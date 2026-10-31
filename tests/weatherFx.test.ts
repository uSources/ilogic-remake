import { describe, expect, it } from 'vitest';
import { seededRng } from '@core/geom';
import { STYLES, spawnParticle, stepParticle } from '../src/ui/weatherFx';

describe('efecto de clima', () => {
  it('la arena sigue repartida por toda la pantalla al cabo de un rato (no se junta arriba)', () => {
    const s = STYLES.Sandstorm!;
    const rnd = seededRng(3);
    const ps = Array.from({ length: s.count }, () => spawnParticle(s, rnd() * 1.2 - 0.1, rnd(), rnd()));
    // 30 s a 60 imagenes por segundo.
    for (let i = 0; i < 1800; i++) for (const p of ps) stepParticle(p, s, 1 / 60, 0, rnd);
    const bottom = ps.filter((p) => p.y > 0.5).length / ps.length;
    expect(bottom).toBeGreaterThan(0.35);
    expect(bottom).toBeLessThan(0.65);
  });

  it('la lluvia que cae por abajo vuelve por arriba', () => {
    const s = STYLES.Rain!;
    const p = spawnParticle(s, 0.5, 1.04, 0.5);
    stepParticle(p, s, 0.1, 0, () => 0.5);
    expect(p.y).toBeCloseTo(-0.05);
  });
});
