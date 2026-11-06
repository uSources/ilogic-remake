/**
 * La caida de un equipo: por que (`DefeatReason`) y cuando (`TeamFall`). Sin dependencias: lo usan
 * los equipos (TeamState.fell), los sucesos ('teamDefeated') y el final (EndReason).
 */

/**
 * Por que cae un equipo: sin su Base ('hq'), sin nada, ni unidades ni edificios ('wipeout'), o se ha
 * rendido ('surrender'). La lista, en el orden en que cuentan si caen varios a la vez, es
 * DEFEAT_REASONS (rules/falls.ts: el modelo no tiene constantes).
 */
export type DefeatReason = 'hq' | 'wipeout' | 'surrender';

/** La caida de un equipo: la `order`-esima (los que caen en la misma accion comparten numero) y por que. */
export interface TeamFall {
  order: number;
  reason: DefeatReason;
}
