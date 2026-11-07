/**
 * Partida por texto: las reglas del juego sin graficos, para probar cambios de reglas o de IA en
 * segundos (la usan los agentes de IA y los tests). Cada orden es una linea; la respuesta, texto.
 * Juega la persona a la que le toca ("tu"; con varias, por turnos); los demas equipos los mueve la IA
 * al terminar el turno, en orden. La partida se juega con la misma sesion que la pantalla (GameSession):
 * lo que pasa solo al acabar y empezar cada turno, igual.
 */
import { playerTeam, shownTeamNumber, teamIds, teamState, teamValue } from '@core/teams';
import { defaultContent } from '@core/content/default';
import { buildingTypeOf, terrainAt, unitTypeOf } from '@core/gameContent';
import { createMatch, loadGame } from '@core/defaultGames';
import { skirmishConfig, type MatchConfig } from '@core/match';
import { posKey } from '@core/geom';
import { mapGrid } from '@core/mapGrid';
import { generalOf } from '@core/generals';
import { missionById } from '@core/missions';
import {
  attackTargets,
  buildingAt,
  buyOptions,
  canCapture,
  roundReport,
  endsInterrupted,
  moveRange,
  outcomeFor,
  type MatchOutcome,
  reachableTiles,
  unitAt,
  unitById,
  visibility,
  canStillAct,
  buildingsOf,
  teamUnits,
} from '@core/rules';
import { serialize } from '@core/save';
import { aiController, screenControllers } from '@core/controllers';
import { GameSession, personStillPlays, runMatch, screenEnd, type ActedStep } from '@core/session';
import type { DefeatReason, GameAction, GameEvent, GameEventOf, GameState, InterruptionKind, Pos, TeamId, Unit } from '@core/model';

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
  /** La partida en juego: los equipos de personas los juegan las ordenes; los demas, la IA. */
  private readonly session: GameSession;
  /** El equipo que se juega con las ordenes: la persona a la que le toca (con varias, por turnos). */
  private me: TeamId;
  /** Lo que se cuenta de lo que pasa mientras la partida sigue sola (turnos de los demas, ordenes). */
  private told: string[] = [];
  /** Los sucesos del ultimo fin de ronda (para contar lo cobrado). */
  private lastRound: GameEvent[] = [];
  /** La IA esta jugando el turno de la persona (orden `ai`): lo que hace se cuenta como suyo. */
  private aiPlaysForMe = false;

  /** Los demas equipos, en orden. */
  private get others(): TeamId[] {
    return teamIds(this.s).filter((team) => team !== this.me);
  }

  constructor(options: TextMatchOptions = {}) {
    const seed = options.seed ?? 1;
    this.s = options.state ? loadedGame(options.state) : createMatch(matchConfigOf(options, seed));
    this.me = playerTeam(this.s);
    this.session = new GameSession(this.s, screenControllers(this.s));
    this.session.subscribe((step) => this.note(step));
    this.advance();
    this.told = [];
  }

  /** Apunta lo que pasa: los sucesos que se cuentan (con quien los hace) y lo del fin de ronda. */
  private note(step: ActedStep): void {
    if (step.events.some((event) => event.kind === 'newDay')) this.lastRound = step.events;
    // Lo que pasa al acabar el turno ya no es de la IA que jugaba por ti (como cuando lo acabas tu).
    if (step.action.kind === 'endTurn') this.aiPlaysForMe = false;
    const prefix = step.team !== this.me ? `equipo ${shownTeamNumber(step.team)}: ` : this.aiPlaysForMe ? 'tu IA: ' : 'tu: ';
    this.told.push(...describeAll(this.s, step.events, prefix));
  }

  /**
   * La partida sigue sola hasta que le toca a una persona (desde entonces se juega con ella), se acaba
   * o ya no juega ninguna persona (se acaba para esta pantalla, como en el juego: screenEnd).
   */
  private advance(): void {
    const step = runMatch(this.session, { until: () => !personStillPlays(this.session) });
    if (step.kind === 'awaitingInput') this.me = step.team;
  }

  /** Las ordenes, en ingles y en español; `plays`: juega (no vale con la partida acabada para esta pantalla). */
  private static readonly COMMANDS: readonly TextCommand[] = [
    { names: ['', '#'], plays: false, run: () => '' },
    { names: ['help', 'ayuda'], plays: false, run: () => HELP },
    { names: ['map', 'mapa'], plays: false, run: (match) => match.map() },
    {
      names: ['units', 'unidades'],
      plays: false,
      run: (match, words) => match.units(words.list[0] === undefined ? null : words.numberAt(0)),
    },
    { names: ['unit', 'unidad'], plays: false, run: (match, words) => match.unitInfo(match.mine(words.numberAt(0), false)) },
    { names: ['move', 'mover'], plays: true, run: (match, words) => match.move(match.mine(words.numberAt(0)), words.posAt(1)) },
    { names: ['attack', 'atacar'], plays: true, run: (match, words) => match.attack(match.mine(words.numberAt(0)), words.posAt(1)) },
    { names: ['capture', 'capturar'], plays: true, run: (match, words) => match.capture(match.mine(words.numberAt(0))) },
    {
      names: ['wait', 'esperar'],
      plays: true,
      run: (match, words) => {
        match.perform({ kind: 'wait', uid: match.mine(words.numberAt(0)).uid }, 'no puede esperar');
        return 'ok';
      },
    },
    { names: ['buy', 'comprar'], plays: true, run: (match, words) => match.buy(words.posAt(0), words.list[2] ?? '') },
    {
      names: ['power', 'poder'],
      plays: true,
      run: (match, words) => match.power(words.list[0] ?? '', words.list[1] === undefined ? null : words.posAt(1)),
    },
    { names: ['end', 'fin'], plays: true, run: (match) => match.endTurn(false) },
    { names: ['ai', 'ia'], plays: true, run: (match) => match.endTurn(true) },
    { names: ['surrender', 'rendirse'], plays: true, run: (match) => match.surrender() },
    { names: ['status', 'estado'], plays: false, run: (match) => match.status() },
    { names: ['state', 'json'], plays: false, run: (match) => serialize(match.s) },
  ];

  private static readonly COMMAND_BY_NAME: ReadonlyMap<string, TextCommand> = new Map(
    TextMatch.COMMANDS.flatMap((command) => command.names.map((name) => [name, command] as const)),
  );

  /** Ejecuta una orden y devuelve la respuesta. Errores de uso: texto que empieza por "error:". */
  run(line: string): string {
    const [name = '', ...words] = line.trim().split(/\s+/);
    try {
      const command = TextMatch.COMMAND_BY_NAME.get(name.toLowerCase());
      if (!command) return `error: orden desconocida "${name}" (help para ver las ordenes)`;
      // Acabada para esta pantalla, solo se mira: nada de seguir jugando (ni de exportar mas jugadas).
      if (command.plays && screenEnd(this.session, this.me)) return `error: la partida ha acabado (${this.result()})`;
      return command.run(this, commandWords(words));
    } catch (error) {
      if (error instanceof UsageError) return `error: ${error.message}`;
      throw error;
    }
  }

  /** Rendirse: lo que cuenta (tu caida) y despues lo que pase al seguir los demas. */
  private surrender(): string {
    this.told = [];
    this.perform({ kind: 'surrender' }, 'no puede rendirse');
    const said = this.told;
    return [...said, this.endTurn(false)].join('\n');
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
    const { width, height } = map;
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
    return endsInterrupted(events) ? `emboscada: se para en (${unit.x},${unit.y})` : `movida a (${unit.x},${unit.y})`;
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
    this.told = [];
    this.lastRound = [];
    if (aiForMe) this.handTurnToAi();
    else this.session.finishInput(before);
    this.advance();
    const out = [...this.told];
    out.push(this.dayLine(before));
    if (this.me !== before) out.push(`--- turno del equipo ${shownTeamNumber(this.me)}`);
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

  /**
   * La IA juega lo que queda de tu turno: se lo dejas a la sesion (`handOver`), que lo juega como el
   * de cualquier equipo de la IA (su perfil, su vista; sus acciones quedan apuntadas como tuyas) y
   * despues pasa el turno.
   */
  private handTurnToAi(): void {
    this.aiPlaysForMe = true;
    this.session.handOver(this.me, aiController());
  }

  /** Como va la partida para ti: sigue, ganada, perdida o empate (y por que). */
  private result(): string {
    const end = screenEnd(this.session, this.me);
    if (!end) return 'sigue';
    if (end.kind === 'out') return `perdida (${DEFEAT_TEXT[end.fall.reason]}; los demas siguen sin personas)`;
    return `${OUTCOME_TEXT[outcomeFor(end.result, this.me)]} (${end.result.reason})`;
  }

  status(): string {
    const s = this.s;
    const me = this.me;
    const own = (team: TeamId) => buildingsOf(s, team).length;
    const unitsOf = (team: TeamId) => teamUnits(s, team).length;
    const others = (count: (team: TeamId) => number) => this.others.map(count).join('/');
    const general = teamState(s, me).general;
    return [
      `dia ${s.day} · dinero ${teamState(s, me).funds} (otros ${others((team) => teamState(s, team).funds)}) · edificios ${own(me)} contra ${others(own)}`,
      ...(general ? [`general ${general.id}: carga ${general.charge.toFixed(1)}`] : []),
      `unidades ${unitsOf(me)} contra ${others(unitsOf)} · resultado: ${this.result()}`,
      `sin usar: ${
        teamUnits(s, me)
          .filter((unit) => canStillAct(unit) && unit.carrier === null)
          .map((unit) => unit.uid)
          .join(' ') || 'ninguna'
      }`,
    ].join('\n');
  }
}

