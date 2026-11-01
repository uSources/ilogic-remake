import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, keyCommand, type KeyInput } from '../src/controls/keyboard';

const key = (code: string, o: Partial<KeyInput> = {}): KeyInput => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...o,
});

describe('adaptador de teclado', () => {
  it('ninguna tecla esta en dos ordenes', () => {
    const seen = new Set<string>();
    for (const b of KEY_BINDINGS) {
      for (const c of b.codes) {
        const k = `${b.ctrl ? 'Ctrl+' : ''}${c}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });

  it('flechas, WASD y teclado numerico mueven el cursor', () => {
    for (const code of ['ArrowUp', 'KeyW', 'Numpad8']) expect(keyCommand(key(code))).toEqual({ kind: 'cursor', dx: 0, dy: -1 });
    for (const code of ['ArrowRight', 'KeyD', 'Numpad6']) expect(keyCommand(key(code))).toEqual({ kind: 'cursor', dx: 1, dy: 0 });
  });

  it('Enter acepta; con Mayusculas, mueve y espera; mantenido no repite', () => {
    expect(keyCommand(key('Enter'))).toEqual({ kind: 'accept', wait: false });
    expect(keyCommand(key('Space', { shiftKey: true }))).toEqual({ kind: 'accept', wait: true });
    expect(keyCommand(key('Enter', { repeat: true }))).toBeNull();
  });

  it('Esc cancela y Retroceso da un paso atras', () => {
    expect(keyCommand(key('Escape'))?.kind).toBe('cancel');
    expect(keyCommand(key('Backspace'))?.kind).toBe('stepBack');
  });

  it('Ctrl+Z (o Cmd+Z) deshace; Z sola no hace nada', () => {
    expect(keyCommand(key('KeyZ', { ctrlKey: true }))?.kind).toBe('undo');
    expect(keyCommand(key('KeyZ', { metaKey: true }))?.kind).toBe('undo');
    expect(keyCommand(key('KeyZ'))).toBeNull();
  });

  it('las teclas del juego no se disparan con Ctrl (atajos del navegador)', () => {
    expect(keyCommand(key('KeyT', { ctrlKey: true }))).toBeNull();
    expect(keyCommand(key('KeyE', { metaKey: true }))).toBeNull();
  });

  it('el resto de teclas del mapa', () => {
    const cases: [string, string][] = [
      ['KeyE', 'endTurn'],
      ['KeyT', 'threat'],
      ['KeyM', 'minimap'],
      ['Tab', 'nextUnit'],
      ['KeyH', 'help'],
      ['KeyO', 'options'],
      ['KeyF', 'orderHere'],
    ];
    for (const [code, kind] of cases) expect(keyCommand(key(code))?.kind, code).toBe(kind);
    expect(keyCommand(key('NumpadAdd'))).toEqual({ kind: 'zoom', dir: 1 });
    expect(keyCommand(key('Minus'))).toEqual({ kind: 'zoom', dir: -1 });
    expect(keyCommand(key('KeyQ'))).toBeNull();
  });
});
