import type Phaser from 'phaser';
import { abilitiesOf } from '../../core/abilities';
import { RULES, UNIT, Movement, MoveType, type AbilityDef } from '../../core/data';
import {
  inControlZone,
  buildingAt,
  buildingIncome,
  capturePointsOf,
  captureProgress,
  captureStrength,
  cargoUnits,
  moveCost,
  rank,
  unhealable,
  tileProtection,
  unitAt,
} from '../../core/rules';
import { terrainAt } from '../../core/mapGrid';
import type { GameState, Pos, Unit } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { effectiveCommand, isDetached, squadById } from '../../core/squads';
import type { AbilityVM, StatChipVM, TileVM } from '../../hud/store';
import { buildingLabel, t, terrainLabel, unitLabel } from '../../settings';
import { buildingKey, terrainKey, unitKey } from '../sprites';
import { commandLabel } from './army';

/** Fichas de abajo: la casilla (terreno, edificio, punto de control) y la unidad que hay en ella. */

/** Datos de la ficha de una unidad con su icono: movimiento, alcance y vision. */
export function unitStatChips(type: number): StatChipVM[] {
  const range = UNIT.alcance[type]! === 0 ? '—' : `${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return [
    { icon: 'ui/movimiento', text: String(UNIT.mover[type]), title: t('move') },
    { icon: 'ui/alcance', text: range, title: UNIT.alcance[type]! === 0 ? t('noAttack') : t('range') },
    { icon: 'ui/vision', text: String(UNIT.vision[type]), title: t('vision') },
  ];
}

/** "Mov 3 · Alcance 1–1" */
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
    case 'scout':
      return { name: t('ability_scout'), desc: t('ability_scout_desc') };
    case 'quickCapture':
      return { name: t('ability_quickCapture'), desc: t('ability_quickCapture_desc').replace('{n}', pct(a.factor - 1)) };
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
  view: { vis: Grid<boolean>; hidden: ReadonlySet<number>; selected?: Unit | null },
): TileVM {
  const terr = terrainAt(s, p);
  const b = buildingAt(s, p.x, p.y);
  const vis = view.vis.at(p);
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
  // [CAMBIO] Zona de un punto de control (se ve aunque haya niebla: esta marcada en el mapa).
  // Disputada solo si se ven unidades de los dos bandos dentro (no delata a los escondidos).
  const cp = s.controlPoints?.find((c) => inControlZone(c, p));
  if (cp) {
    const inside = s.units.filter((u) => u.carrier === null && inControlZone(cp, u) && (u.team === 0 || view.vis.at(u)));
    info.point = {
      owner: cp.owner === 0 ? 'you' : cp.owner === 1 ? 'enemy' : 'neutral',
      income: RULES.controlIncome,
      contested: inside.some((u) => u.team === 0) && inside.some((u) => u.team === 1),
      icon: `ui/zona_${cp.owner === 0 ? 'b' : cp.owner === 1 ? 'r' : 'i'}`,
    };
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
      ...(shown.life < 100 && unhealable(s, shown) ? { noHeal: true } : {}),
      ...(shown.team === 0 && effectiveCommand(s, shown) ? { order: commandLabel(effectiveCommand(s, shown)!.kind) } : {}),
      ...(shown.team === 0 && isDetached(s, shown) ? { detached: true } : {}),
      ...(shown.team === 0 && squadById(s, shown.squad) ? { squad: squadById(s, shown.squad)!.name } : {}),
    };
  }
  return info;
}