class UsageError extends Error {}

/** Las palabras que siguen a una orden y como leer de ellas un numero o una casilla. */
interface CommandWords {
  list: readonly string[];
  numberAt(position: number): number;
  /** La casilla de las palabras `position` (x) y la siguiente (y). */
  posAt(position: number): Pos;
}

function commandWords(list: readonly string[]): CommandWords {
  const numberAt = (position: number) => {
    const value = Number(list[position]);
    if (!Number.isInteger(value)) throw new UsageError(`falta un numero en la posicion ${position + 1}`);
    return value;
  };
  return { list, numberAt, posAt: (position) => ({ x: numberAt(position), y: numberAt(position + 1) }) };
}

/** Una orden de la partida por texto: sus nombres, si juega y lo que hace. */
interface TextCommand {
  names: readonly string[];
  plays: boolean;
  run(match: TextMatch, words: CommandWords): string;
}

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
    if (!missionById(defaultContent(), options.mission)) throw new Error(`No existe la mision "${options.mission}"`);
    return { mode: 'mission', mission: options.mission, seed };
  }
  return skirmishConfig({
    seed,
    size: options.size,
    theme: options.theme,
    settingChanges: options.fog === undefined ? {} : { fog: options.fog },
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

/** Como ha acabado para ti, en una palabra. */
const OUTCOME_TEXT: Record<MatchOutcome, string> = { won: 'ganada', lost: 'perdida', draw: 'empate' };

/** Por que cae un equipo, en una palabra o dos. */
const DEFEAT_TEXT: Record<DefeatReason, string> = { hq: 'sin Base', wipeout: 'sin nada', surrender: 'rendido' };

/** Que ha cortado un camino, en una palabra (los que no estan aqui, por su nombre en el codigo). */
const INTERRUPTION_NAMES: Partial<Record<InterruptionKind, string>> = { ambush: 'emboscada' };

/** Como se nombra una unidad en el texto: su uid y su tipo (si ya no esta, solo el uid). */
function unitName(s: GameState, uid: number): string {
  const unit = unitById(s, uid);
  return unit ? `${uid} ${unitTypeOf(s, unit).id}` : `${uid}`;
}

const at = (pos: Pos): string => `(${pos.x},${pos.y})`;

/** Cada suceso que se cuenta, en una linea. Los que no estan (esperar, ordenes, escuadras, viajes y el fin de ronda, que resume endTurn) no se cuentan. */
const EVENT_TEXT: { readonly [Kind in GameEvent['kind']]?: (s: GameState, event: GameEventOf<Kind>) => string } = {
  move: (s, event) => {
    const interruption = event.interruption ? ` (${INTERRUPTION_NAMES[event.interruption.kind] ?? event.interruption.kind})` : '';
    return `${unitName(s, event.uid)} mueve a ${at(event.path[event.path.length - 1]!)}${interruption}`;
  },
  attack: (s, event) => `${unitName(s, event.attacker)} ataca ${at(event.at)}: daño ${event.damage}${event.killed ? ', destruida' : ''}`,
  capture: (s, event) => `${unitName(s, event.uid)} captura ${at(event.at)}${event.left ? `, quedan ${event.left}` : ''}`,
  spawn: (s, event) => `compra ${unitName(s, event.uid)} en ${at(event.at)}`,
  merge: (s, event) => `${unitName(s, event.uid)} se une a ${unitName(s, event.into)}`,
  load: (s, event) => `${unitName(s, event.uid)} sube a ${unitName(s, event.into)}`,
  unload: (s, event) => `${unitName(s, event.uid)} baja a ${unitName(s, event.passenger)} en ${at(event.to)}`,
  supply: (s, event) => `${unitName(s, event.uid)} repara a ${event.repairs.length}`,
  power: (s, event) => {
    const target = event.target ? ` en ${at(event.target)}` : '';
    const hits = event.hits.length ? `: ${event.hits.map((hit) => `${unitName(s, hit.uid)} -${hit.damage}`).join(', ')}` : '';
    return `general ${event.general} usa ${event.power}${target}${hits}`;
  },
  surrender: (_s, event) => `el equipo ${shownTeamNumber(event.actor)} se rinde`,
  teamDefeated: (_s, event) => `el equipo ${shownTeamNumber(event.team)} queda fuera (${DEFEAT_TEXT[event.reason]})`,
};

/** Un suceso en una linea, o null si no merece la pena contarlo. */
function describe(s: GameState, event: GameEvent): string | null {
  const text = EVENT_TEXT[event.kind] as ((s: GameState, event: GameEvent) => string) | undefined;
  return text ? text(s, event) : null;
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
  surrender                rendirse (y siguen los demas, si queda alguna persona)
  status                   dia, dinero, edificios y unidades
  state                    partida en JSON (para guardarla o abrirla en el juego)
Tambien en español: mapa, unidades, unidad, mover, atacar, capturar, esperar, comprar, fin, ia, rendirse, estado.`;
