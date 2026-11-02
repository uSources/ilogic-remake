/**
 * [CAMBIO] Escuadras y ordenes con destino del jugador (estilo RTS). Logica pura: la usa GameScene
 * y la cumple la IA al terminar el turno (commandTurn en ai.ts).
 */
import { UNIT } from './data';
import { manhattan } from './geom';
import { buildingAt } from './rules';
import type { Command, CommandKind, GameState, Pos, Squad, Unit } from './types';

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

/** Teclas de grupo: 1-9, como en los juegos de estrategia en tiempo real. */
export const SQUAD_KEYS = 9;

/**
 * Forma una escuadra con estas unidades (solo las del jugador; salen de la que tuvieran) y le da el
 * primer nombre libre y la primera tecla libre (o la tecla `key`, cuyo nombre de la lista prefiere:
 * Ctrl+3 forma «Charlie»). Devuelve la escuadra, o null si no hay unidades.
 */
export function formSquad(s: GameState, units: readonly Unit[], name?: string, key?: number): Squad | null {
  const mine = units.filter((u) => u.team === 0);
  if (!mine.length) return null;
  for (const u of mine) leaveSquad(s, u);
  pruneSquads(s);
  const squads = s.squads ?? [];
  const id = squads.reduce((m, q) => Math.max(m, q.id), 0) + 1;
  const used = new Set(squads.map((q) => q.name));
  const byKey = key !== undefined ? SQUAD_NAMES[key - 1] : undefined;
  const free = (byKey && !used.has(byKey) ? byKey : SQUAD_NAMES.find((n) => !used.has(n))) ?? `${SQUAD_NAMES[0]} ${id}`;
  const k = key ?? freeKey(s);
  const squad: Squad = { id, name: (name && cleanSquadName(name)) || free, ...(k !== undefined ? { key: k } : {}) };
  for (const u of mine) u.squad = id;
  s.squads = [...squads, squad];
  liftCommand(s, squad);
  pruneSquads(s);
  return squad;
}

/** La primera tecla de grupo (1-9) que no tiene ninguna escuadra. */
export function freeKey(s: GameState): number | undefined {
  const used = new Set((s.squads ?? []).map((q) => q.key));
  for (let k = 1; k <= SQUAD_KEYS; k++) if (!used.has(k)) return k;
  return undefined;
}

/** La escuadra de esa tecla de grupo. */
export function squadByKey(s: GameState, key: number): Squad | undefined {
  return s.squads?.find((q) => q.key === key);
}

/** Da tecla a las escuadras que no tienen (partidas de antes, o cuando se libera una). */
export function assignKeys(s: GameState): void {
  for (const q of s.squads ?? [])
    if (q.key === undefined) {
      const k = freeKey(s);
      if (k === undefined) return;
      q.key = k;
    }
}

/**
 * [CAMBIO] Ctrl + numero: estas unidades pasan a ser el grupo de esa tecla. Si ya habia una
 * escuadra con esa tecla, se queda solo con estas (las demas salen, con lo que estaban haciendo);
 * si no, se forma. Devuelve la escuadra, o null si no hay unidades.
 */
export function setGroup(s: GameState, units: readonly Unit[], key: number): Squad | null {
  const mine = units.filter((u) => u.team === 0);
  if (!mine.length) return null;
  const q = squadByKey(s, key);
  if (!q) return formSquad(s, mine, undefined, key);
  const keep = new Set(mine.map((u) => u.uid));
  for (const u of squadUnits(s, q.id)) if (!keep.has(u.uid)) leaveSquad(s, u);
  return joinSquad(s, q, mine);
}

/** [CAMBIO] Mayusculas + numero: añadir estas unidades al grupo de esa tecla (o formarlo). */
export function addToGroup(s: GameState, units: readonly Unit[], key: number): Squad | null {
  const mine = units.filter((u) => u.team === 0);
  if (!mine.length) return null;
  const q = squadByKey(s, key);
  return q ? joinSquad(s, q, mine) : formSquad(s, mine, undefined, key);
}

/** Meter unidades en una escuadra que ya existe (salen de la suya; las que no tenian orden siguen la de esta). */
function joinSquad(s: GameState, q: Squad, units: readonly Unit[]): Squad {
  for (const u of units) {
    if (u.squad === q.id) continue;
    leaveSquad(s, u);
    u.squad = q.id;
    // Si ya hacia justo lo de la escuadra, la sigue (no va destacada).
    if (u.command && q.command && sameCommand(u.command, forUnit(u, q.command))) delete u.command;
  }
  pruneSquads(s);
  return q;
}

