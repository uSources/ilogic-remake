import type Phaser from 'phaser';
import type { AbilityDef, MoveType, UnitAttack, UnitType } from '../../core/content';
import { defaultContent } from '../../core/content/default';
import type { DeepReadonly } from '../../core/util/freeze';
import { unitTypeOf, buildingTypeOf, terrainAt } from '../../core/gameContent';
import {
  canMoveOn,
  inControlZone,
  isShownTo,
  buildingAt,
  buildingIncome,
  capturePointsOf,
  captureProgress,
  captureStrength,
  cargoUnits,
  terrainAccess,
  rank,
  unhealable,
  tileProtection,
  unitAt,
  abilitiesOf,
  isRuleOn,
} from '../../core/rules';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { isHostile } from '../../core/teams';
import type { Grid } from '../../core/util/grid';
import { turnEndOrderOf, isDetached, squadById } from '../../core/squads';
import type { AbilityVM, StatChipVM, TileVM } from '../../hud/store';
import { nameOf, t, type TextKey } from '../../settings';
import { isFriendly, ownerSideOf, sideLetter, sideOf } from '../sides';
import { AS_ACTIVE, buildingKey, terrainKey, unitKey } from '../sprites';
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

/** Como se dice cada tipo de movimiento dentro de una frase ("a pie, vehículos"); uno nuevo, por su nombre en movements.json. */
const MOVEMENT_PHRASES: Readonly<Partial<Record<MoveType, TextKey>>> = {
  foot: 'move_foot',
  vehicle: 'move_vehicle',
  air: 'move_air',
  amphibious: 'move_amphibious',
};

function movementPhrase(movement: MoveType): string {
  const key = MOVEMENT_PHRASES[movement];
  const type = defaultContent().movements.byId[movement];
  return key ? t(key) : type ? nameOf(type) : movement;
}

/** Nombre y explicacion de una habilidad, con sus numeros. */
export function abilityVM(ability: DeepReadonly<AbilityDef>): AbilityVM {
  switch (ability.kind) {
    case 'guard':
      return { name: t('ability_guard'), desc: t('ability_guard_desc').replace('{n}', pct(1 - ability.factor)) };
    case 'zoneOfControl':
      return {
        name: t('ability_zoneOfControl'),
        desc: t('ability_zoneOfControl_desc').replace('{m}', ability.stops.map(movementPhrase).join(', ')),
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
  if (isRuleOn(s, 'terrainCost')) {
    // Coste de paso: a pie y en vehiculo (null = no se puede pasar).
    const cost = (moveType: MoveType) => (canMoveOn(moveType, terr) ? terrainAccess(s, moveType).enterCost(pos) : null);
    info.terrain.cost = { foot: cost('foot'), vehicle: cost('vehicle') };
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
    const inside = s.units.filter((unit) => inControlZone(s, controlPoint, unit) && isShownTo(viewer, unit, (at) => view.vis.at(at)));
    const owner = ownerSideOf(s, viewer, controlPoint.owner);
    info.point = {
      owner,
      income: s.settings.controlIncome,
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
      // Las ajenas se ven siempre como activas (no se enseña si ya han jugado).
      icon: unitKey(textures, s, shown, viewer, own ? {} : AS_ACTIVE),
      name: nameOf(shownType),
      rank: isRuleOn(s, 'veterancy') ? rank(shown) : 0,
      side,
      life: shown.life,
      stats: unitStatsText(shownType),
      chips: unitStatChips(shownType),
      abilities: abilitiesVM(s, shownType),
      cargo: shownType.cargoSlots > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
      ...(shown.life < 100 && unhealable(s, shown) ? { noHeal: true } : {}),
      ...(own && turnEndOrderOf(s, shown) ? { order: standingOrderLabel(turnEndOrderOf(s, shown)!.kind) } : {}),
      ...(own && isDetached(s, shown) ? { detached: true } : {}),
      ...(own && squadById(s, shown.squad) ? { squad: squadById(s, shown.squad)!.name } : {}),
    };
  }
  return info;
}
