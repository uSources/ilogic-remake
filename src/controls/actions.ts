/**
 * [CAMBIO] Registro de acciones sobre lo elegido (una unidad o un grupo), como en los juegos de
 * estrategia en tiempo real. Cada accion dice cuando tiene sentido, su texto y el cursor que la
 * anuncia. De aqui salen:
 * - el clic derecho "inteligente": la primera accion principal que vale en la casilla (smartAction);
 * - el menu completo (pulsacion larga, F, Alt + clic derecho, o «Órdenes» en la bandeja): todas las
 *   que valen (menuActions);
 * - el cursor del raton al pasar por encima (cursorFor).
 *
 * Logica pura: no mueve nada ni sabe de mandos. Lo que hace cada accion al elegirla esta en
 * scenes/game/actionRunners.ts (una entrada por cada `ActionId`, lo obliga el tipo). La escena le
 * pasa aqui lo que solo ella sabe (que significa ir a esa casilla con la unidad elegida: `intent`).
 * Añadir una accion es una entrada en ACTIONS y otra en ACTION_RUNNERS; los mandos no cambian.
 */
import { UNIT } from '../core/data';
import { buildingAt } from '../core/rules';
import { commandChoices, effectiveCommand, squadUnits } from '../core/squads';
import type { GameState, Pos, Unit } from '../core/model';
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
  ok(ctx: ActionCtx): boolean;
}

type ActionEntry = Pick<ActionDef, 'id' | 'label' | 'cursor' | 'ok'>;

/** Accion sobre una casilla que puede hacer el clic derecho (atacar, mover, unirse...). */
const onTile = (entry: ActionEntry): ActionDef => ({ ...entry, smart: true, needsTile: true });

/** Accion que solo sale en el menu; sin casilla, la pide despues (ordenes, escuadras). */
const inMenu = (entry: ActionEntry): ActionDef => ({ ...entry, smart: false, needsTile: false });

/** La unica unidad elegida, si se esta moviendo (la escena ha dicho que pasaria en la casilla). */
const movingUnit = (ctx: ActionCtx): Unit | null => (ctx.units.length === 1 && ctx.intent !== undefined ? ctx.units[0]! : null);
const isMoving = (ctx: ActionCtx) => movingUnit(ctx) !== null;
const isGroup = (ctx: ActionCtx) => !isMoving(ctx) && ctx.units.length > 0;
const anyCanCapture = (units: readonly Unit[]) => units.some((unit) => UNIT.cancapt[unit.type]);
const anyCanFight = (units: readonly Unit[]) => units.some((unit) => UNIT.canfight[unit.type]);

/** La casilla tiene un edificio que no es del jugador y alguna de estas unidades puede capturar. */
function hasBuildingToCapture(ctx: ActionCtx): boolean {
  if (!ctx.at) return false;
  const building = buildingAt(ctx.s, ctx.at.x, ctx.at.y);
  return !!building && building.owner !== 0 && anyCanCapture(ctx.units);
}

/** Escuadra que forman exactamente estas unidades (o null). */
export function exactSquad(s: GameState, units: readonly Unit[]): number | null {
  const id = units[0]?.squad;
  if (id === undefined || !units.every((unit) => unit.squad === id)) return null;
  return squadUnits(s, id).length === units.length ? id : null;
}

const isWholeSquad = (ctx: ActionCtx) => exactSquad(ctx.s, ctx.units) !== null;

/** Ordenes con destino que ofrece el menu en esa casilla (o todas las que pueden cumplir, sin casilla). */
function canOrder(ctx: ActionCtx, kind: 'attack' | 'capture' | 'defend'): boolean {
  if (ctx.at) return commandChoices(ctx.s, ctx.at, ctx.units, ctx.enemyHere).includes(kind);
  return kind === 'capture' ? anyCanCapture(ctx.units) : anyCanFight(ctx.units);
}

/**
 * Todas las acciones, en orden: el de prioridad del clic derecho y el del menu. Las de una sola
 * unidad (atacar, capturar, unirse, subir, mover, ir) usan lo que dice la escena de esa casilla; con
 * un grupo, atacar y capturar son ordenes que empiezan ya y mover lleva a cada una lo mas cerca.
 */