/** Saca la unidad de su escuadra; si seguia la orden de la escuadra, se la queda como propia. */
export function leaveSquad(s: GameState, u: Unit): void {
  if (u.squad === undefined) return;
  if (!u.command) {
    const c = squadById(s, u.squad)?.command;
    if (c) u.command = forUnit(u, c);
  }
  delete u.squad;
}

/**
 * Si todas las unidades de la escuadra llevan la misma orden propia (contando la escolta de una
 * captura), pasa a ser la orden de la escuadra. Asi una escuadra formada con unidades que ya iban
 * juntas, o una partida guardada antes de que las escuadras tuvieran orden, sigue igual.
 */
export function liftCommand(s: GameState, q: Squad): void {
  const units = squadUnits(s, q.id);
  if (!units.length || units.some((u) => !u.command)) return;
  const lead = units.find((u) => u.command!.kind === 'capture') ?? units[0]!;
  const c = lead.command!;
  if (!units.every((u) => sameCommand(u.command!, forUnit(u, c)))) return;
  q.command = { kind: c.kind, at: { x: c.at.x, y: c.at.y } };
  for (const u of units) delete u.command;
}

/** Cambia el nombre de una escuadra. Devuelve false si no existe o el nombre queda vacio. */
export function renameSquad(s: GameState, id: number, name: string): boolean {
  const q = squadById(s, id);
  const n = cleanSquadName(name);
  if (!q || !n) return false;
  q.name = n;
  return true;
}

/** Deshace una escuadra: sus unidades siguen ahi (con lo que estuvieran haciendo), pero sueltas. */
export function disbandSquad(s: GameState, id: number): void {
  for (const u of squadUnits(s, id)) leaveSquad(s, u);
  pruneSquads(s);
}

// ---------------------------------------------------------------------------
// Ordenes: la de la escuadra y la propia de cada unidad (destacada)
// ---------------------------------------------------------------------------

const sameCommand = (a: Command, b: Command): boolean => a.kind === b.kind && a.at.x === b.at.x && a.at.y === b.at.y;

/** La orden tal como la cumple esta unidad: con "capturar", las que no pueden capturar van de escolta (atacar). */
function forUnit(u: Unit, c: Command): Command {
  return { kind: c.kind === 'capture' && !UNIT.cancapt[u.type] ? 'attack' : c.kind, at: { x: c.at.x, y: c.at.y } };
}

/**
 * [CAMBIO] La orden que cumple la unidad: la suya propia si la tiene (destacada) y si no la de su
 * escuadra (adaptada: escolta en una captura). undefined = no tiene orden.
 */
export function effectiveCommand(s: GameState, u: Unit): Command | undefined {
  // Llevada a mano a una casilla lejana (Unit.order): eso manda mientras dura.
  if (u.order) return undefined;
  if (u.command) return u.command;
  const c = squadById(s, u.squad)?.command;
  return c ? forUnit(u, c) : undefined;
}

/** [CAMBIO] Va por su cuenta: es de una escuadra con orden y lleva otra propia distinta. */
export function isDetached(s: GameState, u: Unit): boolean {
  const c = squadById(s, u.squad)?.command;
  return !!u.command && !!c && !sameCommand(u.command, forUnit(u, c));
}

/** Unidades del jugador de esa escuadra que siguen su orden (no destacadas). */
const followers = (s: GameState, q: Squad) => squadUnits(s, q.id).filter((u) => !u.command);

