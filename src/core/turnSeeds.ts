/**
 * La semilla de las decisiones de cada turno, sacada de la partida de verdad: la de la partida
 * (`GameState.decisionSeed`), el dia y el equipo. La lee quien hace la vista de un equipo
 * (`playerView`, que se la da como `PlayerView.turnSeed`); quien decide no la saca de aqui (en su
 * vista la semilla de la partida no se ve: le daria siempre lo mismo), usa `decisionRngOf(vista)`.
 */
import type { GameState, TeamId } from './model';
import { turnSeed } from './util/random';

/** La semilla de las decisiones del equipo `team` en su turno de hoy: la misma cada vez que se juegue ese turno. */
export const turnSeedOf = (s: GameState, team: TeamId): number => turnSeed(s.decisionSeed, s.day, team);
