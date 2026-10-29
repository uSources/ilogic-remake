import type Phaser from 'phaser';
import { MAP_H, MAP_W, RULES, TERRAIN, UNIT } from '../core/data';
import {
  buildingAt,
  buildingIncome,
  capturePointsOf,
  captureProgress,
  captureStrength,
  cargoUnits,
  combatForecast,
  moveCost,
  rank,
  tileProtection,
  unitAt,
} from '../core/rules';
import type { GameState, Pos, Unit } from '../core/types';
import type { Anchor, ForecastVM, MinimapVM, TileVM } from '../hud/store';
import { buildingLabel, t, terrainLabel, unitLabel } from '../settings';
import { buildingKey, terrainKey, unitKey } from './sprites';

/**
 * Datos que enseña la interfaz HTML durante la partida (fichas, prevision de combate, minimapa),
 * calculados a partir del estado. Sin efectos: GameScene los publica en el store.
 */

/** "Mov 3 · Alcance 1–1" */
export function unitStatsText(type: number): string {
  const range = UNIT.alcance[type]! === 0 ? t('noAttack') : `${t('range')} ${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return `${t('move')} ${UNIT.mover[type]} · ${range}`;
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
    const cost = (mt: number) => (TERRAIN.canwalk[mt]![terr] ? moveCost(s, mt, p.x, p.y) : null);
    info.terrain.cost = { foot: cost(0), vehicle: cost(1) };
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
      fuel: UNIT.maxfuel[T]! > 0 ? { now: shown.fuel, max: UNIT.maxfuel[T]! } : undefined,
      ammo: UNIT.maxammo[T]! > 0 ? { now: shown.ammo, max: UNIT.maxammo[T]! } : undefined,
      stats: unitStatsText(T),
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
