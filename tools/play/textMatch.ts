/**
 * Partida por texto: las reglas del juego sin graficos, para probar cambios de reglas o de IA en
 * segundos (la usan los agentes de IA y los tests). Cada orden es una linea; la respuesta, texto.
 * Juega la persona a la que le toca ("tu"; con varias, por turnos); los demas equipos los mueve la IA
 * al terminar el turno, en orden. La partida se juega con la misma sesion que la pantalla (GameSession):
 * lo que pasa solo al acabar y empezar cada turno, igual.
 */
import { aiTurn } from '@core/ai';
import { playerTeam, teamIds, teamState, teamValue } from '@core/teams';
import { defaultContent } from '@core/content/default';
import { buildingTypeOf, terrainAt, unitTypeOf } from '@core/gameContent';
import { createMatch, loadGame } from '@core/defaultGames';
import { skirmishConfig, type MatchConfig } from '@core/match';
import { posKey } from '@core/geom';
import { aiSeedFor, seededRng } from '@core/util/random';
import { mapGrid } from '@core/mapGrid';
import { generalOf } from '@core/generals';
import { missionById } from '@core/missions';
import {
  attackTargets,
  buildingAt,
  buyOptions,
  canCapture,
  roundReport,
  endsInAmbush,
  moveRange,
  isWinner,
  matchResult,
  reachableTiles,
  unitAt,
  unitById,
  visibility,
  canStillAct,
} from '@core/rules';
import { serialize } from '@core/save';
import { controllersFor } from '@core/controllers';
import { GameSession, runMatch, type ActedStep } from '@core/session';
import type { GameAction, GameEvent, GameState, Pos, Rng, TeamId, Unit } from '@core/model';

/** Una letra por terreno (por id de terrain.json; uno que no este sale como '?'). */
const TERRAIN_CHAR: Readonly<Record<string, string>> = {
  Grass: '.',
  Flowers: ',',
  Woods: 'f',
  GrassCliff: '^',
  Sand: ':',
  Cactus: 'c',
  SandCliff: 'M',
  Snow: '_',
  Frosty: 'o',
  SnowWood: 't',
  SnowCliff: '%',
  Ice: 'i',
  Water: '~',
  SWater: '-',
  DWater: '=',
};
/** Edificios: inicial (mayuscula = tuyo, minuscula = enemigo, * delante = neutral). */
const BUILDING_CHAR: Readonly<Record<string, string>> = { City: 'C', Oil: 'O', Factory: 'F', Stronghold: 'S', Airport: 'A', Base: 'B' };

export interface TextMatchOptions {
  seed?: number;
  /** Lado del mapa (si no, el de una partida nueva del juego: DEFAULT_MAP_SIZE). */
  size?: number;
  /** Tema (id de themes.json: Plains, Desert, Forest, Swamp, Snowy) o null al azar. */
  theme?: string | null;
  /** Con niebla (si no se dice, como en el juego: la de las reglas por defecto). */
  fog?: boolean;
  mission?: string;
  /** Partida guardada (JSON) en vez de una nueva. */
  state?: string;
  /** General del jugador y de la IA (id de generals.json). */
  general?: string;
  enemyGeneral?: string;
}

export class TextMatch {
  readonly s: GameState;
  private readonly rng: Rng;
  /** La partida en juego: los equipos de personas los juegan las ordenes; los demas, la IA. */
  private readonly session: GameSession;
  /** El equipo que se juega con las ordenes: la persona a la que le toca (con varias, por turnos). */
  private me: TeamId;
  /** Lo que se cuenta de lo que pasa mientras la partida sigue sola (turnos de los demas, ordenes). */
  private told: string[] = [];
  /** Los sucesos del ultimo fin de ronda (para contar lo cobrado). */
  private lastRound: GameEvent[] = [];

  /** Los demas equipos, en orden. */
  private get others(): TeamId[] {
    return teamIds(this.s).filter((team) => team !== this.me);
  }

  constructor(options: TextMatchOptions = {}) {
    const seed = options.seed ?? 1;
    this.rng = seededRng(aiSeedFor(seed));
    this.s = options.state ? loadedGame(options.state) : createMatch(matchConfigOf(options, seed));
    this.me = playerTeam(this.s);
    this.session = new GameSession(this.s, controllersFor(this.s, this.rng));
    this.session.subscribe((step) => this.note(step));
    this.advance();
    this.told = [];
  }

