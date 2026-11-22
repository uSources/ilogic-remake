import { describe, expect, it } from 'vitest';
import type { MenuCommand, MenuContext } from '../src/controls/menu';
import type { SoundName } from '../src/audio/sounds';
import { ui } from '../src/hud/store';
import { OptionsPanel } from '../src/menu/optionsPanel';
import type { CameraControls } from '../src/view3d/systems/camera/strategyCamera';
import { KeyRouter, type KeyHost, type KeyPanel, type KeyPress } from '../src/view3d/systems/input/keyInput';

/** El teclado de la partida sin navegador: el mapa, la camara, los paneles y los sonidos son puertos falsos que apuntan lo que se les pide. */

const FRAME_SECONDS = 0.1;

/** Un panel que se abre y se cierra a mano y apunta las ordenes que recibe. */
class FakePanel implements KeyPanel {
  isOpen = false;
  menu: MenuContext = 'options';
  readonly received: MenuCommand[] = [];
  context(): MenuContext {
    return this.menu;
  }
  command(command: MenuCommand): void {
    this.received.push(command);
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

/** Una pulsacion de la tecla `code` (KeyboardEvent.code), sin modificadores; apunta si se le quito al navegador. */
function keyPress(code: string): KeyPress & { prevented: boolean } {
  const press = {
    code,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
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
