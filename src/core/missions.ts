/**
 * Misiones de la campaña: mapas hechos a mano, objetivos y textos.
 *
 * Mapas en texto, una fila por linea (y), una letra por casilla (x):
 *   .  suelo (hierba, arena o nieve segun el tema)   T  bosque (o cactus, o bosque nevado)
 *   M  acantilado                                     *  flores (o escarcha)
 *   ~  agua    ,  agua poco profunda    =  agua profunda    i  hielo
 *   P  bosque nevado    N  acantilado nevado
 * Edificios: [tipo, dueño (0 jugador, 1 IA, null neutral), x, y]. Unidades: [tipo, bando, x, y, vida?].
 */
import { BUILDING_NAMES, HQ, DEFAULT_RULES, setMapSize, TERRAIN, UNIT_NAMES, type RulesConfig, Movement } from './data';
import { newUnit } from './rules';
import type { GameState, Objective, Pos, Team } from './types';

type Text = { es: string; en: string };
type B = (typeof BUILDING_NAMES)[number];
type U = (typeof UNIT_NAMES)[number];

export interface MissionDef {
  id: string;
  title: Text;
  brief: Text;
  /** Tema de graficos: 0 llanura, 1 desierto, 2 bosque, 3 pantano, 4 nieve. */
  theme: number;
  map: string[];
  buildings: [B, Team | null, number, number][];
  units: [U, Team, number, number, number?][];
  funds: [number, number];
  /** Objetivo; en 'escort', `vip` es el indice en `units` de la unidad a escoltar. */
  objective:
    | { kind: 'hq' }
    | { kind: 'survive'; days: number }
    | { kind: 'capture'; count: number; type: B | null; days: number }
    | { kind: 'destroy'; days: number }
    | { kind: 'escort'; vip: number; to: Pos; days: number };
  /** Cambios a las reglas nuevas (por defecto, las nuevas con niebla). */
  rules?: Partial<RulesConfig>;
  /** Consejos paso a paso (solo el tutorial). */
  tutorial?: boolean;
}

const GENERIC: Record<string, number[]> = {
  // tema:      llanura desierto bosque pantano nieve
  '.': [0, 3, 0, 0, 10],
  T: [2, 4, 2, 2, 13],
  M: [7, 5, 7, 7, 12],
  '*': [6, 3, 6, 6, 11],
};
const FIXED: Record<string, number> = { '~': 1, ',': 8, '=': 9, i: 14, P: 13, N: 12 };

export function terrainOf(ch: string, theme: number): number {
  if (ch in FIXED) return FIXED[ch]!;
  const g = GENERIC[ch];
  if (!g) throw new Error(`Letra de terreno desconocida: "${ch}"`);
  return g[theme]!;
}

/** Crea la partida de una mision (con las reglas ya puestas por quien llama: ver `missionRules`). */
export function buildMission(m: MissionDef): GameState {
  const n = m.map.length;
  setMapSize(n, n);
  const map: number[][] = Array.from({ length: n }, (_, x) => Array.from({ length: n }, (_, y) => terrainOf(m.map[y]![x]!, m.theme)));
  const s: GameState = { version: 1, map, theme: m.theme, funds: [m.funds[0], m.funds[1]], units: [], buildings: [], nextUid: 1, day: 1 };
  for (const [t, owner, x, y] of m.buildings) s.buildings.push({ type: BUILDING_NAMES.indexOf(t), owner, x, y });
  const uids: number[] = [];
  for (const [t, team, x, y, life] of m.units) {
    const u = newUnit(s, UNIT_NAMES.indexOf(t), team, x, y);
    if (life) u.life = life;
    uids.push(u.uid);
  }
  const o = m.objective;
  let objective: Objective;
  if (o.kind === 'escort') objective = { kind: 'escort', uid: uids[o.vip]!, to: o.to, days: o.days };
  else if (o.kind === 'capture')
    objective = { kind: 'capture', count: o.count, type: o.type === null ? null : BUILDING_NAMES.indexOf(o.type), days: o.days };
  else objective = o;
  s.mission = { id: m.id, objective };
  return s;
}

export const missionRules = (m: MissionDef): RulesConfig => ({ ...DEFAULT_RULES, initialFunds: m.funds[0], ...m.rules });

