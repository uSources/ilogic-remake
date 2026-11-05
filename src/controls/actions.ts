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
 * scenes/game/actionRunners.ts (una entrada por cada `ActionId`, lo obliga el tipo), que manda las
 * acciones del nucleo (core/actions.ts); si una vale lo dice el nucleo (`isValidAction`,
 * `canGiveStandingOrder`), y aqui solo se añade lo que es de la interfaz (que significa ir a esa
 * casilla con la unidad elegida: `intent`; que formar escuadra pide dos o mas). Añadir una accion
 * es una entrada en ACTIONS y otra en ACTION_RUNNERS; los mandos no cambian.
 */
import { canFight, isCapturer } from '../core/util/predicates';
import { buildingAt } from '../core/rules';
import { isAlliedOwner } from '../core/teams';
import { standingOrderChoices, squadUnits } from '../core/squads';
import { canGiveStandingOrder, isValidAction } from '../core/actions';
import type { GameAction, GameState, Pos, TeamId, Unit } from '../core/model';
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
  | 'orderToAttack'
  | 'orderToCapture'
  | 'orderToDefend'
  | 'cancelOrder'
  | 'squadForm'
  | 'squadLeave'
  | 'squadRename'
  | 'squadDisband';

/** Lo que hace falta para decidir que acciones valen. */
export interface ActionCtx {
  s: GameState;
  /** El equipo de quien elige (el que se ve en pantalla). */
  viewer: TeamId;
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
  ok(context: ActionCtx): boolean;
}

type ActionEntry = Pick<ActionDef, 'id' | 'label' | 'cursor' | 'ok'>;

/** Accion sobre una casilla que puede hacer el clic derecho (atacar, mover, unirse...). */
const onTile = (entry: ActionEntry): ActionDef => ({ ...entry, smart: true, needsTile: true });

/** Accion que solo sale en el menu; sin casilla, la pide despues (ordenes, escuadras). */
const inMenu = (entry: ActionEntry): ActionDef => ({ ...entry, smart: false, needsTile: false });

/** La unica unidad elegida, si se esta moviendo (la escena ha dicho que pasaria en la casilla). */
const movingUnit = (context: ActionCtx): Unit | null =>
  context.units.length === 1 && context.intent !== undefined ? context.units[0]! : null;
const isMoving = (context: ActionCtx) => movingUnit(context) !== null;
const isGroup = (context: ActionCtx) => !isMoving(context) && context.units.length > 0;
const anyCanCapture = (context: ActionCtx) => context.units.some((unit) => isCapturer(context.s, unit));
const anyCanFight = (context: ActionCtx) => context.units.some((unit) => canFight(context.s, unit));

/** La casilla tiene un edificio que no es del jugador y alguna de estas unidades puede capturar. */
function hasBuildingToCapture(context: ActionCtx): boolean {
  if (!context.at) return false;
  const building = buildingAt(context.s, context.at);
  return !!building && !isAlliedOwner(context.s, building.owner, context.viewer) && anyCanCapture(context);
}

/** Escuadra que forman exactamente estas unidades (o null). */
export function exactSquad(s: GameState, units: readonly Unit[]): number | null {
  const id = units[0]?.squad;
  if (id === undefined || !units.every((unit) => unit.squad === id)) return null;
  return squadUnits(s, id).length === units.length ? id : null;
}

const isWholeSquad = (context: ActionCtx) => exactSquad(context.s, context.units) !== null;

/** Ordenes con destino que ofrece el menu en esa casilla (o todas las que se pueden dar, sin casilla). */
function canOrder(context: ActionCtx, kind: 'attack' | 'capture' | 'defend'): boolean {
  const { s, viewer, units, at } = context;
  if (at && !standingOrderChoices(s, viewer, at, units, context.enemyHere).includes(kind)) return false;
  return canGiveStandingOrder(s, viewer, units, kind, at);
}

