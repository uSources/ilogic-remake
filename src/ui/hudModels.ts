import type Phaser from 'phaser';
import { abilitiesOf } from '../core/abilities';
import { MAP_H, MAP_W, MAX_FUNDS, RULES, UNIT, WEATHER, Movement, MoveType, type AbilityDef } from '../core/data';
import {
  buildingAt,
  buildingIncome,
  capturePointsOf,
  captureProgress,
  captureStrength,
  cargoUnits,
  combatForecast,
  commandUsed,
  moveCost,
  rank,
  score,
  tileProtection,
  unitAt,
  upkeepOf,
  type BuyOption,
} from '../core/rules';
import type { CombatInfo, GameEvent, GameState, Pos, Team, Unit } from '../core/types';
import { forecast, weatherNow } from '../core/weather';
import type {
  GeneralVM,
  AbilityVM,
  Anchor,
  BreakdownLineVM,
  CombatSideVM,
  CombatVM,
  DayInfoVM,
  EconomyVM,
  ForecastVM,
  MinimapVM,
  StatChipVM,
  TileVM,
  WeatherVM,
} from '../hud/store';
import { abilityBlock, chargeStars, generalOf, type AbilityBlock } from '../core/generals';
import { buildingLabel, settings, t, terrainLabel, unitLabel, weatherLabel, type TextKey } from '../settings';
import { buildingKey, terrainKey, unitKey } from './sprites';

/**
 * Datos que enseña la interfaz HTML durante la partida (fichas, prevision de combate, minimapa),
 * calculados a partir del estado. Sin efectos: GameScene los publica en el store.
 */

