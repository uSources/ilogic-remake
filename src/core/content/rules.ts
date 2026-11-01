/** Reglas por defecto de una partida (rules.json). */
import { type Checker } from './check';

/** Reglas y parametros de una partida (se guardan con ella). */
export interface RulesConfig {
  /** Dinero inicial de cada bando. */
  initialFunds: number;
  /** Unidades maximas por bando. */
  maxUnits: number;
  /** [CAMBIO] Puntos de mando por bando: cada unidad ocupa los de su `command` (null = sin limite de puntos). */
  commandPoints: number | null;
  /** [CAMBIO] Mantenimiento: cada ronda se paga este tanto por uno del precio de cada unidad (0 = sin mantenimiento). */
  upkeep: number;
  /** [CAMBIO] El defensor que sobrevive responde al ataque. */
  counterattack: boolean;
  /** null = tirada original por punto de vida; numero = daño esperado +- ese tanto por uno (0.1 = 10 %). */
  damageSpread: number | null;
  /** Puntos de captura de un edificio y de la Base. */
  capturePoints: number;
  hqCapturePoints: number;
  /** Multiplicador de los ingresos de los edificios. */
  incomeScale: number;
  /** Niebla de guerra. */
  fog: boolean;
  /** Limite de dias (null = sin limite): al acabar gana quien tenga mas puntos. */
  dayLimit: number | null;
  /** Veterania: las unidades que destruyen enemigos suben de rango (+acierto, +defensa). */
  veterancy: boolean;
  /** [CAMBIO] Veterania: acierto que gana (y defensa) cada rango, en tanto por uno. */
  vetBonus: number;
  /** [CAMBIO] Botin: al destruir una unidad se cobra este tanto por uno de su precio (0 = sin botin). */
  bounty: number;
  /** [CAMBIO] Flanqueo: acierto extra contra una unidad que ya ha recibido un ataque ese dia (0 = sin flanqueo). */
  flankBonus: number;
  /** [CAMBIO] Una unidad que ha recibido un ataque ese dia no se cura en los edificios al acabarlo. */
  noHealUnderFire: boolean;
  /** Se puede pasar por casillas de unidades propias (sin terminar en ellas). */
  passAllies: boolean;
  /** Emboscadas: el alcance no tiene en cuenta a los enemigos que no se ven; si el camino choca con uno, se para. */
  ambush: boolean;
  /** Con niebla, el bosque (y cactus, bosque nevado) solo se ve desde una casilla vecina. */
  forestHides: boolean;
  /** Cada terreno cuesta lo que diga terrain.json (si no, todo cuesta 1). */
  terrainCost: boolean;
  /** [CAMBIO] Clima que cambia cada pocos dias (weather.json): vision, movimiento y punteria. */
  weather: boolean;
  /** Habilidades de las unidades (units.json, "abilities"). */
  abilities: boolean;
  /** [CAMBIO] Puntos de control en los mapas al azar (0 = ninguno): casillas que dan dinero cada ronda a quien las tiene. */
  controlPoints: number;
  /** [CAMBIO] Dinero que da cada punto de control por ronda. */
  controlIncome: number;
  /** [CAMBIO] Tamaño de la zona de cada punto: casillas alrededor del centro (1 = zona de 3×3). */
  controlRadius: number;
}

export interface RulesFile {
  defaults: RulesConfig;
  maxFunds: number;
}

type Kind = 'int' | 'number' | 'bool' | 'days' | 'spread' | 'fraction' | 'points';
/** Tipo de cada regla (las claves tienen que ser exactamente las de RulesConfig). */
const RULE_KINDS: Record<keyof RulesConfig, Kind> = {
  initialFunds: 'int',
  maxUnits: 'int',
  commandPoints: 'points',
  upkeep: 'fraction',
  counterattack: 'bool',
  damageSpread: 'spread',
  capturePoints: 'int',
  hqCapturePoints: 'int',
  incomeScale: 'number',
  fog: 'bool',
  dayLimit: 'days',
  veterancy: 'bool',
  vetBonus: 'fraction',
  bounty: 'fraction',
  flankBonus: 'fraction',
  noHealUnderFire: 'bool',
  passAllies: 'bool',
  ambush: 'bool',
  forestHides: 'bool',
  terrainCost: 'bool',
  weather: 'bool',
  abilities: 'bool',
  controlPoints: 'int',
  controlIncome: 'int',
  controlRadius: 'int',
};

export function validateRules(r: RulesFile, check: Checker): void {
  const s = check.scope('rules.json');
  const d = (r?.defaults ?? {}) as unknown as Record<string, unknown>;
  for (const [k, kind] of Object.entries<Kind>(RULE_KINDS)) {
    const v = d[k];
    const f = `defaults.${k}`;
    if (kind === 'bool') s.bool(f, v);
    else if (kind === 'int') s.num(f, v, { min: 0, int: true });
    else if (kind === 'number') s.num(f, v, { min: 0 });
    else if (kind === 'fraction') s.num(f, v, { min: 0, max: 1 });
    else if (v !== null)
      s.num(`${f} (o null)`, v, kind === 'days' || kind === 'points' ? { min: 1, max: 1e4, int: true } : { min: 0, max: 1 });
  }
  for (const k of Object.keys(d)) s.expect(k in RULE_KINDS, `regla desconocida "${k}"`);
  s.num('maxFunds', r?.maxFunds, { min: 1, int: true });
}
