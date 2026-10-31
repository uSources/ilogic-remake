/**
 * Laboratorio de animaciones: una partida de mentira en campo abierto con una unidad propia y una
 * enemiga, para ver (y ajustar) como se anima mover, atacar, el contraataque y una unidad destruida
 * sin tener que jugar. Se abre con `#lab` en la direccion o con `ilogicDebug.lab()`.
 * Cada accion vuelve a empezar la escena desde cero, asi siempre se ve igual.
 */
import { HQ, setMapSize, UNIT, UNIT_NAMES } from './core/data';
import { grid } from './core/geom';
import { newUnit } from './core/rules';
import type { GameState } from './core/types';

export type LabAction = 'move' | 'attack' | 'counter' | 'kill';
export const LAB_ACTIONS: readonly LabAction[] = ['move', 'attack', 'counter', 'kill'];

export interface LabOptions {
  /** Tipo de la unidad propia y de la enemiga (indices de UNIT_NAMES). */
  attacker: number;
  defender: number;
  /** Camara lenta (a un cuarto de la velocidad). */
  slow: boolean;
  /** Accion que se reproduce al empezar (null = ninguna). */
  play: LabAction | null;
}

export const LAB_SIZE = 12;
/** Donde empieza cada una. La propia avanza 3 casillas para atacar (mover) o empieza al lado. */
export const LAB_FROM = { x: 3, y: 6 };
export const LAB_TARGET = { x: 7, y: 6 };

export const defaultLab = (): LabOptions => ({
  attacker: Math.max(0, UNIT_NAMES.indexOf('Tank')),
  defender: Math.max(0, UNIT_NAMES.indexOf('Tank')),
  slow: false,
  play: null,
});

/** Distancia desde la que ataca la propia: la casilla de al lado o su alcance minimo. */
export const labRange = (type: number): number => Math.max(1, UNIT.minalc[type]! + 1);

/**
 * Partida del laboratorio: todo hierba, una Base por bando en las esquinas (si no, la partida
 * acabaria sola) y las dos unidades. Para atacar, la propia ya esta a su distancia de tiro.
 */
export function labState(o: LabOptions, action: LabAction | null): GameState {
  setMapSize(LAB_SIZE, LAB_SIZE);
  const s: GameState = {
    version: 1,
    map: grid(0),
    theme: 0,
    funds: [0, 0],
    units: [],
    buildings: [
      { type: HQ, owner: 0, x: 0, y: LAB_SIZE - 1, capture: null },
      { type: HQ, owner: 1, x: LAB_SIZE - 1, y: 0, capture: null },
    ],
    nextUid: 1,
    day: 1,
  };
  const near = action !== null && action !== 'move';
  const from = near ? { x: LAB_TARGET.x - labRange(o.attacker), y: LAB_TARGET.y } : LAB_FROM;
  newUnit(s, o.attacker, 0, from.x, from.y);
  const d = newUnit(s, o.defender, 1, LAB_TARGET.x, LAB_TARGET.y);
  if (action === 'kill') d.life = 15;
  return s;
}
