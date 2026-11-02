import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, UNIT_NAMES, useRules } from '@core/data';
import { mergeTargets, loadTargets, moveRange, newUnit } from '@core/rules';
import type { GameState, Unit } from '@core/types';
import { intentAt, trailTo, type MovePlan } from '../src/scenes/game/intent';
import { computeHighlights, type HighlightInput } from '../src/scenes/game/highlights';
import { hintText } from '../src/scenes/game/hudParts';
import { key } from '../src/scenes/game/types';
import { blankState } from './helpers';

const type = (n: (typeof UNIT_NAMES)[number]) => UNIT_NAMES.indexOf(n);
const seeAll = () => true;

beforeEach(() => useRules(DEFAULT_RULES));

function plan(s: GameState, u: Unit): MovePlan {
  const range = moveRange(s, u);
  return {
    unit: u,
    range,
    merge: new Map(mergeTargets(s, u, range).map((o) => [key(o), o.uid])),
    load: new Map(loadTargets(s, u, range).map((o) => [key(o), o.uid])),
    trail: [{ x: u.x, y: u.y }],
  };
}

describe('escena: que pasa al soltar la unidad elegida (game/intent.ts)', () => {
  it('en su casilla se queda; en una alcanzable se mueve; fuera del alcance, nada', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    const p = plan(s, u);
    expect(intentAt(s, p, { x: 5, y: 5 }, seeAll)).toEqual({ kind: 'stay' });
    expect(intentAt(s, p, { x: 6, y: 5 }, seeAll)).toEqual({ kind: 'move', to: { x: 6, y: 5 }, capture: false });
    expect(intentAt(s, p, { x: 19, y: 19 }, seeAll).kind).toBe('none');
    expect(intentAt(s, null, { x: 6, y: 5 }, seeAll).kind).toBe('none');
  });

  it('un enemigo visible se ataca desde una casilla al lado; uno que no se ve, no', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    newUnit(s, type('Soldier'), 1, 7, 5);
    const p = plan(s, u);
    const it = intentAt(s, p, { x: 7, y: 5 }, seeAll);
    expect(it.kind).toBe('attack');
    expect(intentAt(s, p, { x: 7, y: 5 }, () => false).kind).not.toBe('attack');
  });

  it('el camino sigue el trazado si acaba en el destino, y si no el mas corto', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    const p = {
      ...plan(s, u),
      trail: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
    };
    expect(trailTo(p, { x: 6, y: 6 })).toBe(p.trail);
    expect(trailTo(p, { x: 5, y: 6 })).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);
    const short = trailTo(p, { x: 7, y: 5 });
    expect(short[0]).toEqual({ x: 5, y: 5 });
    expect(short[short.length - 1]).toEqual({ x: 7, y: 5 });
  });
});

describe('escena: casillas marcadas (game/highlights.ts)', () => {
  const base = (s: GameState): HighlightInput => ({
    s,
    phase: 'map',
    cursor: { x: 0, y: 0 },
    range: null,
    merge: new Map(),
    load: new Map(),
    attack: new Map(),
    unload: new Set(),
    orderMenuUids: null,
    orderingUids: null,
    targetArea: () => [],
    group: new Set(),
    inspectUid: null,
    enemyPlaying: false,
    visible: seeAll,
  });

  it('al mover, el alcance; con un grupo, el aro de cada unidad', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    const o = newUnit(s, type('Soldier'), 0, 9, 9);
    const moving = computeHighlights({ ...base(s), phase: 'move', range: moveRange(s, u) });
    expect(moving.tiles.get('6,5')).toBe('move');
    const grouped = computeHighlights({ ...base(s), group: new Set([u.uid, o.uid]) });
    expect([...grouped.tiles]).toEqual([
      ['5,5', 'group'],
      ['9,9', 'group'],
    ]);
  });

  it('si la unidad señalada ya no esta, avisa para dejar de señalarla', () => {
    const s = blankState();
    expect(computeHighlights({ ...base(s), inspectUid: 99 }).inspectGone).toBe(true);
  });
});

describe('escena: linea de ayuda (game/hudParts.ts)', () => {
  it('cambia con la fase y no dice nada mientras anima lo propio', () => {
    const o = { busy: false, enemyPlaying: false, phase: 'map' as const, ordering: false, inspecting: false };
    expect(hintText({ ...o, busy: true })).toBe('');
    expect(hintText(o)).not.toBe(hintText({ ...o, inspecting: true }));
    expect(hintText({ ...o, phase: 'move' })).toBe('');
  });
});
