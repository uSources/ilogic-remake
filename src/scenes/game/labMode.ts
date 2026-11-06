/**
 * Laboratorio de animaciones (src/lab.ts): dos unidades frente a frente para ver como se mueven y
 * combaten, a camara lenta si se pide. Es una partida sin niebla ni final.
 */
import type Phaser from 'phaser';
import type { GameEvent, GameState, TeamId } from '../../core/model';
import { isHostile } from '../../core/teams';
import { LAB_TARGET, labRange, type LabAction, type LabOptions } from '../../lab';
import { TILE } from '../../layout';
import type { MapView } from '../../ui/mapView';
import type { ActionHost, GameStartData } from './types';

/** Lo que el laboratorio necesita de la escena. */
export interface LabHost extends ActionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
  refresh(): void;
  play(events: GameEvent[]): Promise<void>;
}

/** Prepara la camara y, si se pide, lanza la accion al poco de empezar. */
export function startLab(host: LabHost, options: LabOptions): void {
  const scene = host.scene;
  // Camara lenta: todo lo que va por tweens y temporizadores de la escena.
  const scale = options.slow ? 0.25 : 1;
  scene.tweens.timeScale = scale;
  scene.time.timeScale = scale;
  host.view.cursor = { ...LAB_TARGET };
  // Mas cerca que en una partida: se ven bien los efectos. Centrado entre las dos unidades.
  const camera = scene.cameras.main;
  for (let i = 0; i < 2; i++) host.view.zoomStep(1, camera.width / 2, camera.height / 2);
  camera.centerOn((LAB_TARGET.x - 1) * TILE, (LAB_TARGET.y + 0.5) * TILE);
  host.refresh();
  if (options.play) scene.time.delayedCall(450, () => void runLab(host, options.play!));
}

async function runLab(host: LabHost, action: LabAction): Promise<void> {
  const s = host.state;
  const me = s.units.find((unit) => unit.team === host.viewer);
  const foe = s.units.find((unit) => isHostile(s, host.viewer, unit.team));
  if (!me || !foe) return;
  if (action === 'move') {
    await host.perform({ kind: 'move', uid: me.uid, to: { x: LAB_TARGET.x - labRange(s, me), y: LAB_TARGET.y } });
    return;
  }
  await host.perform({ kind: 'attack', uid: me.uid, target: foe.uid });
}

/** Volver a empezar el laboratorio con otras opciones (y una accion, si se pide). */
export function restartLab(scene: Phaser.Scene, options: LabOptions): void {
  scene.scene.start('Game', { start: 'lab', lab: options } satisfies GameStartData);
}
