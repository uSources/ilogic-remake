/**
 * Laboratorio de animaciones: una partida de mentira en campo abierto con una unidad propia y una
 * enemiga, para ver (y ajustar) como se anima mover, atacar, el contraataque y una unidad destruida
 * sin tener que jugar. Se abre con `#lab` en la direccion o con `ilogicDebug.lab()`.
 * Cada accion vuelve a empezar la escena desde cero, asi siempre se ve igual.
 */
import { defaultContent } from './core/content/default';
import type { SandboxConfig } from './core/match';
import { entryOf, MoveType, type GameContent, type UnitType } from './core/content';
import { unitTypeOf } from './core/gameContent';
import { maxBy } from './core/util/pick';
import type { GameState, MatchSettings, Unit } from './core/model';

export type LabAction = 'move' | 'attack' | 'counter' | 'kill';
export const LAB_ACTIONS: readonly LabAction[] = ['move', 'attack', 'counter', 'kill'];

export interface LabOptions {
  /** Tipo de la unidad propia y de la enemiga (id de units.json). */
  attacker: string;
  defender: string;
  /** Camara lenta (a un cuarto de la velocidad). */
  slow: boolean;
  /** Accion que se reproduce al empezar (null = ninguna). */
  play: LabAction | null;
}

export const LAB_SIZE = 12;
/** Semilla de los dados del laboratorio: la misma animacion sale siempre igual. */
const LAB_DICE_SEED = 1;
/** Los dos equipos del laboratorio: el de la persona y su enemigo. */
const LAB_PERSON = 0;
const LAB_ENEMY = 1;
/** Vida del defensor en 'kill': lo justo para que el golpe lo destruya. */
const KILL_LIFE = 15;
/** Donde empieza cada una. La propia avanza 3 casillas para atacar (mover) o empieza al lado. */
export const LAB_FROM = { x: 3, y: 6 };
export const LAB_TARGET = { x: 7, y: 6 };

/**
 * La unidad de siempre del laboratorio, sacada del contenido (no de su nombre): el vehiculo de cuerpo
 * a cuerpo mas caro (con el contenido del juego, el tanque).
 */
function heaviestMeleeVehicle(content: GameContent): string {
  const isMeleeVehicle = (unitType: UnitType) => unitType.attack?.minRange === 1 && unitType.movement === MoveType.VEHICLE;
  const heaviest = maxBy(content.units.list.filter(isMeleeVehicle), (unitType) => unitType.cost) ?? content.units.list[0]!;
  return heaviest.id;
}

export const defaultLab = (): LabOptions => ({
  attacker: heaviestMeleeVehicle(defaultContent()),
  defender: heaviestMeleeVehicle(defaultContent()),
  slow: false,
  play: null,
});

/** Distancia desde la que ataca la propia: su alcance minimo (la casilla de al lado si no ataca). */
export const labRange = (s: GameState, unit: Pick<Unit, 'type'>): number => unitTypeOf(s, unit).attack?.minRange ?? 1;

/**
 * Reglas del laboratorio: sin niebla; contraataque solo en la accion que lo enseña (en 'attack', el
 * defensor no responde). Sin clima ya lo pone su modo (GAME_MODES.sandbox.fixedRules).
 */
export function labRuleChanges(action: LabAction | null): Partial<MatchSettings> {
  return { fog: false, counterattack: action !== 'attack' };
}

/**
 * Partida del laboratorio: todo hierba, una Base por equipo en las esquinas (sin Base un equipo
 * empezaria caido: buildMatch no lo deja, assertAllStanding, y un equipo caido no puede actuar) y las
 * dos unidades. Para atacar, la propia ya esta a su distancia de tiro.
 */
export function labMatch(options: LabOptions, action: LabAction | null): SandboxConfig {
  const content = defaultContent();
  const hq = content.hq.id;
  const attackerType = entryOf(content.units, options.attacker, 'unidad');
  const near = action !== null && action !== 'move';
  const from = near ? { x: LAB_TARGET.x - (attackerType.attack?.minRange ?? 1), y: LAB_TARGET.y } : LAB_FROM;
  return {
    mode: 'sandbox',
    size: LAB_SIZE,
    ruleChanges: labRuleChanges(action),
    teams: [
      { controller: 'human', funds: 0 },
      { controller: 'ai', funds: 0 },
    ],
    buildings: [
      { type: hq, owner: LAB_PERSON, at: { x: 0, y: LAB_SIZE - 1 } },
      { type: hq, owner: LAB_ENEMY, at: { x: LAB_SIZE - 1, y: 0 } },
    ],
    units: [
      { type: attackerType.id, team: LAB_PERSON, at: from },
      { type: options.defender, team: LAB_ENEMY, at: LAB_TARGET, ...(action === 'kill' ? { life: KILL_LIFE } : {}) },
    ],
    diceSeed: LAB_DICE_SEED,
  };
}