export const ACTIONS: readonly ActionDef[] = [
  onTile({
    id: 'attack',
    label: 'attack',
    cursor: 'attack',
    ok: (ctx) => (isMoving(ctx) ? ctx.intent === 'attack' : isGroup(ctx) && ctx.enemyHere && anyCanFight(ctx.units)),
  }),
  onTile({
    id: 'capture',
    label: 'capture',
    cursor: 'capture',
    ok: (ctx) =>
      isMoving(ctx) ? ctx.intent === 'move' && !!ctx.intentCapture : isGroup(ctx) && !ctx.enemyHere && hasBuildingToCapture(ctx),
  }),
  onTile({ id: 'merge', label: 'actMerge', cursor: 'merge', ok: (ctx) => isMoving(ctx) && ctx.intent === 'merge' }),
  onTile({ id: 'load', label: 'actLoad', cursor: 'load', ok: (ctx) => isMoving(ctx) && ctx.intent === 'load' }),
  onTile({
    id: 'move',
    label: 'actMove',
    cursor: 'move',
    ok: (ctx) =>
      isMoving(ctx)
        ? ctx.intent === 'move' && !ctx.intentCapture
        : isGroup(ctx) && !!ctx.at && !ctx.enemyHere && !hasBuildingToCapture(ctx),
  }),
  onTile({ id: 'go', label: 'goThere', cursor: 'go', ok: (ctx) => isMoving(ctx) && ctx.intent === 'none' && !!ctx.farOk }),
  inMenu({ id: 'cmdAttack', label: 'cmdAttack', cursor: 'attack', ok: (ctx) => canOrder(ctx, 'attack') }),
  inMenu({ id: 'cmdCapture', label: 'cmdCapture', cursor: 'capture', ok: (ctx) => canOrder(ctx, 'capture') }),
  inMenu({ id: 'cmdDefend', label: 'cmdDefend', cursor: 'move', ok: (ctx) => canOrder(ctx, 'defend') }),
  inMenu({
    id: 'cmdCancel',
    label: 'cmdCancel',
    cursor: 'default',
    ok: (ctx) => ctx.units.some((unit) => !!effectiveCommand(ctx.s, unit)),
  }),
  inMenu({ id: 'squadForm', label: 'squadForm', cursor: 'default', ok: (ctx) => ctx.units.length > 1 && !isWholeSquad(ctx) }),
  inMenu({
    id: 'squadLeave',
    label: 'squadLeave',
    cursor: 'default',
    ok: (ctx) => ctx.units.some((unit) => unit.squad !== undefined) && !isWholeSquad(ctx),
  }),
  inMenu({ id: 'squadRename', label: 'squadRename', cursor: 'default', ok: isWholeSquad }),
  inMenu({ id: 'squadDisband', label: 'squadDisband', cursor: 'default', ok: isWholeSquad }),
];

const isValid = (ctx: ActionCtx, action: ActionDef) => (!action.needsTile || ctx.at !== null) && action.ok(ctx);

/** Lo que hace el clic derecho en esa casilla (null: nada, la escena hace lo de siempre). */
export function smartAction(ctx: ActionCtx): ActionDef | null {
  if (!ctx.units.length || !ctx.at) return null;
  return ACTIONS.find((action) => action.smart && isValid(ctx, action)) ?? null;
}

/** El menu completo: todas las acciones que valen, en orden. */
export function menuActions(ctx: ActionCtx): ActionDef[] {
  if (!ctx.units.length) return [];
  return ACTIONS.filter((action) => isValid(ctx, action));
}

/** Puntero del raton en esa casilla: el de la accion del clic derecho, o prohibido si no hay ninguna. */
export function cursorFor(ctx: ActionCtx): CursorKind {
  if (!ctx.units.length || !ctx.at) return 'default';
  return smartAction(ctx)?.cursor ?? 'forbidden';
}

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((action) => action.id === id);
