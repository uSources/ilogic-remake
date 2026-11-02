/**
 * [CAMBIO] Escuadras y ordenes con destino del jugador (estilo RTS). Logica pura: la usa GameScene
 * y la cumple la IA al terminar el turno (commandTurn en ai.ts).
 */
import { UNIT } from './data';
import { manhattan } from './geom';
import { buildingAt } from './rules';
import type { CommandKind, GameState, Pos, Squad, Unit } from './types';

/** Nombres que se van dando a las escuadras nuevas (el jugador los puede cambiar). */
export const SQUAD_NAMES = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Fox', 'Golf', 'Hotel', 'India', 'Juliet'] as const;
/** Largo maximo del nombre de una escuadra. */
export const SQUAD_NAME_MAX = 14;

/** Unidades vivas de una escuadra. */
export function squadUnits(s: GameState, id: number): Unit[] {
  return s.units.filter((u) => u.squad === id);
}

/** Escuadra por id. */
export function squadById(s: GameState, id: number | undefined): Squad | undefined {
  return id === undefined ? undefined : s.squads?.find((q) => q.id === id);
}

/** Quita las escuadras que se han quedado sin unidades (las destruyen, se disuelven...). */
export function pruneSquads(s: GameState): void {
  if (!s.squads) return;
  s.squads = s.squads.filter((q) => s.units.some((u) => u.squad === q.id));
  for (const u of s.units) if (u.squad !== undefined && !s.squads.some((q) => q.id === u.squad)) delete u.squad;
  if (!s.squads.length) delete s.squads;
}

/** Nombre limpio: sin espacios de mas y como mucho SQUAD_NAME_MAX letras (null si queda vacio). */
export function cleanSquadName(name: string): string | null {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, SQUAD_NAME_MAX);
  return n || null;
}

/**
 * Forma una escuadra con estas unidades (solo las del jugador; salen de la que tuvieran) y le da el
 * primer nombre libre. Devuelve la escuadra, o null si no hay unidades.
 */
export function formSquad(s: GameState, units: readonly Unit[], name?: string): Squad | null {
  const mine = units.filter((u) => u.team === 0);
  if (!mine.length) return null;
  pruneSquads(s);
  const squads = s.squads ?? [];
  const id = squads.reduce((m, q) => Math.max(m, q.id), 0) + 1;
  const used = new Set(squads.map((q) => q.name));
  const free = SQUAD_NAMES.find((n) => !used.has(n)) ?? `${SQUAD_NAMES[0]} ${id}`;
  const squad: Squad = { id, name: (name && cleanSquadName(name)) || free };
  for (const u of mine) u.squad = id;
  s.squads = [...squads, squad];
  pruneSquads(s);
  return squad;
}

/** Cambia el nombre de una escuadra. Devuelve false si no existe o el nombre queda vacio. */
export function renameSquad(s: GameState, id: number, name: string): boolean {
  const q = squadById(s, id);
  const n = cleanSquadName(name);
  if (!q || !n) return false;
  q.name = n;
  return true;
}

/** Deshace una escuadra: sus unidades siguen ahi (con sus ordenes), pero sueltas. */
export function disbandSquad(s: GameState, id: number): void {
  for (const u of squadUnits(s, id)) delete u.squad;
  pruneSquads(s);
}

/** Por que no se puede dar esa orden ahi (null = se puede). */
export function commandBlock(s: GameState, kind: CommandKind, at: Pos, units: readonly Unit[]): 'noBuilding' | 'noCapturer' | null {
  if (kind !== 'capture') return null;
  const b = buildingAt(s, at.x, at.y);
  if (!b || b.owner === 0) return 'noBuilding';
  if (!units.some((u) => UNIT.cancapt[u.type])) return 'noCapturer';
  return null;
}

/**
 * Ordenes que tiene sentido ofrecer en una casilla (clic derecho o pulsacion larga en el destino, con
 * unidades elegidas), en el orden del menu. Con un enemigo visible ahi, atacar va primero; si no, con
 * un edificio que estas unidades pueden capturar, capturar va primero. Defender siempre se puede.
 * `enemyHere`: hay un enemigo que el jugador ve en esa casilla (la niebla la decide la escena).
 */
export function commandChoices(s: GameState, at: Pos, units: readonly Unit[], enemyHere: boolean): CommandKind[] {
  const mine = units.filter((u) => u.team === 0);
  if (!mine.length) return [];
  const canCapture = commandBlock(s, 'capture', at, mine) === null;
  if (enemyHere) return canCapture ? ['attack', 'capture', 'defend'] : ['attack', 'defend'];
  return canCapture ? ['capture', 'attack', 'defend'] : ['attack', 'defend'];
}

/**
 * Da una orden con destino a estas unidades del jugador. Con "capturar", las que no pueden capturar
 * van escoltando: atacan hacia ese sitio. Devuelve cuantas la han recibido.
 */
export function giveCommand(units: readonly Unit[], kind: CommandKind, at: Pos): number {
  let n = 0;
  for (const u of units) {
    if (u.team !== 0) continue;
    u.command = { kind: kind === 'capture' && !UNIT.cancapt[u.type] ? 'attack' : kind, at: { x: at.x, y: at.y } };
    delete u.order;
    n++;
  }
  return n;
}

/** Quita la orden a estas unidades (se quedan esperando). */
export function cancelCommand(units: readonly Unit[]): void {
  for (const u of units) delete u.command;
}

/** Ya ha llegado a la zona de su orden (a 1 casilla o menos). */
export const atCommand = (u: Unit): boolean => !!u.command && manhattan(u, u.command.at) <= 1;
