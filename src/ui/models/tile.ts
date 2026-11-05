import type Phaser from 'phaser';
import { abilitiesOf } from '../../core/abilities';
import { MoveType, type AbilityDef, type UnitAttack, type UnitType } from '../../core/content';
import type { DeepReadonly } from '../../core/util/freeze';
import { unitTypeOf, buildingTypeOf, terrainAt } from '../../core/gameContent';
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
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { isHostile } from '../../core/teams';
import type { Grid } from '../../core/util/grid';
import { effectiveStandingOrder, isDetached, squadById } from '../../core/squads';
import type { AbilityVM, StatChipVM, TileVM } from '../../hud/store';
import { nameOf, t } from '../../settings';
import { isFriendly, ownerSideOf, sideLetter, sideOf } from '../sides';
import { buildingKey, terrainKey, unitKey } from '../sprites';
import { standingOrderLabel } from './army';

/** Fichas de abajo: la casilla (terreno, edificio, punto de control) y la unidad que hay en ella. */

/** "1–2": distancias a las que dispara un tipo de unidad. */
const rangeText = (attack: UnitAttack): string => `${attack.minRange}–${attack.maxRange}`;

/** Datos de la ficha de un tipo de unidad con su icono: movimiento, alcance y vision. */
export function unitStatChips(unitType: UnitType): StatChipVM[] {
  const { attack } = unitType;
  return [
    { icon: 'ui/movimiento', text: String(unitType.move), title: t('move') },
    { icon: 'ui/alcance', text: attack ? rangeText(attack) : '—', title: attack ? t('range') : t('noAttack') },
    { icon: 'ui/vision', text: String(unitType.vision), title: t('vision') },
  ];
}

/** "Mov 3 · Alcance 1–1" */
export function unitStatsText(unitType: UnitType): string {
  const range = unitType.attack ? `${t('range')} ${rangeText(unitType.attack)}` : t('noAttack');
  return `${t('move')} ${unitType.move} · ${range}`;
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
export function abilitiesVM(s: GameState, unitType: UnitType): AbilityVM[] {
  return abilitiesOf(s, unitType).map(abilityVM);
}

/** "20→10": puntos del edificio de debajo antes y despues de capturar este turno. */
export function captureHintText(s: GameState, unit: Unit): string | undefined {
  const building = buildingAt(s, unit);
  if (!building) return undefined;
  const capture = captureProgress(s, building);
  const now = capture && capture.uid === unit.uid ? capture.left : capturePointsOf(s, building);
  return `${now}→${Math.max(0, now - captureStrength(s, unit))}`;
}

/**
 * Ficha de la casilla `p` para el equipo que mira (`view.viewer`): terreno, edificio y unidad (si se
 * ve). `selected` es la unidad que se esta moviendo, que se enseña aunque su sprite este oculto.
 */
export function tileVM(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  pos: Pos,
  view: { viewer: TeamId; vis: Grid<boolean>; hidden: ReadonlySet<number>; selected?: Unit | null },
): TileVM {
  const terr = terrainAt(s, pos);
  const building = buildingAt(s, pos);
  const vis = view.vis.at(pos);
  const viewer = view.viewer;
  const info: TileVM = {
    terrain: { key: terrainKey(terr), name: nameOf(terr), defense: Math.round((1 - tileProtection(s, pos)) * 100) },
  };
  if (s.rules.terrainCost) {
    // Coste de paso: a pie y en vehiculo (null = no se puede pasar).
    const cost = (moveType: MoveType) => (canMoveOn(moveType, terr) ? moveCost(s, moveType, pos) : null);
    info.terrain.cost = { foot: cost(MoveType.FOOT), vehicle: cost(MoveType.VEHICLE) };
  }
  if (building) {
    const owner = ownerSideOf(s, viewer, building.owner);
    const known = vis || isFriendly(owner);
    const capture = captureProgress(s, building);
    info.building = {
      name: nameOf(buildingTypeOf(s, building)),
      owner: known ? owner : 'unknown',
      income: buildingIncome(s, buildingTypeOf(s, building)),
      icon: buildingKey(textures, s, building, vis, viewer),
      ...(capture && known
        ? { capture: { left: capture.left, total: capturePointsOf(s, building), side: sideOf(s, viewer, capture.team) } }
        : {}),
    };
  }
  // [CAMBIO] Zona de un punto de control (se ve aunque haya niebla: esta marcada en el mapa).
  // Disputada solo si se ven dentro unidades de alianzas enemigas (no delata a los escondidos).
  const controlPoint = s.controlPoints?.find((controlPoint) => inControlZone(s, controlPoint, pos));
  if (controlPoint) {
    const inside = s.units.filter(
      (unit) => unit.carrier === null && inControlZone(s, controlPoint, unit) && (unit.team === viewer || view.vis.at(unit)),
    );
    const owner = ownerSideOf(s, viewer, controlPoint.owner);
    info.point = {
      owner,
      income: s.rules.controlIncome,
      contested: inside.some((unit) => inside.some((other) => isHostile(s, unit.team, other.team))),
      icon: `ui/zona_${sideLetter(owner)}`,
    };
  }
  const unit = unitAt(s, pos);
  const selected = view.selected;
  const shown =
    unit && vis && !view.hidden.has(unit.uid) ? unit : selected && selected.x === pos.x && selected.y === pos.y ? selected : undefined;
  if (shown) {
    const shownType = unitTypeOf(s, shown);
    const cargo = cargoUnits(s, shown).map((unit) => nameOf(unitTypeOf(s, unit)));
    const side = sideOf(s, viewer, shown.team);
    const own = side === 'own';
    info.unit = {
      icon: unitKey(textures, s, { ...shown, turnState: own ? shown.turnState : 'ready' }, viewer),
      name: nameOf(shownType),
      rank: s.rules.veterancy ? rank(shown) : 0,
      side,
      life: shown.life,
      stats: unitStatsText(shownType),
      chips: unitStatChips(shownType),
      abilities: abilitiesVM(s, shownType),
      cargo: shownType.cargoSlots > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
      ...(shown.life < 100 && unhealable(s, shown) ? { noHeal: true } : {}),
      ...(own && effectiveStandingOrder(s, shown) ? { order: standingOrderLabel(effectiveStandingOrder(s, shown)!.kind) } : {}),
      ...(own && isDetached(s, shown) ? { detached: true } : {}),
      ...(own && squadById(s, shown.squad) ? { squad: squadById(s, shown.squad)!.name } : {}),
    };
  }
  return info;
}
