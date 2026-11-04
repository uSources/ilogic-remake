/**
 * Lo que hace falta para leer partidas guardadas por versiones anteriores del juego: una lista de
 * pasos (MIGRATIONS) que deserialize aplica, en orden, al JSON recien leido y antes de comprobarlo.
 * Cada paso dice que cambio y por que; ninguno se quita mientras pueda haber partidas guardadas asi.
 *
 * Lo que la partida no guarda lo da quien la lee (SaveContext): el contenido con el que se juega y
 * las reglas de cada mision. Asi save.ts no depende del catalogo de misiones.
 */
import type { GameContent } from './content';
import type { GameState, RulesConfig, StandingOrder } from './model';

/** Lo que pone quien lee una partida (ver defaultGames.ts para el del juego). */
export interface SaveContext {
  /** Contenido con el que se juega (no se guarda con la partida). */
  content: GameContent;
  /** Reglas de la mision con ese id (undefined si no es una mision conocida). */
  missionRules(id: string): RulesConfig | undefined;
}

/** Un paso para leer partidas antiguas. Recibe el JSON tal cual: puede venir roto (lo comprueba deserialize despues). */
export interface SaveMigration {
  /** Que cambia, en pocas palabras (para quien lea la lista). */
  readonly name: string;
  apply(s: GameState, context: SaveContext): void;
}

/** Lo que el JSON trae como lista (o una vacia si no lo es: entonces deserialize lo rechazara). */
const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Pasa el campo `from` a `to` (si no estaba ya) y lo quita. */
function renameField(holder: unknown, from: string, to: string): void {
  if (!isObject(holder) || holder[from] === undefined) return;
  holder[to] ??= holder[from];
  delete holder[from];
}

/** Los pasos, del mas antiguo al mas nuevo. */
export const MIGRATIONS: readonly SaveMigration[] = [
  {
    // [CAMBIO] Antes de quitar el combustible y la municion las unidades los guardaban: se ignoran.
    name: 'unidades sin combustible ni municion',
    apply: (s) => {
      for (const unit of listOf<Record<string, unknown>>(s.units)) {
        if (!isObject(unit)) continue;
        delete unit.fuel;
        delete unit.ammo;
      }
    },
  },
  {
    // [CAMBIO] Antes de llamarla "orden permanente", la orden de la unidad y la de la escuadra iban en `command`.
    name: 'command pasa a standingOrder',
    apply: (s) => {
      for (const holder of [...listOf<{ standingOrder?: StandingOrder }>(s.units), ...listOf<{ standingOrder?: StandingOrder }>(s.squads)])
        renameField(holder, 'command', 'standingOrder');
    },
  },
  {
    // [CAMBIO] El viaje de varios turnos de una unidad se guardaba como `order`, que se confundia con las ordenes permanentes.
    name: 'order pasa a travelTo',
    apply: (s) => {
      for (const unit of listOf(s.units)) renameField(unit, 'order', 'travelTo');
    },
  },
  {
    // [CAMBIO] Fallo K1: las misiones se juegan con sus reglas. Las guardadas antes del arreglo no las
    // llevaban (o llevaban las de escaramuza): una partida de una mision conocida usa siempre las suyas.
    name: 'las misiones se juegan con sus reglas',
    apply: (s, context) => {
      const id = isObject(s.mission) ? s.mission.id : undefined;
      const rules = typeof id === 'string' ? context.missionRules(id) : undefined;
      if (rules) s.rules = rules;
    },
  },
];
