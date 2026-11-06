import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { saveContext } from '@core/defaultGames';
import { readSave, serialize } from '@core/save';
import { newUnit } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';

const context = () => saveContext(defaultContent());

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
    ['unknownVersion', () => savedWith((raw) => (raw.version = 99))],
    ['badShape', () => savedWith((raw) => delete raw.units)],
    ['badMap', () => savedWith((raw) => (raw.map = [['Lava']]))],
    ['badTheme', () => savedWith((raw) => (raw.theme = 'Moon'))],
    ['badDice', () => savedWith((raw) => (raw.dice = -1))],
    ['badTeams', () => savedWith((raw) => (raw.teams = []))],
    ['badUnits', () => savedWith((raw) => ((raw.units as { life: number }[])[0]!.life = 0))],
    ['badRules', () => savedWith((raw) => ((raw.rules as { fog: unknown }).fog = 'mucha'))],
  ])('%s', (error, json) => {
    expect(readSave(json(), context())).toEqual({ ok: false, error });
  });

  it('una partida bien da la partida, y leer lo mismo dos veces da lo mismo', () => {
    const json = savedWith(() => {});
    const first = readSave(json, context());
    const second = readSave(json, context());
    expect(first.ok && second.ok && serialize(first.state) === serialize(second.state)).toBe(true);
    expect(first.ok && serialize(first.state)).toBe(json);
  });

  it('lo opcional roto se quita y la partida se lee', () => {
    const json = savedWith((raw) => {
      raw.weather = { kind: 'Fog?' };
      raw.squads = 'escuadras';
    });
    const result = readSave(json, context());
    expect(result.ok && [result.state.weather, result.state.squads]).toEqual([undefined, undefined]);
  });
});