  /** Apunta lo que pasa: los sucesos que se cuentan (con quien los hace) y lo del fin de ronda. */
  private note(step: ActedStep): void {
    if (step.events.some((event) => event.kind === 'newDay')) this.lastRound = step.events;
    const prefix = step.team === this.me ? 'tu: ' : `equipo ${step.team}: `;
    this.told.push(...describeAll(this.s, step.events, prefix));
  }

  /** La partida sigue sola hasta que le toca a una persona (desde entonces se juega con ella) o se acaba. */
  private advance(): void {
    const step = runMatch(this.session);
    if (step.kind === 'awaitingInput') this.me = step.team;
  }

  /** Ejecuta una orden y devuelve la respuesta. Errores de uso: texto que empieza por "error:". */
  run(line: string): string {
    const [command = '', ...words] = line.trim().split(/\s+/);
    const numberAt = (position: number) => {
      const value = Number(words[position]);
      if (!Number.isInteger(value)) throw new UsageError(`falta un numero en la posicion ${position + 1}`);
      return value;
    };
    try {
      switch (command.toLowerCase()) {
        case '':
        case '#':
          return '';
        case 'help':
        case 'ayuda':
          return HELP;
        case 'map':
        case 'mapa':
          return this.map();
        case 'units':
        case 'unidades':
          return this.units(words[0] === undefined ? null : numberAt(0));
        case 'unit':
        case 'unidad':
          return this.unitInfo(this.mine(numberAt(0), false));
        case 'move':
        case 'mover':
          return this.move(this.mine(numberAt(0)), { x: numberAt(1), y: numberAt(2) });
        case 'attack':
        case 'atacar':
          return this.attack(this.mine(numberAt(0)), { x: numberAt(1), y: numberAt(2) });
        case 'capture':
        case 'capturar':
          return this.capture(this.mine(numberAt(0)));
        case 'wait':
        case 'esperar':
          this.perform({ kind: 'wait', uid: this.mine(numberAt(0)).uid }, 'no puede esperar');
          return 'ok';
        case 'buy':
        case 'comprar':
          return this.buy({ x: numberAt(0), y: numberAt(1) }, words[2] ?? '');
        case 'power':
        case 'poder':
          return this.power(words[0] ?? '', words[1] === undefined ? null : { x: numberAt(1), y: numberAt(2) });
        case 'end':
        case 'fin':
          return this.endTurn(false);
        case 'ai':
        case 'ia':
          return this.endTurn(true);
        case 'status':
        case 'estado':
          return this.status();
        case 'state':
        case 'json':
          return serialize(this.s);
        default:
          return `error: orden desconocida "${command}" (help para ver las ordenes)`;
      }
    } catch (error) {
      if (error instanceof UsageError) return `error: ${error.message}`;
      throw error;
    }
  }

  private mine(uid: number, needActive = true): Unit {
    const unit = unitById(this.s, uid);
    if (!unit) throw new UsageError(`no existe la unidad ${uid}`);
    if (unit.team !== this.me) throw new UsageError(`la unidad ${uid} no es tuya`);
    if (needActive && !canStillAct(unit)) throw new UsageError(`la unidad ${uid} ya ha actuado este turno`);
    if (unit.carrier !== null) throw new UsageError(`la unidad ${uid} va dentro de un transporte`);
    return unit;
  }

  /** Mapa en texto: terreno, edificios y unidades (las enemigas solo si se ven). */
  map(): string {
    const s = this.s;
    const vis = visibility(s, this.me);
    const map = mapGrid(s);
    const width = map.width,
      height = map.height;
    const head = '    ' + Array.from({ length: width }, (_, x) => String(x % 10).padStart(3)).join('');
    const rows = [head];
    for (let y = 0; y < height; y++) {
      let row = String(y).padStart(3) + ' ';
      for (let x = 0; x < width; x++) {
        const unit = unitAt(s, { x, y });
        const building = buildingAt(s, { x, y });
        let cell = ' ' + (TERRAIN_CHAR[terrainAt(s, { x, y }).id] ?? '?') + ' ';
        if (building) {
          const char = BUILDING_CHAR[buildingTypeOf(s, building).id] ?? '?';
          cell = building.owner === null ? `*${char} ` : ` ${building.owner === this.me ? char : char.toLowerCase()} `;
        }
        if (unit && unit.carrier === null && (unit.team === this.me || vis.at({ x, y })))
          cell = (unit.team === this.me ? '+' : '-') + String(unit.uid).padStart(2, '0').slice(-2);
        else if (!vis.at({ x, y }) && !building) cell = ' ? ';
        row += cell;
      }
      rows.push(row);
    }
    return `${rows.join('\n')}\n${legend(this.s)}`;
  }

