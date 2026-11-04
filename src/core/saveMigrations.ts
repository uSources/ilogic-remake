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

interface MigrationInfo {
  /** Que cambia, en pocas palabras (para quien lea la lista). */
  readonly name: string;
  /** Lo necesitan las partidas guardadas con esta version del formato o una anterior. */
  readonly upToVersion: number;
}

/** Un paso sobre el JSON tal cual, antes de comprobarlo: puede venir roto (lo comprueba deserialize despues). */
export interface ReadMigration extends MigrationInfo {
  readonly stage: 'read';
  apply(raw: Record<string, unknown>, context: SaveContext): void;
}

/** Un paso sobre la partida ya comprobada. */
export interface CheckedMigration extends MigrationInfo {
  readonly stage: 'checked';
  apply(s: GameState, context: SaveContext): void;
}

/** Un paso para leer partidas antiguas. */
export type SaveMigration = ReadMigration | CheckedMigration;

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
    apply: (raw) => {
      for (const unit of listOf(raw.units)) {
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
    apply: (raw) => {
      for (const holder of [...listOf(raw.units), ...listOf(raw.squads)]) renameField(holder, 'command', 'standingOrder');
    },
  },
  {
    // [CAMBIO] El viaje de varios turnos de una unidad se guardaba como `order`, que se confundia con las ordenes permanentes.
    name: 'order pasa a travelTo',
    upToVersion: 1,
    stage: 'read',
    apply: (raw) => {
      for (const unit of listOf(raw.units)) renameField(unit, 'order', 'travelTo');
    },
  },
  {
    // [CAMBIO] Fallo K1: antes del arreglo una mision guardada no llevaba sus reglas (o llevaba las de
    // escaramuza): se juega con las de su mision. Las guardadas despues (version 2) llevan las suyas.
    name: 'las misiones antiguas se juegan con sus reglas',
    upToVersion: 1,
    stage: 'read',
    apply: (raw, context) => {
      const id = isObject(raw.mission) ? raw.mission.id : undefined;
      const rules = typeof id === 'string' ? context.missionRules(id) : undefined;
      if (rules) raw.rules = rules;
    },
  },
  {
    // Las escaramuzas guardadas antes de guardar las reglas se juegan con las de siempre.
    name: 'partidas sin reglas: las de siempre',
    upToVersion: 1,
    stage: 'read',
    apply: (raw, context) => {
      if (raw.rules === undefined) raw.rules = rulesWith(context.content);
    },
  },
  {
    name: 'reglas que se añadieron despues: como se jugaba entonces',
    upToVersion: 1,
    stage: 'read',
    apply: (raw) => {
      const rules = raw.rules;
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

const needs = (migration: SaveMigration, savedVersion: number) => savedVersion <= migration.upToVersion;

/** Aplica al JSON de una partida guardada con la version `savedVersion` los pasos de la etapa 'read' que necesita. */
export function migrateRead(raw: Record<string, unknown>, savedVersion: number, context: SaveContext): void {
  for (const migration of MIGRATIONS) if (migration.stage === 'read' && needs(migration, savedVersion)) migration.apply(raw, context);
}

/** Aplica a la partida ya comprobada los pasos de la etapa 'checked' que necesita. */
export function migrateChecked(s: GameState, savedVersion: number, context: SaveContext): void {
  for (const migration of MIGRATIONS) if (migration.stage === 'checked' && needs(migration, savedVersion)) migration.apply(s, context);
}
