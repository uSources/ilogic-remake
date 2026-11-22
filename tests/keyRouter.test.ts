import { afterEach, describe, expect, it } from 'vitest';
import { GameSession, humanController, passiveController } from '@core/session';
import type { InputCommand, InputCommandKind } from '../src/controls/inputCommands';
import type { KeyInput } from '../src/controls/keyboard';
import type { MenuCommand, MenuContext } from '../src/controls/menu';
import type { SoundName } from '../src/audio/sounds';
import { ui } from '../src/hud/store';
import { OptionsPanel } from '../src/menu/optionsPanel';
import { settings } from '../src/settings';
import type { CameraControls } from '../src/view3d/systems/camera/strategyCamera';
import { PauseMenu } from '../src/view3d/systems/hud/matchMenus';
import { KeyRouter, type KeyHost, type KeyPanel, type KeyPress } from '../src/view3d/systems/input/keyInput';
import { blankState, PLAYER } from './helpers';

/** El teclado de la partida sin navegador: el mapa, la camara, los paneles y los sonidos son puertos falsos que apuntan lo que se les pide. */

const FRAME_SECONDS = 0.1;

/** Un panel que se abre y se cierra a mano y apunta las ordenes que recibe (las de menu y sus atajos). */
class FakePanel implements KeyPanel {
  isOpen = false;
  menu: MenuContext = 'options';
  /** Las ordenes del mapa que hace suyas. */
  takes: InputCommandKind[] = [];
  readonly received: MenuCommand[] = [];
  readonly taken: InputCommand[] = [];
  context(): MenuContext {
    return this.menu;
  }
  command(command: MenuCommand): void {
    this.received.push(command);
  }
  shortcut(command: InputCommand): boolean {
    if (!this.takes.includes(command.kind)) return false;
    this.taken.push(command);
    return true;
  }
}

/** La partida: cada orden que llega al mapa se apunta por su nombre (y los desplazamientos de la camara aparte). */
function fakeMatch(panels: readonly KeyPanel[]) {
  const mapOrders: string[] = [];
  const pans: [number, number][] = [];
  const sounds: SoundName[] = [];
  const order = (name: string) => () => void mapOrders.push(name);
  const camera: CameraControls = {
    pan: order('pan'),
    panByKeys: (right, forward) => void pans.push([right, forward]),
    zoom: order('zoom'),
    orbit: order('orbit'),
    tilesPerPixel: () => 1,
  };
  const host: KeyHost = {
    camera,
    onFrame: () => undefined,
    panels,
    sounds: { play: (sound) => void sounds.push(sound) },
    endTurn: order('endTurn'),
    nextUnit: order('nextUnit'),
    cancel: order('cancel'),
    accept: order('accept'),
    group: order('group'),
    intents: order('intents'),
    order: order('order'),
    threat: order('threat'),
    orderHere: order('orderHere'),
    undo: order('undo'),
    minimap: order('minimap'),
    help: order('help'),
    options: order('options'),
  };
  return { router: new KeyRouter(host), mapOrders, pans, sounds };
}

/** Una pulsacion de la tecla `code` (KeyboardEvent.code), sin modificadores si no se dan; apunta si se le quito al navegador. */
function keyPress(code: string, modifiers: Partial<KeyInput> = {}): KeyPress & { prevented: boolean } {
  const press = {
    code,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...modifiers,
    prevented: false,
    preventDefault: () => void (press.prevented = true),
  };
  return press;
}