/** Comprobaciones de un mapa de mision (para los tests). Devuelve los problemas encontrados. */
export function checkMission(m: MissionDef): string[] {
  const errs: string[] = [];
  const n = m.map.length;
  if (m.map.some((r) => r.length !== n)) errs.push('el mapa no es cuadrado');
  const t = (x: number, y: number) => terrainOf(m.map[y]![x]!, m.theme);
  const seen = new Set<string>();
  for (const [b, , x, y] of m.buildings) {
    if (!BUILDING_NAMES.includes(b)) errs.push(`edificio "${b}" no existe (src/core/content/buildings.json)`);
    if (!TERRAIN.canbuild[t(x, y)]) errs.push(`${b} en (${x},${y}) no esta sobre suelo`);
    if (seen.has(`${x},${y}`)) errs.push(`dos edificios en (${x},${y})`);
    seen.add(`${x},${y}`);
  }
  const occ = new Set<string>();
  for (const [u, , x, y] of m.units) {
    const T = UNIT_NAMES.indexOf(u);
    if (T < 0) {
      errs.push(`unidad "${u}" no existe (src/core/content/units.json)`);
      continue;
    }
    if (!Movement.canWalk(Movement.of(T), t(x, y))) errs.push(`${u} en (${x},${y}) no puede estar en ese terreno`);
    if (occ.has(`${x},${y}`)) errs.push(`dos unidades en (${x},${y})`);
    occ.add(`${x},${y}`);
  }
  for (const team of [0, 1] as const)
    if (!m.buildings.some(([b, o]) => b === BUILDING_NAMES[HQ] && o === team)) errs.push(`falta la Base del bando ${team}`);
  return errs;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'tutorial',
    tutorial: true,
    title: { es: 'Primeros pasos', en: 'First steps' },
    brief: {
      es: 'Aprende lo básico en un mapa pequeño: mover, capturar, comprar y atacar. Te iré diciendo qué hacer en cada paso.',
      en: 'Learn the basics on a small map: moving, capturing, buying and attacking. I will tell you what to do at each step.',
    },
    theme: 0,
    map: [
      '~~~~~~~~~~~~~~~~',
      '~...TT.....*..~~',
      '~..TTT.........~',
      '~..T....M......~',
      '~.......M...TT.~',
      '~..*....MM..T..~',
      '~.......*......~',
      '~..TT..........~',
      '~..T......TT...~',
      '~.......*..T...~',
      '~....MM........~',
      '~.....M....T...~',
      '~..............~',
      '~.....TT.....*.~',
      '~~.....T.......~',
      '~~~~~~~~~~~~~~~~',
    ],
    buildings: [
      ['Base', 0, 2, 13],
      ['Factory', 0, 4, 13],
      ['City', 0, 2, 11],
      ['City', null, 4, 10],
      ['City', null, 9, 11],
      ['City', null, 6, 4],
      ['Base', 1, 13, 2],
      ['City', 1, 11, 3],
    ],
    units: [
      ['Soldier', 0, 3, 12],
      ['Soldier', 0, 1, 12],
      ['Soldier', 1, 10, 5, 50],
    ],
    funds: [6000, 0],
    objective: { kind: 'hq' },
  },
  {
    id: 'bridgehead',
    title: { es: 'Cabeza de puente', en: 'Bridgehead' },
    brief: {
      es: 'El río parte el valle en dos. Hazte con 6 ciudades antes de que acabe el día 14: la infantería cruza el agua poco profunda, los vehículos no.',
      en: 'The river splits the valley in two. Own 6 cities before day 14 ends: infantry can wade through shallow water, vehicles cannot.',
    },
    theme: 0,
    map: [
      '....TT......,,......',
      '...TTT.....,,..T....',
      '..........,,..TTT...',
      '.*........,,........',
      '......M...,,....*...',
      '..TT..M....,,.......',
      '..T........,,...TT..',
      '............,,..T...',
      '....*.......,,......',
      '..........,,,,......',
      '..TT......,,.....TT.',
      '...T.....,,......T..',
      '.........,,..M......',
      '..M......,,..M...*..',
      '..M.....,,..........',
      '.......,,.....TT....',
      '..*....,,......T....',
      '......,,............',
      '..TT..,,.....*......',
      '......,,............',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 17],
      ['City', 0, 3, 15],
      ['City', null, 8, 13],
      ['City', null, 5, 10],
      ['City', null, 12, 16],
      ['City', null, 15, 12],
      ['City', null, 15, 8],
      ['City', null, 7, 3],
      ['City', null, 13, 3],
      ['City', null, 17, 2],
      ['Base', 1, 17, 1],
      ['Factory', 1, 18, 3],
      ['City', 1, 15, 3],
    ],
    units: [
      ['Soldier', 0, 1, 16],
      ['Soldier', 0, 3, 16],
      ['Soldier', 0, 5, 16],
      ['Car', 0, 5, 17],
      ['Soldier', 1, 13, 2],
      ['Soldier', 1, 12, 4],
      ['Tank', 1, 16, 4],
    ],
    funds: [4000, 6000],
    objective: { kind: 'capture', count: 6, type: 'City', days: 14 },
  },
  {
    id: 'hold',
    title: { es: 'Resistir', en: 'Hold the line' },
    brief: {
      es: 'Un ejército mucho mayor viene hacia tu Base. Aguanta hasta el final del día 8. Aprovecha el terreno y el contraataque: no salgas a buscarlos.',
      en: 'A much larger army is marching on your HQ. Hold out until the end of day 8. Use the terrain and counterattacks: let them come to you.',
    },
    theme: 1,
    map: [
      '..........TT........',
      '....T.....T.....M...',
      '...TT...........M...',
      '...........*........',
      '......MM............',
      '.......M.....TT.....',
      '..T..........T......',
      '..TT.......*........',
      '........M...........',
      '........M......TT...',
      '..*.............T...',
      '.....TT.............',
      '.....T.....M........',
      '...........M....*...',
      '.M...............T..',
      '.M......TT.......T..',
      '........T...........',
      '...*................',
      '.......MM.....T.....',
      '..............T.....',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 18],
      ['City', 0, 2, 15],
      ['City', 0, 6, 16],
      ['City', null, 10, 10],
      ['City', null, 12, 6],
      ['Base', 1, 17, 2],
      ['Factory', 1, 15, 1],
      ['Airport', 1, 18, 4],
      ['City', 1, 13, 3],
    ],
    units: [
      ['Tank', 0, 4, 15],
      ['Tank', 0, 7, 14],
      ['Artillery', 0, 3, 16],
      ['Soldier', 0, 5, 13],
      ['Soldier', 0, 8, 15],
      ['Antiair', 0, 6, 15],
      ['Tank', 1, 14, 6],
      ['Tank', 1, 12, 8],
      ['Tank', 1, 16, 7],
      ['LTank', 1, 10, 5],
      ['Soldier', 1, 13, 9],
      ['Soldier', 1, 11, 11],
      ['Soldier', 1, 15, 10],
      ['Soldier', 1, 9, 7],
      ['Artillery', 1, 16, 4],
      ['Artillery', 1, 18, 6],
    ],
    funds: [6000, 15000],
    objective: { kind: 'survive', days: 8 },
  },
  {
    id: 'escort',
    title: { es: 'Convoy', en: 'Convoy' },
    brief: {
      es: 'Lleva el camión de suministros (el que tiene la flecha) hasta la ciudad del noreste antes de que acabe el día 12. Si lo destruyen, se acabó.',
      en: 'Take the supply truck to the city in the north-east before day 12 ends. If it is destroyed, the mission is over.',
    },
    theme: 2,
    map: [
      '..TT..TTTT..TT......',
      '.TT...TTTT...T......',
      '.....TTT.......TTT..',
      '..*..........TTTT...',
      '....TT..M.....TT....',
      '...TTT..M...........',
      '.......MM...TT...*..',
      '..TT.........T......',
      '..TTT....*........TT',
      '......TT.....M....T.',
      '.....TTT.....M......',
      '..M.........TTT.....',
      '..M...*......T....*.',
      '.....TT.............',
      '....TTT...M....TT...',
      '..........M...TTT...',
      '.TT.....*.......T...',
      '.T..........TT......',
      '...........TTT..*...',
      '....TT..............',
    ],
    buildings: [
      ['Base', 0, 1, 19],
      ['Factory', 0, 3, 18],
      ['City', null, 18, 2],
      ['City', null, 9, 9],
      ['City', null, 3, 13],
      ['Base', 1, 17, 0],
      ['Factory', 1, 19, 1],
      ['City', 1, 12, 3],
    ],
    units: [
      ['Supplier', 0, 2, 17],
      ['Tank', 0, 3, 16],
      ['Tank', 0, 4, 17],
      ['Soldier', 0, 1, 15],
      ['Antiair', 0, 5, 18],
      ['Tank', 1, 10, 8],
      ['Tank', 1, 14, 11],
      ['Soldier', 1, 8, 12],
      ['Soldier', 1, 12, 5],
      ['Artillery', 1, 15, 6],
      ['LTank', 1, 16, 9],
    ],
    funds: [5000, 8000],
    objective: { kind: 'escort', vip: 0, to: { x: 18, y: 2 }, days: 12 },
  },
  {
    id: 'cleanup',
    title: { es: 'Limpieza', en: 'Clean sweep' },
    brief: {
      es: 'Los restos de un ejército enemigo resisten en la nieve, sin fábricas. Destruye todas sus unidades antes de que acabe el día 10.',
      en: 'The remains of an enemy army hold out in the snow, with no factories. Destroy all their units before day 10 ends.',
    },
    theme: 4,
    map: [
      'iii.......PP....iiii',
      'ii.....*..P.......ii',
      'i...PP.........*...i',
      '....P.....NN.......i',
      '..........N.........',
      '..*...........PP....',
      '......PP.......P....',
      '.......P...*........',
      '...N..........N.....',
      '...N...........N....',
      '........PP..........',
      '..*......P.....*....',
      '..............PP....',
      '....PP...N.....P....',
      '.....P...N..........',
      '..........*.....PP..',
      'i...*...........P..i',
      'ii....PP...........i',
      'iii....P......*...ii',
      'iiii.............iii',
    ],
    buildings: [
      ['Base', 0, 2, 16],
      ['Factory', 0, 4, 15],
      ['City', 0, 3, 13],
      ['Airport', 0, 6, 16],
      ['Base', 1, 17, 3],
    ],
    units: [
      ['Tank', 0, 5, 14],
      ['Tank', 0, 4, 12],
      ['Artillery', 0, 2, 14],
      ['Soldier', 0, 6, 13],
      ['Soldier', 1, 13, 5],
      ['Soldier', 1, 15, 8],
      ['Tank', 1, 11, 7],
      ['Tank', 1, 16, 11],
      ['Artillery', 1, 14, 2],
      ['Antiair', 1, 12, 10],
      ['LTank', 1, 17, 13],
      ['Soldier', 1, 10, 15],
    ],
    funds: [10000, 0],
    objective: { kind: 'destroy', days: 10 },
  },
  {
    id: 'assault',
    title: { es: 'Asalto final', en: 'Final assault' },
    brief: {
      es: 'El enemigo tiene más dinero y se ha atrincherado tras los pantanos. Conquista su Base.',
      en: 'The enemy has more money and has dug in behind the swamps. Take their HQ.',
    },
    theme: 3,
    map: [
      '....,,......TT......',
      '...,,..*.....T...TT.',
      '..,,..............T.',
      '.,,....TT.....M.....',
      ',,.....T......M..*..',
      '......,,............',
      '..*..,,....TT.......',
      '.....,,....T.....,,.',
      '......,,........,,..',
      '..TT...,,......,,...',
      '..T.....,,....,,..*.',
      '.........,,..,,.....',
      '....*.....,,,,......',
      '..M........,,...TT..',
      '..M.........,,..T...',
      '.......TT....,,.....',
      '..*....T......,,....',
      '...............,,...',
      '.TT....*........,,..',
      '.T...............,,.',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 18],
      ['City', 0, 3, 15],
      ['Airport', 0, 6, 16],
      ['City', null, 9, 6],
      ['City', null, 14, 9],
      ['City', null, 6, 12],
      ['City', null, 15, 13],
      ['City', null, 11, 17],
      ['City', null, 4, 3],
      ['Oil', null, 9, 15],
      ['Stronghold', null, 10, 8],
      ['Base', 1, 17, 2],
      ['Factory', 1, 15, 1],
      ['City', 1, 18, 4],
      ['Airport', 1, 13, 2],
    ],
    units: [
      ['Soldier', 0, 3, 16],
      ['Soldier', 0, 5, 17],
      ['Tank', 0, 5, 15],
      ['Soldier', 1, 16, 3],
      ['Soldier', 1, 14, 4],
      ['Tank', 1, 16, 2],
    ],
    funds: [8000, 14000],
    objective: { kind: 'hq' },
  },
];

export const missionById = (id: string): MissionDef | undefined => MISSIONS.find((m) => m.id === id);
