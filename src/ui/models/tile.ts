import type Phaser from 'phaser';
import { abilitiesOf } from '../../core/abilities';
import { MoveType, type AbilityDef } from '../../core/content';
import type { DeepReadonly } from '../../core/util/freeze';
import { tablesOf } from '../../core/gameContent';
import {
  canMoveOn,
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
import { effectiveStandingOrder, isDetached, squadById } from '../../core/squads';
import type { AbilityVM, StatChipVM, TileVM } from '../../hud/store';
import { buildingLabel, t, terrainLabel, unitLabel } from '../../settings';
import { buildingKey, terrainKey, unitKey } from '../sprites';
import { standingOrderLabel } from './army';

/** Fichas de abajo: la casilla (terreno, edificio, punto de control) y la unidad que hay en ella. */

/** Datos de la ficha de una unidad con su icono: movimiento, alcance y vision. */
export function unitStatChips(s: GameState, type: number): StatChipVM[] {
  const UNIT = tablesOf(s).UNIT;
  const range = UNIT.alcance[type]! === 0 ? '—' : `${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return [
    { icon: 'ui/movimiento', text: String(UNIT.mover[type]), title: t('move') },
    { icon: 'ui/alcance', text: range, title: UNIT.alcance[type]! === 0 ? t('noAttack') : t('range') },
    { icon: 'ui/vision', text: String(UNIT.vision[type]), title: t('vision') },
  ];
}

/** "Mov 3 · Alcance 1–1" */
export function unitStatsText(s: GameState, type: number): string {
  const UNIT = tablesOf(s).UNIT;
  const range = UNIT.alcance[type]! === 0 ? t('noAttack') : `${t('range')} ${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
  return `${t('move')} ${UNIT.mover[type]} · ${range}`;
}

const pct = (factor: number): string => String(Math.round(factor * 100));

/** Nombre y explicacion de una habilidad, con sus numeros. */
export function abilityVM(ability: DeepReadonly<AbilityDef>): AbilityVM {
  switch (ability.kind) {
    case 'guard':
      return { name: t('ability_guard'), desc: t('ability_guard_desc').replace('{n}', pct(1 - ability.factor)) };
    case 'zoneOfControl':
      return {
        name: t('ability_zoneOfControl'),
        desc: t('ability_zoneOfControl_desc').replace('{m}', ability.stops.map((kind) => t(`move_${kind}`)).join(', ')),
      };
    case 'aura':
      return {
        name: t('ability_aura'),
        desc: t('ability_aura_desc')
          .replace('{r}', String(ability.radius))
          .replace('{n}', pct(1 - ability.defense)),
      };
    case 'piercing':
      return { name: t('ability_piercing'), desc: t('ability_piercing_desc').replace('{n}', pct(ability.ignoreCover)) };
    case 'scout':
      return { name: t('ability_scout'), desc: t('ability_scout_desc') };
    case 'quickCapture':
      return { name: t('ability_quickCapture'), desc: t('ability_quickCapture_desc').replace('{n}', pct(ability.factor - 1)) };
    default:
      return ability satisfies never;
  }
}

/** Habilidades de un tipo de unidad que cuentan en esta partida (vacio con la regla apagada). */
export function abilitiesVM(s: GameState, type: number): AbilityVM[] {
  return abilitiesOf(s, type).map(abilityVM);
}

/** "20→10": puntos del edificio de debajo antes y despues de capturar este turno. */
export function captureHintText(s: GameState, unit: Unit): string | undefined {
  const building = buildingAt(s, unit);
  if (!building) return undefined;
  const cp = captureProgress(s, building);
  const now = cp && cp.uid === unit.uid ? cp.left : capturePointsOf(s, building);
  return `${now}→${Math.max(0, now - captureStrength(s, unit))}`;
}

/**
 * Ficha de la casilla `p`: terreno, edificio y unidad (si se ve). `selected` es la unidad que se esta
 * moviendo, que se enseña aunque su sprite este oculto.
 */
export function tileVM(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  pos: Pos,
  view: { vis: Grid<boolean>; hidden: ReadonlySet<number>; selected?: Unit | null },
): TileVM {
  const terr = terrainAt(s, pos);
  const building = buildingAt(s, pos);
  const vis = view.vis.at(pos);
  const info: TileVM = {
    terrain: { key: terrainKey(terr), name: terrainLabel(s.content, terr), defense: Math.round((1 - tileProtection(s, pos)) * 100) },
  };
  if (s.rules.terrainCost) {
    // Coste de paso: a pie y en vehiculo (null = no se puede pasar).
    const cost = (mt: MoveType) => (canMoveOn(s, mt, terr) ? moveCost(s, mt, pos) : null);
    info.terrain.cost = { foot: cost(MoveType.FOOT), vehicle: cost(MoveType.VEHICLE) };
  }
  if (building) {
    const known = vis || building.owner === 0;
    info.building = {
      name: buildingLabel(s.content, building.type),
      owner: !known ? 'unknown' : building.owner === 0 ? 'you' : building.owner === 1 ? 'enemy' : 'neutral',
      income: buildingIncome(s, building.type),
      icon: buildingKey(textures, s, building, vis),
    };
    const cp = captureProgress(s, building);
    if (cp && known) info.building.capture = { left: cp.left, total: capturePointsOf(s, building), team: cp.team };
  }
  // [CAMBIO] Zona de un punto de control (se ve aunque haya niebla: esta marcada en el mapa).
  // Disputada solo si se ven unidades de los dos bandos dentro (no delata a los escondidos).
  const cp = s.controlPoints?.find((controlPoint) => inControlZone(s, controlPoint, pos));
  if (cp) {
    const inside = s.units.filter((unit) => unit.carrier === null && inControlZone(s, cp, unit) && (unit.team === 0 || view.vis.at(unit)));
    info.point = {
      owner: cp.owner === 0 ? 'you' : cp.owner === 1 ? 'enemy' : 'neutral',
      income: s.rules.controlIncome,
      contested: inside.some((unit) => unit.team === 0) && inside.some((unit) => unit.team === 1),
      icon: `ui/zona_${cp.owner === 0 ? 'b' : cp.owner === 1 ? 'r' : 'i'}`,
    };
  }
  const unit = unitAt(s, pos);
  const sel = view.selected;
  const shown = unit && vis && !view.hidden.has(unit.uid) ? unit : sel && sel.x === pos.x && sel.y === pos.y ? sel : undefined;
  if (shown) {
    const shownType = shown.type;
    const cargo = cargoUnits(s, shown).map((unit) => unitLabel(s.content, unit.type));
    info.unit = {
      icon: unitKey(textures, s, { ...shown, active: shown.team === 1 || shown.active }),
      name: unitLabel(s.content, shownType),
      rank: s.rules.veterancy ? rank(shown) : 0,
      team: shown.team,
      life: shown.life,
      stats: unitStatsText(s, shownType),
      chips: unitStatChips(s, shownType),
      abilities: abilitiesVM(s, shownType),
      cargo: tablesOf(s).UNIT.maxcarry[shownType]! > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
      ...(shown.life < 100 && unhealable(s, shown) ? { noHeal: true } : {}),
      ...(shown.team === 0 && effectiveStandingOrder(s, shown)
        ? { order: standingOrderLabel(effectiveStandingOrder(s, shown)!.kind) }
        : {}),
      ...(shown.team === 0 && isDetached(s, shown) ? { detached: true } : {}),
      ...(shown.team === 0 && squadById(s, shown.squad) ? { squad: squadById(s, shown.squad)!.name } : {}),
    };
  }
  return info;
}