describe('KeyRouter: las teclas de la partida', () => {
  it('sin panel abierto, van al mapa: E acaba el turno y las flechas mueven la camara', () => {
    const { router, mapOrders, pans } = fakeMatch([new FakePanel()]);
    router.press(keyPress('KeyE'));
    router.press(keyPress('ArrowUp'));
    router.frame(FRAME_SECONDS);
    expect(mapOrders).toEqual(['endTurn']);
    expect(pans).toEqual([[0, 1]]);
  });

  it('O y H abren las opciones y la ayuda', () => {
    const { router, mapOrders } = fakeMatch([]);
    router.press(keyPress('KeyO'));
    router.press(keyPress('KeyH'));
    expect(mapOrders).toEqual(['options', 'help']);
  });

  it('con un panel abierto, son ordenes de menu para el y ninguna llega al mapa', () => {
    const panel = new FakePanel();
    panel.isOpen = true;
    const { router, mapOrders, sounds } = fakeMatch([panel]);
    const tabKey = keyPress('KeyE');
    for (const press of [tabKey, keyPress('ArrowDown'), keyPress('Enter'), keyPress('Escape'), keyPress('Tab')]) router.press(press);
    expect(panel.received).toEqual([
      { kind: 'tab', dir: 1 },
      { kind: 'move', dx: 0, dy: 1 },
      { kind: 'ok', repeat: false },
      { kind: 'back' },
    ]);
    expect(mapOrders).toEqual([]);
    expect(tabKey.prevented).toBe(true);
    expect(sounds).toEqual(['ui_move', 'ui_select', 'ui_back']);
  });

  it('esperando la tecla nueva de una orden, cualquiera es para el panel (Esc lo deja)', () => {
    const panel = new FakePanel();
    panel.isOpen = true;
    panel.menu = 'keyCapture';
    const { router, mapOrders } = fakeMatch([panel]);
    router.press(keyPress('KeyE'));
    router.press(keyPress('Escape'));
    expect(panel.received).toEqual([{ kind: 'key', code: 'KeyE' }, { kind: 'back' }]);
    expect(mapOrders).toEqual([]);
  });

  it('las flechas que se mantenian no mueven la camara mientras hay un panel delante', () => {
    const panel = new FakePanel();
    const { router, pans } = fakeMatch([panel]);
    router.press(keyPress('ArrowUp'));
    panel.isOpen = true;
    router.frame(FRAME_SECONDS);
    expect(pans).toEqual([]);
    panel.isOpen = false;
    router.frame(FRAME_SECONDS);
    expect(pans).toEqual([[0, 1]]);
  });

  it('un panel hace suyos sus atajos del mapa; las demas teclas del mapa no llegan a ningun sitio', () => {
    const panel = new FakePanel();
    panel.isOpen = true;
    panel.menu = 'pause';
    panel.takes = ['endTurn'];
    const { router, mapOrders, sounds } = fakeMatch([panel]);
    const endTurnKey = keyPress('KeyE');
    const nextUnitKey = keyPress('Tab');
    for (const press of [endTurnKey, nextUnitKey, keyPress('KeyE', { repeat: true }), keyPress('KeyZ', { ctrlKey: true })])
      router.press(press);
    expect(panel.taken).toEqual([{ kind: 'endTurn' }]);
    expect(panel.received).toEqual([]);
    expect(mapOrders).toEqual([]);
    expect([endTurnKey.prevented, nextUnitKey.prevented]).toEqual([true, false]);
    expect(sounds).toEqual(['ui_select']);
  });

  it('el primer panel abierto se queda con las teclas', () => {
    const closed = new FakePanel();
    const open = new FakePanel();
    open.isOpen = true;
    const { router } = fakeMatch([closed, open]);
    router.press(keyPress('KeyQ'));
    expect(closed.received).toEqual([]);
    expect(open.received).toEqual([{ kind: 'tab', dir: -1 }]);
  });
});

describe('KeyRouter con las opciones de verdad', () => {
  const shownOptions = () => ui.get().options!;
  const tabIdShown = () => shownOptions().tabs[shownOptions().tab]!.id;

  it('E cambia de pestaña sin acabar el turno, y en Controles se espera la tecla nueva', () => {
    const options = new OptionsPanel(
      'game',
      () => undefined,
      () => undefined,
    );
    const { router, mapOrders } = fakeMatch([options]);
    options.open();
    const firstTab = tabIdShown();
    router.press(keyPress('KeyE'));
    expect(tabIdShown()).not.toBe(firstTab);
    while (tabIdShown() !== 'keys') router.press(keyPress('KeyQ'));
    router.press(keyPress('Enter'));
    expect(options.context()).toBe('keyCapture');
    // Digit1 es una tecla fija (los grupos): el panel dice por que no vale y el mapa no elige el grupo 1.
    router.press(keyPress('Digit1'));
    expect(shownOptions().tabs[shownOptions().tab]!.rows[0]).toMatchObject({ capturing: true, notice: expect.any(String) });
    router.press(keyPress('Escape'));
    expect(options.context()).toBe('options');
    // Vuelve a la pestaña del principio para no dejar otra como la ultima abierta.
    while (tabIdShown() !== firstTab) router.press(keyPress('KeyE'));
    router.press(keyPress('Escape'));
    expect(options.isOpen).toBe(false);
    expect(mapOrders).toEqual([]);
  });
});

