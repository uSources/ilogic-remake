import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { loadGame } from '@core/defaultGames';
import { readSave, serialize } from '@core/save';
import { SAVE_VERSION } from '@core/saveVersion';
import { newUnit } from '@core/rules';
import { formSquad } from '@core/squads/membership';
import { blankState, unitTypeNamed } from './helpers';

/** Una partida guardada con un cambio en su JSON. */
function savedWith(change: (raw: Record<string, unknown>) => void): string {
  const s = blankState();
  newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
  const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
  change(raw);
  return JSON.stringify(raw);
}

describe('readSave: leer una partida dice que ha fallado', () => {
  it.each([
    ['notJson', () => '{'],
    ['badVersion', () => savedWith((raw) => (raw.version = 99))],
    ['badVersion', () => savedWith((raw) => delete raw.version)],
    ['badShape', () => savedWith((raw) => delete raw.units)],
    ['badMap', () => savedWith((raw) => (raw.map = [['Lava']]))],
    ['badTheme', () => savedWith((raw) => (raw.theme = 'Moon'))],
    ['badDice', () => savedWith((raw) => (raw.dice = -1))],
    ['badDice', () => savedWith((raw) => (raw.decisionSeed = 1.5))],
    ['badTeams', () => savedWith((raw) => (raw.teams = []))],
    ['badTeams', () => savedWith((raw) => ((raw.teams as { fell: unknown }[])[0]!.fell = { order: 0, reason: 'bored' }))],
    ['badMode', () => savedWith((raw) => (raw.mode = 'arcade'))],
    ['badTurn', () => savedWith((raw) => (raw.turn = 5))],
    ['badTurn', () => savedWith((raw) => (raw.turnOrder = [0, 0]))],
    ['badTurn', () => savedWith((raw) => (raw.turnStarted = 'si'))],
    ['badUnits', () => savedWith((raw) => ((raw.units as { life: number }[])[0]!.life = 0))],
    ['badSettings', () => savedWith((raw) => ((raw.settings as { fog: unknown }).fog = 'mucha'))],
    // Una regla que falta no se rellena: todas las partidas de ahora las guardan todas.
    ['badSettings', () => savedWith((raw) => delete (raw.settings as { weather?: unknown }).weather)],
  ])('%s', (error, json) => {
    expect(readSave(json(), defaultContent())).toEqual({ ok: false, error });
  });

  it.each([1, SAVE_VERSION - 1])('una partida del formato %i (uno de antes) se descarta: el juego hace como si no hubiera', (version) => {
    const json = savedWith((raw) => (raw.version = version));
    expect(readSave(json, defaultContent())).toEqual({ ok: false, error: 'badVersion' });
    expect(loadGame(json)).toBeNull();
  });

  it('una partida bien da la partida, y leer lo mismo dos veces da lo mismo', () => {
    const json = savedWith(() => {});
    const first = readSave(json, defaultContent());
    const second = readSave(json, defaultContent());
    expect(first.ok && second.ok && serialize(first.state) === serialize(second.state)).toBe(true);
    expect(first.ok && serialize(first.state)).toBe(json);
  });

  it('lo opcional roto se quita y la partida se lee', () => {
    const json = savedWith((raw) => {
      raw.weather = { kind: 'Fog?' };
      raw.squads = 'escuadras';
    });
    const result = readSave(json, defaultContent());
    expect(result.ok && [result.state.weather, result.state.squads]).toEqual([undefined, undefined]);
  });
});

describe('readSave: los contadores rotos se arreglan', () => {
  /** Una partida con dos unidades, cada una en su escuadra (1 y 2), y los contadores escritos a mano. */
  function withCounters(written: string) {
    const s = blankState();
    const soldiers = [newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 }), newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 2 })];
    for (const soldier of soldiers) formSquad(s, 0, [soldier]);
    const json = serialize(s)
      .replace(/"nextUid":\d+/, `"nextUid":${written}`)
      .replace(/"nextSquadId":\d+/, `"nextSquadId":${written}`);
    return { highestUid: Math.max(...s.units.map((unit) => unit.uid)), read: readSave(json, defaultContent()) };
  }

  it('por debajo de lo que hay, o rotos (1e300, 3,5, -4, null, "x"): el mayor que hay + 1', () => {
    for (const broken of ['1', '1e300', '3.5', '-4', 'null', '"x"']) {
      const { highestUid, read } = withCounters(broken);
      expect(read.ok && [read.state.nextUid, read.state.nextSquadId]).toEqual([highestUid + 1, 3]);
    }
  });

  it('con Infinity el fichero no es JSON: no se lee', () => {
    expect(withCounters('Infinity').read).toEqual({ ok: false, error: 'notJson' });
  });
});
