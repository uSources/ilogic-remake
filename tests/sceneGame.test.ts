import { describe, expect, it } from 'vitest';
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
import { INPUT_ACTIONS } from '../src/controls/actions';
import { MISSIONS } from '@core/missions';
import { blankState, unitTypeNamed, hqId, withoutHeadquarters } from './helpers';
import { viewerOf } from '../src/scenes/game/matchSetup';
import { isPlayableOnOneScreen } from '@core/teams';
import { checkPlayedByAi } from '../src/scenes/game/turns';
import { dispatch } from '@core/actions';

const HQ = hqId();

const type = unitTypeNamed;
const seeAll = () => true;

function plan(s: GameState, unit: Unit): MovePlan {
  const range = moveRange(s, unit);
  return {
    unit: unit,
    range,
    merge: new Map(mergeTargets(s, unit, range).map((unit) => [posKey(unit), unit.uid])),
    load: new Map(loadTargets(s, unit, range).map((unit) => [posKey(unit), unit.uid])),
    trail: [posOf(unit)],
  };
}

describe('escena: que pasa al soltar la unidad elegida (game/intent.ts)', () => {
  it('en su casilla se queda; en una alcanzable se mueve; fuera del alcance, nada', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const movePlan = plan(s, unit);
    expect(intentAt(s, movePlan, { x: 5, y: 5 }, seeAll)).toEqual({ kind: 'stay' });
    expect(intentAt(s, movePlan, { x: 6, y: 5 }, seeAll)).toEqual({ kind: 'move', to: { x: 6, y: 5 }, capture: false });
    expect(intentAt(s, movePlan, { x: 19, y: 19 }, seeAll).kind).toBe('none');
    expect(intentAt(s, null, { x: 6, y: 5 }, seeAll).kind).toBe('none');
  });

  it('un enemigo visible se ataca desde una casilla al lado; uno que no se ve, no', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    newUnit(s, type('Soldier'), 1, { x: 7, y: 5 });
    const movePlan = plan(s, unit);
    const it = intentAt(s, movePlan, { x: 7, y: 5 }, seeAll);
    expect(it.kind).toBe('attack');
    expect(intentAt(s, movePlan, { x: 7, y: 5 }, () => false).kind).not.toBe('attack');
  });

  it('con aliados: a un aliado no se le ataca y lo suyo no se captura; lo enemigo y lo neutral, si', () => {
    const s = blankState({}, [
      { controller: 'human', alliance: 0 },
      { controller: 'ai', alliance: 1 },
      { controller: 'ai', alliance: 0 },
    ]);
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    newUnit(s, type('Soldier'), 2, { x: 7, y: 5 });
    s.buildings.push(
      { type: 'City', owner: 2, x: 5, y: 6, capture: null },
      { type: 'City', owner: 1, x: 4, y: 5, capture: null },
      { type: 'City', owner: null, x: 5, y: 4, capture: null },
    );
    const movePlan = plan(s, unit);
    expect(intentAt(s, movePlan, { x: 7, y: 5 }, seeAll).kind).not.toBe('attack');
    expect(intentAt(s, movePlan, { x: 5, y: 6 }, seeAll)).toEqual({ kind: 'move', to: { x: 5, y: 6 }, capture: false });
    expect(intentAt(s, movePlan, { x: 4, y: 5 }, seeAll)).toEqual({ kind: 'move', to: { x: 4, y: 5 }, capture: true });
    expect(intentAt(s, movePlan, { x: 5, y: 4 }, seeAll)).toEqual({ kind: 'move', to: { x: 5, y: 4 }, capture: true });
  });

  it('el camino sigue el trazado si acaba en el destino, y si no el mas corto', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const shown = {
      ...plan(s, unit),
      trail: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
    };
    expect(trailTo(shown, { x: 6, y: 6 })).toBe(shown.trail);
    expect(trailTo(shown, { x: 5, y: 6 })).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);
    const short = trailTo(shown, { x: 7, y: 5 });
    expect(short[0]).toEqual({ x: 5, y: 5 });
    expect(short[short.length - 1]).toEqual({ x: 7, y: 5 });
  });
});

