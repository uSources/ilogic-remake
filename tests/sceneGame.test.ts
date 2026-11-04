import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { mergeTargets, loadTargets, moveRange, newUnit } from '@core/rules';
import type { GameState, Unit } from '@core/model';
import { intentAt, trailTo, type MovePlan } from '../src/scenes/game/intent';
import { computeHighlights, type HighlightInput } from '../src/scenes/game/highlights';
import { hintText } from '../src/scenes/game/hudParts';
import { posKey, posOf } from '@core/geom';
import { endButtonsFor, endFocus } from '../src/scenes/game/endOfMatch';
import { live } from '../src/scenes/game/host';
import { Orders, type OrderHost } from '../src/scenes/game/orders';
import { GroupSelection, type SelectionHost } from '../src/scenes/game/groupSelection';
import { MENU_PHASES, type Phase } from '../src/scenes/game/types';
import { PHASES } from '../src/scenes/game/phases';
import { hasMenu } from '../src/scenes/game/menuModel';
import { ACTION_RUNNERS } from '../src/scenes/game/actionRunners';
import { ACTIONS } from '../src/controls/actions';
import { MISSIONS } from '@core/missions';
import { blankState } from './helpers';

const { UNIT_NAMES, HQ } = defaultContent().tables;

const type = (n: (typeof UNIT_NAMES)[number]) => UNIT_NAMES.indexOf(n);
const seeAll = () => true;

function plan(s: GameState, u: Unit): MovePlan {
  const range = moveRange(s, u);
  return {
    unit: u,
    range,
    merge: new Map(mergeTargets(s, u, range).map((o) => [posKey(o), o.uid])),
    load: new Map(loadTargets(s, u, range).map((o) => [posKey(o), o.uid])),
    trail: [posOf(u)],
  };
}

