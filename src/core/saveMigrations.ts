/**
 * Leer partidas guardadas por versiones anteriores del juego. Cada partida guarda la version de su
 * formato (`GameState.version`, ahora SAVE_VERSION); MIGRATIONS es la lista de pasos que la ponen al
 * dia. Cada paso dice que cambio, por que y hasta que version hace falta, y si va sobre el JSON tal
 * cual (antes de comprobarlo) o sobre la partida ya comprobada. Ninguno se quita mientras pueda haber
 * partidas guardadas asi.
 *
 * Lo que la partida no guarda lo da quien la lee (SaveContext): el contenido con el que se juega y
 * las reglas de cada mision. Asi save.ts no depende del catalogo de misiones.
 */
import type { GameContent } from './content';
import { rulesWith } from './rulesConfig';
import type { GameState, RulesConfig } from './model';
import { liftStandingOrder } from './squads/standingOrders';

/**
 * Version del formato de las partidas guardadas. 1: hasta el arreglo de K1 (las misiones podian
 * llevar las reglas de escaramuza). 2: desde entonces (las reglas guardadas son las de la partida).
 */
export const SAVE_VERSION = 2;

/** Lo que pone quien lee una partida (ver defaultGames.ts para el del juego). */
export interface SaveContext {
  /** Contenido con el que se juega (no se guarda con la partida). */
  content: GameContent;
  /** Reglas de la mision con ese id (undefined si no es una mision conocida). */
  missionRules(id: string): RulesConfig | undefined;
}

/** Un paso para leer partidas antiguas. */
export interface SaveMigration {
  /** Que cambia, en pocas palabras (para quien lea la lista). */
  readonly name: string;
  /** Lo necesitan las partidas guardadas con esta version del formato o una anterior. */
  readonly upToVersion: number;
  /**
   * 'read': sobre el JSON tal cual, antes de comprobarlo (puede venir roto: lo comprueba deserialize
   * despues). 'checked': sobre la partida ya comprobada.
   */
  readonly stage: 'read' | 'checked';
  apply(s: GameState, context: SaveContext): void;
}

/** Lo que el JSON trae como lista (o una vacia si no lo es: entonces deserialize lo rechazara). */
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Pasa el campo `from` a `to` (si no estaba ya) y lo quita. */
function renameField(holder: unknown, from: string, to: string): void {
  if (!isObject(holder) || holder[from] === undefined) return;
  holder[to] ??= holder[from];
  delete holder[from];
}

/** Reglas que no existian cuando se guardo la partida, con el valor con el que se jugaba entonces. */
const RULES_ADDED_LATER: Partial<RulesConfig> = {
  veterancy: false,
  passAllies: false,
  ambush: false,
  forestHides: false,
  terrainCost: false,
  weather: false,
  abilities: false,
  commandPoints: null,
  upkeep: 0,
  // Partidas de antes del botin y el flanqueo.
  vetBonus: 0.05,
  bounty: 0,
  flankBonus: 0,
  noHealUnderFire: false,
  // Partidas de antes de los puntos de control: sin ellos.
  controlPoints: 0,
  controlIncome: 0,
  controlRadius: 0,
};

/** Los pasos, del mas antiguo al mas nuevo. */
export const MIGRATIONS: readonly SaveMigration[] = [
  {
    // [CAMBIO] Antes de quitar el combustible y la municion las unidades los guardaban: se ignoran.
    name: 'unidades sin combustible ni municion',
    upToVersion: 1,
    stage: 'read',
    apply: (s) => {
      for (const unit of listOf(s.units)) {
        if (!isObject(unit)) continue;
        delete unit.fuel;
        delete unit.ammo;
      }
    },
  },
  {
    // [CAMBIO] Antes de llamarla "orden permanente", la orden de la unidad y la de la escuadra iban en `command`.
    name: 'command pasa a standingOrder',
    upToVersion: 1,
    stage: 'read',
    apply: (s) => {
      for (const holder of [...listOf(s.units), ...listOf(s.squads)]) renameField(holder, 'command', 'standingOrder');
    },
  },
  {
    // [CAMBIO] El viaje de varios turnos de una unidad se guardaba como `order`, que se confundia con las ordenes permanentes.
    name: 'order pasa a travelTo',
    upToVersion: 1,
    stage: 'read',
    apply: (s) => {
      for (const unit of listOf(s.units)) renameField(unit, 'order', 'travelTo');
    },
  },
  {
    // [CAMBIO] Fallo K1: antes del arreglo una mision guardada no llevaba sus reglas (o llevaba las de
    // escaramuza): se juega con las de su mision. Las guardadas despues (version 2) llevan las suyas.
    name: 'las misiones antiguas se juegan con sus reglas',
    upToVersion: 1,
    stage: 'read',
    apply: (s, context) => {
      const id = isObject(s.mission) ? s.mission.id : undefined;
      const rules = typeof id === 'string' ? context.missionRules(id) : undefined;
      if (rules) s.rules = rules;
    },
  },
  {
    // Las escaramuzas guardadas antes de guardar las reglas se juegan con las de siempre.
    name: 'partidas sin reglas: las de siempre',
    upToVersion: 1,
    stage: 'read',
    apply: (s, context) => {
      if ((s as { rules?: unknown }).rules === undefined) s.rules = rulesWith(context.content);
    },
  },
  {
    name: 'reglas que se añadieron despues: como se jugaba entonces',
    upToVersion: 1,
    stage: 'read',
    apply: (s) => {
      const rules: unknown = s.rules;
      if (!isObject(rules)) return;
      for (const [rule, value] of Object.entries(RULES_ADDED_LATER)) rules[rule] ??= value;
    },
  },
  {
    // [CAMBIO] Partidas de antes de que la escuadra tuviera orden: si todas llevaban la misma, es suya.
    name: 'la orden comun de las unidades pasa a la escuadra',
    upToVersion: 1,
    stage: 'checked',
    apply: (s) => {
      for (const squad of s.squads ?? []) if (!squad.standingOrder) liftStandingOrder(s, squad);
    },
  },
];

/** Aplica a una partida guardada con la version `savedVersion` los pasos de esa etapa que necesita. */
export function migrate(s: GameState, savedVersion: number, stage: SaveMigration['stage'], context: SaveContext): void {
  for (const migration of MIGRATIONS) {
    if (migration.stage === stage && savedVersion <= migration.upToVersion) migration.apply(s, context);
  }
}
