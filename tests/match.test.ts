import { describe, expect, it } from 'vitest';
import { dispatch } from '@core/actions';
import { createMatch } from '@core/defaultGames';
import { DEFAULT_MAP_SIZE, MATCH_SETUPS, rematchOf, skirmishConfig } from '@core/match';
import { GAME_MODES } from '@core/modes';
import { serialize } from '@core/save';
import { duel } from '@core/teams';
import { DEFAULT_OPTIONS, matchConfigFor } from '../src/setup';
import { TextMatch } from '../tools/play/textMatch';
import { defaultLab, labMatch } from '../src/lab';

describe('empezar una partida (core/match.ts, MatchConfig y createMatch)', () => {
  it('cada modo de GAME_MODES tiene su forma de prepararse, y la partida lleva su modo', () => {
    expect(Object.keys(MATCH_SETUPS).sort()).toEqual(Object.keys(GAME_MODES).sort());
    const mission = createMatch({ mode: 'mission', mission: 'bridgehead', diceSeed: 1 });
    expect(mission.mode).toBe('mission');
    expect(createMatch(skirmishConfig({ seed: 3, teams: duel('human', 'ai') })).mode).toBe('skirmish');
  });

  it('una escaramuza sin elegir nada: mapa de siempre, tema al azar, reglas por defecto', () => {
    const config = skirmishConfig({ seed: 9, teams: duel('human', 'ai') });
    expect(config.map).toEqual({ seed: 9, size: DEFAULT_MAP_SIZE, theme: null });
    const s = createMatch(config);
    expect(s.setup).toEqual(config.map);
    expect(s.settings).toEqual(s.content.defaultSettings);
  });

  it('la misma configuracion da la misma partida (con su clima del primer dia y la muestra del ejercito)', () => {
    const config = skirmishConfig({ seed: 21, size: 20, teams: duel('human', 'ai') });
    const s = createMatch(config);
    expect(serialize(createMatch(config))).toBe(serialize(s));
    expect(s.weather).toBeDefined();
    expect(s.teams.every((team) => team.stats.army.length === 1)).toBe(true);
  });

  it('los generales de cada equipo vienen en la configuracion', () => {
    const s = createMatch(
      skirmishConfig({
        seed: 4,
        size: 20,
        teams: [
          { controller: 'human', general: 'Brisa' },
          { controller: 'ai', general: null },
        ],
      }),
    );
    expect(s.teams.map((team) => team.general?.id ?? null)).toEqual(['Brisa', null]);
  });

  it('con swapStarts cada equipo empieza donde le tocaba al otro (la herramienta de equilibrio)', () => {
    const config = skirmishConfig({ seed: 5, size: 16, teams: duel('ai', 'ai') });
    const normal = createMatch(config);
    const swapped = createMatch({ ...config, swapStarts: true });
    const startOf = (s: typeof normal, team: number) => [
      s.units.filter((unit) => unit.team === team).map((unit) => [unit.type, unit.x, unit.y]),
      s.buildings.filter((building) => building.owner === team).map((building) => [building.x, building.y]),
    ];
    expect(startOf(swapped, 0)).toEqual(startOf(normal, 1));
    expect(startOf(swapped, 1)).toEqual(startOf(normal, 0));
    expect(() =>
      createMatch({
        ...skirmishConfig({ seed: 5, size: 16, teams: [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }] }),
        swapStarts: true,
      }),
    ).toThrow(/dos equipos/);
  });

  it('una partida que empezaria con un equipo ya caido (sin Base) es un fallo de su configuracion', () => {
    const config = labMatch(defaultLab(), null);
    const noHq = { ...config, buildings: config.buildings.filter((building) => building.owner !== 1) };
    expect(() => createMatch(noHq)).toThrow(/empieza con el equipo 1 ya caido/);
  });

  it('el laboratorio no tiene clima porque su modo lo impone, no porque lo pida', () => {
    const config = labMatch(defaultLab(), 'attack');
    expect(config.settingChanges?.weather).toBeUndefined();
    expect(createMatch(config).settings.weather).toBe(false);
  });

  it('revancha: el mismo mapa, reglas y equipos; una mision no la tiene', () => {
    const s = createMatch(skirmishConfig({ seed: 5, size: 20, settingChanges: { fog: false }, teams: duel('human', 'ai') }));
    const again = createMatch(rematchOf(s)!);
    expect(again.map).toEqual(s.map);
    expect(again.settings).toEqual(s.settings);
    expect(rematchOf(createMatch({ mode: 'mission', mission: 'bridgehead', diceSeed: 1 }))).toBeNull();
  });

  it('K4: la misma semilla da la misma partida en la pantalla (opciones de siempre) y en npm run play', () => {
    const game = createMatch(matchConfigFor(DEFAULT_OPTIONS, 7));
    // npm run play ya ha empezado el turno de la persona (como la pantalla al abrir la partida).
    dispatch(game, 0, { kind: 'startTurn' });
    expect(serialize(new TextMatch({ seed: 7 }).s)).toBe(serialize(game));
  });
});

describe('partida nueva desde la pantalla (src/setup.ts)', () => {
  it('el rival puede ser la IA u otra persona en esta pantalla', () => {
    expect(matchConfigFor(DEFAULT_OPTIONS, 1).teams.map((team) => team.controller)).toEqual(['human', 'ai']);
    expect(matchConfigFor({ ...DEFAULT_OPTIONS, rival: 'human' }, 1).teams.map((team) => team.controller)).toEqual(['human', 'human']);
  });
});
