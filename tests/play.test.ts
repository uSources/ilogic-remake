import { describe, expect, it } from 'vitest';
import { TextMatch } from '../tools/play/textMatch';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { serialize } from '@core/save';
import { duel } from '@core/teams';

/** Una partida nueva guardada en JSON, con estos equipos. */
const savedWith = (teams: Parameters<typeof skirmishConfig>[0]['teams'], seed = 4) =>
  serialize(createMatch(skirmishConfig({ seed, size: 16, teams })));

/** La partida por texto (npm run play) es la forma rapida de probar reglas: que no se rompa. */
describe('partida por texto', () => {
  it('mapa, unidades y ordenes basicas', () => {
    const g = new TextMatch({ seed: 7, size: 20, theme: 'Plains' });
    expect(g.run('map').split('\n').length).toBeGreaterThan(20);
    const units = g.run('units 0');
    const uid = Number(units.trim().split(/\s+/)[0]);
    const info = g.run(`unit ${uid}`);
    const [x, y] = info.split('\n')[1]!.split(': ')[1]!.split(' ')[0]!.split(',').map(Number);
    expect(g.run(`move ${uid} ${x} ${y}`)).toMatch(/movida|emboscada/);
    expect(g.run(`move ${uid} 0 0`)).toMatch(/^error: .*ya ha actuado|^error: .*no puede llegar|^movida/);
    expect(g.run('nada')).toMatch(/^error: orden desconocida/);
    expect(g.run('end')).toMatch(/--- dia 2/);
  });

  it('misma semilla, misma partida (la IA juega los dos bandos)', () => {
    const play = () => {
      const g = new TextMatch({ seed: 3, size: 20 });
      for (let i = 0; i < 5; i++) g.run('ai');
      return g.run('state');
    };
    expect(play()).toBe(play());
  });

  it('se puede guardar en JSON y seguir desde ahi', () => {
    const g = new TextMatch({ seed: 5, size: 20 });
    g.run('ai');
    const copy = new TextMatch({ state: g.run('state') });
    expect(copy.run('status')).toBe(g.run('status'));
  });

  it('una partida de IA contra IA (del fuzz, de las herramientas) se juega desde el primer equipo', () => {
    const g = new TextMatch({ state: savedWith(duel('ai', 'ai')) });
    expect(g.run('status')).toMatch(/resultado: sigue/);
    expect(g.run('end')).toMatch(/--- dia 2/);
    const three = new TextMatch({ state: savedWith([{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]) });
    expect(three.run('status')).toMatch(/resultado: sigue/);
    expect(three.run('end')).toMatch(/equipo 3: /);
  });

  it('rendirse: con otra persona sigue ella; sin ninguna, se acaba para la pantalla y ya no se juega', () => {
    const hotSeat = new TextMatch({ state: savedWith([{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]) });
    const out = hotSeat.run('rendirse');
    expect(out).toMatch(/tu: el equipo 1 se rinde/);
    expect(out).toMatch(/--- turno del equipo 2/);
    expect(out).not.toMatch(/FIN/);
    const lone = new TextMatch({ state: savedWith([{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]) });
    const end = lone.run('surrender');
    expect(end).toMatch(/el equipo 1 queda fuera \(rendido\)/);
    expect(end).toMatch(/FIN: perdida \(rendido; los demas siguen sin personas\)/);
    expect(lone.run('end')).toMatch(/^error: la partida ha acabado/);
    expect(lone.run('status')).toMatch(/resultado: perdida/);
  });

  it('una partida decidida ya no se sigue jugando', () => {
    const duelGame = new TextMatch({ state: savedWith(duel('human', 'ai')) });
    expect(duelGame.run('rendirse')).toMatch(/FIN: perdida \(surrender\)/);
    expect(duelGame.run('ai')).toMatch(/^error: la partida ha acabado/);
    expect(duelGame.run('map').split('\n').length).toBeGreaterThan(10);
  });
});