  units(team: number | null): string {
    const vis = visibility(this.s, this.me);
    const list = this.s.units.filter((unit) => (team === null || unit.team === team) && (unit.team === this.me || vis.at(unit)));
    if (!list.length) return '(ninguna)';
    return list
      .map((unit) => {
        const usedTag = [canStillAct(unit) ? '' : 'usada'].filter(Boolean).join(' ');
        return `${String(unit.uid).padStart(3)} ${unit.team === this.me ? 'tuya   ' : 'enemiga'} ${unitTypeOf(this.s, unit).id.padEnd(13)} (${unit.x},${unit.y}) vida ${unit.life} ${usedTag}`;
      })
      .join('\n');
  }

  unitInfo(unit: Unit): string {
    const range = moveRange(this.s, unit);
    const targets = attackTargets(this.s, unit);
    const tiles = reachableTiles(range);
    return [
      `${unit.uid} ${unitTypeOf(this.s, unit).id} en (${unit.x},${unit.y}), vida ${unit.life}, ${canStillAct(unit) ? 'puede actuar' : 'ya ha actuado'}`,
      `puede ir a ${tiles.length} casillas: ${tiles.slice(0, 40).map(posKey).join(' ')}${tiles.length > 40 ? ' ...' : ''}`,
      `objetivos desde aqui: ${targets.length ? targets.map((unit) => `${unit.uid} ${unitTypeOf(this.s, unit).id} (${unit.x},${unit.y})`).join(', ') : 'ninguno'}`,
      canCapture(this.s, unit) ? 'puede capturar el edificio de debajo' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * La persona hace una accion de su equipo por la misma via que el juego (dispatch). Si no vale, el
   * error dice `problem` y la razon que da el nucleo.
   */
  private perform(action: GameAction, problem: string): GameEvent[] {
    const result = this.session.act(this.me, action);
    if (!result.ok) throw new UsageError(`${problem} (${result.reason})`);
    return result.events;
  }

  private move(unit: Unit, to: Pos): string {
    const events = this.perform({ kind: 'move', uid: unit.uid, to }, `la unidad ${unit.uid} no puede llegar a (${posKey(to)})`);
    return endsInAmbush(events) ? `emboscada: se para en (${unit.x},${unit.y})` : `movida a (${unit.x},${unit.y})`;
  }

  private attack(unit: Unit, at: Pos): string {
    const target = unitAt(this.s, at);
    const problem = `la unidad ${unit.uid} no puede atacar a (${posKey(at)}) desde (${unit.x},${unit.y})`;
    if (!target) throw new UsageError(problem);
    const [fight] = this.perform({ kind: 'attack', uid: unit.uid, target: target.uid }, problem);
    if (fight?.kind !== 'attack') return 'ok';
    const counter = fight.counter ? `, contraataque ${fight.counter}${fight.attackerKilled ? ' (la tuya destruida)' : ''}` : '';
    return `daño ${fight.damage}${fight.killed ? ' (destruida)' : ''}${counter}`;
  }

  private capture(unit: Unit): string {
    const [captured] = this.perform({ kind: 'capture', uid: unit.uid }, `la unidad ${unit.uid} no puede capturar ahi`);
    if (captured?.kind !== 'capture') return 'ok';
    return captured.left === 0 ? 'edificio capturado' : `capturando: quedan ${captured.left} de ${captured.total}`;
  }

  private buy(at: Pos, name: string): string {
    const building = buildingAt(this.s, at);
    if (!building || building.owner !== this.me) throw new UsageError(`no tienes un edificio en (${posKey(at)})`);
    const unitType = this.s.content.units.list.find((candidate) => candidate.id.toLowerCase() === name.toLowerCase());
    const options = buyOptions(this.s, building);
    if (!options.length) throw new UsageError(`${buildingTypeOf(this.s, building).id} no fabrica unidades`);
    if (!unitType)
      return `error: tipo desconocido. Aqui se puede: ${options.map((buyOption) => `${buyOption.unitType.id} (${buyOption.cost})`).join(', ')}`;
    const problem = `no se puede comprar ${name} aqui (dinero ${teamState(this.s, this.me).funds})`;
    const [built] = this.perform({ kind: 'buy', at, unitType: unitType.id }, problem);
    const uid = built?.kind === 'spawn' ? built.uid : '?';
    return `comprada ${uid} ${unitType.id} en (${posKey(at)}); quedan ${teamState(this.s, this.me).funds}`;
  }

  /** Usar un poder del general (sin id: lista de poderes y carga). */
  private power(id: string, target: { x: number; y: number } | null): string {
    const general = generalOf(this.s, this.me);
    if (!general) throw new UsageError('no tienes general (--general Brisa)');
    const list = general.definition.powers.map((power) => `${power.id} (${power.cost})`).join(', ');
    if (!id)
      return `${general.definition.id}: carga ${general.state.charge.toFixed(1)}/${general.definition.charge.max}${general.state.used ? ', ya usado este turno' : ''}. Poderes: ${list}`;
    const events = this.perform({ kind: 'usePower', power: id, target }, `no se puede usar ${id} (poderes: ${list})`);
    return describeAll(this.s, events, '').join('\n');
  }

  /**
   * Fin del turno propio (o la IA juega por ti con `ai`): lo que pasa solo al acabarlo (las ordenes
   * permanentes, las capturas que siguen), los turnos de los demas equipos por su orden (los
   * derrotados no juegan) con el fin de ronda tras el ultimo, y lo que pasa solo al empezar el
   * siguiente turno de una persona (los viajes): lo mismo que en la pantalla. Con varias personas, se
   * sigue con la siguiente.
   */
  private endTurn(aiForMe: boolean): string {
    const before = this.me;
    const out = aiForMe ? this.playMyTurnWithAi() : [];
    this.told = [];
    this.lastRound = [];
    this.session.finishInput(before);
    this.advance();
    out.push(...this.told);
    out.push(this.dayLine(before));
    if (this.me !== before) out.push(`--- turno del equipo ${this.me}`);
    const result = this.result();
    if (result !== 'sigue') out.push(`FIN: ${result}`);
    return out.join('\n');
  }

  /** El dia y el dinero del equipo; si en este fin de turno ha acabado una ronda, lo cobrado en ella. */
  private dayLine(team: TeamId): string {
    const funds = `dinero ${teamState(this.s, team).funds}`;
    if (!this.lastRound.length) return `--- dia ${this.s.day}: ${funds}`;
    const income = teamValue(roundReport(this.s, this.lastRound).income, team);
    return `--- dia ${this.s.day}: +${income} de ingresos, ${funds}`;
  }

  /** La IA juega tu turno, por la sesion (sus acciones quedan apuntadas como las tuyas): lo que ha hecho. */
  private playMyTurnWithAi(): string[] {
    return describeAll(this.s, aiTurn(this.s, this.rng, this.me, this.session.dispatcher), 'tu IA: ');
  }

  /** Como va la partida para ti: sigue, ganada, perdida o empate (y por que). */
  private result(): string {
    const result = matchResult(this.s);
    if (result.status === 'playing') return 'sigue';
    if (result.status === 'draw') return `empate (${result.reason})`;
    return `${isWinner(result, this.me) ? 'ganada' : 'perdida'} (${result.reason})`;
  }

  status(): string {
    const s = this.s;
    const me = this.me;
    const own = (team: TeamId) => s.buildings.filter((building) => building.owner === team).length;
    const unitsOf = (team: TeamId) => s.units.filter((unit) => unit.team === team).length;
    const others = (count: (team: TeamId) => number) => this.others.map(count).join('/');
    const general = teamState(s, me).general;
    return [
      `dia ${s.day} · dinero ${teamState(s, me).funds} (otros ${others((team) => teamState(s, team).funds)}) · edificios ${own(me)} contra ${others(own)}`,
      ...(general ? [`general ${general.id}: carga ${general.charge.toFixed(1)}`] : []),
      `unidades ${unitsOf(me)} contra ${others(unitsOf)} · resultado: ${this.result()}`,
      `sin usar: ${
        s.units
          .filter((unit) => unit.team === me && canStillAct(unit) && unit.carrier === null)
          .map((unit) => unit.uid)
          .join(' ') || 'ninguna'
      }`,
    ].join('\n');
  }
}

class UsageError extends Error {}

/** La partida guardada (si no es valida, para aqui). */
function loadedGame(json: string): GameState {
  const s = loadGame(json);
  if (!s) throw new Error('Partida guardada no valida');
  return s;
}

/** Un general que no existe para aqui; ninguno (undefined), sin general. */
function checkedGeneral(id: string | undefined): string | null {
  if (!id) return null;
  const known = defaultContent().generals.list.map((general) => general.id);
  if (!known.includes(id)) throw new Error(`No existe el general "${id}" (${known.join(', ')})`);
  return id;
}

/**
 * La partida que se pide: la mision, o una escaramuza con lo mismo que el juego en lo que no se
 * dice (skirmishConfig: mapa, reglas). Asi la misma semilla da la misma partida aqui y en la pantalla (K4).
 */
function matchConfigOf(options: TextMatchOptions, seed: number): MatchConfig {
  if (options.mission) {
    if (!missionById(options.mission)) throw new Error(`No existe la mision "${options.mission}"`);
    return { mode: 'mission', mission: options.mission, diceSeed: seed };
  }
  return skirmishConfig({
    seed,
    size: options.size,
    theme: options.theme,
    ruleChanges: options.fog === undefined ? {} : { fog: options.fog },
    teams: [
      { controller: 'human', general: checkedGeneral(options.general) },
      { controller: 'ai', general: checkedGeneral(options.enemyGeneral) },
    ],
  });
}

/**
 * Lo que se cuenta de unos sucesos, una linea por suceso con `prefix` delante (los que no dicen nada
 * nuevo, como esperar o una orden cumplida, no se cuentan).
 */
function describeAll(s: GameState, events: Iterable<GameEvent>, prefix: string): string[] {
  const lines: string[] = [];
  for (const event of events) {
    const line = describe(s, event);
    if (line) lines.push(prefix + line);
  }
  return lines;
}

/** Un suceso en una linea, o null si no merece la pena contarlo. */
function describe(s: GameState, event: GameEvent): string | null {
  const name = (uid: number) => {
    const unit = unitById(s, uid);
    return unit ? `${uid} ${unitTypeOf(s, unit).id}` : `${uid}`;
  };
  switch (event.kind) {
    case 'move':
      return `${name(event.uid)} mueve a (${event.path[event.path.length - 1]!.x},${event.path[event.path.length - 1]!.y})${event.ambush ? ' (emboscada)' : ''}`;
    case 'attack':
      return `${name(event.attacker)} ataca (${event.at.x},${event.at.y}): daño ${event.damage}${event.killed ? ', destruida' : ''}`;
    case 'capture':
      return `${name(event.uid)} captura (${event.at.x},${event.at.y})${event.left ? `, quedan ${event.left}` : ''}`;
    case 'spawn':
      return `compra ${name(event.uid)} en (${event.at.x},${event.at.y})`;
    case 'merge':
      return `${name(event.uid)} se une a ${name(event.into)}`;
    case 'load':
      return `${name(event.uid)} sube a ${name(event.into)}`;
    case 'unload':
      return `${name(event.uid)} baja a ${name(event.passenger)} en (${event.to.x},${event.to.y})`;
    case 'supply':
      return `${name(event.uid)} repara a ${event.repairs.length}`;
    case 'power':
      return `general ${event.general} usa ${event.power}${event.target ? ` en (${event.target.x},${event.target.y})` : ''}${event.hits.length ? `: ${event.hits.map((hit) => `${name(hit.uid)} -${hit.damage}`).join(', ')}` : ''}`;
    default:
      // Esperar, ordenes, escuadras, viajes y el fin de ronda (eso lo resume endTurn) no se cuentan.
      return null;
  }
}

const legend = (s: GameState): string => `+NN unidad tuya · -NN enemiga · ? no se ve
Terreno: . hierba , flores f bosque ^ acantilado : arena c cactus M meseta _ nieve o muñeco t pinos % roca nevada i hielo ~ agua - poco profunda = profunda
Edificios: C ciudad O petroleo F fabrica S fortaleza A aeropuerto B base (mayuscula tuyo, minuscula enemigo, * neutral)
Edificios de tipo: ${s.content.buildings.list.map((building) => building.id).join(', ')}`;

const HELP = `Ordenes (coordenadas x y desde 0, arriba a la izquierda):
  map                      mapa en texto
  units [0|1]              unidades (las enemigas solo si se ven)
  unit <id>                a donde puede ir y a quien puede atacar
  move <id> <x> <y>        mover
  attack <id> <x> <y>      atacar a la unidad de (x,y) desde donde esta (mover antes si hace falta)
  capture <id>             capturar el edificio de debajo
  wait <id>                terminar con la unidad
  buy <x> <y> <Tipo>       comprar en un edificio tuyo (Soldier, Tank...; sin tipo, lista)
  power [id] [x y]         poder del general (con --general; sin id, carga y lista)
  end                      fin de turno: juega la IA enemiga y empieza el dia siguiente
  ai                       la IA juega tu turno y el enemigo el suyo
  status                   dia, dinero, edificios y unidades
  state                    partida en JSON (para guardarla o abrirla en el juego)
Tambien en español: mapa, unidades, unidad, mover, atacar, capturar, esperar, comprar, fin, ia, estado.`;
