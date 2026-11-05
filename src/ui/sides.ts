/**
 * De que lado esta cada equipo para quien mira la partida (el equipo que juega en esta pantalla): el
 * suyo, un aliado o un enemigo. La interfaz pinta y escribe con el lado, nunca con el numero de
 * equipo: asi da igual cual sea el equipo que mira (o cuantos equipos haya).
 */
import type { GameState, TeamId } from '../core/model';
import { areAllied } from '../core/teams';
import type { OwnerSide, Side } from '../hud/vm/common';
import { PAL, PAL_MAP } from './palette';

export type { OwnerSide, Side };

/** El lado de `team` para el equipo que mira (`viewer`). */
export function sideOf(s: GameState, viewer: TeamId, team: TeamId): Side {
  if (team === viewer) return 'own';
  return areAllied(s, viewer, team) ? 'ally' : 'enemy';
}

/** El lado del dueño de algo; 'neutral' si no es de nadie. */
export const ownerSideOf = (s: GameState, viewer: TeamId, owner: TeamId | null): OwnerSide =>
  owner === null ? 'neutral' : sideOf(s, viewer, owner);

/** Se pinta con el color propio (azul): el suyo y los aliados; los enemigos van en rojo. */
export const isFriendly = (side: OwnerSide): boolean => side === 'own' || side === 'ally';

/** Color del mapa de un lado: azul lo propio y aliado, rojo lo enemigo, gris lo de nadie. */
export const sideColor = (side: OwnerSide): number => (side === 'neutral' ? PAL_MAP.neutral : isFriendly(side) ? PAL.blue : PAL.red);

/** Letra de los dibujos por lado (`b_` azul, `r_` rojo, `i_` gris). */
export const sideLetter = (side: OwnerSide): 'b' | 'r' | 'i' => (side === 'neutral' ? 'i' : isFriendly(side) ? 'b' : 'r');
