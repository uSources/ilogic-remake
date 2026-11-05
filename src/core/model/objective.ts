import type { Pos } from './geometry';

export type Outcome = 'playing' | 'won' | 'lost';

/**
 * Objetivo de una mision. En todas se pierde tambien si cae la Base propia.
 * - hq: conquistar la Base enemiga (lo normal).
 * - survive: aguantar hasta el final del dia `days`.
 * - capture: tener `count` edificios del tipo `type` (o de cualquiera) antes de acabar el dia `days`.
 * - destroy: destruir todas las unidades enemigas antes de acabar el dia `days`.
 * - escort: llevar la unidad `uid` hasta `to` antes de acabar el dia `days`; si la destruyen, se pierde.
 */
export type Objective =
  | { kind: 'hq' }
  | { kind: 'survive'; days: number }
  | { kind: 'capture'; count: number; type: number | null; days: number }
  | { kind: 'destroy'; days: number }
  | { kind: 'escort'; uid: number; to: Pos; days: number };
