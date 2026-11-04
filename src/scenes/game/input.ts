/**
 * Enganche de los mandos a la partida: teclado y punteros de Phaser → adaptadores de src/controls.
 * Aqui no se decide nada: el teclado pasa a ordenes (keyCommand / menuKeyCommand) y los punteros a
 * PointerGestures, que decide el gesto. Quien las cumple es un `InputTarget` (GameScene).
 */
import Phaser from 'phaser';
import type { InputCommand } from '../../controls/inputCommands';
import { keyCommand } from '../../controls/keyboard';
import { menuKeyCommand, type ControlContext, type MenuCommand } from '../../controls/menu';
import type { PointerGestures, PointerIn } from '../../controls/pointer';

/** Lo unico que un mando necesita de la escena (ver docs/ARQUITECTURA.md, "Mandos"). */
export interface InputTarget {
  /** Donde esta el foco: el mapa ('map') o un menu propio. */
  controlContext(): ControlContext;
  menu(cmd: MenuCommand): void;
  command(cmd: InputCommand): void;
}

/** Traducir un puntero de Phaser al evento del adaptador de punteros (src/controls/pointer.ts). */
export function pointerIn(p: Phaser.Input.Pointer, right: boolean, middle = false): PointerIn {
  const e = p.event as MouseEvent | undefined;
  return {
    id: p.id,
    x: p.x,
    y: p.y,
    touch: p.wasTouch,
    down: p.isDown,
    right,
    shift: !!e?.shiftKey,
    ctrl: !!e?.ctrlKey || !!e?.metaKey,
    alt: !!e?.altKey,
    middle,
  };
}

/** Adaptador de teclado: en el mapa, ordenes InputCommand; en la pantalla final y opciones, MenuCommand. */
export function onKey(e: KeyboardEvent, target: InputTarget): void {
  const ctx = target.controlContext();
  if (ctx !== 'map') {
    const cmd = menuKeyCommand(e, ctx);
    if (cmd) target.menu(cmd);
    return;
  }
  const cmd = keyCommand(e);
  if (!cmd) return;
  // Ctrl+numero cambia de pestaña en algunos navegadores: aqui es hacer un grupo.
  if (cmd.kind === 'accept' || (cmd.kind === 'group' && cmd.mode !== 'select')) e.preventDefault();
  target.command(cmd);
}

/** Engancha el teclado y los punteros de la escena a los adaptadores. */
export function bindInput(scene: Phaser.Scene, target: InputTarget, gestures: PointerGestures): void {
  scene.input.mouse?.disableContextMenu();
  // Dos dedos a la vez para pellizcar (zoom).
  if (scene.input.manager.pointersTotal < 3) scene.input.addPointer(1);
  // Que el navegador no use estas teclas (Tab cambia el foco, Espacio desplaza la pagina...).
  scene.input.keyboard!.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT,BACKSPACE');
  scene.input.keyboard!.on('keydown', (event: KeyboardEvent) => onKey(event, target));
  // Raton y dedos: el adaptador decide el gesto; GameScene.pointerTarget() dice que hace en la partida.
  const g = gestures;
  const pin = pointerIn;
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => g.move(pin(pointer, false)));
  scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) =>
    g.down(pin(pointer, pointer.rightButtonDown(), pointer.middleButtonDown())),
  );
  scene.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) =>
    g.up(pin(pointer, pointer.rightButtonReleased(), pointer.middleButtonReleased())),
  );
  scene.input.on(Phaser.Input.Events.GAME_OUT, () => g.leave());
  scene.input.on(Phaser.Input.Events.POINTER_WHEEL, (pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
    g.wheel(dy, pointer.x, pointer.y),
  );
}