/** Los ids de escuadra a los que pertenecen todas sus unidades vivas de esta lista. */
function wholeSquads(s: GameState, units: readonly Unit[]): Set<number> {
  const ids = new Set(units.flatMap((u) => (u.squad === undefined ? [] : [u.squad])));
  const picked = new Set(units.map((u) => u.uid));
  return new Set([...ids].filter((id) => squadUnits(s, id).every((u) => u.life <= 0 || picked.has(u.uid))));
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
 * Da una orden con destino a estas unidades del jugador. Si son una escuadra entera, la orden es de
 * la escuadra (y se olvidan las propias); si son solo algunas, cada una se queda con la orden como
 * propia (destacada) y al cumplirla vuelve a la de su escuadra. Con "capturar", las que no pueden
 * capturar van de escolta. Devuelve cuantas la han recibido.
 */
export function giveCommand(s: GameState, units: readonly Unit[], kind: CommandKind, at: Pos): number {
  const mine = units.filter((u) => u.team === 0);
  const c: Command = { kind, at: { x: at.x, y: at.y } };
  const whole = wholeSquads(s, mine);
  for (const id of whole) squadById(s, id)!.command = { ...c, at: { ...c.at } };
  for (const u of mine) {
    if (u.squad !== undefined && whole.has(u.squad)) delete u.command;
    else {
      u.command = forUnit(u, c);
      // Si es justo la orden de su escuadra, no va destacada: la sigue.
      const q = squadById(s, u.squad)?.command;
      if (q && sameCommand(u.command, forUnit(u, q))) delete u.command;
    }
    delete u.order;
  }
  return mine.length;
}

/**
 * Quita la orden a estas unidades. A una escuadra entera se le quita la suya (se quedan esperando).
 * Una destacada vuelve a la orden de su escuadra; una que seguia a su escuadra se queda guardando
 * donde esta (defender aqui), que es "parar" sin sacarla de la escuadra.
 */
export function cancelCommand(s: GameState, units: readonly Unit[]): void {
  const whole = wholeSquads(s, units);
  for (const id of whole) delete squadById(s, id)!.command;
  for (const u of units) {
    if (u.squad !== undefined && whole.has(u.squad)) delete u.command;
    else if (u.command) delete u.command;
    else if (effectiveCommand(s, u)) u.command = { kind: 'defend', at: { x: u.x, y: u.y } };
  }
}

/**
 * [CAMBIO] La unidad ha cumplido la orden que seguia. Si era la suya, la olvida (vuelve a la de su
 * escuadra). Si era la de la escuadra, se quita cuando ya esta cumplida para la escuadra: al
 * capturar el edificio, o al atacar cuando han llegado todas las que la siguen.
 */
export function finishCommand(s: GameState, u: Unit): void {
  if (u.command) {
    delete u.command;
    return;
  }
  const q = squadById(s, u.squad);
  if (!q?.command) return;
  const b = q.command.kind === 'capture' ? buildingAt(s, q.command.at.x, q.command.at.y) : null;
  const done = q.command.kind === 'capture' ? !b || b.owner === 0 : followers(s, q).every((o) => o.life <= 0 || atCommand(s, o));
  if (done) delete q.command;
}

/**
 * [CAMBIO] Has empezado a mano una captura con esta unidad: si llevaba una orden (suya o de su
 * escuadra) que no es capturar este edificio, ahora lo es, para que el turno siguiente no lo deje a
 * medias. En una escuadra queda destacada y, con el edificio tomado, vuelve a la orden de la escuadra.
 */
export function keepCapturing(s: GameState, u: Unit): void {
  const b = buildingAt(s, u.x, u.y);
  const c = effectiveCommand(s, u);
  if (u.team !== 0 || !b || b.owner === 0 || !c) return;
  if (c.kind === 'capture' && c.at.x === u.x && c.at.y === u.y) return;
  u.command = { kind: 'capture', at: { x: u.x, y: u.y } };
}

/** Ya ha llegado a la zona de su orden (a 1 casilla o menos). */
export function atCommand(s: GameState, u: Unit): boolean {
  const c = effectiveCommand(s, u);
  return !!c && manhattan(u, c.at) <= 1;
}

/**
 * [CAMBIO] Dos unidades van en formacion: misma escuadra y misma orden (mismo destino; capturar y
 * atacar cuentan igual, porque con "capturar" las que no capturan van escoltando con "atacar").
 */
export function sameFormation(s: GameState, a: Unit, b: Unit): boolean {
  if (a.squad === undefined || a.squad !== b.squad || a.team !== b.team) return false;
  const ca = effectiveCommand(s, a),
    cb = effectiveCommand(s, b);
  if (!ca || !cb) return false;
  const holds = (c: Command) => c.kind === 'defend';
  return holds(ca) === holds(cb) && ca.at.x === cb.at.x && ca.at.y === cb.at.y;
}

/** [CAMBIO] La escuadra entera (dos o mas unidades) lleva la misma orden: avanza en formacion. */
export function squadInFormation(s: GameState, id: number): boolean {
  const units = squadUnits(s, id);
  return units.length > 1 && units.every((u) => sameFormation(s, units[0]!, u));
}
