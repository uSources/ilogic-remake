/**
 * Partida por texto: las reglas del juego sin graficos, para probar cambios de reglas o de IA en
 * segundos (la usan los agentes de IA y los tests). Cada orden es una linea; la respuesta, texto.
 * Juega el bando 0 (azul, "tu"); el 1 (rojo) lo mueve la IA al terminar el turno.
 */
import { aiTurn } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { buildingTypeOf, terrainAt, unitTypeOf } from '@core/gameContent';
import { createGame, loadGame } from '@core/defaultGames';
import { posKey, samePos, seededRng } from '@core/geom';
import { mapGrid } from '@core/mapGrid';
import { abilityBlock, generalOf, newGeneral, useAbility } from '@core/generals';
import { buildMission, missionById } from '@core/missions';
import {
  attackFull,
  attackTargets,
  buildingAt,
  buyOptions,
  canCapture,
  capture,
  endRound,
  moveRange,
  moveUnit,
  outcome,
  reachableTiles,
  spawn,
  unitAt,
  unitById,
  visibility,
  wait,
} from '@core/rules';
import { serialize } from '@core/save';
import type { GameEvent, GameState, Pos, Rng, Unit } from '@core/model';

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

export interface SessionOptions {
  seed?: number;
  size?: number;
  theme?: number | null;
  fog?: boolean;
  mission?: string;
  /** Partida guardada (JSON) en vez de una nueva. */
  state?: string;
  /** General del jugador y de la IA (id de generals.json). */
  general?: string;
  enemyGeneral?: string;
}

export class Session {
  s: GameState;
  private rng: Rng;

  constructor(options: SessionOptions = {}) {
    const seed = options.seed ?? 1;
    this.rng = seededRng(seed ^ 0x9e3779b9);
    if (options.state) {
      const s = loadGame(options.state);
      if (!s) throw new Error('Partida guardada no valida');
      this.s = s;
    } else if (options.mission) {
      const mission = missionById(options.mission);
      if (!mission) throw new Error(`No existe la mision "${options.mission}"`);
      this.s = buildMission(mission, defaultContent());
    } else {
      this.s = createGame(seededRng(seed), {
        size: options.size ?? 20,
        theme: options.theme ?? null,
        ruleChanges: { fog: options.fog ?? false },
      });
      const pick = (id: string | undefined) => {
        if (!id) return null;
        const general = newGeneral(this.s, id);
        if (!general)
          throw new Error(
            `No existe el general "${id}" (${defaultContent()
              .files.generals.map((general) => general.id)
              .join(', ')})`,
          );
        return general;
      };
      const [general, enemyGeneral] = [pick(options.general), pick(options.enemyGeneral)];
      if (general || enemyGeneral) this.s.generals = [general, enemyGeneral];
    }
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
          wait(this.mine(numberAt(0)));
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
    if (unit.team !== 0) throw new UsageError(`la unidad ${uid} no es tuya`);
    if (needActive && !unit.active) throw new UsageError(`la unidad ${uid} ya ha actuado este turno`);
    if (unit.carrier !== null) throw new UsageError(`la unidad ${uid} va dentro de un transporte`);
    return unit;
  }

