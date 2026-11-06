import type { Pos } from './geometry';
import type { TeamId } from './team';

export type Outcome = 'playing' | 'won' | 'lost';

/**
 * Lo que pide un objetivo de mision. En todas se pierde tambien si cae la Base propia.
 * - hq: conquistar la Base enemiga (lo normal).
 * - survive: aguantar hasta el final del dia `days`.
 * - capture: tener `count` edificios del tipo `type` (id de buildings.json, o de cualquiera) antes de
 *   acabar el dia `days`.
 * - destroy: destruir todas las unidades enemigas antes de acabar el dia `days`.
 * - escort: llevar la unidad `uid` hasta `to` antes de acabar el dia `days`; si la destruyen, se pierde.
 */
export type ObjectiveGoal =
  | { kind: 'hq' }
  | { kind: 'survive'; days: number }
  | { kind: 'capture'; count: number; type: string | null; days: number }
  | { kind: 'destroy'; days: number }
  | { kind: 'escort'; uid: number; to: Pos; days: number };

/**
 * El objetivo de una partida: lo que pide y de que equipo es (`owner`). Se mide para su dueño; si lo
 * cumple gana su alianza, y si falla, sus enemigos (rules/victory.ts).
 */
export type Objective = ObjectiveGoal & { owner: TeamId };