describe('KeyRouter con la pausa de verdad', () => {
  /** Donde se ancla la pausa (no cuenta: sale en el centro). */
  const ANCHOR = { x: 0, y: 0 };

  const keysBefore = settings.keys;
  afterEach(() => {
    settings.keys = keysBefore;
    ui.set({ help: false });
  });

  /** La pausa de una partida vacia (sin ordenes: no sale «Ver órdenes»); lo que pide a la partida se apunta por su nombre. */
  function pausedMatch() {
    const asked: string[] = [];
    const ask = (name: string) => () => void asked.push(name);
    const pause = new PauseMenu({
      session: new GameSession(blankState(), [humanController(), passiveController()]),
      viewer: PLAYER,
      endTurn: ask('endTurn'),
      openOptions: ask('options'),
      toggleThreat: ask('threat'),
      toggleIntents: ask('intents'),
      isThreatOn: () => false,
      isIntentsOn: () => false,
      hasOrders: () => false,
      refresh: () => undefined,
    });
    const match = fakeMatch([pause]);
    pause.open();
    const press = (...codes: string[]) => codes.forEach((code) => match.router.press(keyPress(code)));
    return { ...match, pause, asked, press };
  }

  const shownPause = (pause: PauseMenu) => pause.view(ANCHOR)!;
  const selectedChoice = (pause: PauseMenu) => shownPause(pause).items[shownPause(pause).selected]!.id;
  const hintOf = (pause: PauseMenu, choice: string) => shownPause(pause).items.find((item) => item.id === choice)?.hint;

  it('con la pausa abierta, las teclas del mapa no le llegan: Tab, ordenes, grupos, deshacer, minimapa, zoom ni flechas', () => {
    const { router, press, pause, asked, mapOrders, pans } = pausedMatch();
    press('Tab', 'KeyQ', 'KeyC', 'KeyG', 'KeyX', 'KeyF', 'Digit1', 'KeyM', 'Equal', 'Minus', 'ArrowUp');
    router.press(keyPress('KeyZ', { ctrlKey: true }));
    router.press(keyPress('Digit2', { shiftKey: true }));
    router.frame(FRAME_SECONDS);
    expect(mapOrders).toEqual([]);
    expect(pans).toEqual([]);
    expect(asked).toEqual([]);
    expect(pause.isOpen).toBe(true);
  });

  it('las flechas recorren las opciones como se ven y Enter elige la señalada', () => {
    const { press, pause, asked, sounds } = pausedMatch();
    // «Seguir» a todo lo ancho; debajo, «Fin del turno» y «Ver amenaza»; luego «Guardar» y «Opciones».
    press('ArrowDown', 'ArrowRight');
    expect(selectedChoice(pause)).toBe('threat');
    press('ArrowDown');
    expect(selectedChoice(pause)).toBe('options');
    press('ArrowUp', 'ArrowLeft');
    expect(selectedChoice(pause)).toBe('endTurn');
    press('Enter');
    expect(asked).toEqual(['endTurn']);
    expect(pause.isOpen).toBe(false);
    expect(sounds).toEqual(['ui_move', 'ui_move', 'ui_move', 'ui_move', 'ui_move', 'ui_select']);
  });

  it('las peligrosas van en su fila, abajo', () => {
    const { press, pause } = pausedMatch();
    press('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    expect(selectedChoice(pause)).toBe('surrender');
    press('ArrowRight');
    expect(selectedChoice(pause)).toBe('quit');
  });

  it('sus atajos hacen lo que la opcion, y Esc la cierra', () => {
    const { press, pause, asked, mapOrders } = pausedMatch();
    press('KeyT');
    expect(asked).toEqual(['threat']);
    expect(pause.isOpen).toBe(false);
    pause.open();
    press('KeyO');
    expect(asked).toEqual(['threat', 'options']);
    press('KeyH');
    expect(ui.get().help).toBe(true);
    expect(pause.isOpen).toBe(false);
    pause.open();
    // Sin ordenes, «Ver órdenes» no sale: V no hace nada.
    press('KeyV', 'Escape');
    expect(asked).toEqual(['threat', 'options']);
    expect(pause.isOpen).toBe(false);
    expect(mapOrders).toEqual([]);
  });

  it('enseña y atiende las teclas del jugador, no las de serie', () => {
    const { press, pause, asked } = pausedMatch();
    expect([hintOf(pause, 'resume'), hintOf(pause, 'endTurn'), hintOf(pause, 'threat'), hintOf(pause, 'help')]).toEqual([
      'Esc',
      'E',
      'T',
      'H',
    ]);
    settings.keys = { endTurn: 'KeyP', cancel: 'KeyK' };
    expect([hintOf(pause, 'resume'), hintOf(pause, 'endTurn')]).toEqual(['K', 'P']);
    press('KeyE');
    expect(asked).toEqual([]);
    press('KeyK');
    expect(pause.isOpen).toBe(false);
    pause.open();
    press('KeyP');
    expect(asked).toEqual(['endTurn']);
  });
});