/** "Mov 3 · Alcance 1–1" */
/** Datos de la ficha de una unidad con su icono: movimiento, alcance y vision. */
export function unitStatChips(type: number): StatChipVM[] {
  const range = UNIT.alcance[type]! === 0 ? '—' : `${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return [
    { icon: 'ui/movimiento', text: String(UNIT.mover[type]), title: t('move') },
    { icon: 'ui/alcance', text: range, title: UNIT.alcance[type]! === 0 ? t('noAttack') : t('range') },
    { icon: 'ui/vision', text: String(UNIT.vision[type]), title: t('vision') },
  ];
}

export function unitStatsText(type: number): string {
  const range = UNIT.alcance[type]! === 0 ? t('noAttack') : `${t('range')} ${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return `${t('move')} ${UNIT.mover[type]} · ${range}`;
}

const pct = (f: number): string => String(Math.round(f * 100));

/** Nombre y explicacion de una habilidad, con sus numeros. */
export function abilityVM(a: AbilityDef): AbilityVM {
  switch (a.kind) {
    case 'guard':
      return { name: t('ability_guard'), desc: t('ability_guard_desc').replace('{n}', pct(1 - a.factor)) };
    case 'zoneOfControl':
      return {
        name: t('ability_zoneOfControl'),
        desc: t('ability_zoneOfControl_desc').replace('{m}', a.stops.map((m) => t(`move_${m}`)).join(', ')),
      };
    case 'aura':
      return {
        name: t('ability_aura'),
        desc: t('ability_aura_desc')
          .replace('{r}', String(a.radius))
          .replace('{n}', pct(1 - a.defense)),
      };
    case 'piercing':
      return { name: t('ability_piercing'), desc: t('ability_piercing_desc').replace('{n}', pct(a.ignoreCover)) };
    default:
      return a satisfies never;
  }
}

/** Habilidades de un tipo de unidad que cuentan en esta partida (vacio con la regla apagada). */
export function abilitiesVM(type: number): AbilityVM[] {
  return abilitiesOf(type).map(abilityVM);
}

/** "20→10": puntos del edificio de debajo antes y despues de capturar este turno. */
export function captureHintText(s: GameState, u: Unit): string | undefined {
  const b = buildingAt(s, u.x, u.y);
  if (!b) return undefined;
  const cp = captureProgress(s, b);
  const now = cp && cp.uid === u.uid ? cp.left : capturePointsOf(b);
  return `${now}→${Math.max(0, now - captureStrength(u))}`;
}

/**
 * Ficha de la casilla `p`: terreno, edificio y unidad (si se ve). `selected` es la unidad que se esta
 * moviendo, que se enseña aunque su sprite este oculto.
 */
export function tileVM(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  p: Pos,
  view: { vis: boolean[][]; hidden: ReadonlySet<number>; selected?: Unit | null },
): TileVM {
  const terr = s.map[p.x]![p.y]!;
  const b = buildingAt(s, p.x, p.y);
  const vis = view.vis[p.x]![p.y]!;
  const info: TileVM = {
    terrain: { key: terrainKey(terr), name: terrainLabel(terr), defense: Math.round((1 - tileProtection(s, p)) * 100) },
  };
  if (RULES.terrainCost) {
    // Coste de paso: a pie y en vehiculo (null = no se puede pasar).
    const cost = (mt: MoveType) => (Movement.canWalk(mt, terr) ? moveCost(s, mt, p.x, p.y) : null);
    info.terrain.cost = { foot: cost(MoveType.FOOT), vehicle: cost(MoveType.VEHICLE) };
  }
  if (b) {
    const known = vis || b.owner === 0;
    info.building = {
      name: buildingLabel(b.type),
      owner: !known ? 'unknown' : b.owner === 0 ? 'you' : b.owner === 1 ? 'enemy' : 'neutral',
      income: buildingIncome(b.type),
      icon: buildingKey(textures, s, b, vis),
    };
    const cp = captureProgress(s, b);
    if (cp && known) info.building.capture = { left: cp.left, total: capturePointsOf(b), team: cp.team };
  }
  const u = unitAt(s, p.x, p.y);
  const sel = view.selected;
  const shown = u && vis && !view.hidden.has(u.uid) ? u : sel && sel.x === p.x && sel.y === p.y ? sel : undefined;
  if (shown) {
    const T = shown.type;
    const cargo = cargoUnits(s, shown).map((c) => unitLabel(c.type));
    info.unit = {
      icon: unitKey(textures, s, { ...shown, active: shown.team === 1 || shown.active }),
      name: unitLabel(T),
      rank: RULES.veterancy ? rank(shown) : 0,
      team: shown.team,
      life: shown.life,
      stats: unitStatsText(T),
      chips: unitStatChips(T),
      abilities: abilitiesVM(T),
      cargo: UNIT.maxcarry[T]! > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
    };
  }
  return info;
}

/** Prevision de combate de `attacker` (colocado en `from`) contra `target`. */
export function forecastVM(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  attacker: Unit,
  from: Pos,
  target: Unit,
  anchor: Anchor,
): ForecastVM {
  const f = combatForecast(s, { ...attacker, x: from.x, y: from.y }, target);
  return {
    attackerIcon: unitKey(textures, s, { ...attacker, active: true }),
    defenderIcon: unitKey(textures, s, target),
    low: f.low,
    high: f.high,
    expected: f.expected,
    lifeBefore: target.life,
    lifeAfter: f.lifeAfter,
    killChance: f.killChance,
    anchor,
    counter: f.counter
      ? {
          low: f.counter.low,
          high: f.counter.high,
          lifeBefore: attacker.life,
          lifeAfter: f.counter.lifeAfter,
          killChance: f.counter.killChance,
        }
      : null,
  };
}

/**
 * Panel de combate de un ataque (ver CombatVM) en el momento `stage`. `icons` son las imagenes que
 * habia dibujadas antes del combate y `seen` si el jugador ve a cada una: una unidad en la niebla
 * sale como '???' (no se delata que unidad dispara desde donde no se ve).
 * Devuelve null para eventos antiguos sin datos de combate.
 */
export function combatVM(
  ev: Extract<GameEvent, { kind: 'attack' }>,
  stage: CombatVM['stage'],
  icons: { attacker: string | null; defender: string | null },
  seen: { attacker: boolean; defender: boolean },
  id = 0,
): CombatVM | null {
  const c: CombatInfo | undefined = ev.combat;
  if (!c) return null;
  const counter = ev.counter ?? 0;
  const defTeam = (1 - c.attackerTeam) as 0 | 1;
  const hitDone = stage !== 'start';
  const counterDone = stage === 'counter';
  const side = (role: CombatSideVM['role']): CombatSideVM => {
    const atk = role === 'attacker';
    const known = atk ? seen.attacker : seen.defender;
    const before = atk ? c.attackerLife : c.defenderLife;
    const hurt = atk ? (counterDone ? counter : null) : hitDone ? ev.damage : null;
    const life = Math.max(0, before - (hurt ?? 0));
    return {
      icon: known ? (atk ? icons.attacker : icons.defender) : null,
      name: known ? unitLabel(atk ? c.attackerType : c.defenderType) : '???',
      team: atk ? c.attackerTeam : defTeam,
      role,
      rank: known ? (atk ? c.attackerRank : c.defenderRank) : 0,
      life,
      lifeBefore: before,
      hit: known ? (atk ? c.hit : c.counterHit) : null,
      hurt,
      ko: hurt !== null && life <= 0,
    };
  };
  const a = side('attacker');
  const d = side('defender');
  const playerAttacks = c.attackerTeam === 0;
  return { id, stage, left: playerAttacks ? a : d, right: playerAttacks ? d : a, counter: c.counterHit !== null };
}

/** Minimapa (`palette`: color de cada terreno, ver terrainPalette): colores del terreno, niebla, edificios (dueño solo si se ve) y unidades visibles. */
export function minimapVM(pal: readonly number[], s: GameState, vis: boolean[][], hidden: ReadonlySet<number>): MinimapVM {
  const terrain: number[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) terrain.push(pal[s.map[x]![y]!] ?? 0x3a7a3a);
  const seen = (p: Pos) => !!vis[p.x]?.[p.y];
  return {
    w: MAP_W,
    h: MAP_H,
    terrain,
    fog: vis.map((col) => col.slice()),
    buildings: s.buildings.map((b) => ({ x: b.x, y: b.y, owner: b.owner === 0 || seen(b) ? b.owner : null })),
    units: s.units
      .filter((u) => u.carrier === null && !hidden.has(u.uid) && (u.team === 0 || seen(u)))
      .map((u) => ({ x: u.x, y: u.y, team: u.team })),
  };
}

/** Por que no se puede comprar una unidad (menu de compra y aviso). */
export function buyBlockedText(b: NonNullable<BuyOption['blocked']>): string {
  switch (b) {
    case 'funds':
      return t('cantAfford');
    case 'units':
      return t('unitLimit').replace('{n}', String(RULES.maxUnits));
    case 'command':
      return t('commandLimit').replace('{n}', String(RULES.commandPoints ?? 0));
  }
}

/** Nombre de cada tipo de movimiento, en el orden de MoveType. */
const MOVE_TYPE_KEYS: readonly TextKey[] = ['mtFoot', 'mtVehicle', 'mtAir', 'mtAmphibious'];

const signed = (n: number): string => (n > 0 ? `+${n}` : `−${-n}`);

/** Efectos de un clima en corto: "Vehículos −1 mov. · Visión −1 · Puntería −10 %". */
export function weatherEffectsText(kind: number): string {
  const parts: string[] = [];
  // Tipos de movimiento con el mismo cambio, juntos: "Infantería/Vehículos −1 mov."
  const byDelta = new Map<number, string[]>();
  WEATHER.move[kind]!.forEach((d, mt) => {
    if (d !== 0) byDelta.set(d, [...(byDelta.get(d) ?? []), t(MOVE_TYPE_KEYS[mt]!)]);
  });
  for (const [d, names] of byDelta) parts.push(`${names.join('/')} ${signed(d)} ${t('weatherMoveShort')}`);
  const vision = WEATHER.vision[kind]!;
  if (vision !== 0) parts.push(`${cap(t('weatherVision'))} ${signed(vision)}`);
  const aim = Math.round((WEATHER.hitChance[kind]! - 1) * 100);
  if (aim !== 0) parts.push(`${cap(t('weatherAim'))} ${signed(aim)} %`);
  return parts.length ? parts.join(' · ') : t('weatherNoEffect');
}

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/** Indicador del clima (null si la partida se juega sin clima). */
export function weatherVM(s: GameState): WeatherVM | null {
  if (!RULES.weather) return null;
  const kind = weatherNow(s);
  const next = forecast(s);
  return {
    id: WEATHER.ids[kind]!,
    name: weatherLabel(kind),
    effects: weatherEffectsText(kind),
    next: next === null ? null : weatherLabel(next),
  };
}

/** Cuenta por tipo y multiplica: filas "3 × Ciudad". Orden: de mas a menos cantidad. */
function tally(types: number[], label: (t: number) => string, each: (t: number) => number): BreakdownLineVM[] {
  const counts = new Map<number, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([t, count]) => ({ label: label(t), count, amount: count * each(t) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

/**
 * Desglose del dinero de un bando: ingresos por tipo de edificio, mantenimiento por tipo de unidad,
 * lo que queda por dia, con cuanto se empieza el proximo turno y los puntos de mando por tipo. Mismas
 * cuentas que endRound (las cifras de cada fila de mantenimiento son su parte sin redondear; el total
 * es el que se cobra, redondeado a 100).
 */
export function economyVM(s: GameState, team: Team): EconomyVM {
  const owned = s.buildings.filter((b) => b.owner === team).map((b) => b.type);
  const units = s.units.filter((u) => u.team === team).map((u) => u.type);
  const income = owned.reduce((n, t) => n + buildingIncome(t), 0);
  const upkeep = upkeepOf(s, team);
  // endRound cobra primero y despues paga lo que pueda del mantenimiento.
  const afterIncome = s.funds[team] + income;
  const paid = Math.min(upkeep, afterIncome);
  return {
    income: { lines: tally(owned, buildingLabel, buildingIncome), total: income, scale: RULES.incomeScale },
    upkeep:
      RULES.upkeep > 0
        ? { lines: tally(units, unitLabel, (t) => Math.round(UNIT.cost[t]! * RULES.upkeep)), total: upkeep, rate: RULES.upkeep }
        : null,
    net: income - upkeep,
    next: Math.min(afterIncome - paid, MAX_FUNDS),
    shortfall: paid < upkeep ? paid : null,
    command:
      RULES.commandPoints === null
        ? null
        : { lines: tally(units, unitLabel, (t) => UNIT.command[t]!), used: commandUsed(s, team), max: RULES.commandPoints },
  };
}

/** Desglose del dia: limite, dias que quedan y puntos si se acabase ahora. */
export function dayInfoVM(s: GameState): DayInfoVM {
  const limit = RULES.dayLimit;
  return {
    day: s.day,
    limit,
    left: limit === null ? null : Math.max(0, limit - s.day + 1),
    score: limit === null ? null : [score(s, 0), score(s, 1)],
  };
}

const BLOCK_TEXT: Partial<Record<AbilityBlock, TextKey>> = { used: 'genUsed', charge: 'genCharge' };

/** Panel del general de un bando (null si no tiene). `targeting`: habilidad que se esta apuntando. */
export function generalVM(s: GameState, team: Team, targeting: string | null): GeneralVM | null {
  const g = generalOf(s, team);
  if (!g) return null;
  const lang = settings.lang;
  const stars = chargeStars(g.state);
  return {
    name: g.def.name[lang],
    title: g.def.title[lang],
    description: g.def.description[lang],
    stars,
    max: g.def.charge.max,
    fraction: stars >= g.def.charge.max ? 0 : g.state.charge - stars,
    targeting,
    abilities: g.def.abilities.map((a) => {
      // 'target' solo dice que falta elegir casilla: se puede usar.
      const block = abilityBlock(s, team, a.id, { x: 0, y: 0 });
      const text = block ? BLOCK_TEXT[block] : undefined;
      return {
        id: a.id,
        name: a.name[lang],
        description: a.description[lang],
        cost: a.cost,
        ready: block === null,
        reason: text ? t(text) : null,
      };
    }),
  };
}
