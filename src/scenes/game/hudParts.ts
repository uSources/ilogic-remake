/**
 * Piezas del HUD que dependen de lo que hay elegido en la escena: prevision de combate, bocadillo al
 * mover, panel de lo elegido y la linea de ayuda. Sin efectos: la escena junta el resultado y lo
 * publica con ui.set (las fichas en si se calculan en ui/hudModels.ts).
 */
import type Phaser from 'phaser';
import { Movement } from '../../core/data';
import { defenseStars, pathCost, unitById, type MoveRange } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/types';
import type { Anchor, ForecastVM, MoveTipVM, SelectionVM } from '../../hud/store';
import { t, unitLabel } from '../../settings';
import { forecastVM } from '../../ui/hudModels';
import { unitKey } from '../../ui/sprites';
import { key, type Intent, type Phase } from './types';

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
  const sel = o.sel;
  if (!sel) return null;
  let target: Unit | undefined;
  let atk: Unit = sel;
  if (o.phase === 'move') {
    // Al mover: si el cursor esta sobre un enemigo atacable, prevision desde la casilla desde la que se atacaria.
    const it = o.intentAt(o.c);
    if (it.kind !== 'attack') return null;
    target = it.target;
    atk = { ...sel, x: it.from.x, y: it.from.y };
  } else {
    const uid = o.attackSet.get(key(o.c));
    target = uid !== undefined ? unitById(s, uid) : undefined;
  }
  if (!target) return null;
  return forecastVM(textures, s, sel, atk, target, o.anchor(target));
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
    danger: boolean[][] | null;
    anchor: (p: Pos) => Anchor;
  },
): MoveTipVM | null {
  const u = o.sel,
    r = o.range,
    c = o.c;
  if (!u || !r) return null;
  const it = o.intentAt(c);
  if (it.kind === 'attack' || it.kind === 'stay') return null; // de eso se encarga la prevision de combate
  const anchor = o.anchor(c);
  if (it.kind === 'none') return { anchor, action: t('tipNone'), invalid: true };
  const dest = it.kind === 'move' ? it.to : null;
  const used = dest ? pathCost(s, Movement.of(u.type), o.trailTo(dest)) : r.steps[c.x]![c.y]! || 1;
  const stars = defenseStars(s, c);
  const action = it.kind === 'merge' ? t('tipJoin') : it.kind === 'load' ? t('tipBoard') : it.capture ? t('tipCapture') : t('tipMove');
  return {
    anchor,
    action,
    used,
    max: r.maxSteps,
    stars: it.kind === 'move' ? stars : undefined,
    danger: it.kind === 'move' && !!o.danger?.[c.x]?.[c.y],
  };
}

/** [CAMBIO] Panel de lo elegido (dos o mas unidades): retratos en orden y cuantas hay de cada tipo. */
export function selectionPanel(textures: Phaser.Textures.TextureManager, s: GameState, list: Unit[], c: Pos): SelectionVM {
  const types = new Map<number, number>();
  for (const u of list) types.set(u.type, (types.get(u.type) ?? 0) + 1);
  return {
    units: list.map((u) => ({
      uid: u.uid,
      icon: unitKey(textures, s, u),
      name: unitLabel(u.type),
      life: u.life,
      current: u.x === c.x && u.y === c.y,
    })),
    types: [...types].map(([type, count]) => ({ name: unitLabel(type), count })),
  };
}

/** Linea de ayuda de abajo segun la fase. */
export function hintText(o: { busy: boolean; enemyPlaying: boolean; phase: Phase; ordering: boolean; inspecting: boolean }): string {
  return o.busy
    ? o.enemyPlaying
      ? t('skip')
      : ''
    : o.phase === 'target'
      ? o.ordering
        ? t('orderPick')
        : t('genTarget')
      : o.phase === 'map'
        ? o.inspecting
          ? t('hintInspect')
          : t('hintMap')
        : '';
}
