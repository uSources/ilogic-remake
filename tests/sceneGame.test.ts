import { withBack } from '../src/scenes/game/phases/unitMenu';
import { backWarning } from '../src/scenes/game/unitMoves';
import { describe, expect, it } from 'vitest';
import { mergeTargets, loadTargets, moveRange, newUnit, outcomeFor, restoreInvariants } from '@core/rules';
import type { GameState, MatchResult, Unit } from '@core/model';
import { intentAt, trailTo, type MovePlan } from '../src/scenes/game/intent';
import { computeHighlights, type HighlightInput } from '../src/scenes/game/highlights';
import { hintText } from '../src/scenes/game/hudParts';
import { posKey, posOf } from '@core/geom';
import { endButtonsFor, endFocus, endViewer, reasonText, screenEndFor } from '../src/scenes/game/endOfMatch';
import { fallsNoticeFor } from '../src/scenes/game/turns';
import { canUseMenuButton } from '../src/hud/game/turn';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { duel } from '@core/teams';
import { defaultLab, labMatch } from '../src/lab';
import { initialState } from '../src/hud/state';
import { live } from '../src/scenes/game/host';
import { Orders, type OrderHost } from '../src/scenes/game/orders';
import { GroupSelection, type SelectionHost } from '../src/scenes/game/groupSelection';
import { CONFIRM_MS, MENU_PHASES, type Phase } from '../src/scenes/game/types';
import { GameMenuChoices, gameMenuOf, PHASES, quitWhileWatching, watchesOthers, type GameMenuHost } from '../src/scenes/game/phases';
import { hasMenu } from '../src/scenes/game/menuModel';
import { ACTION_RUNNERS } from '../src/scenes/game/actionRunners';
import { INPUT_ACTIONS } from '../src/controls/actions';
import { MISSIONS } from '@core/missions';
import { act, blankState, giveTurn, unitTypeNamed, hqId, withoutHeadquarters } from './helpers';
import { PLAIN_SETTINGS } from './plainSettings';
import { labControllers, viewerOf } from '../src/scenes/game/matchSetup';
import { screenControllers } from '@core/controllers';
import {
  GameSession,
  humanController,
  isPerson,
  passiveController,
  personStillPlays,
  remoteController,
  screenEnd,
  sequence,
} from '@core/session';
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
    expect(trailTo(shown, { x: 6, y: 6 })).toEqual(shown.trail);
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
    expect(endButtonsFor(MISSIONS[0], 'won')).toEqual(['next', 'retry', 'menu']);
    expect(endButtonsFor(MISSIONS[MISSIONS.length - 1], 'won')).toEqual(['retry', 'menu']);
    expect(endButtonsFor(MISSIONS[0], 'lost')).toEqual(['retry', 'menu']);
    expect(endButtonsFor(MISSIONS[0], 'draw')).toEqual(['retry', 'menu']);
    expect(endButtonsFor(undefined, 'won')).toEqual(['rematch', 'new', 'menu']);
  });

  it('con varias personas en esta pantalla, el final se ve desde una que gana', () => {
    const result: MatchResult = { status: 'decided', winners: [1], reason: 'hq' };
    expect(endViewer(result, 0, [0, 1])).toBe(1);
    expect(endViewer(result, 0, [0])).toBe(0);
    expect(endViewer(result, 1, [0, 1])).toBe(1);
  });

  it('para quien mira: su alianza gana, pierde o nadie gana', () => {
    expect(outcomeFor({ status: 'decided', winners: [0, 2], reason: 'hq' }, 2)).toBe('won');
    expect(outcomeFor({ status: 'decided', winners: [0, 2], reason: 'hq' }, 1)).toBe('lost');
    expect(outcomeFor({ status: 'draw', winners: [], reason: 'days' }, 0)).toBe('draw');
  });

  it('la camara va a la ultima jugada o, al perder sin ella, a la Base propia', () => {
    const s = withoutHeadquarters(blankState());
    s.buildings.push({ type: HQ, owner: 0, x: 3, y: 4 });
    expect(endFocus(s, 0, 'won', 'hq', { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
    expect(endFocus(s, 0, 'lost', 'surrender', null)).toMatchObject({ x: 3, y: 4 });
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
        afterAction: nop,
        checkEnd: () => false,
        act: (action) => {
          const result = dispatch(s, 0, action);
          return result.ok ? result.events : null;
        },
        perform: async () => false,
        dispatcher: dispatch,
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

describe('escena: rendirse sin personas en juego y salir mientras juegan los demas', () => {
  /** Una sesion con estas personas (las demas, quietas): como la de la escena. */
  const withPeople = (s: GameState, people: readonly number[]) =>
    new GameSession(
      s,
      s.teams.map((team) => (people.includes(team.id) ? humanController() : passiveController())),
    );

  it('sin personas en juego la partida se acaba para la pantalla (screenEnd): perdida, por rendirse o por caer', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const session = withPeople(s, [0]);
    expect([personStillPlays(session), screenEnd(session, 0)]).toEqual([true, null]);
    act(s, 0, { kind: 'surrender' });
    expect(personStillPlays(session)).toBe(false);
    const out = screenEnd(session, 0)!;
    expect(out).toEqual({ kind: 'out', fall: { order: 1, reason: 'surrender' } });
    expect(screenEndFor(s, out, 0)).toEqual({ outcome: 'lost', reason: 'surrender', fallenBy: 'own' });
    // Sin rendirse: cae y quedan dos IA. Sin nada (ni Base) es 'wipeout'; el motivo es el apuntado al caer.
    const fallen = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    fallen.buildings = fallen.buildings.filter((building) => building.owner !== 0);
    restoreInvariants(fallen, null);
    newUnit(fallen, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
    expect(screenEndFor(fallen, screenEnd(withPeople(fallen, [0]), 0)!, 0)).toEqual({
      outcome: 'lost',
      reason: 'wipeout',
      fallenBy: 'own',
    });
    // Con dos personas, si cae una la otra sigue jugando.
    const hotSeat = blankState({}, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]);
    act(hotSeat, 0, { kind: 'surrender' });
    expect(screenEnd(withPeople(hotSeat, [0, 1]), 1)).toBeNull();
  });

  it('el final de una partida decidida segun quien mira: 2 contra 2, se rinden los dos de una alianza', () => {
    const pairs = blankState({}, [
      { controller: 'human', alliance: 0 },
      { controller: 'ai', alliance: 1 },
      { controller: 'ai', alliance: 0 },
      { controller: 'ai', alliance: 1 },
    ]);
    act(pairs, 0, { kind: 'surrender' });
    act(pairs, 2, { kind: 'surrender' });
    const end = screenEnd(withPeople(pairs, [0]), 0)!;
    expect(end).toEqual({ kind: 'decided', result: { status: 'decided', winners: [1, 3], reason: 'surrender' } });
    expect(screenEndFor(pairs, end, 0)).toEqual({ outcome: 'lost', reason: 'surrender', fallenBy: 'ally' });
    expect(screenEndFor(pairs, end, 2)).toEqual({ outcome: 'lost', reason: 'surrender', fallenBy: 'own' });
    expect(screenEndFor(pairs, end, 1)).toEqual({ outcome: 'won', reason: 'surrender', fallenBy: 'enemy' });
  });

  it('el motivo del final, para quien mira: «te has rendido» solo para quien se rindio', () => {
    expect(reasonText({ outcome: 'lost', reason: 'surrender', fallenBy: 'own' })).toBe('endSurrender');
    expect(reasonText({ outcome: 'lost', reason: 'surrender', fallenBy: 'ally' })).toBe('endAllySurrender');
    expect(reasonText({ outcome: 'won', reason: 'surrender', fallenBy: 'enemy' })).toBe('endEnemySurrender');
    expect(reasonText({ outcome: 'won', reason: 'hq', fallenBy: 'enemy' })).toBe('endHq');
    expect(reasonText({ outcome: 'won', reason: 'days' })).toBe('endDays');
  });

  it('con varias personas, la que vuelve a mirar se entera de las caidas que no vio (una, varias, ya vistas no)', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    expect(fallsNoticeFor(s, 1, 0)).toBeNull();
    act(s, 0, { kind: 'surrender' });
    expect(fallsNoticeFor(s, 1, 0)).toEqual({ key: 'teamOut', numbers: '1' });
    // La propia no se cuenta, y lo ya visto tampoco.
    expect(fallsNoticeFor(s, 0, 0)).toBeNull();
    expect(fallsNoticeFor(s, 1, 1)).toBeNull();
    s.turn = 2;
    act(s, 2, { kind: 'surrender' });
    expect(fallsNoticeFor(s, 1, 0)).toEqual({ key: 'teamsOut', numbers: '1, 3' });
    expect(fallsNoticeFor(s, 1, 1)).toEqual({ key: 'teamOut', numbers: '3' });
  });

  it('el menu de pausa: en el laboratorio (no se acaba ni se guarda) ni guardar ni rendirse', () => {
    const skirmish = createMatch(skirmishConfig({ seed: 3, size: 16, teams: duel('human', 'ai') }));
    expect(gameMenuOf(skirmish)).toEqual(['resume', 'endTurn', 'save', 'replay', 'options', 'help', 'surrender', 'quit']);
    const lab = createMatch(labMatch(defaultLab(), null));
    expect(gameMenuOf(lab)).toEqual(['resume', 'endTurn', 'replay', 'options', 'help', 'quit']);
    // Y el nucleo tampoco lo deja.
    expect(dispatch(lab, 0, { kind: 'surrender' })).toEqual({ ok: false, reason: 'cannotLose' });
  });

  it('salir mientras juegan los demas: solo mirando, y con dos pulsaciones a tiempo', () => {
    const watching = { ended: false, phase: 'busy' as const, othersPlaying: true };
    expect(watchesOthers(watching)).toBe(true);
    expect(watchesOthers({ ...watching, othersPlaying: false })).toBe(false);
    expect(watchesOthers({ ...watching, phase: 'map' })).toBe(false);
    expect(watchesOthers({ ...watching, ended: true })).toBe(false);
    let now = 1000;
    let quits = 0;
    const host = {
      get now() {
        return now;
      },
      quitToMenu: () => quits++,
    } as unknown as GameMenuHost;
    const choices = new GameMenuChoices(host);
    quitWhileWatching({ ...watching, phase: 'map' }, choices);
    quitWhileWatching(watching, choices);
    expect(quits).toBe(0);
    now += CONFIRM_MS - 1;
    quitWhileWatching(watching, choices);
    expect(quits).toBe(1);
    now += CONFIRM_MS * 3;
    quitWhileWatching(watching, choices);
    expect(quits).toBe(1);
  });

  it('el boton del menu: en tu turno, el menu; mientras juegan los demas, salir; al acabar, nada', () => {
    expect(canUseMenuButton({ ...initialState, turn: 'own', busy: false })).toBe(true);
    expect(canUseMenuButton({ ...initialState, turn: 'own', busy: true })).toBe(false);
    // Mientras juegan los demas, lo que dice la escena (watching); al acabar (animacion del final), no.
    expect(canUseMenuButton({ ...initialState, turn: 'enemy', busy: true, watching: true })).toBe(true);
    expect(canUseMenuButton({ ...initialState, turn: 'enemy', busy: true, watching: false })).toBe(false);
  });
});

describe('escena: quien mira al abrir la partida (game/matchSetup.ts)', () => {
  /** La sesion de la escena para esa partida (sus controladores: screenControllers y, en el laboratorio, labControllers). */
  const sceneSession = (s: GameState, isLab = false) => new GameSession(s, screenControllers(s, labControllers(s, isLab)));

  it('la persona a la que le toca; si le toca a la IA, la primera persona; sin personas, el primer equipo', () => {
    const twoPeople = blankState({}, [{ controller: 'human' }, { controller: 'human' }]);
    expect(viewerOf(sceneSession(twoPeople))).toBe(0);
    expect(viewerOf(sceneSession(giveTurn(twoPeople, 1)))).toBe(1);
    expect(viewerOf(sceneSession(blankState({}, [{ controller: 'ai' }, { controller: 'ai' }])))).toBe(0);
    expect(viewerOf(sceneSession(blankState({}, [{ controller: 'ai' }, { controller: 'human' }])))).toBe(1);
  });

  it('quien es una persona lo dice su controlador, tambien dentro de una serie', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }]);
    const session = new GameSession(s, [sequence(passiveController(), humanController()), remoteController()]);
    expect([isPerson(session, 0), isPerson(session, 1)]).toEqual([true, false]);
    giveTurn(s, 1);
    expect(viewerOf(session)).toBe(0);
    const lab = sceneSession(blankState({}, [{ controller: 'human' }, { controller: 'ai' }]), true);
    expect(lab.controllerOf(1).name).toBe('passive');
  });
});

describe('escena: menu de la unidad (game/phases/unitMenu.ts)', () => {
  it('las opciones son las del nucleo, en su orden, con «Atras» antes de retirar', () => {
    expect(withBack(['attack', 'wait', 'delete'])).toEqual(['attack', 'wait', 'back', 'delete']);
    expect(withBack(['wait'])).toEqual(['wait', 'back']);
  });
});

describe('escena: «Atras» (game/unitMoves.ts)', () => {
  it('avisa en vez de deshacer si el movimiento ha descubierto enemigos', () => {
    const s = blankState({ ...PLAIN_SETTINGS, fog: true });
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
    newUnit(s, unitTypeNamed('Soldier'), 1, { x: 2, y: 4 + unitTypeNamed('Soldier').vision });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 2, y: 3 } });
    expect(backWarning(s, 0, soldier)).toBeNull();
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 2, y: 4 } });
    expect(backWarning(s, 0, soldier)).toBe('undoRevealed');
  });
});
