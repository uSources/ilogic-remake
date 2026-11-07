/**
 * Generador de mapas aleatorios (RandomMap.java), como una lista de pasos (`MAP_STEPS`): el tema,
 * el terreno, el agua, las zonas de inicio, los edificios y unidades de cada salida, los neutrales y
 * los puntos de control. [CAMBIO] las zonas de inicio se buscan al final, deben existir, estar
 * conectadas por tierra y separadas; si no, se genera otro mapa (en el original podian faltar o
 * solaparse).
 *
 * El orden de los pasos y de las llamadas a `rng` dentro de cada uno es parte del resultado: con la
 * misma semilla tiene que salir el mismo mapa (lo comprueban `npm run huella` y `tests/sim.test.ts`).
 */
import { themeOf } from '../gameContent';
import { type GameContent, type Theme } from '../content';
import { newGameState } from '../gameState';
import type { TeamSetup } from '../teams';
import { blankMap, mapGrid } from '../mapGrid';
import { pick, seedFromDraw, shuffleInPlace, type MatchSeeds } from '../util/random';
import type { GameState, Pos, Rng, MatchSettings, TeamId } from '../model';
import type { GameModeRegistry } from '../modes';
import { areaScale, MAX_ATTEMPTS_FOR_LAND, ORIGINAL_MAP_SIDE, settingsOf } from './common';
import { growTerrain, shapeWater } from './terrain';
import { findMoreSpawns, findSpawn } from './spawns';
import { placeNeutralBuildings, placeStartingBuildings, placeStartingUnits } from './buildings';
import { placeControlPoints } from './controlPoints';

function emptyState(size: number, options: NewMapOptions, seeds: MatchSeeds): GameState {
  // El terreno de partida no importa: el generador pone todas las casillas.
  const plain = options.content.plainTerrain.id;
  return newGameState({
    map: blankMap(size, plain),
    settings: options.settings,
    content: options.content,
    mode: 'skirmish',
    teams: options.teams,
    firstTeam: options.firstTeam,
    seeds,
    modes: options.modes,
  });
}

/** Un intento de mapa, que cada paso va completando. */
interface MapDraft {
  s: GameState;
  rng: Rng;
  origin: Pos;
  attempt: number;
  forcedTheme: Theme | null;
  /** Casillas a pie del terreno, mas las de agua que se vuelven transitables. */
  landTiles: number;
  /** Zona de inicio de cada equipo (por numero de equipo), cuando ya se han buscado. */
  spawns: Pos[] | null;
}

interface MapStep {
  name: string;
  /** Devuelve false si este mapa no vale y hay que empezar otro. */
  run: (draft: MapDraft) => boolean;
}

/** La salida de cada equipo: la zona `i` es del equipo `i` de la partida. */
const startsOf = (draft: MapDraft): { spawn: Pos; team: TeamId }[] =>
  spawnsOf(draft).map((spawn, index) => ({ spawn, team: draft.s.teams[index]!.id }));

function spawnsOf(draft: MapDraft): Pos[] {
  if (!draft.spawns) throw new Error('Paso de mapa fuera de orden: aun no hay zonas de inicio');
  return draft.spawns;
}

/** Siempre se tira el dado del tema, aunque venga fijado, para no mover el resto de la secuencia. */
function chooseTheme(draft: MapDraft): boolean {
  const themes = draft.s.content.themes;
  const randomTheme = pick(themes.list, draft.rng);
  const theme = draft.forcedTheme ?? randomTheme;
  if (!theme) throw new Error('El contenido no tiene temas');
  draft.s.theme = theme.id;
  return true;
}

/** Tras muchos intentos con poca tierra se acepta el mapa que salga. */
const hasEnoughLand = (draft: MapDraft) =>
  draft.landTiles >= settingsOf(draft.s).minLandTiles * areaScale(mapGrid(draft.s)) || draft.attempt >= MAX_ATTEMPTS_FOR_LAND;

