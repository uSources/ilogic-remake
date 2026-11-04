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
export function startLab(h: LabHost, o: LabOptions): void {
  const sc = h.scene;
  // Camara lenta: todo lo que va por tweens y temporizadores de la escena.
  const scale = o.slow ? 0.25 : 1;
  sc.tweens.timeScale = scale;
  sc.time.timeScale = scale;
  h.view.cursor = { ...LAB_TARGET };
  // Mas cerca que en una partida: se ven bien los efectos. Centrado entre las dos unidades.
  const cam = sc.cameras.main;
  for (let i = 0; i < 2; i++) h.view.zoomStep(1, cam.width / 2, cam.height / 2);
  cam.centerOn((LAB_TARGET.x - 1) * TILE, (LAB_TARGET.y + 0.5) * TILE);
  h.refresh();
  if (o.play) sc.time.delayedCall(450, () => void runLab(h, o.play!));
}

async function runLab(h: LabHost, action: LabAction): Promise<void> {
  const s = h.state;
  const me = s.units.find((unit) => unit.team === 0);
  const foe = s.units.find((unit) => unit.team === 1);
  if (!me || !foe) return;
  if (action === 'move') {
    const range = moveRange(s, me);
    const dest = { x: LAB_TARGET.x - labRange(s, me.type), y: LAB_TARGET.y };
    const path = moveUnit(s, me, dest, range);
    if (path) await h.play([moveEvent(me.uid, path)]);
    return;
  }
  await h.play([attackEvent(s, me, foe, seededRng(3))]);
}

/** Volver a empezar el laboratorio con otras opciones (y una accion, si se pide). */
export function restartLab(sc: Phaser.Scene, o: LabOptions): void {
  sc.scene.start('Game', { mode: 'lab', lab: o } satisfies GameStartData);
}
