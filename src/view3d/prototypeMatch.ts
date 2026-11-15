/**
 * La partida del prototipo 3D: el terreno de una escaramuza de verdad (para ver alturas, agua y
 * bosques) con lo minimo encima: una Base por equipo (sin Base un equipo empieza caido) y un tanque
 * propio. Sin niebla. Se juega con la misma sesion y las mismas acciones que el juego en 2D.
 */
import { defaultContent } from '../core/content/default';
import { entryOf, type GameContent, type UnitType } from '../core/content';
import { screenControllers } from '../core/controllers';
import { createMatch } from '../core/defaultGames';
import { manhattan, samePos } from '../core/geom';
import { mapGrid } from '../core/mapGrid';
import { skirmishConfig, type SandboxConfig } from '../core/match';
import type { GameState, Pos, TeamId } from '../core/model';
import { GameSession, passiveController } from '../core/session';
import { duel, playerTeam } from '../core/teams';
import { minBy } from '../core/util/pick';

/** Lado del mapa: pequeño, para ver el conjunto de un vistazo. */
const PROTO_SIZE = 20;
/** Semilla del mapa: siempre el mismo, para comparar cambios de aspecto. */
const PROTO_SEED = 2013;
const PERSON: TeamId = 0;
const ENEMY: TeamId = 1;
/** La unidad del prototipo (id de units.json). */
const PROTO_UNIT = 'Tank';

type Terrain = NonNullable<SandboxConfig['terrain']>;

/** El terreno (y su tema) de la escaramuza de esa semilla: lo demas de esa partida no se usa. */
function skirmishTerrain(seed: number): Terrain {
  const skirmish = createMatch(skirmishConfig({ seed, size: PROTO_SIZE, teams: duel('ai', 'ai') }));
  return { map: skirmish.map, theme: skirmish.theme };
}

/** La casilla mas cercana a `target` cuyo terreno vale (y que no este en `taken`). */
function closestTile(terrain: Terrain, target: Pos, fits: (terrainId: string) => boolean, taken: readonly Pos[] = []): Pos {
  const isFree = (pos: Pos) => !taken.some((other) => samePos(other, pos));
  const candidates = [...mapGrid(terrain).cells()].filter((cell) => fits(cell.value) && isFree(cell.pos));
  const best = minBy(candidates, (cell) => manhattan(cell.pos, target));
  if (!best) throw new Error('El mapa del prototipo no tiene sitio para lo que se pide');
  return best.pos;
}

const isBuildable = (content: GameContent) => (terrainId: string) => entryOf(content.terrain, terrainId, 'terreno').buildable;
const canStandOn = (content: GameContent, unitType: UnitType) => (terrainId: string) =>
  entryOf(content.terrain, terrainId, 'terreno').moveCost[unitType.movement] !== null;

/** La configuracion del prototipo: cada Base en la casilla edificable mas cerca de su esquina y el tanque al lado de la propia. */
export function prototypeConfig(): SandboxConfig {
  const content = defaultContent();
  const terrain = skirmishTerrain(PROTO_SEED);
  const unitType = entryOf(content.units, PROTO_UNIT, 'unidad');
  const ownBase = closestTile(terrain, { x: 2, y: PROTO_SIZE - 3 }, isBuildable(content));
  const enemyBase = closestTile(terrain, { x: PROTO_SIZE - 3, y: 2 }, isBuildable(content));
  const unitAt = closestTile(terrain, ownBase, canStandOn(content, unitType), [ownBase]);
  return {
    mode: 'sandbox',
    size: PROTO_SIZE,
    terrain,
    settingChanges: { fog: false },
    teams: [
      { controller: 'human', funds: 0 },
      { controller: 'ai', funds: 0 },
    ],
    buildings: [
      { type: content.hq.id, owner: PERSON, at: ownBase },
      { type: content.hq.id, owner: ENEMY, at: enemyBase },
    ],
    units: [{ type: unitType.id, team: PERSON, at: unitAt }],
    seed: PROTO_SEED,
  };
}

export interface PrototypeStart {
  session: GameSession;
  /** El equipo que juega la persona (el que mira). */
  viewer: TeamId;
}

/** La partida del prototipo en juego: la persona contra un equipo que no hace nada (solo se mira). */
export function startPrototype(): PrototypeStart {
  const state: GameState = createMatch(prototypeConfig());
  const quiet = new Map([[ENEMY, passiveController()] as const]);
  const session = new GameSession(state, screenControllers(state, quiet));
  return { session, viewer: playerTeam(state) };
}
