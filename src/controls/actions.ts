/**
 * [CAMBIO] Registro de acciones sobre lo elegido (una unidad o un grupo), como en los juegos de
 * estrategia en tiempo real. Cada accion dice cuando tiene sentido, su texto y el cursor que la
 * anuncia. De aqui salen:
 * - el clic derecho "inteligente": la primera accion principal que vale en la casilla (smartAction);
 * - el menu completo (pulsacion larga, F, Alt + clic derecho, o «Órdenes» en la bandeja): todas las
 *   que valen (menuActions);
 * - el cursor del raton al pasar por encima (cursorFor).
 *
 * Logica pura: no mueve nada ni sabe de mandos. GameScene cumple la accion elegida (runAction) y
 * le pasa lo que solo ella sabe (que significa ir a esa casilla con la unidad elegida: `intent`).
 * Añadir una accion es una entrada mas en ACTIONS y un caso en runAction; los mandos no cambian.
 */
import { UNIT } from '../core/data';
import { buildingAt } from '../core/rules';
import { commandChoices, effectiveCommand, squadUnits } from '../core/squads';
import type { GameState, Pos, Unit } from '../core/types';
import type { IntentKind } from '../ui/touch';

/** Puntero del raton que anuncia lo que hara el clic derecho (ver ui/cursors.ts). */
export type CursorKind = 'default' | 'move' | 'attack' | 'capture' | 'load' | 'merge' | 'go' | 'forbidden';

export type ActionId =
  | 'attack'
  | 'capture'
  | 'merge'
  | 'load'
  | 'move'
  | 'go'
  | 'cmdAttack'
  | 'cmdCapture'
  | 'cmdDefend'
  | 'cmdCancel'
  | 'squadForm'
  | 'squadLeave'
  | 'squadRename'
  | 'squadDisband';

/** Lo que hace falta para decidir que acciones valen. */
export interface ActionCtx {
  s: GameState;
  /** Lo elegido (unidades propias). */
  units: readonly Unit[];
  /** La casilla (null: menu sin casilla, desde la bandeja; las ordenes piden despues el destino). */
  at: Pos | null;
  /** Hay en `at` un enemigo que el jugador ve. */
  enemyHere: boolean;
  /**
   * Con una sola unidad elegida que aun se mueve: que pasaria al soltarla en `at` (intentAt de la
   * escena) y si eso es capturar. undefined con un grupo.
   */
  intent?: IntentKind;
  intentCapture?: boolean;
  /** Con una sola unidad: `at` esta fuera de su alcance pero se puede llegar en varios turnos. */
  farOk?: boolean;
}

export interface ActionDef {
  id: ActionId;
  /** Clave del texto del menu (settings.ts). */
  label: string;
  cursor: CursorKind;
  /** Puede ser lo que hace el clic derecho (si no, solo sale en el menu). */
  smart: boolean;
  /** Pide una casilla (sin ella, el menu de la bandeja la pide despues). */
  needsTile: boolean;
  ok(c: ActionCtx): boolean;
}

const single = (c: ActionCtx) => (c.units.length === 1 && c.intent !== undefined ? c.units[0]! : null);
const group = (c: ActionCtx) => single(c) === null && c.units.length > 0;

/** La casilla tiene un edificio que no es del jugador y alguna de estas unidades puede capturar. */
function capturable(c: ActionCtx): boolean {
  if (!c.at) return false;
  const b = buildingAt(c.s, c.at.x, c.at.y);
  return !!b && b.owner !== 0 && c.units.some((u) => UNIT.cancapt[u.type]);
}

/** Escuadra que forman exactamente estas unidades (o null). */
export function exactSquad(s: GameState, units: readonly Unit[]): number | null {
  const id = units[0]?.squad;
  if (id === undefined || !units.every((u) => u.squad === id)) return null;
  return squadUnits(s, id).length === units.length ? id : null;
}

/** Ordenes con destino que ofrece el menu en esa casilla (o todas las que pueden cumplir, sin casilla). */
function orderOk(c: ActionCtx, kind: 'attack' | 'capture' | 'defend'): boolean {
  if (c.at) return commandChoices(c.s, c.at, c.units, c.enemyHere).includes(kind);
  if (kind === 'capture') return c.units.some((u) => UNIT.cancapt[u.type]);
  return c.units.some((u) => UNIT.canfight[u.type]);
}

