import { describe, expect, it } from 'vitest';
import { Session } from '../tools/play/session';

/** La partida por texto (npm run play) es la forma rapida de probar reglas: que no se rompa. */
describe('partida por texto', () => {
  it('mapa, unidades y ordenes basicas', () => {
    const g = new Session({ seed: 7, size: 20, theme: 0 });
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
      const g = new Session({ seed: 3, size: 20 });
      for (let i = 0; i < 5; i++) g.run('ai');
      return g.run('state');
    };
    expect(play()).toBe(play());
  });

  it('se puede guardar en JSON y seguir desde ahi', () => {
    const g = new Session({ seed: 5, size: 20 });
    g.run('ai');
    const copy = new Session({ state: g.run('state') });
    expect(copy.run('status')).toBe(g.run('status'));
  });
});
