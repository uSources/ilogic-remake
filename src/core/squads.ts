/**
 * [CAMBIO] Escuadras y ordenes con destino del jugador (estilo RTS). Logica pura: la usa GameScene
 * y la cumple la IA al terminar el turno (commandTurn en ai.ts).
 */
import { manhattan, samePos } from './geom';
import { buildingAt } from './rules/queries';
import { isAlive, isCapturer, isPlayer } from './util/predicates';
import type { Command, CommandKind, GameState, Pos, Squad, Unit } from './model';

/** Nombres que se van dando a las escuadras nuevas (el jugador los puede cambiar). */
export const SQUAD_NAMES = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Fox', 'Golf', 'Hotel', 'India', 'Juliet'] as const;
/** Largo maximo del nombre de una escuadra. */
export const SQUAD_NAME_MAX = 14;

/** Solo las del jugador: las escuadras y las ordenes con destino son suyas (la IA decide sola). */
const playerUnits = (units: readonly Unit[]): Unit[] => units.filter((unit) => isPlayer(unit.team));

/** Unidades vivas de una escuadra. */
export function squadUnits(s: GameState, id: number): Unit[] {
  return s.units.filter((unit) => unit.squad === id);
}

/** Escuadra por id. */
export function squadById(s: GameState, id: number | undefined): Squad | undefined {
  return id === undefined ? undefined : s.squads?.find((squad) => squad.id === id);
}

/** Quita las escuadras que se han quedado sin unidades (las destruyen, se disuelven...). */
export function pruneSquads(s: GameState): void {
  if (!s.squads) return;
  s.squads = s.squads.filter((squad) => s.units.some((unit) => unit.squad === squad.id));
  for (const unit of s.units) if (unit.squad !== undefined && !squadById(s, unit.squad)) delete unit.squad;
  if (!s.squads.length) delete s.squads;
}

/** Nombre limpio: sin espacios de mas y como mucho SQUAD_NAME_MAX letras (null si queda vacio). */
export function cleanSquadName(name: string): string | null {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, SQUAD_NAME_MAX);
  return clean || null;
}

/** Teclas de grupo: 1-9, como en los juegos de estrategia en tiempo real. */
export const SQUAD_KEYS = 9;

/**
 * Primer nombre libre de la lista (o el de la tecla `key`, si esta libre: Ctrl+3 forma «Charlie»).
 * Si se han gastado todos, el primero con el numero de la escuadra.
 */
function freeName(squads: readonly Squad[], id: number, key?: number): string {
  const used = new Set(squads.map((squad) => squad.name));
  const nameForKey = key !== undefined ? SQUAD_NAMES[key - 1] : undefined;
  if (nameForKey && !used.has(nameForKey)) return nameForKey;
  return SQUAD_NAMES.find((name) => !used.has(name)) ?? `${SQUAD_NAMES[0]} ${id}`;
}

/**
 * Forma una escuadra con estas unidades (solo las del jugador; salen de la que tuvieran) y le da el
 * primer nombre libre y la primera tecla libre (o la tecla `key`, cuyo nombre de la lista prefiere:
 * Ctrl+3 forma «Charlie»). Devuelve la escuadra, o null si no hay unidades.
 */
export function formSquad(s: GameState, units: readonly Unit[], name?: string, key?: number): Squad | null {
  const mine = playerUnits(units);
  if (!mine.length) return null;
  for (const unit of mine) leaveSquad(s, unit);
  pruneSquads(s);
  const squads = s.squads ?? [];
  const id = squads.reduce((highest, squad) => Math.max(highest, squad.id), 0) + 1;
  const squadKey = key ?? freeKey(s);
  const squad: Squad = {
    id,
    name: (name && cleanSquadName(name)) || freeName(squads, id, key),
    ...(squadKey !== undefined ? { key: squadKey } : {}),
  };
  for (const unit of mine) unit.squad = id;
  s.squads = [...squads, squad];
  liftCommand(s, squad);
  pruneSquads(s);
  return squad;
}

/** La primera tecla de grupo (1-9) que no tiene ninguna escuadra. */
export function freeKey(s: GameState): number | undefined {
  const used = new Set((s.squads ?? []).map((squad) => squad.key));
  for (let key = 1; key <= SQUAD_KEYS; key++) if (!used.has(key)) return key;
  return undefined;
}

