/**
 * Que suena con cada cosa de la vista: pasos, disparos, capturas, menus y el final. Solo decide (tablas,
 * sin Web Audio ni three.js); lo hace sonar el `SoundPort` que reciba quien lo use.
 */
import type { SoundId } from '../audio/sounds';
import type { MovementMotion } from '../core/content';
import type { MenuCommand } from '../controls/menu';

/** El paso de cada forma de moverse, una vez por casilla. */
export const STEP_SOUNDS: Readonly<Record<MovementMotion, SoundId>> = {
  march: 'step_march',
  drive: 'step_drive',
  fly: 'step_fly',
};

/** El disparo de cada forma de moverse: la infanteria lleva fusil y los aviones misiles; los vehiculos, cañon (en arco, artilleria). */
const SHOT_SOUNDS: Readonly<Record<MovementMotion, { near: SoundId; far: SoundId }>> = {
  march: { near: 'shot_rifle', far: 'shot_rifle' },
  drive: { near: 'shot_cannon', far: 'shot_artillery' },
  fly: { near: 'shot_missile', far: 'shot_missile' },
};

export const shotSound = (motion: MovementMotion, isArc: boolean): SoundId => SHOT_SOUNDS[motion][isArc ? 'far' : 'near'];

export const captureSound = (isDone: boolean): SoundId => (isDone ? 'capture_done' : 'capture');

export const endSound = (won: boolean): SoundId => (won ? 'victory' : 'defeat');

/** Lo que suena con cada orden de menu (moverse, aceptar, volver); las demas, nada. */
const MENU_SOUNDS: Partial<Record<MenuCommand['kind'], SoundId>> = { move: 'ui_move', ok: 'ui_select', back: 'ui_back' };

export const menuSound = (command: MenuCommand): SoundId | undefined => MENU_SOUNDS[command.kind];