describe('escena: que pasa al soltar la unidad elegida (game/intent.ts)', () => {
  it('en su casilla se queda; en una alcanzable se mueve; fuera del alcance, nada', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const p = plan(s, u);
    expect(intentAt(s, p, { x: 5, y: 5 }, seeAll)).toEqual({ kind: 'stay' });
    expect(intentAt(s, p, { x: 6, y: 5 }, seeAll)).toEqual({ kind: 'move', to: { x: 6, y: 5 }, capture: false });
    expect(intentAt(s, p, { x: 19, y: 19 }, seeAll).kind).toBe('none');
    expect(intentAt(s, null, { x: 6, y: 5 }, seeAll).kind).toBe('none');
  });

  it('un enemigo visible se ataca desde una casilla al lado; uno que no se ve, no', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    newUnit(s, type('Soldier'), 1, { x: 7, y: 5 });
    const p = plan(s, u);
    const it = intentAt(s, p, { x: 7, y: 5 }, seeAll);
    expect(it.kind).toBe('attack');
    expect(intentAt(s, p, { x: 7, y: 5 }, () => false).kind).not.toBe('attack');
  });

  it('el camino sigue el trazado si acaba en el destino, y si no el mas corto', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
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
    const u = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const o = newUnit(s, type('Soldier'), 0, { x: 9, y: 9 });
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

describe('escena: final de la partida (game/endOfMatch.ts)', () => {
  it('botones: en una mision ganada, la siguiente si la hay; si no es mision, revancha', () => {
    expect(endButtonsFor(MISSIONS[0], true)).toEqual(['next', 'retry', 'menu']);
    expect(endButtonsFor(MISSIONS[MISSIONS.length - 1], true)).toEqual(['retry', 'menu']);
    expect(endButtonsFor(MISSIONS[0], false)).toEqual(['retry', 'menu']);
    expect(endButtonsFor(undefined, true)).toEqual(['rematch', 'new', 'menu']);
  });

  it('la camara va a la ultima jugada o, al perder sin ella, a la Base propia', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 0, x: 3, y: 4 });
    expect(endFocus(s, true, 'hq', { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
    expect(endFocus(s, false, 'surrender', null)).toMatchObject({ x: 3, y: 4 });
  });
});

describe('escena: puente a los modulos (game/host.ts)', () => {
  it('los campos se leen y escriben cada vez en el sitio de origen', () => {
    const origin = { phase: 'map', n: 1 };
    const h = live<{ phase: string; readonly n: number; bump(): void }>({
      phase: { get: () => origin.phase, set: (v) => (origin.phase = v) },
      n: { get: () => origin.n },
      bump: () => {
        origin.n++;
      },
    });
    h.bump();
    expect(h.n).toBe(2);
    h.phase = 'busy';
    expect(origin.phase).toBe('busy');
  });
});

describe('escena: a quien va una orden (game/orders.ts)', () => {
  /** Ordenes con una escena de mentira: solo la partida, la fase, la unidad elegida y el grupo. */
  function setup(s: GameState) {
    const st = { phase: 'map' as Phase, sel: null as Unit | null };
    const nop = () => {};
    const selection = new GroupSelection({ state: s, phase: 'map', sel: null } as unknown as SelectionHost);
    const orders = new Orders(
      live<OrderHost>({
        scene: { get: () => null as never },
        view: { get: () => null as never },
        state: { get: () => s },
        phase: { get: () => st.phase, set: (v) => (st.phase = v) },
        menuSel: { get: () => 0 },
        match: { get: () => 1 },
        sel: { get: () => st.sel },
        undo: { get: () => null },
        selection: { get: () => selection },
        menuPick: () => undefined,
        stopInspect: nop,
        visible: seeAll,
        intentAt: () => ({ kind: 'none' }),
        toMap: nop,
        back: nop,
        refresh: nop,
        selectUnit: nop,
        moveCursorTo: nop,
        commit: async () => {},
        groupMove: async () => {},
        giveTravel: async () => {},
        clearUndo: nop,
        afterAction: nop,
        checkEnd: () => false,
        play: async () => {},
      }),
    );
    return { st, selection, orders };
  }

  it('moviendo, a la unidad elegida; en el mapa, al grupo; sin nada, a nadie', () => {
    const s = blankState();
    const a = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const b = newUnit(s, type('Soldier'), 0, { x: 6, y: 5 });
    const { st, selection, orders } = setup(s);
    expect(orders.subjects()).toBeNull();
    selection.group = new Set([a.uid, b.uid]);
    expect(orders.subjects()?.units.map((u) => u.uid)).toEqual([a.uid, b.uid]);
    st.phase = 'move';
    st.sel = a;
    expect(orders.subjects()).toEqual({ units: [a], from: 'move' });
  });

  it('el contexto de las acciones dice si en la casilla hay un enemigo que se ve', () => {
    const s = blankState();
    const a = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    newUnit(s, type('Soldier'), 1, { x: 8, y: 5 });
    const { selection, orders } = setup(s);
    selection.group = new Set([a.uid]);
    expect(orders.ctx({ x: 8, y: 5 })?.enemyHere).toBe(true);
    expect(orders.ctx({ x: 9, y: 5 })?.enemyHere).toBe(false);
  });

  it('cada accion se cumple con su entrada del registro: formar escuadra con el grupo', async () => {
    const s = blankState();
    const a = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const b = newUnit(s, type('Soldier'), 0, { x: 6, y: 5 });
    const { selection, orders } = setup(s);
    selection.group = new Set([a.uid, b.uid]);
    await orders.run('squadForm', null);
    expect(a.squad).toBeDefined();
    expect(b.squad).toBe(a.squad);
  });
});

describe('escena: tabla de fases (game/phases)', () => {
  it('hay una entrada por fase, y las que tienen menu de bocadillo son las de MENU_PHASES', () => {
    const phases = Object.keys(PHASES) as Phase[];
    expect(phases.filter(hasMenu)).toEqual(MENU_PHASES);
  });

  it('cada accion del registro (controls/actions.ts) tiene quien la cumpla', () => {
    expect(ACTIONS.every((action) => ACTION_RUNNERS[action.id])).toBe(true);
  });
});