/** La accion del nucleo con estas unidades vale ahora. */
const isValidFor = (context: ActionCtx, action: (uids: number[]) => GameAction): boolean =>
  isValidAction(context.s, context.viewer, action(context.units.map((unit) => unit.uid)));

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
    ok: (context) => (isMoving(context) ? context.intent === 'attack' : isGroup(context) && context.enemyHere && anyCanFight(context)),
  }),
  onTile({
    id: 'capture',
    label: 'capture',
    cursor: 'capture',
    ok: (context) =>
      isMoving(context)
        ? context.intent === 'move' && !!context.intentCapture
        : isGroup(context) && !context.enemyHere && hasBuildingToCapture(context),
  }),
  onTile({ id: 'merge', label: 'actMerge', cursor: 'merge', ok: (context) => isMoving(context) && context.intent === 'merge' }),
  onTile({ id: 'load', label: 'actLoad', cursor: 'load', ok: (context) => isMoving(context) && context.intent === 'load' }),
  onTile({
    id: 'move',
    label: 'actMove',
    cursor: 'move',
    ok: (context) =>
      isMoving(context)
        ? context.intent === 'move' && !context.intentCapture
        : isGroup(context) && !!context.at && !context.enemyHere && !hasBuildingToCapture(context),
  }),
  onTile({ id: 'go', label: 'goThere', cursor: 'go', ok: (context) => isMoving(context) && context.intent === 'none' && !!context.farOk }),
  inMenu({ id: 'orderToAttack', label: 'orderToAttack', cursor: 'attack', ok: (context) => canOrder(context, 'attack') }),
  inMenu({ id: 'orderToCapture', label: 'orderToCapture', cursor: 'capture', ok: (context) => canOrder(context, 'capture') }),
  inMenu({ id: 'orderToDefend', label: 'orderToDefend', cursor: 'move', ok: (context) => canOrder(context, 'defend') }),
  inMenu({
    id: 'cancelOrder',
    label: 'cancelOrder',
    cursor: 'default',
    ok: (context) => isValidFor(context, (uids) => ({ kind: 'cancelStandingOrder', uids })),
  }),
  inMenu({
    id: 'squadForm',
    label: 'squadForm',
    cursor: 'default',
    // Una escuadra de una sola unidad no sirve de nada: el menu la ofrece desde dos.
    ok: (context) => context.units.length > 1 && !isWholeSquad(context) && isValidFor(context, (uids) => ({ kind: 'formSquad', uids })),
  }),
  inMenu({
    id: 'squadLeave',
    label: 'squadLeave',
    cursor: 'default',
    ok: (context) => !isWholeSquad(context) && isValidFor(context, (uids) => ({ kind: 'leaveSquad', uids })),
  }),
  inMenu({ id: 'squadRename', label: 'squadRename', cursor: 'default', ok: isWholeSquad }),
  inMenu({ id: 'squadDisband', label: 'squadDisband', cursor: 'default', ok: isWholeSquad }),
];

const isValid = (context: ActionCtx, action: ActionDef) => (!action.needsTile || context.at !== null) && action.ok(context);

/** Lo que hace el clic derecho en esa casilla (null: nada, la escena hace lo de siempre). */
export function smartAction(context: ActionCtx): ActionDef | null {
  if (!context.units.length || !context.at) return null;
  return ACTIONS.find((action) => action.smart && isValid(context, action)) ?? null;
}

/** El menu completo: todas las acciones que valen, en orden. */
export function menuActions(context: ActionCtx): ActionDef[] {
  if (!context.units.length) return [];
  return ACTIONS.filter((action) => isValid(context, action));
}

/** Puntero del raton en esa casilla: el de la accion del clic derecho, o prohibido si no hay ninguna. */
export function cursorFor(context: ActionCtx): CursorKind {
  if (!context.units.length || !context.at) return 'default';
  return smartAction(context)?.cursor ?? 'forbidden';
}

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((action) => action.id === id);
