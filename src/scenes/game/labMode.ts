/**
 * Laboratorio de animaciones (src/lab.ts): dos unidades frente a frente para ver como se mueven y
 * combaten, a camara lenta si se pide. Es una partida sin niebla ni final.
 */
import type Phaser from 'phaser';
import { seededRng } from '../../core/geom';
import { attackEvent, moveEvent, moveRange, moveUnit } from '../../core/rules';
import type { GameEvent, GameState } from '../../core/model';
import { LAB_TARGET, labRange, type LabAction, type LabOptions } from '../../lab';
import { TILE } from '../../layout';
import type { MapView } from '../../ui/mapView';
import type { GameStartData } from './types';

/** Lo que el laboratorio necesita de la escena. */
export interface LabHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
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
  const me = s.units.find((unit) => unit.team === 0);
  const foe = s.units.find((unit) => unit.team === 1);
  if (!me || !foe) return;
  if (action === 'move') {
    const range = moveRange(s, me);
    const dest = { x: LAB_TARGET.x - labRange(s, me.type), y: LAB_TARGET.y };
    const path = moveUnit(s, me, dest, range);
    if (path) await host.play([moveEvent(me.uid, path)]);
    return;
  }
  await host.play([attackEvent(s, me, foe, seededRng(3))]);
}

/** Volver a empezar el laboratorio con otras opciones (y una accion, si se pide). */
export function restartLab(scene: Phaser.Scene, options: LabOptions): void {
  scene.scene.start('Game', { mode: 'lab', lab: options } satisfies GameStartData);
}
