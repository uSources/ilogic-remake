import type { GameImages } from '../../atlas';
import type { AbilityDef, MoveType, UnitAttack, UnitType } from '../../core/content';
import { defaultContent } from '../../core/content/default';
import { MAX_LIFE } from '../../core/data';
import { samePos } from '../../core/geom';
import type { DeepReadonly } from '../../core/util/freeze';
import { unitTypeOf, buildingTypeOf, terrainAt } from '../../core/gameContent';
import {
  canMoveOn,
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
import type { Building, GameState, Pos, TeamId, Unit } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { turnEndOrderOf, isDetached, squadById } from '../../core/squads';
import type { AbilityVM, BuildingVM, ChosenStatVM, ChosenUnitVM, StatChipVM, TileVM, UnitVM } from '../../hud/store';
import { nameOf, t, type TextKey } from '../../settings';
import { isFriendly, ownerSideOf, sideOf } from '../sides';
import { AS_ACTIVE, buildingKey, terrainKey, unitKey } from '../sprites';
import { standingOrderLabel } from './army';

/** Fichas de abajo: la casilla (terreno y edificio) y la unidad que hay en ella. */

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

/** 0.25 → 25: la parte de uno como porcentaje entero. */
const percent = (factor: number): number => Math.round(factor * 100);
const pct = (factor: number): string => String(percent(factor));

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
 * Lo que necesita la ficha de quien mira: su equipo, que casillas ve, que unidades no se enseñan
 * (su pieza esta escondida) y la que se esta moviendo, que se enseña aunque su pieza este oculta.
 */
export interface TileViewer {
  viewer: TeamId;
  vis: Grid<boolean>;
  hidden: ReadonlySet<number>;
  selected?: Unit | null;
}

/** Ficha de la casilla `pos` para el equipo que mira: terreno, edificio y unidad (si se ve). */
export function tileVM(textures: GameImages, s: GameState, pos: Pos, view: TileViewer): TileVM {
  const isVisible = view.vis.at(pos);
  const info: TileVM = { terrain: terrainVM(s, pos) };
  const building = buildingAt(s, pos);
  if (building) info.building = buildingVM(textures, s, building, view.viewer, isVisible);
  const shown = shownUnitAt(s, pos, view, isVisible);
  if (shown) info.unit = unitVM(textures, s, shown, view.viewer);
  return info;
}

/** El terreno: su defensa y, con la regla de coste de paso, lo que cuesta entrar a pie y en vehiculo (null = no se pasa). */
function terrainVM(s: GameState, pos: Pos): TileVM['terrain'] {
  const terrain = terrainAt(s, pos);
  const vm: TileVM['terrain'] = { key: terrainKey(terrain), name: nameOf(terrain), defense: percent(1 - tileProtection(s, pos)) };
  if (!isRuleOn(s, 'terrainCost')) return vm;
  const enterCost = (moveType: MoveType) => (canMoveOn(moveType, terrain) ? terrainAccess(s, moveType).enterCost(pos) : null);
  vm.cost = { foot: enterCost('foot'), vehicle: enterCost('vehicle') };
  return vm;
}

/** El edificio: de quien es y su captura a medias solo si se ve o es de un aliado. */
function buildingVM(textures: GameImages, s: GameState, building: Building, viewer: TeamId, isVisible: boolean): BuildingVM {
  const owner = ownerSideOf(s, viewer, building.owner);
  const isKnown = isVisible || isFriendly(owner);
  const capture = captureProgress(s, building);
  const buildingType = buildingTypeOf(s, building);
  return {
    name: nameOf(buildingType),
    owner: isKnown ? owner : 'unknown',
    income: buildingIncome(s, buildingType),
    icon: buildingKey(textures, s, building, isVisible, viewer),
    ...(capture && isKnown
      ? { capture: { left: capture.left, total: capturePointsOf(s, building), side: sideOf(s, viewer, capture.team) } }
      : {}),
  };
}

/** La unidad que enseña la ficha: la de la casilla si se ve, o la que se esta moviendo hasta alli. */
function shownUnitAt(s: GameState, pos: Pos, view: TileViewer, isVisible: boolean): Unit | undefined {
  const unit = unitAt(s, pos);
  if (unit && isVisible && !view.hidden.has(unit.uid)) return unit;
  const selected = view.selected;
  return selected && samePos(selected, pos) ? selected : undefined;
}

function unitVM(textures: GameImages, s: GameState, unit: Unit, viewer: TeamId): UnitVM {
  const unitType = unitTypeOf(s, unit);
  const side = sideOf(s, viewer, unit.team);
  const isOwn = side === 'own';
  return {
    // Las ajenas se ven siempre como activas (no se enseña si ya han jugado).
    icon: unitKey(textures, s, unit, viewer, isOwn ? {} : AS_ACTIVE),
    name: nameOf(unitType),
    rank: isRuleOn(s, 'veterancy') ? rank(unit) : 0,
    side,
    life: unit.life,
    stats: unitStatsText(unitType),
    chips: unitStatChips(unitType),
    abilities: abilitiesVM(s, unitType),
    cargo: cargoText(s, unit, unitType),
    ...(unit.life < MAX_LIFE && unhealable(s, unit) ? { noHeal: true } : {}),
    ...(isOwn ? ownUnitDetails(s, unit) : {}),
  };
}

/**
 * La ficha de la unidad elegida (lienzo «Todo en estilo C», tablero 8): la unidad como en lo de bajo
 * el cursor, lo que mueve, alcanza y ve en texto, y lo que sabe hacer. Sin municion ni combustible:
 * el juego no los tiene.
 */
export function chosenUnitVM(textures: GameImages, s: GameState, unit: Unit, viewer: TeamId): ChosenUnitVM {
  const unitType = unitTypeOf(s, unit);
  const capture = unitType.canCapture ? [t('capturesBuildings')] : [];
  return {
    unit: unitVM(textures, s, unit, viewer),
    stats: chosenStats(unitType),
    skills: [...capture, ...abilitiesVM(s, unitType).map((ability) => ability.name)],
  };
}

/** «Mueve 3 · Alcance 1–1 · Visión 2» (o «No ataca» en vez del alcance). */
function chosenStats(unitType: UnitType): ChosenStatVM[] {
  const { attack } = unitType;
  return [
    { label: t('movesStat'), value: String(unitType.move) },
    attack ? { label: t('range'), value: rangeText(attack) } : { label: t('noAttack'), value: '' },
    { label: t('vision'), value: String(unitType.vision) },
  ];
}

/** "Carga: Soldado, Soldado" (o "Carga: vacío") en los que llevan carga; undefined en el resto. */
function cargoText(s: GameState, transport: Unit, transportType: UnitType): string | undefined {
  if (transportType.cargoSlots <= 0) return undefined;
  const cargo = cargoUnits(s, transport).map((passenger) => nameOf(unitTypeOf(s, passenger)));
  return `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}`;
}

/** Lo que solo se enseña de las propias: la orden que cumplira al acabar el turno, si va suelta y su escuadra. */
function ownUnitDetails(s: GameState, unit: Unit): Pick<UnitVM, 'order' | 'detached' | 'squad'> {
  const order = turnEndOrderOf(s, unit);
  const squad = squadById(s, unit.squad);
  return {
    ...(order ? { order: standingOrderLabel(order.kind) } : {}),
    ...(isDetached(s, unit) ? { detached: true } : {}),
    ...(squad ? { squad: squad.name } : {}),
  };
}
