import type { Pos } from './geometry';
import type { TeamId } from './team';

/** Lo que acaba de pasar, para que la interfaz lo anime. Lo usan el jugador y la IA. */
export type GameEvent =
  | { kind: 'move'; uid: number; path: Pos[]; ambush?: Pos }
  | {
      kind: 'attack';
      attacker: number;
      target: Pos;
      damage: number;
      killed: boolean;
      counter?: number;
      attackerKilled?: boolean;
      /** [CAMBIO] Dinero cobrado por destruir una unidad (para quien la destruyo). */
      bounty?: number;
      /** Datos para enseñar el combate (ver attackEvent). Los eventos antiguos no lo tienen. */
      combat?: CombatInfo;
    }
  | { kind: 'capture'; uid: number; at: Pos; owner: TeamId | null; left?: number; total?: number }
  | { kind: 'merge'; uid: number; into: number; path: Pos[] }
  | { kind: 'load'; uid: number; into: number; path: Pos[] }
  | { kind: 'spawn'; uid: number; at: Pos }
  | { kind: 'wait'; uid: number }
  | {
      kind: 'power';
      team: TeamId;
      general: string;
      power: string;
      /** Casilla elegida (poderes de area). */
      target?: Pos;
      /** Unidades tocadas y vida que han perdido. */
      hits: { uid: number; damage: number }[];
      /** Unidades propias curadas y vida que han recuperado (heal). */
      heals?: { uid: number; amount: number }[];
      /** Dinero conseguido (funds). */
      funds?: number;
    };

/** Tipo de evento ('move', 'attack'...). */
export type GameEventKind = GameEvent['kind'];
/** El evento de un tipo concreto, p. ej. `GameEventOf<'attack'>`. */
export type GameEventOf<K extends GameEventKind> = Extract<GameEvent, { kind: K }>;

/**
 * Como estaban las dos unidades justo antes de un combate. La interfaz lo usa para enseñarlo
 * (panel de combate, barras de vida) aunque una de las dos haya caido.
 */
export interface CombatInfo {
  /** Tipos de unidad (id de units.json). */
  attackerType: string;
  defenderType: string;
  attackerTeam: TeamId;
  defenderTeam: TeamId;
  /** Vida antes del combate. */
  attackerLife: number;
  defenderLife: number;
  /** Rango de veterania (0..3) antes del combate. */
  attackerRank: number;
  defenderRank: number;
  /** Probabilidad de acierto de cada disparo del atacante (0..1). */
  hit: number;
  /** Lo mismo para el contraataque, o null si no lo hubo. */
  counterHit: number | null;
}