  /** Mapa en texto: terreno, edificios y unidades (las enemigas solo si se ven). */
  map(): string {
    const s = this.s;
    const vis = visibility(s, 0);
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
          cell = building.owner === null ? `*${char} ` : ` ${building.owner === 0 ? char : char.toLowerCase()} `;
        }
        if (unit && unit.carrier === null && (unit.team === 0 || vis.at({ x, y })))
          cell = (unit.team === 0 ? '+' : '-') + String(unit.uid).padStart(2, '0').slice(-2);
        else if (!vis.at({ x, y }) && !building) cell = ' ? ';
        row += cell;
      }
      rows.push(row);
    }
    return `${rows.join('\n')}\n${legend(this.s)}`;
  }

  units(team: number | null): string {
    const vis = visibility(this.s, 0);
    const list = this.s.units.filter((unit) => (team === null || unit.team === team) && (unit.team === 0 || vis.at(unit)));
    if (!list.length) return '(ninguna)';
    return list
      .map((unit) => {
        const usedTag = [unit.active ? '' : 'usada'].filter(Boolean).join(' ');
        return `${String(unit.uid).padStart(3)} ${unit.team === 0 ? 'tuya   ' : 'enemiga'} ${unitTypeOf(this.s, unit).id.padEnd(13)} (${unit.x},${unit.y}) vida ${unit.life} ${usedTag}`;
      })
      .join('\n');
  }

  unitInfo(unit: Unit): string {
    const range = moveRange(this.s, unit);
    const targets = attackTargets(this.s, unit);
    const tiles = reachableTiles(range);
    return [
      `${unit.uid} ${unitTypeOf(this.s, unit).id} en (${unit.x},${unit.y}), vida ${unit.life}, ${unit.active ? 'puede actuar' : 'ya ha actuado'}`,
      `puede ir a ${tiles.length} casillas: ${tiles.slice(0, 40).map(posKey).join(' ')}${tiles.length > 40 ? ' ...' : ''}`,
      `objetivos desde aqui: ${targets.length ? targets.map((unit) => `${unit.uid} ${unitTypeOf(this.s, unit).id} (${unit.x},${unit.y})`).join(', ') : 'ninguno'}`,
      canCapture(this.s, unit) ? 'puede capturar el edificio de debajo' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private move(unit: Unit, to: Pos): string {
    const path = moveUnit(this.s, unit, to);
    if (!path) throw new UsageError(`la unidad ${unit.uid} no puede llegar a (${posKey(to)})`);
    return path.ambush ? `emboscada: se para en (${unit.x},${unit.y})` : `movida a (${unit.x},${unit.y})`;
  }

  private attack(unit: Unit, at: Pos): string {
    const target = attackTargets(this.s, unit).find((target) => samePos(target, at));
    if (!target) throw new UsageError(`la unidad ${unit.uid} no puede atacar a (${posKey(at)}) desde (${unit.x},${unit.y})`);
    const result = attackFull(this.s, unit, target, this.rng);
    wait(unit);
    return `daño ${result.damage}${result.killed ? ' (destruida)' : ''}${result.counter ? `, contraataque ${result.counter}${result.attackerKilled ? ' (la tuya destruida)' : ''}` : ''}`;
  }

  private capture(unit: Unit): string {
    const result = capture(this.s, unit);
    if (!result) throw new UsageError(`la unidad ${unit.uid} no puede capturar ahi`);
    return result.done ? 'edificio capturado' : `capturando: quedan ${result.left} de ${result.total}`;
  }

  private buy(at: Pos, name: string): string {
    const building = buildingAt(this.s, at);
    if (!building || building.owner !== 0) throw new UsageError(`no tienes un edificio en (${posKey(at)})`);
    const unitType = this.s.content.units.list.find((candidate) => candidate.id.toLowerCase() === name.toLowerCase());
    const options = buyOptions(this.s, building);
    if (!options.length) throw new UsageError(`${buildingTypeOf(this.s, building).id} no fabrica unidades`);
    if (!unitType)
      return `error: tipo desconocido. Aqui se puede: ${options.map((buyOption) => `${buyOption.unitType.id} (${buyOption.cost})`).join(', ')}`;
    const unit = spawn(this.s, building, unitType);
    if (!unit) throw new UsageError(`no se puede comprar ${name} aqui (dinero ${this.s.funds[0]})`);
    return `comprada ${unit.uid} ${unitType.id} en (${posKey(at)}); quedan ${this.s.funds[0]}`;
  }

  /** Usar una habilidad del general (sin id: lista de habilidades y carga). */
  private power(id: string, target: { x: number; y: number } | null): string {
    const general = generalOf(this.s, 0);
    if (!general) throw new UsageError('no tienes general (--general Brisa)');
    const list = general.definition.abilities.map((ability) => `${ability.id} (${ability.cost})`).join(', ');
    if (!id)
      return `${general.definition.id}: carga ${general.state.charge.toFixed(1)}/${general.definition.charge.max}${general.state.used ? ', ya usada este turno' : ''}. Habilidades: ${list}`;
    const block = abilityBlock(this.s, 0, id, target);
    if (block) throw new UsageError(`no se puede usar ${id}: ${block} (habilidades: ${list})`);
    return describe(this.s, useAbility(this.s, 0, id, target)!);
  }

  /** Fin del turno propio (o la IA juega por ti con `ai`), turno enemigo y fin de ronda. */
  private endTurn(aiForMe: boolean): string {
    const out: string[] = [];
    if (aiForMe) for (const event of aiTurn(this.s, this.rng, 0)) out.push(`tu IA: ${describe(this.s, event)}`);
    for (const event of aiTurn(this.s, this.rng, 1)) out.push(`enemigo: ${describe(this.s, event)}`);
    const round = endRound(this.s);
    out.push(`--- dia ${this.s.day}: +${round.income[0]} de ingresos, dinero ${this.s.funds[0]}`);
    const result = outcome(this.s);
    if (result !== 'playing') out.push(`FIN: ${result}`);
    return out.join('\n');
  }

  status(): string {
    const s = this.s;
    const own = (team: number) => s.buildings.filter((building) => building.owner === team).length;
    return [
      `dia ${s.day} · dinero ${s.funds[0]} (enemigo ${s.funds[1]}) · edificios ${own(0)} contra ${own(1)}`,
      ...(s.generals?.[0] ? [`general ${s.generals[0].id}: carga ${s.generals[0].charge.toFixed(1)}`] : []),
      `unidades ${s.units.filter((unit) => unit.team === 0).length} contra ${s.units.filter((unit) => unit.team === 1).length} · resultado: ${outcome(s)}`,
      `sin usar: ${
        s.units
          .filter((unit) => unit.team === 0 && unit.active && unit.carrier === null)
          .map((unit) => unit.uid)
          .join(' ') || 'ninguna'
      }`,
    ].join('\n');
  }
}

class UsageError extends Error {}

function describe(s: GameState, event: GameEvent): string {
  const name = (uid: number) => {
    const unit = unitById(s, uid);
    return unit ? `${uid} ${unitTypeOf(s, unit).id}` : `${uid}`;
  };
  switch (event.kind) {
    case 'move':
      return `${name(event.uid)} mueve a (${event.path[event.path.length - 1]!.x},${event.path[event.path.length - 1]!.y})${event.ambush ? ' (emboscada)' : ''}`;
    case 'attack':
      return `${name(event.attacker)} ataca (${event.target.x},${event.target.y}): daño ${event.damage}${event.killed ? ', destruida' : ''}`;
    case 'capture':
      return `${name(event.uid)} captura (${event.at.x},${event.at.y})${event.left ? `, quedan ${event.left}` : ''}`;
    case 'spawn':
      return `compra ${name(event.uid)} en (${event.at.x},${event.at.y})`;
    case 'merge':
      return `${name(event.uid)} se une a ${name(event.into)}`;
    case 'load':
      return `${name(event.uid)} sube a ${name(event.into)}`;
    case 'wait':
      return `${name(event.uid)} espera`;
    case 'ability':
      return `general ${event.general} usa ${event.ability}${event.target ? ` en (${event.target.x},${event.target.y})` : ''}${event.hits.length ? `: ${event.hits.map((hit) => `${name(hit.uid)} -${hit.damage}`).join(', ')}` : ''}`;
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
  power [id] [x y]         habilidad del general (con --general; sin id, carga y lista)
  end                      fin de turno: juega la IA enemiga y empieza el dia siguiente
  ai                       la IA juega tu turno y el enemigo el suyo
  status                   dia, dinero, edificios y unidades
  state                    partida en JSON (para guardarla o abrirla en el juego)
Tambien en español: mapa, unidades, unidad, mover, atacar, capturar, esperar, comprar, fin, ia, estado.`;
