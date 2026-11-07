/**
 * Lo que un modo puede fijar y ningun modo del juego usa aun: pasos de turno propios y otro orden de
 * turnos. GAME_MODES esta congelado y nada es global: el modo de prueba se registra como uno de
 * verdad (su nombre en GameModeIds, `declare module`) y se le da a quien crea la partida en un
 * registro propio (`GameModeRegistry`: `newGameState({ modes })`, `buildMatch(config, { modes })`).
 */
import { describe, expect, it } from 'vitest';
import { GAME_MODES, gameModeOf, type GameMode, type GameModeRegistry } from '@core/modes';
import { defaultContent } from '@core/content/default';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import { settingsWith } from '@core/matchSettings';
import { buildMatch, skirmishConfig } from '@core/match';
import { deserialize, readSave, serialize } from '@core/save';
import type { MatchSettings } from '@core/model';
import type { TeamSetup } from '@core/teams';
import { engagement, hitChance, hooksOf, isRuleOn, unitById, type RuleModule } from '@core/rules';
import { newUnit } from '@core/measure';
import { traverse } from '@core/rules/traverse';
import { GameSession, passiveController, runMatch } from '@core/session';
import { startsTurn } from '@core/actions';
import { act, BLANK_SEEDS, blankState, giveTurn, unitTypeNamed } from './helpers';
import { PLAIN_SETTINGS } from './plainSettings';

// Los modulos y el corte de camino del modo de prueba tienen sus propios nombres, como los de un modo de verdad.
// Ojo: `tsc` comprueba src/ y tests/ juntos, asi que estos nombres tambien existen para el codigo
// del juego mientras se comprueba. Por eso (y porque un modo puede traer los suyos) ninguna tabla de
// src/ indexada por RuleModuleId o InterruptionKind es exhaustiva: son Partial y tienen algo por
// defecto (INTERRUPTION_ANIMATIONS, INTERRUPTION_NAMES); la lista de ids que si es completa es la de
// RULE_MODULES, que se recorre, no se indexa.
declare module '@core/ruleModules/hooks' {
  interface RuleModuleIds {
    testBonus: true;
    testMines: true;
  }
}
declare module '@core/model/events' {
  interface InterruptionKinds {
    testMine: true;
  }
}
declare module '@core/model/match' {
  interface GameModeIds {
    testMode: true;
  }
}

/** Los modos del juego y el de prueba, que es una escaramuza con `changes`. */
const modesWith = (changes: Partial<GameMode>): GameModeRegistry => ({
  ...GAME_MODES,
  testMode: { ...GAME_MODES.skirmish, ...changes, id: 'testMode' },
});

/** Una partida vacia del modo de prueba (como blankState, ya en el turno del primer equipo). */
function testModeState(changes: Partial<GameMode>, settingChanges: Partial<MatchSettings> = {}, teams?: readonly TeamSetup[]) {
  const s = newGameState({
    map: blankMap(24, defaultContent().plainTerrain.id),
    settings: settingsWith(defaultContent(), { ...PLAIN_SETTINGS, ...settingChanges }),
    content: defaultContent(),
    mode: 'testMode',
    modes: modesWith(changes),
    teams: teams ?? [{ controller: 'human' }, { controller: 'ai' }],
    seeds: BLANK_SEEDS,
  });
  s.teams.forEach((team, index) => s.buildings.push({ type: defaultContent().hq.id, owner: team.id, x: 23 - index, y: 23, capture: null }));
  return giveTurn(s, s.turn);
}