/**
 * Todas las acciones, en orden: el de prioridad del clic derecho y el del menu. Las de una sola
 * unidad (atacar, capturar, unirse, subir, mover, ir) usan lo que dice la escena de esa casilla; con
 * un grupo, atacar y capturar son ordenes que empiezan ya y mover lleva a cada una lo mas cerca.
 */
export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'attack',
    label: 'attack',
    cursor: 'attack',
    smart: true,
    needsTile: true,
    ok: (c) => (single(c) ? c.intent === 'attack' : group(c) && c.enemyHere && c.units.some((u) => UNIT.canfight[u.type])),
  },
  {
    id: 'capture',
    label: 'capture',
    cursor: 'capture',
    smart: true,
    needsTile: true,
    ok: (c) => (single(c) ? c.intent === 'move' && !!c.intentCapture : group(c) && !c.enemyHere && capturable(c)),
  },
  { id: 'merge', label: 'actMerge', cursor: 'merge', smart: true, needsTile: true, ok: (c) => !!single(c) && c.intent === 'merge' },
  { id: 'load', label: 'actLoad', cursor: 'load', smart: true, needsTile: true, ok: (c) => !!single(c) && c.intent === 'load' },
  {
    id: 'move',
    label: 'actMove',
    cursor: 'move',
    smart: true,
    needsTile: true,
    ok: (c) => (single(c) ? c.intent === 'move' && !c.intentCapture : group(c) && !!c.at && !c.enemyHere && !capturable(c)),
  },
  { id: 'go', label: 'goThere', cursor: 'go', smart: true, needsTile: true, ok: (c) => !!single(c) && c.intent === 'none' && !!c.farOk },
  { id: 'cmdAttack', label: 'cmdAttack', cursor: 'attack', smart: false, needsTile: false, ok: (c) => orderOk(c, 'attack') },
  { id: 'cmdCapture', label: 'cmdCapture', cursor: 'capture', smart: false, needsTile: false, ok: (c) => orderOk(c, 'capture') },
  { id: 'cmdDefend', label: 'cmdDefend', cursor: 'move', smart: false, needsTile: false, ok: (c) => orderOk(c, 'defend') },
  {
    id: 'cmdCancel',
    label: 'cmdCancel',
    cursor: 'default',
    smart: false,
    needsTile: false,
    ok: (c) => c.units.some((u) => !!effectiveCommand(c.s, u)),
  },
  {
    id: 'squadForm',
    label: 'squadForm',
    cursor: 'default',
    smart: false,
    needsTile: false,
    ok: (c) => c.units.length > 1 && exactSquad(c.s, c.units) === null,
  },
  {
    id: 'squadLeave',
    label: 'squadLeave',
    cursor: 'default',
    smart: false,
    needsTile: false,
    ok: (c) => c.units.some((u) => u.squad !== undefined) && exactSquad(c.s, c.units) === null,
  },
  {
    id: 'squadRename',
    label: 'squadRename',
    cursor: 'default',
    smart: false,
    needsTile: false,
    ok: (c) => exactSquad(c.s, c.units) !== null,
  },
  {
    id: 'squadDisband',
    label: 'squadDisband',
    cursor: 'default',
    smart: false,
    needsTile: false,
    ok: (c) => exactSquad(c.s, c.units) !== null,
  },
];

const valid = (c: ActionCtx) => (a: ActionDef) => (!a.needsTile || c.at !== null) && a.ok(c);

/** Lo que hace el clic derecho en esa casilla (null: nada, la escena hace lo de siempre). */
export function smartAction(c: ActionCtx): ActionDef | null {
  if (!c.units.length || !c.at) return null;
  return ACTIONS.find((a) => a.smart && valid(c)(a)) ?? null;
}

/** El menu completo: todas las acciones que valen, en orden. */
export function menuActions(c: ActionCtx): ActionDef[] {
  if (!c.units.length) return [];
  return ACTIONS.filter(valid(c));
}

/** Puntero del raton en esa casilla: el de la accion del clic derecho, o prohibido si no hay ninguna. */
export function cursorFor(c: ActionCtx): CursorKind {
  if (!c.units.length || !c.at) return 'default';
  return smartAction(c)?.cursor ?? 'forbidden';
}

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);