describe('escena: casillas marcadas (game/highlights.ts)', () => {
  const base = (s: GameState): HighlightInput => ({
    s,
    viewer: 0,
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
    othersPlaying: false,
    visible: seeAll,
  });

  it('al mover, el alcance; con un grupo, el aro de cada unidad', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const other = newUnit(s, type('Soldier'), 0, { x: 9, y: 9 });
    const moving = computeHighlights({ ...base(s), phase: 'move', range: moveRange(s, unit) });
    expect(moving.tiles.get('6,5')).toBe('move');
    const grouped = computeHighlights({ ...base(s), group: new Set([unit.uid, other.uid]) });
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
    const options = { busy: false, othersPlaying: false, phase: 'map' as const, ordering: false, inspecting: false };
    expect(hintText({ ...options, busy: true })).toBe('');
    expect(hintText(options)).not.toBe(hintText({ ...options, inspecting: true }));
    expect(hintText({ ...options, phase: 'move' })).toBe('');
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
    const s = withoutHeadquarters(blankState());
    s.buildings.push({ type: HQ, owner: 0, x: 3, y: 4 });
    expect(endFocus(s, 0, true, 'hq', { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
    expect(endFocus(s, 0, false, 'surrender', null)).toMatchObject({ x: 3, y: 4 });
  });
});

describe('escena: puente a los modulos (game/host.ts)', () => {
  it('los campos se leen y escriben cada vez en el sitio de origen', () => {
    const origin = { phase: 'map', n: 1 };
    const holder = live<{ phase: string; readonly n: number; bump(): void }>({
      phase: { get: () => origin.phase, set: (value) => (origin.phase = value) },
      n: { get: () => origin.n },
      bump: () => {
        origin.n++;
      },
    });
    holder.bump();
    expect(holder.n).toBe(2);
    holder.phase = 'busy';
    expect(origin.phase).toBe('busy');
  });
});

describe('escena: a quien va una orden (game/orders.ts)', () => {
  /** Ordenes con una escena de mentira: solo la partida, la fase, la unidad elegida y el grupo. */
  function setup(s: GameState) {
    const state = { phase: 'map' as Phase, selected: null as Unit | null };
    const nop = () => {};
    const selection = new GroupSelection({ state: s, viewer: 0, phase: 'map', selected: null } as unknown as SelectionHost);
    const orders = new Orders(
      live<OrderHost>({
        scene: { get: () => null as never },
        view: { get: () => null as never },
        state: { get: () => s },
        viewer: { get: () => 0 },
        phase: { get: () => state.phase, set: (kind) => (state.phase = kind) },
        menuSel: { get: () => 0 },
        match: { get: () => 1 },
        selected: { get: () => state.selected },
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
        act: (action) => {
          const result = dispatch(s, 0, action);
          return result.ok ? result.events : null;
        },
        perform: async () => false,
        record: nop,
        play: async () => {},
      }),
    );
    return { st: state, selection, orders };
  }

  it('moviendo, a la unidad elegida; en el mapa, al grupo; sin nada, a nadie', () => {
    const s = blankState();
    const soldier = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const otherSoldier = newUnit(s, type('Soldier'), 0, { x: 6, y: 5 });
    const { st: state, selection, orders } = setup(s);
    expect(orders.subjects()).toBeNull();
    selection.group = new Set([soldier.uid, otherSoldier.uid]);
    expect(orders.subjects()?.units.map((unit) => unit.uid)).toEqual([soldier.uid, otherSoldier.uid]);
    state.phase = 'move';
    state.selected = soldier;
    expect(orders.subjects()).toEqual({ units: [soldier], from: 'move' });
  });

  it('el contexto de las acciones dice si en la casilla hay un enemigo que se ve', () => {
    const s = blankState();
    const soldier = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    newUnit(s, type('Soldier'), 1, { x: 8, y: 5 });
    const { selection, orders } = setup(s);
    selection.group = new Set([soldier.uid]);
    expect(orders.ctx({ x: 8, y: 5 })?.enemyHere).toBe(true);
    expect(orders.ctx({ x: 9, y: 5 })?.enemyHere).toBe(false);
  });

  it('cada accion se cumple con su entrada del registro: formar escuadra con el grupo', async () => {
    const s = blankState();
    const soldier = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const otherSoldier = newUnit(s, type('Soldier'), 0, { x: 6, y: 5 });
    const { selection, orders } = setup(s);
    selection.group = new Set([soldier.uid, otherSoldier.uid]);
    await orders.run('squadForm', null);
    expect(soldier.squad).toBeDefined();
    expect(otherSoldier.squad).toBe(soldier.squad);
  });
});

describe('escena: tabla de fases (game/phases)', () => {
  it('hay una entrada por fase, y las que tienen menu de bocadillo son las de MENU_PHASES', () => {
    const phases = Object.keys(PHASES) as Phase[];
    expect(phases.filter(hasMenu)).toEqual(MENU_PHASES);
  });

  it('cada accion del registro (controls/actions.ts) tiene quien la cumpla', () => {
    expect(INPUT_ACTIONS.every((action) => ACTION_RUNNERS[action.id])).toBe(true);
  });
});

describe('escena: una sola persona por pantalla (hasta la fase 4)', () => {
  const twoPeople = () => blankState({}, [{ controller: 'human' }, { controller: 'human' }]);

  it('una partida con dos equipos de personas no se juega aqui; con una o ninguna, si', () => {
    expect(isPlayableOnOneScreen(twoPeople())).toBe(false);
    expect(() => viewerOf(twoPeople())).toThrow(/solo juega una/);
    expect(isPlayableOnOneScreen(blankState())).toBe(true);
    const aiOnly = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }]);
    expect(isPlayableOnOneScreen(aiOnly)).toBe(true);
    expect(viewerOf(aiOnly)).toBe(0);
    expect(viewerOf(blankState({}, [{ controller: 'ai' }, { controller: 'human' }]))).toBe(1);
  });

  it('el turno de otro equipo solo lo juega la IA: si es de una persona, falla', () => {
    expect(() => checkPlayedByAi(blankState(), 1)).not.toThrow();
    expect(() => checkPlayedByAi(twoPeople(), 1)).toThrow(/solo juega una persona/);
  });
});
