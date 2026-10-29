/**
 * Partida por texto: las reglas del juego sin graficos, para probar cambios de reglas o de IA en
 * segundos (la usan los agentes de IA y los tests). Cada orden es una linea; la respuesta, texto.
 * Juega el bando 0 (azul, "tu"); el 1 (rojo) lo mueve la IA al terminar el turno.
 */
import { aiTurn } from '../../src/core/ai';
import { BUILDING_NAMES, DEFAULT_RULES, TERRAIN_NAMES, UNIT, UNIT_NAMES, useRules } from '../../src/core/data';
import { seededRng } from '../../src/core/geom';
import { generateGame } from '../../src/core/mapgen';
import { buildMission, missionById, missionRules } from '../../src/core/missions';
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
} from '../../src/core/rules';
import { deserialize, serialize } from '../../src/core/save';
import type { GameEvent, GameState, Rng, Unit } from '../../src/core/types';

/** Una letra por terreno (minuscula = suelo; mayuscula = obstaculo o agua). */
const TERRAIN_CHAR: Record<(typeof TERRAIN_NAMES)[number], string> = {
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
const BUILDING_CHAR = ['C', 'O', 'F', 'S', 'A', 'B'];

export interface SessionOptions {
  seed?: number;
  size?: number;
  theme?: number | null;
  fog?: boolean;
  mission?: string;
  /** Partida guardada (JSON) en vez de una nueva. */
  state?: string;
}

export class Session {
  s: GameState;
  private rng: Rng;

  constructor(opts: SessionOptions = {}) {
    const seed = opts.seed ?? 1;
    this.rng = seededRng(seed ^ 0x9e3779b9);
    if (opts.state) {
      const s = deserialize(opts.state);
      if (!s) throw new Error('Partida guardada no valida');
      useRules({ ...DEFAULT_RULES, ...(s.rules ?? {}) });
      this.s = s;
    } else if (opts.mission) {
      const m = missionById(opts.mission);
      if (!m) throw new Error(`No existe la mision "${opts.mission}"`);
      useRules(missionRules(m));
      this.s = buildMission(m);
    } else {
      useRules({ ...DEFAULT_RULES, fog: opts.fog ?? false });
      this.s = generateGame(seededRng(seed), { size: opts.size ?? 20, theme: opts.theme ?? null });
    }
  }

  /** Ejecuta una orden y devuelve la respuesta. Errores de uso: texto que empieza por "error:". */
  run(line: string): string {
    const [cmd = '', ...a] = line.trim().split(/\s+/);
    const n = (i: number) => {
      const v = Number(a[i]);
      if (!Number.isInteger(v)) throw new UsageError(`falta un numero en la posicion ${i + 1}`);
      return v;
    };
    try {
      switch (cmd.toLowerCase()) {
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
          return this.units(a[0] === undefined ? null : n(0));
        case 'unit':
        case 'unidad':
          return this.unitInfo(this.mine(n(0), false));
        case 'move':
        case 'mover':
          return this.move(this.mine(n(0)), n(1), n(2));
        case 'attack':
        case 'atacar':
          return this.attack(this.mine(n(0)), n(1), n(2));
        case 'capture':
        case 'capturar':
          return this.capture(this.mine(n(0)));
        case 'wait':
        case 'esperar':
          wait(this.mine(n(0)));
          return 'ok';
        case 'buy':
        case 'comprar':
          return this.buy(n(0), n(1), a[2] ?? '');
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
          return `error: orden desconocida "${cmd}" (help para ver las ordenes)`;
      }
    } catch (e) {
      if (e instanceof UsageError) return `error: ${e.message}`;
      throw e;
    }
  }

  private mine(uid: number, needActive = true): Unit {
    const u = unitById(this.s, uid);
    if (!u) throw new UsageError(`no existe la unidad ${uid}`);
    if (u.team !== 0) throw new UsageError(`la unidad ${uid} no es tuya`);
    if (needActive && !u.active) throw new UsageError(`la unidad ${uid} ya ha actuado este turno`);
    if (u.carrier !== null) throw new UsageError(`la unidad ${uid} va dentro de un transporte`);
    return u;
  }

  /** Mapa en texto: terreno, edificios y unidades (las enemigas solo si se ven). */
  map(): string {
    const s = this.s;
    const vis = visibility(s, 0);
    const W = s.map.length,
      H = s.map[0]!.length;
    const head = '    ' + Array.from({ length: W }, (_, x) => String(x % 10).padStart(3)).join('');
    const rows = [head];
    for (let y = 0; y < H; y++) {
      let row = String(y).padStart(3) + ' ';
      for (let x = 0; x < W; x++) {
        const u = unitAt(s, x, y);
        const b = buildingAt(s, x, y);
        let cell = ' ' + TERRAIN_CHAR[TERRAIN_NAMES[s.map[x]![y]!]!] + ' ';
        if (b) {
          const c = BUILDING_CHAR[b.type]!;
          cell = b.owner === null ? `*${c} ` : ` ${b.owner === 0 ? c : c.toLowerCase()} `;
        }
        if (u && u.carrier === null && (u.team === 0 || vis[x]![y]))
          cell = (u.team === 0 ? '+' : '-') + String(u.uid).padStart(2, '0').slice(-2);
        else if (!vis[x]![y] && !b) cell = ' ? ';
        row += cell;
      }
      rows.push(row);
    }
    return `${rows.join('\n')}\n${LEGEND}`;
  }

  units(team: number | null): string {
    const vis = visibility(this.s, 0);
    const list = this.s.units.filter((u) => (team === null || u.team === team) && (u.team === 0 || vis[u.x]![u.y]));
    if (!list.length) return '(ninguna)';
    return list
      .map((u) => {
        const st = [
          UNIT.maxfuel[u.type]! > 0 ? `comb ${u.fuel}` : '',
          UNIT.maxammo[u.type]! > 0 ? `mun ${u.ammo}` : '',
          u.active ? '' : 'usada',
        ]
          .filter(Boolean)
          .join(' ');
        return `${String(u.uid).padStart(3)} ${u.team === 0 ? 'tuya   ' : 'enemiga'} ${UNIT_NAMES[u.type]!.padEnd(13)} (${u.x},${u.y}) vida ${u.life} ${st}`;
      })
      .join('\n');
  }

  unitInfo(u: Unit): string {
    const r = moveRange(this.s, u);
    const targets = attackTargets(this.s, u);
    const tiles = reachableTiles(r);
    return [
      `${u.uid} ${UNIT_NAMES[u.type]} en (${u.x},${u.y}), vida ${u.life}, ${u.active ? 'puede actuar' : 'ya ha actuado'}`,
      `puede ir a ${tiles.length} casillas: ${tiles
        .slice(0, 40)
        .map((p) => `${p.x},${p.y}`)
        .join(' ')}${tiles.length > 40 ? ' ...' : ''}`,
      `objetivos desde aqui: ${targets.length ? targets.map((t) => `${t.uid} ${UNIT_NAMES[t.type]} (${t.x},${t.y})`).join(', ') : 'ninguno'}`,
      canCapture(this.s, u) ? 'puede capturar el edificio de debajo' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private move(u: Unit, x: number, y: number): string {
    const path = moveUnit(this.s, u, { x, y });
    if (!path) throw new UsageError(`la unidad ${u.uid} no puede llegar a (${x},${y})`);
    return path.ambush ? `emboscada: se para en (${u.x},${u.y})` : `movida a (${u.x},${u.y})`;
  }

  private attack(u: Unit, x: number, y: number): string {
    const t = attackTargets(this.s, u).find((v) => v.x === x && v.y === y);
    if (!t) throw new UsageError(`la unidad ${u.uid} no puede atacar a (${x},${y}) desde (${u.x},${u.y})`);
    const r = attackFull(this.s, u, t, this.rng);
    wait(u);
    return `daño ${r.damage}${r.killed ? ' (destruida)' : ''}${r.counter ? `, contraataque ${r.counter}${r.attackerKilled ? ' (la tuya destruida)' : ''}` : ''}`;
  }

  private capture(u: Unit): string {
    const r = capture(this.s, u);
    if (!r) throw new UsageError(`la unidad ${u.uid} no puede capturar ahi`);
    return r.done ? 'edificio capturado' : `capturando: quedan ${r.left} de ${r.total}`;
  }

  private buy(x: number, y: number, name: string): string {
    const b = buildingAt(this.s, x, y);
    if (!b || b.owner !== 0) throw new UsageError(`no tienes un edificio en (${x},${y})`);
    const type = UNIT_NAMES.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    const opts = buyOptions(this.s, b);
    if (!opts.length) throw new UsageError(`${BUILDING_NAMES[b.type]} no fabrica unidades`);
    if (type < 0) return `error: tipo desconocido. Aqui se puede: ${opts.map((o) => `${UNIT_NAMES[o.type]} (${o.cost})`).join(', ')}`;
    const u = spawn(this.s, b, type);
    if (!u) throw new UsageError(`no se puede comprar ${name} aqui (dinero ${this.s.funds[0]})`);
    return `comprada ${u.uid} ${UNIT_NAMES[type]} en (${x},${y}); quedan ${this.s.funds[0]}`;
  }

  /** Fin del turno propio (o la IA juega por ti con `ai`), turno enemigo y fin de ronda. */
  private endTurn(aiForMe: boolean): string {
    const out: string[] = [];
    if (aiForMe) for (const ev of aiTurn(this.s, this.rng, 0)) out.push(`tu IA: ${describe(this.s, ev)}`);
    for (const ev of aiTurn(this.s, this.rng, 1)) out.push(`enemigo: ${describe(this.s, ev)}`);
    const r = endRound(this.s);
    out.push(`--- dia ${this.s.day}: +${r.income[0]} de ingresos, dinero ${this.s.funds[0]}`);
    const o = outcome(this.s);
    if (o !== 'playing') out.push(`FIN: ${o}`);
    return out.join('\n');
  }

  status(): string {
    const s = this.s;
    const own = (t: number) => s.buildings.filter((b) => b.owner === t).length;
    return [
      `dia ${s.day} · dinero ${s.funds[0]} (enemigo ${s.funds[1]}) · edificios ${own(0)} contra ${own(1)}`,
      `unidades ${s.units.filter((u) => u.team === 0).length} contra ${s.units.filter((u) => u.team === 1).length} · resultado: ${outcome(s)}`,
      `sin usar: ${
        s.units
          .filter((u) => u.team === 0 && u.active && u.carrier === null)
          .map((u) => u.uid)
          .join(' ') || 'ninguna'
      }`,
    ].join('\n');
  }
}

class UsageError extends Error {}

function describe(s: GameState, ev: GameEvent): string {
  const name = (uid: number) => {
    const u = unitById(s, uid);
    return u ? `${uid} ${UNIT_NAMES[u.type]}` : `${uid}`;
  };
  switch (ev.kind) {
    case 'move':
      return `${name(ev.uid)} mueve a (${ev.path[ev.path.length - 1]!.x},${ev.path[ev.path.length - 1]!.y})${ev.ambush ? ' (emboscada)' : ''}`;
    case 'attack':
      return `${name(ev.attacker)} ataca (${ev.target.x},${ev.target.y}): daño ${ev.damage}${ev.killed ? ', destruida' : ''}`;
    case 'capture':
      return `${name(ev.uid)} captura (${ev.at.x},${ev.at.y})${ev.left ? `, quedan ${ev.left}` : ''}`;
    case 'spawn':
      return `compra ${name(ev.uid)} en (${ev.at.x},${ev.at.y})`;
    case 'merge':
      return `${name(ev.uid)} se une a ${name(ev.into)}`;
    case 'load':
      return `${name(ev.uid)} sube a ${name(ev.into)}`;
    case 'wait':
      return `${name(ev.uid)} espera`;
  }
}

const LEGEND = `+NN unidad tuya · -NN enemiga · ? no se ve
Terreno: . hierba , flores f bosque ^ acantilado : arena c cactus M meseta _ nieve o muñeco t pinos % roca nevada i hielo ~ agua - poco profunda = profunda
Edificios: C ciudad O petroleo F fabrica S fortaleza A aeropuerto B base (mayuscula tuyo, minuscula enemigo, * neutral)
Edificios de tipo: ${BUILDING_NAMES.join(', ')}`;

const HELP = `Ordenes (coordenadas x y desde 0, arriba a la izquierda):
  map                      mapa en texto
  units [0|1]              unidades (las enemigas solo si se ven)
  unit <id>                a donde puede ir y a quien puede atacar
  move <id> <x> <y>        mover
  attack <id> <x> <y>      atacar a la unidad de (x,y) desde donde esta (mover antes si hace falta)
  capture <id>             capturar el edificio de debajo
  wait <id>                terminar con la unidad
  buy <x> <y> <Tipo>       comprar en un edificio tuyo (Soldier, Tank...; sin tipo, lista)
  end                      fin de turno: juega la IA enemiga y empieza el dia siguiente
  ai                       la IA juega tu turno y el enemigo el suyo
  status                   dia, dinero, edificios y unidades
  state                    partida en JSON (para guardarla o abrirla en el juego)
Tambien en español: mapa, unidades, unidad, mover, atacar, capturar, esperar, comprar, fin, ia, estado.`;