/** La escuadra de esa tecla de grupo. */
export function squadByKey(s: GameState, key: number): Squad | undefined {
  return s.squads?.find((squad) => squad.key === key);
}

/** Da tecla a las escuadras que no tienen (partidas de antes, o cuando se libera una). */
export function assignKeys(s: GameState): void {
  for (const squad of s.squads ?? []) {
    if (squad.key !== undefined) continue;
    const key = freeKey(s);
    if (key === undefined) return;
    squad.key = key;
  }
}

/**
 * [CAMBIO] Ctrl + numero: estas unidades pasan a ser el grupo de esa tecla. Si ya habia una
 * escuadra con esa tecla, se queda solo con estas (las demas salen, con lo que estaban haciendo);
 * si no, se forma. Devuelve la escuadra, o null si no hay unidades.
 */
export function setGroup(s: GameState, units: readonly Unit[], key: number): Squad | null {
  const mine = playerUnits(units);
  if (!mine.length) return null;
  const squad = squadByKey(s, key);
  if (!squad) return formSquad(s, mine, undefined, key);
  const keep = new Set(mine.map((unit) => unit.uid));
  for (const unit of squadUnits(s, squad.id)) if (!keep.has(unit.uid)) leaveSquad(s, unit);
  return joinSquad(s, squad, mine);
}

/** [CAMBIO] Mayusculas + numero: añadir estas unidades al grupo de esa tecla (o formarlo). */
export function addToGroup(s: GameState, units: readonly Unit[], key: number): Squad | null {
  const mine = playerUnits(units);
  if (!mine.length) return null;
  const squad = squadByKey(s, key);
  return squad ? joinSquad(s, squad, mine) : formSquad(s, mine, undefined, key);
}

/** Meter unidades en una escuadra que ya existe (salen de la suya; las que no tenian orden siguen la de esta). */
function joinSquad(s: GameState, squad: Squad, units: readonly Unit[]): Squad {
  for (const unit of units) {
    if (unit.squad === squad.id) continue;
    leaveSquad(s, unit);
    unit.squad = squad.id;
    // Si ya hacia justo lo de la escuadra, la sigue (no va destacada).
    if (unit.command && squad.command && sameCommand(unit.command, forUnit(unit, squad.command))) delete unit.command;
  }
  pruneSquads(s);
  return squad;
}

/** Saca la unidad de su escuadra; si seguia la orden de la escuadra, se la queda como propia. */
export function leaveSquad(s: GameState, unit: Unit): void {
  if (unit.squad === undefined) return;
  if (!unit.command) {
    const squadCommand = squadById(s, unit.squad)?.command;
    if (squadCommand) unit.command = forUnit(unit, squadCommand);
  }
  delete unit.squad;
}

/**
 * Si todas las unidades de la escuadra llevan la misma orden propia (contando la escolta de una
 * captura), pasa a ser la orden de la escuadra. Asi una escuadra formada con unidades que ya iban
 * juntas, o una partida guardada antes de que las escuadras tuvieran orden, sigue igual.
 */
export function liftCommand(s: GameState, squad: Squad): void {
  const units = squadUnits(s, squad.id);
  if (!units.length || units.some((unit) => !unit.command)) return;
  // La de capturar manda: las demas van de escolta con "atacar" al mismo sitio.
  const lead = units.find((unit) => unit.command!.kind === 'capture') ?? units[0]!;
  const command = lead.command!;
  if (!units.every((unit) => sameCommand(unit.command!, forUnit(unit, command)))) return;
  squad.command = copyCommand(command);
  for (const unit of units) delete unit.command;
}

/** Cambia el nombre de una escuadra. Devuelve false si no existe o el nombre queda vacio. */
export function renameSquad(s: GameState, id: number, name: string): boolean {
  const squad = squadById(s, id);
  const clean = cleanSquadName(name);
  if (!squad || !clean) return false;
  squad.name = clean;
  return true;
}

