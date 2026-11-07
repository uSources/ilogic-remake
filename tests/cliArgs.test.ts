import { describe, expect, it } from 'vitest';
import { cliArgs, usageOf } from '../tools/cliArgs';

const SPEC = { games: 'number', name: 'text', set: 'texts', fog: 'flag', inline: { kind: 'text', short: 'e' } } as const;

describe('cliArgs: las opciones de las herramientas', () => {
  it('lee cada clase de opcion, con su valor por defecto si no sale', () => {
    const args = cliArgs(['run', '--games', '50', '--set', 'a=1', '--set', 'b=2', '--no-fog', '-e', 'map; end', 'otro'], SPEC);
    expect(args.positionals).toEqual(['run', 'otro']);
    expect(args.number('games', 200)).toBe(50);
    expect(args.texts('set')).toEqual(['a=1', 'b=2']);
    expect(args.flag('fog')).toBe(false);
    expect(args.text('inline')).toBe('map; end');
    expect(args.text('name')).toBeUndefined();
    expect(args.text('name', 'actual')).toBe('actual');
  });

  it('sin la opcion: el valor por defecto, ninguna lista y ni si ni no', () => {
    const args = cliArgs([], SPEC);
    expect(args.number('games', 200)).toBe(200);
    expect(args.number('games')).toBeUndefined();
    expect(args.texts('set')).toEqual([]);
    expect(args.flag('fog')).toBeUndefined();
  });

  it('un numero negativo va con =', () => {
    expect(cliArgs(['--games=-5'], SPEC).number('games')).toBe(-5);
  });

  it('para con una opcion que no conoce o un numero que no lo es (antes jugaba con el valor por defecto)', () => {
    expect(() => cliArgs(['--gmes', '50'], SPEC)).toThrow(/gmes/);
    expect(() => cliArgs(['--games', 'muchas'], SPEC)).toThrow(/--games tiene que ser un numero/);
    expect(() => cliArgs(['--games'], SPEC)).toThrow();
  });

  it('la ayuda es el comentario con el que empieza la herramienta', () => {
    const usage = usageOf(new URL('../tools/improve/fuzz.ts', import.meta.url).href);
    expect(usage).toMatch(/^Cazador de fallos/);
    expect(usage).toContain('npm run fuzz -- --repro 1234');
    expect(usage).not.toContain('*');
  });
});