/**
 * Una zona de salida por equipo. [CAMBIO] el original daba siempre la primera zona al jugador y la
 * segunda a la IA. La segunda sale mejor situada mas a menudo (la herramienta de equilibrio: 59-61 %
 * de ventaja para ese lado, en los dos sentidos). Ahora se sortea quien empieza en cada una.
 */
function findStartZones(draft: MapDraft): boolean {
  const first = findSpawn(draft.s, false, () => true);
  if (!first) return false;
  const spawns = findMoreSpawns(draft.s, first, draft.s.teams.length);
  if (!spawns) return false;
  shuffleInPlace(spawns, draft.rng);
  draft.spawns = spawns;
  return true;
}

const MAP_STEPS: readonly MapStep[] = [
  { name: 'tema', run: chooseTheme },
  {
    name: 'terreno',
    run: (draft) => {
      draft.landTiles = growTerrain(draft.s, draft.origin, themeOf(draft.s), draft.rng);
      return true;
    },
  },
  {
    name: 'agua',
    run: (draft) => {
      draft.landTiles += shapeWater(draft.s);
      return hasEnoughLand(draft);
    },
  },
  { name: 'zonas de inicio', run: findStartZones },
  {
    name: 'edificios iniciales',
    run: (draft) => startsOf(draft).every(({ spawn, team }) => placeStartingBuildings(draft.s, spawn, team, draft.rng)),
  },
  {
    name: 'unidades iniciales',
    run: (draft) => {
      for (const { spawn, team } of startsOf(draft)) placeStartingUnits(draft.s, spawn, team, draft.rng);
      return true;
    },
  },
  {
    name: 'edificios neutrales',
    run: (draft) => {
      placeNeutralBuildings(draft.s, draft.rng);
      return true;
    },
  },
  {
    name: 'puntos de control',
    run: (draft) => {
      placeControlPoints(draft.s, spawnsOf(draft), draft.rng);
      return true;
    },
  },
];

/** Como se quiere el mapa al azar: lado, tema (null = al azar) y reglas de la partida. */
export interface NewMapOptions {
  size?: number;
  /** Tema del mapa (de themes.json), o null (o nada) para uno al azar. */
  theme?: Theme | null;
  settings: Readonly<MatchSettings>;
  /** Contenido de la partida (unidades, edificios, terreno...). */
  content: GameContent;
  /** Los equipos (dos o mas): el generador hace una salida para cada uno. */
  teams: readonly TeamSetup[];
  /** El equipo que juega primero cada ronda (si no, el primero). */
  firstTeam?: TeamId;
  /** Los modos que se conocen (si no, los del juego): ver MatchSetupContext.modes. */
  modes?: GameModeRegistry;
}

/**
 * Genera una partida nueva con mapa aleatorio y las reglas dadas. Si un paso falla, se empieza otro
 * mapa desde el principio.
 */
export function generateGame(rng: Rng, options: NewMapOptions): GameState {
  const size = options.size ?? ORIGINAL_MAP_SIDE;
  // El punto de partida del terreno se sortea una vez y vale para todos los intentos.
  const originDraw = { x: rng(), y: rng() };
  const origin = { x: Math.floor(originDraw.x * size), y: Math.floor(originDraw.y * size) };
  // Los dados y las decisiones salen de esas mismas tiradas, una de cada (dos numeros distintos del
  // generador): sin gastar otras, cada semilla sigue dando su mapa.
  const seeds: MatchSeeds = { dice: seedFromDraw(originDraw.x), decisions: seedFromDraw(originDraw.y) };
  for (let attempt = 0; ; attempt++) {
    const draft: MapDraft = {
      s: emptyState(size, options, seeds),
      rng,
      origin,
      attempt,
      forcedTheme: options.theme ?? null,
      landTiles: 0,
      spawns: null,
    };
    if (MAP_STEPS.every((step) => step.run(draft))) return draft.s;
  }
}