/** Deshace una escuadra: sus unidades siguen ahi (con lo que estuvieran haciendo), pero sueltas. */
export function disbandSquad(s: GameState, id: number): void {
  for (const unit of squadUnits(s, id)) leaveSquad(s, unit);
  pruneSquads(s);
}

// ---------------------------------------------------------------------------
// Ordenes: la de la escuadra y la propia de cada unidad (destacada)
// ---------------------------------------------------------------------------

const sameCommand = (a: Command, b: Command): boolean => a.kind === b.kind && samePos(a.at, b.at);

const copyCommand = (command: Command): Command => ({ kind: command.kind, at: { x: command.at.x, y: command.at.y } });

/** La orden tal como la cumple esta unidad: con "capturar", las que no pueden capturar van de escolta (atacar). */
function forUnit(unit: Unit, command: Command): Command {
  const kind = command.kind === 'capture' && !isCapturer(unit) ? 'attack' : command.kind;
  return { kind, at: { x: command.at.x, y: command.at.y } };
}

/**
 * [CAMBIO] La orden que cumple la unidad: la suya propia si la tiene (destacada) y si no la de su
 * escuadra (adaptada: escolta en una captura). undefined = no tiene orden.
 */
export function effectiveCommand(s: GameState, unit: Unit): Command | undefined {
  // Llevada a mano a una casilla lejana (Unit.order): eso manda mientras dura.
  if (unit.order) return undefined;
  if (unit.command) return unit.command;
  const squadCommand = squadById(s, unit.squad)?.command;
  return squadCommand ? forUnit(unit, squadCommand) : undefined;
}

/** [CAMBIO] Va por su cuenta: es de una escuadra con orden y lleva otra propia distinta. */
export function isDetached(s: GameState, unit: Unit): boolean {
  const squadCommand = squadById(s, unit.squad)?.command;
  return !!unit.command && !!squadCommand && !sameCommand(unit.command, forUnit(unit, squadCommand));
}

/** Unidades del jugador de esa escuadra que siguen su orden (no destacadas). */
const followers = (s: GameState, squad: Squad) => squadUnits(s, squad.id).filter((unit) => !unit.command);

/** Los ids de escuadra a los que pertenecen todas sus unidades vivas de esta lista. */
function wholeSquads(s: GameState, units: readonly Unit[]): Set<number> {
  const ids = new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])));
  const picked = new Set(units.map((unit) => unit.uid));
  const isWhole = (id: number) => squadUnits(s, id).every((unit) => !isAlive(unit) || picked.has(unit.uid));
  return new Set([...ids].filter(isWhole));
}

/** Por que no se puede dar esa orden ahi (null = se puede). */
export function commandBlock(s: GameState, kind: CommandKind, at: Pos, units: readonly Unit[]): 'noBuilding' | 'noCapturer' | null {
  if (kind !== 'capture') return null;
  const building = buildingAt(s, at.x, at.y);
  if (!building || isPlayer(building.owner)) return 'noBuilding';
  if (!units.some((unit) => isCapturer(unit))) return 'noCapturer';
  return null;
}

/**
 * Ordenes que tiene sentido ofrecer en una casilla (clic derecho o pulsacion larga en el destino, con
 * unidades elegidas), en el orden del menu. Con un enemigo visible ahi, atacar va primero; si no, con
 * un edificio que estas unidades pueden capturar, capturar va primero. Defender siempre se puede.
 * `enemyHere`: hay un enemigo que el jugador ve en esa casilla (la niebla la decide la escena).
 */
export function commandChoices(s: GameState, at: Pos, units: readonly Unit[], enemyHere: boolean): CommandKind[] {
  const mine = playerUnits(units);
  if (!mine.length) return [];
  const canCapture = commandBlock(s, 'capture', at, mine) === null;
  if (enemyHere) return canCapture ? ['attack', 'capture', 'defend'] : ['attack', 'defend'];
  return canCapture ? ['capture', 'attack', 'defend'] : ['attack', 'defend'];
}

/** La unidad se queda con la orden como propia, salvo que sea justo la de su escuadra (entonces la sigue). */
function giveOwnCommand(s: GameState, unit: Unit, command: Command): void {
  unit.command = forUnit(unit, command);
  const squadCommand = squadById(s, unit.squad)?.command;
  if (squadCommand && sameCommand(unit.command, forUnit(unit, squadCommand))) delete unit.command;
}