describe('modos de juego: lo que fija un modo (core/modes.ts)', () => {
  it('GAME_MODES no se puede cambiar en marcha', () => {
    expect(Object.isFrozen(GAME_MODES)).toBe(true);
    expect(Object.isFrozen(GAME_MODES.skirmish.victory)).toBe(true);
  });

  it('un modo que no esta en el registro no se puede usar; la partida lleva el suyo y se lee con el mismo registro', () => {
    const s = testModeState({ saves: false });
    expect(gameModeOf(s)).toMatchObject({ id: 'testMode', saves: false });
    expect(() =>
      newGameState({
        ...s,
        mode: 'testMode',
        settings: s.settings,
        seeds: BLANK_SEEDS,
        teams: [{ controller: 'ai' }, { controller: 'ai' }],
      }),
    ).toThrow(/no esta en los que se conocen/);
    expect(readSave(serialize(s), defaultContent())).toEqual({ ok: false, error: 'badMode' });
    expect(gameModeOf(deserialize(serialize(s), defaultContent(), modesWith({ saves: false }))!).saves).toBe(false);
  });

  it('los pasos de turno del modo van detras de los de todos, y por las mismas comprobaciones', () => {
    const teams = [{ controller: 'ai' as const }, { controller: 'ai' as const }, { controller: 'ai' as const }];
    const seen: string[] = [];
    const replies: unknown[] = [];
    // Los pasos del modo nombran unidades que se ponen despues: se llaman al empezar y acabar el turno.
    const changes: Partial<GameMode> = {
      turnPhases: {
        start: [
          {
            id: 'modeStart',
            run: (state, team, perform) => {
              // Los viajes (TURN_START_PHASES) ya han dado su paso.
              seen.push(`start: viajero en y=${unitById(state, traveler.uid)!.y}`);
              const result = perform(state, team, { kind: 'wait', uid: other.uid });
              return result.ok ? result.events : [];
            },
          },
        ],
        end: [
          {
            id: 'modeEnd',
            run: (state, team, perform) => {
              // Las capturas (TURN_END_PHASES) ya se han hecho.
              seen.push(`end: ciudad de ${String(state.buildings.at(-1)!.owner)}`);
              replies.push(perform(state, team, { kind: 'wait', uid: other.uid }));
              replies.push(perform(state, 1, { kind: 'wait', uid: enemy.uid }));
              replies.push(perform(state, 1, { kind: 'surrender' }));
              return [];
            },
          },
        ],
      },
    };
    const s = testModeState(changes, {}, teams);
    s.turnStarted = false;
    const traveler = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
    traveler.standingOrder = { kind: 'goto', at: { x: 2, y: 20 } };
    s.buildings.push({ type: 'City', owner: null, x: 9, y: 9 });
    const capturer = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 9, y: 9 });
    s.buildings.at(-1)!.capture = { team: 0, uid: capturer.uid, left: 1 };
    const other = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 5, y: 12 });
    const enemy = newUnit(s, unitTypeNamed('Soldier'), 1, { x: 12, y: 5 });
    const started = act(s, 0, { kind: 'startTurn' });
    const ended = act(s, 0, { kind: 'endTurn' });
    const result = { started, ended };
    expect(seen[0]).not.toBe('start: viajero en y=2');
    expect(result.started.at(-1)).toMatchObject({ kind: 'wait', uid: other.uid });
    expect(seen[1]).toBe('end: ciudad de 0');
    // Lo que manda el paso pasa por validate (esa unidad ya se ha usado) y por las guardas: otro
    // equipo no actua en este turno, ni para rendirse: un paso de turno solo manda las de su equipo.
    expect(replies).toMatchObject([
      { ok: false, reason: 'spent' },
      { ok: false, reason: 'notYourTurn' },
      { ok: false, reason: 'notYourTurn' },
    ]);
  });

  it('un modo con su propio orden de turnos: la partida lo guarda y la sesion lo sigue', () => {
    const reversed = (teams: readonly number[]) => [...teams].reverse();
    const config = skirmishConfig({ seed: 4, size: 16, teams: [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }] });
    // Una escaramuza con otro orden de turnos: el registro cambia lo que es 'skirmish' para esta partida.
    const s = buildMatch(config, {
      content: defaultContent(),
      modes: { ...GAME_MODES, skirmish: { ...GAME_MODES.skirmish, turnOrder: reversed } },
    });
    expect(s.turnOrder).toEqual([2, 1, 0]);
    expect(s.turn).toBe(2);
    const session = new GameSession(
      s,
      s.teams.map(() => passiveController()),
    );
    const started: number[] = [];
    session.subscribe((step) => startsTurn(step) && started.push(step.team));
    runMatch(session, { until: (state) => state.day > 2 });
    expect(started).toEqual([2, 1, 0, 2, 1, 0]);
  });

  it('un modo puede traer sus propios modulos de reglas: se resuelven con la partida, como los del juego', () => {
    const modeModule: RuleModule = {
      id: 'testBonus',
      isOn: () => true,
      hooks: { hitModifiers: [{ id: 'modeBonus', factor: () => 2 }] },
    };
    const s = testModeState({ ruleModules: [modeModule] }, { flankBonus: 0 });
    expect(s.ruleset.modules).toContain(modeModule);
    expect(isRuleOn(s, 'testBonus')).toBe(true);
    expect(isRuleOn(s, 'flank')).toBe(false);
    expect(hooksOf(s, 'hitModifiers').map((modifier) => modifier.id)).toEqual(['generals', 'modeBonus']);
    const attacker = newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    const defender = newUnit(s, unitTypeNamed('Tank'), 1, { x: 3, y: 2 });
    const plain = blankState({ ...PLAIN_SETTINGS, flankBonus: 0 });
    const plainAttacker = newUnit(plain, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    const plainDefender = newUnit(plain, unitTypeNamed('Tank'), 1, { x: 3, y: 2 });
    expect(hitChance(s, engagement(attacker, defender))).toBe(2 * hitChance(plain, engagement(plainAttacker, plainDefender)));
  });

  it('un modulo del modo no puede llamarse como uno del juego (isRuleOn diria que esta puesto el otro)', () => {
    const impostor: RuleModule = { id: 'flank', isOn: () => true, hooks: {} };
    expect(() => testModeState({ ruleModules: [impostor] }, { flankBonus: 0 })).toThrow(/flank/);
  });

  it('un modulo puede cortar caminos (pathInterruptions): manda el corte que llega antes', () => {
    const path = [2, 3, 4, 5, 6].map((x) => ({ x, y: 2 }));
    // Una mina de prueba en la casilla x=5 y un enemigo escondido en x=6: la emboscada llega despues.
    const mineAt = (steps: readonly { x: number }[]) => {
      const index = steps.findIndex((pos) => pos.x === 5);
      return index < 1 ? null : index;
    };
    const mine: RuleModule = {
      id: 'testMines',
      isOn: () => true,
      hooks: { pathInterruptions: [{ kind: 'testMine', cutAt: (_s, _unit, steps) => mineAt(steps) }] },
    };
    const s = testModeState({ ruleModules: [mine] }, { ambush: true });
    expect(hooksOf(s, 'pathInterruptions')).toHaveLength(2);
    const unit = newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    newUnit(s, unitTypeNamed('Soldier'), 1, { x: 6, y: 2 });
    expect(traverse(s, unit, path)).toEqual({ path: path.slice(0, 3), interruption: { kind: 'testMine', at: { x: 5, y: 2 } } });
    expect(unit).toMatchObject({ x: 4, y: 2, turnState: 'done' });

    const plain = blankState({ ...PLAIN_SETTINGS, ambush: false });
    expect(hooksOf(plain, 'pathInterruptions')).toEqual([]);
    const free = newUnit(plain, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    newUnit(plain, unitTypeNamed('Soldier'), 1, { x: 6, y: 7 });
    expect(traverse(plain, free, path.slice(0, 4)).interruption).toBeNull();
  });

  it('un corte tiene que caer despues de la casilla de salida y dentro del camino (si no, es un fallo del modulo)', () => {
    const path = [2, 3, 4].map((x) => ({ x, y: 2 }));
    for (const index of [0, -1, 3]) {
      const broken: RuleModule = {
        id: 'testMines',
        isOn: () => true,
        hooks: { pathInterruptions: [{ kind: 'testMine', cutAt: () => index }] },
      };
      const s = testModeState({ ruleModules: [broken] });
      expect(() => traverse(s, newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 }), path)).toThrow(/corte/);
    }
  });
});
