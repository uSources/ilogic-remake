/**
 * Piezas del HUD que dependen de lo que hay elegido en la escena: prevision de combate, bocadillo al
 * mover, panel de lo elegido, panel del laboratorio y la linea de ayuda. Sin efectos: la escena junta
 * el resultado y lo publica con ui.set (las fichas en si se calculan en ui/hudModels.ts).
 */
import { posKey } from '../../core/geom';
import type Phaser from 'phaser';
import { defaultContent } from '../../core/content/default';
import { movementOf } from '../../core/gameContent';
import { buildingIncome, defenseStars, pathCost, unitById, upkeepOf, type MoveRange } from '../../core/rules';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos, Unit } from '../../core/model';
import type { Anchor, ForecastVM, MoveTipVM, SelectionVM, UIState } from '../../hud/store';
import type { LabOptions } from '../../lab';
import { t, unitLabel } from '../../settings';
import { forecastVM } from '../../ui/hudModels';
import { unitKey } from '../../ui/sprites';
import { type Intent, type Phase } from './types';

/** Prevision del combate con la unidad elegida, si el cursor esta sobre un enemigo atacable. */
export function forecastFor(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  o: {
    phase: Phase;
    sel: Unit | null;
    c: Pos;
    intentAt: (p: Pos) => Intent;
    attackSet: ReadonlyMap<string, number>;
    anchor: (p: Pos) => Anchor;
  },
): ForecastVM | null {
  const attacker = o.sel;
  if (!attacker) return null;
  const fight = o.phase === 'move' ? fightFromMove(attacker, o.intentAt(o.c)) : fightFromHere(s, attacker, o.attackSet, o.c);
  if (!fight) return null;
  return forecastVM(textures, s, attacker, fight.attackerAt, fight.target, o.anchor(fight.target));
}

/** Al mover: si el cursor esta sobre un enemigo atacable, desde la casilla desde la que se atacaria. */
function fightFromMove(attacker: Unit, intent: Intent): { attackerAt: Unit; target: Unit } | null {
  if (intent.kind !== 'attack') return null;
  return { attackerAt: { ...attacker, x: intent.from.x, y: intent.from.y }, target: intent.target };
}

/** Eligiendo a quien atacar (fase 'attack'): desde donde esta. */
function fightFromHere(
  s: GameState,
  attacker: Unit,
  targets: ReadonlyMap<string, number>,
  cursor: Pos,
): { attackerAt: Unit; target: Unit } | null {
  const uid = targets.get(posKey(cursor));
  const target = uid !== undefined ? unitById(s, uid) : undefined;
  return target ? { attackerAt: attacker, target } : null;
}

/** Bocadillo junto al cursor al mover: movimiento gastado, defensa, combustible, peligro y lo que pasaria al soltar. */
export function moveTipFor(
  s: GameState,
  o: {
    sel: Unit | null;
    range: MoveRange | null;
    c: Pos;
    intentAt: (p: Pos) => Intent;
    trailTo: (dest: Pos) => Pos[];
    danger: Grid<boolean> | null;
    anchor: (p: Pos) => Anchor;
  },
): MoveTipVM | null {
  const unit = o.sel;
  const range = o.range;
  const cursor = o.c;
  if (!unit || !range) return null;
  const intent = o.intentAt(cursor);
  // De atacar (y de quedarse) se encarga la prevision de combate.
  if (intent.kind === 'attack' || intent.kind === 'stay') return null;
  const anchor = o.anchor(cursor);
  if (intent.kind === 'none') return { anchor, action: t('tipNone'), invalid: true };
  const isMove = intent.kind === 'move';
  const used = isMove ? pathCost(s, movementOf(s, unit.type), o.trailTo(intent.to)) : range.steps.at(cursor) || 1;
  return {
    anchor,
    action: moveTipAction(intent),
    used,
    max: range.maxSteps,
    stars: isMove ? defenseStars(s, cursor) : undefined,
    danger: isMove && !!o.danger?.at(cursor),
  };
}

function moveTipAction(intent: Intent): string {
  if (intent.kind === 'merge') return t('tipJoin');
  if (intent.kind === 'load') return t('tipBoard');
  return intent.kind === 'move' && intent.capture ? t('tipCapture') : t('tipMove');
}

/** [CAMBIO] Panel de lo elegido (dos o mas unidades): retratos en orden y cuantas hay de cada tipo. */
export function selectionPanel(textures: Phaser.Textures.TextureManager, s: GameState, list: Unit[], c: Pos): SelectionVM {
  const countByType = new Map<number, number>();
  for (const unit of list) countByType.set(unit.type, (countByType.get(unit.type) ?? 0) + 1);
  return {
    units: list.map((unit) => ({
      uid: unit.uid,
      icon: unitKey(textures, s, unit),
      name: unitLabel(unit.type),
      life: unit.life,
      current: unit.x === c.x && unit.y === c.y,
    })),
    types: [...countByType].map(([type, count]) => ({ name: unitLabel(type), count })),
  };
}

/** Ingresos del jugador por turno: lo que dan sus edificios menos el mantenimiento de su ejercito. */
export function playerIncome(s: GameState): number {
  const owned = s.buildings.filter((building) => building.owner === 0);
  return owned.reduce((sum, building) => sum + buildingIncome(s, building.type), 0) - upkeepOf(s, 0);
}

/** Panel del laboratorio de animaciones (null en una partida normal). */
export function labPanel(lab: LabOptions | null): UIState['lab'] {
  if (!lab) return null;
  const { UNIT, UNIT_NAMES } = defaultContent().tables;
  return {
    units: UNIT_NAMES.map((_, type) => unitLabel(type)),
    attacker: lab.attacker,
    defender: lab.defender,
    slow: lab.slow,
    canAttack: !!UNIT.canfight[lab.attacker],
  };
}

/** Linea de ayuda de abajo segun la fase. */
export function hintText(o: { busy: boolean; enemyPlaying: boolean; phase: Phase; ordering: boolean; inspecting: boolean }): string {
  // Animando lo propio no se dice nada; en el turno enemigo, como saltarlo.
  if (o.busy) return o.enemyPlaying ? t('skip') : '';
  if (o.phase === 'target') return o.ordering ? t('orderPick') : t('genTarget');
  if (o.phase === 'map') return o.inspecting ? t('hintInspect') : t('hintMap');
  return '';
}