/**
 * Da una orden con destino a estas unidades del jugador. Si son una escuadra entera, la orden es de
 * la escuadra (y se olvidan las propias); si son solo algunas, cada una se queda con la orden como
 * propia (destacada) y al cumplirla vuelve a la de su escuadra. Con "capturar", las que no pueden
 * capturar van de escolta. Devuelve cuantas la han recibido.
 */
export function giveCommand(s: GameState, units: readonly Unit[], kind: CommandKind, at: Pos): number {
  const mine = playerUnits(units);
  const command: Command = { kind, at: { x: at.x, y: at.y } };
  const whole = wholeSquads(s, mine);
  for (const id of whole) squadById(s, id)!.command = { ...command, at: { ...command.at } };
  for (const unit of mine) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.command;
    else giveOwnCommand(s, unit, command);
    delete unit.order;
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
  for (const unit of units) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.command;
    else if (unit.command) delete unit.command;
    else if (effectiveCommand(s, unit)) unit.command = { kind: 'defend', at: { x: unit.x, y: unit.y } };
  }
}

/** La orden de la escuadra ya esta cumplida: edificio tomado, o todas las que la siguen han llegado. */
function squadCommandDone(s: GameState, squad: Squad, command: Command): boolean {
  if (command.kind === 'capture') {
    const building = buildingAt(s, command.at.x, command.at.y);
    return !building || isPlayer(building.owner);
  }
  return followers(s, squad).every((unit) => !isAlive(unit) || atCommand(s, unit));
}

/**
 * [CAMBIO] La unidad ha cumplido la orden que seguia. Si era la suya, la olvida (vuelve a la de su
 * escuadra). Si era la de la escuadra, se quita cuando ya esta cumplida para la escuadra: al
 * capturar el edificio, o al atacar cuando han llegado todas las que la siguen.
 */
export function finishCommand(s: GameState, unit: Unit): void {
  if (unit.command) {
    delete unit.command;
    return;
  }
  const squad = squadById(s, unit.squad);
  if (!squad?.command) return;
  if (squadCommandDone(s, squad, squad.command)) delete squad.command;
}

/**
 * [CAMBIO] Has empezado a mano una captura con esta unidad: si llevaba una orden (suya o de su
 * escuadra) que no es capturar este edificio, ahora lo es, para que el turno siguiente no lo deje a
 * medias. En una escuadra queda destacada y, con el edificio tomado, vuelve a la orden de la escuadra.
 */
export function keepCapturing(s: GameState, unit: Unit): void {
  const building = buildingAt(s, unit.x, unit.y);
  const command = effectiveCommand(s, unit);
  if (!isPlayer(unit.team) || !building || isPlayer(building.owner) || !command) return;
  if (command.kind === 'capture' && samePos(command.at, unit)) return;
  unit.command = { kind: 'capture', at: { x: unit.x, y: unit.y } };
}

/** Ya ha llegado a la zona de su orden (a 1 casilla o menos). */
export function atCommand(s: GameState, unit: Unit): boolean {
  const command = effectiveCommand(s, unit);
  return !!command && manhattan(unit, command.at) <= 1;
}

/**
 * [CAMBIO] Dos unidades van en formacion: misma escuadra y misma orden (mismo destino; capturar y
 * atacar cuentan igual, porque con "capturar" las que no capturan van escoltando con "atacar").
 */
export function sameFormation(s: GameState, a: Unit, b: Unit): boolean {
  if (a.squad === undefined || a.squad !== b.squad || a.team !== b.team) return false;
  const commandA = effectiveCommand(s, a);
  const commandB = effectiveCommand(s, b);
  if (!commandA || !commandB) return false;
  const holds = (command: Command) => command.kind === 'defend';
  return holds(commandA) === holds(commandB) && samePos(commandA.at, commandB.at);
}

/** [CAMBIO] La escuadra entera (dos o mas unidades) lleva la misma orden: avanza en formacion. */
export function squadInFormation(s: GameState, id: number): boolean {
  const units = squadUnits(s, id);
  return units.length > 1 && units.every((unit) => sameFormation(s, units[0]!, unit));
}
