import { describe, expect, it } from 'vitest';
import { navGrid } from '../src/menu/nav';
import { applyPreset, DEFAULT_OPTIONS, PRESETS } from '../src/setup';

describe('menu', () => {
  const rows = [['continue', 'quick', 'campaign'], ['continue', 'custom', 'campaign'], ['help', 'options', 'credits', 'web']];
  it('se mueve por la rejilla de tarjetas', () => {
    expect(navGrid(rows, 'continue', 1, 0)).toBe('quick');
    expect(navGrid(rows, 'quick', 0, 1)).toBe('custom');
    expect(navGrid(rows, 'continue', 0, 1)).toBe('help');
    expect(navGrid(rows, 'campaign', 0, 1)).toBe('web');
    expect(navGrid(rows, 'custom', 0, -1)).toBe('quick');
    expect(navGrid(rows, 'help', 0, -1)).toBe('continue');
    expect(navGrid(rows, 'web', 1, 0)).toBe('web');
  });
  it('los ajustes ya hechos cambian las opciones, Personalizada no', () => {
    const q = applyPreset(DEFAULT_OPTIONS, 'quick');
    expect(q.size).toBe(PRESETS.quick.size);
    expect(q.dayLimit).toBe(20);
    const c = applyPreset(q, 'custom');
    expect(c.size).toBe(q.size);
    expect(c.preset).toBe('custom');
  });
});
