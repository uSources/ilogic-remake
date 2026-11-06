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
export const isFriendly = (side: OwnerSide | 'unknown'): boolean => side === 'own' || side === 'ally';

/** Los tres colores de lado: azul (lo propio y aliado), rojo (lo enemigo) y gris (lo de nadie o lo que no se sabe). */
type Paint = 'friendly' | 'enemy' | 'neutral';
const paintOf = (side: OwnerSide | 'unknown'): Paint => (isFriendly(side) ? 'friendly' : side === 'enemy' ? 'enemy' : 'neutral');

/**
 * Como se pinta cada lado en cada sitio: el unico lugar con estos colores (los de Phaser son los de
 * palette.ts y los de CSS, las variables de hud.css). `map`: el mapa de Phaser; `canvas` y
 * `canvasUnit`: los lienzos del minimapa y las miniaturas (edificios y, mas claras, unidades); `fill`
 * y `text`: el CSS de las fichas (rellenos y el nombre del dueño).
 */
const SIDE_PAINT = {
  friendly: { map: PAL.blue, canvas: '#3aa8ff', canvasUnit: '#8fd0ff', fill: 'var(--blue)', text: 'var(--blue)' },
  enemy: { map: PAL.red, canvas: '#ff4d45', canvasUnit: '#ff8a80', fill: 'var(--red)', text: 'var(--red-soft)' },
  neutral: { map: PAL_MAP.neutral, canvas: '#c9d2e3', canvasUnit: '#c9d2e3', fill: 'var(--muted)', text: 'var(--muted)' },
} as const;
export type PaintPlace = keyof (typeof SIDE_PAINT)['friendly'];

/** El color de un lado en ese sitio (ver SIDE_PAINT). */
export const sidePaint = <P extends PaintPlace>(side: OwnerSide | 'unknown', place: P): (typeof SIDE_PAINT)[Paint][P] =>
  SIDE_PAINT[paintOf(side)][place];

/** Color del mapa de Phaser de un lado. */
export const sideColor = (side: OwnerSide): number => sidePaint(side, 'map');

/** Letra de los dibujos por lado (`b_` azul, `r_` rojo, `i_` gris). */
const SIDE_LETTER = { friendly: 'b', enemy: 'r', neutral: 'i' } as const;
export const sideLetter = (side: OwnerSide): 'b' | 'r' | 'i' => SIDE_LETTER[paintOf(side)];

/**
 * Letra del dibujo de una unidad: azul la propia y la aliada, roja la enemiga; una propia o aliada
 * que ya ha actuado, gris (`i_`). Las enemigas no se ven grises (no se delata si han actuado).
 */
export const unitSideLetter = (side: Side, active: boolean): 'b' | 'r' | 'i' => (isFriendly(side) && !active ? 'i' : sideLetter(side));

/** El numero de un equipo como se enseña a las personas: contando desde 1 (el equipo 0 es el «equipo 1»). */
export const shownTeamNumber = (team: TeamId): number => team + 1;
