/**
 * Piezas del HUD que dependen de lo que hay elegido en la escena: prevision de combate, bocadillo al
 * mover, panel de lo elegido, panel del laboratorio y la linea de ayuda. Sin efectos: la escena junta
 * el resultado y lo publica con ui.set (las fichas en si se calculan en ui/hudModels.ts).
 */
import { entryOf, type UnitType } from '../../core/content';
import { unitTypeOf, buildingTypeOf } from '../../core/gameContent';
import { posKey, posOf } from '../../core/geom';
import type Phaser from 'phaser';
import { buildingIncome, defenseStars, pathCost, unitById, upkeepOf, type MoveRange } from '../../core/rules';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import type { Anchor, ForecastVM, MoveTipVM, SelectionVM, UIState } from '../../hud/store';
import type { LabOptions } from '../../lab';
import { t, nameOf } from '../../settings';
import { forecastVM } from '../../ui/hudModels';
import { unitKey } from '../../ui/sprites';
import { type Intent, type Phase } from './types';

/** Prevision del combate con la unidad elegida, si el cursor esta sobre un enemigo atacable. */
export function forecastFor(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  options: {
    /** El equipo que mira (los colores de los retratos). */
    viewer: TeamId;
    phase: Phase;
    selected: Unit | null;
    c: Pos;
    intentAt: (pos: Pos) => Intent;
    attackSet: ReadonlyMap<string, number>;
    anchor: (pos: Pos) => Anchor;
  },
): ForecastVM | null {
  const attacker = options.selected;
  if (!attacker) return null;
  const fight =
    options.phase === 'move' ? fightFromMove(options.intentAt(options.c)) : fightFromHere(s, attacker, options.attackSet, options.c);
  if (!fight) return null;
  return forecastVM(textures, s, options.viewer, attacker, fight.from, fight.target, options.anchor(fight.target));
}

/** A quien se apunta y desde que casilla se dispararia. */
interface AimedFight {
  from: Pos;
  target: Unit;
}

/** Al mover: si el cursor esta sobre un enemigo atacable, desde la casilla desde la que se atacaria. */
function fightFromMove(intent: Intent): AimedFight | null {
  if (intent.kind !== 'attack') return null;
  return { from: intent.from, target: intent.target };
}

/** Eligiendo a quien atacar (fase 'attack'): desde donde esta. */
function fightFromHere(s: GameState, attacker: Unit, targets: ReadonlyMap<string, number>, cursor: Pos): AimedFight | null {
  const uid = targets.get(posKey(cursor));
  const target = uid !== undefined ? unitById(s, uid) : undefined;
  return target ? { from: posOf(attacker), target } : null;
}

/** Bocadillo junto al cursor al mover: movimiento gastado, defensa, combustible, peligro y lo que pasaria al soltar. */
export function moveTipFor(
  s: GameState,
  options: {
    selected: Unit | null;
    range: MoveRange | null;
    c: Pos;
    intentAt: (pos: Pos) => Intent;
    trailTo: (dest: Pos) => Pos[];
    danger: Grid<boolean> | null;
    anchor: (pos: Pos) => Anchor;
  },
): MoveTipVM | null {
  const unit = options.selected;
  const range = options.range;
  const cursor = options.c;
  if (!unit || !range) return null;
  const intent = options.intentAt(cursor);
  // De atacar (y de quedarse) se encarga la prevision de combate.
  if (intent.kind === 'attack' || intent.kind === 'stay') return null;
  const anchor = options.anchor(cursor);
  if (intent.kind === 'none') return { anchor, action: t('tipNone'), invalid: true };
  const isMove = intent.kind === 'move';
  const used = isMove ? pathCost(range.profile, options.trailTo(intent.to)) : (range.steps.at(cursor) ?? 1);
  return {
    anchor,
    action: moveTipAction(intent),
    used,
    max: range.profile.budget,
    stars: isMove ? defenseStars(s, cursor) : undefined,
    danger: isMove && !!options.danger?.at(cursor),
  };
}

function moveTipAction(intent: Intent): string {
  if (intent.kind === 'merge') return t('tipJoin');
  if (intent.kind === 'load') return t('tipBoard');
  return intent.kind === 'move' && intent.capture ? t('tipCapture') : t('tipMove');
}

/** [CAMBIO] Panel de lo elegido (dos o mas unidades): retratos en orden y cuantas hay de cada tipo. */
export function selectionPanel(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  viewer: TeamId,
  list: Unit[],
  cursor: Pos,
): SelectionVM {
  const countByType = new Map<UnitType, number>();
  for (const unitType of list.map((unit) => unitTypeOf(s, unit))) countByType.set(unitType, (countByType.get(unitType) ?? 0) + 1);
  return {
    units: list.map((unit) => ({
      uid: unit.uid,
      icon: unitKey(textures, s, unit, viewer),
      name: nameOf(unitTypeOf(s, unit)),
      life: unit.life,
      current: unit.x === cursor.x && unit.y === cursor.y,
    })),
    types: [...countByType].map(([unitType, count]) => ({ name: nameOf(unitType), count })),
  };
}

/** Ingresos de un equipo por turno: lo que dan sus edificios menos el mantenimiento de su ejercito. */
export function teamIncome(s: GameState, team: TeamId): number {
  const owned = s.buildings.filter((building) => building.owner === team);
  return owned.reduce((sum, building) => sum + buildingIncome(s, buildingTypeOf(s, building)), 0) - upkeepOf(s, team);
}

/** Panel del laboratorio de animaciones (null en una partida normal). */
export function labPanel(s: GameState, lab: LabOptions | null): UIState['lab'] {
  if (!lab) return null;
  return {
    units: s.content.units.list.map((unitType) => ({ id: unitType.id, name: nameOf(unitType) })),
    attacker: lab.attacker,
    defender: lab.defender,
    slow: lab.slow,
    canAttack: entryOf(s.content.units, lab.attacker, 'unidad').attack !== null,
  };
}

/** Linea de ayuda de abajo segun la fase. */
export function hintText(options: { busy: boolean; othersPlaying: boolean; phase: Phase; ordering: boolean; inspecting: boolean }): string {
  // Animando lo propio no se dice nada; en el turno enemigo, como saltarlo.
  if (options.busy) return options.othersPlaying ? t('skip') : '';
  if (options.phase === 'target') return options.ordering ? t('orderPick') : t('genTarget');
  if (options.phase === 'map') return options.inspecting ? t('hintInspect') : t('hintMap');
  return '';
}
