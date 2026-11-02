import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, keyCommand, type KeyInput } from '../src/controls/keyboard';
import { MENU_BINDINGS, listStep, menuKeyCommand } from '../src/controls/menu';

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

describe('adaptador de teclado en los menus', () => {
  const k = (code: string, repeat = false) => ({ code, repeat });

  it('en cada menu ninguna tecla esta en dos ordenes', () => {
    for (const [ctx, bindings] of Object.entries(MENU_BINDINGS)) {
      const seen = new Set<string>();
      for (const b of bindings)
        for (const c of b.codes) {
          expect(seen.has(c), `${ctx}: ${c}`).toBe(false);
          seen.add(c);
        }
    }
  });

  it('flechas, WASD y teclado numerico mueven; Enter acepta (dice si es repeticion); Esc y Retroceso van atras', () => {
    for (const code of ['ArrowUp', 'KeyW', 'Numpad8']) expect(menuKeyCommand(k(code), 'home')).toEqual({ kind: 'move', dx: 0, dy: -1 });
    for (const code of ['ArrowLeft', 'KeyA', 'Numpad4'])
      expect(menuKeyCommand(k(code), 'campaign')).toEqual({ kind: 'move', dx: -1, dy: 0 });
    expect(menuKeyCommand(k('Space'), 'options')).toEqual({ kind: 'ok', repeat: false });
    expect(menuKeyCommand(k('Enter', true), 'options')).toEqual({ kind: 'ok', repeat: true });
    for (const code of ['Escape', 'Backspace']) expect(menuKeyCommand(k(code), 'setup')?.kind).toBe('back');
  });

  it('atajos de cada menu: O opciones, N notas, R otro mapa, H cierra la ayuda', () => {
    expect(menuKeyCommand(k('KeyO'), 'home')?.kind).toBe('options');
    expect(menuKeyCommand(k('KeyO'), 'options')?.kind).toBe('options');
    expect(menuKeyCommand(k('KeyO'), 'campaign')).toBeNull();
    expect(menuKeyCommand(k('KeyN'), 'notes')?.kind).toBe('notes');
    expect(menuKeyCommand(k('KeyR'), 'setup')?.kind).toBe('reroll');
    expect(menuKeyCommand(k('KeyH'), 'help')?.kind).toBe('help');
    // En la ayuda las flechas no hacen nada.
    expect(menuKeyCommand(k('ArrowDown'), 'help')).toBeNull();
  });

  it('escribiendo el codigo del mapa las letras y el Retroceso son del cuadro de texto', () => {
    for (const code of ['KeyR', 'KeyW', 'KeyA', 'Backspace', 'Space', 'ArrowLeft']) expect(menuKeyCommand(k(code), 'typing')).toBeNull();
    expect(menuKeyCommand(k('NumpadEnter'), 'typing')?.kind).toBe('ok');
    expect(menuKeyCommand(k('Escape'), 'typing')?.kind).toBe('back');
    expect(menuKeyCommand(k('ArrowDown'), 'typing')).toEqual({ kind: 'move', dx: 0, dy: 1 });
  });

  it('fin de partida: Tab pasa al siguiente, Esc vuelve al menu, Retroceso y teclado numerico no', () => {
    expect(listStep(menuKeyCommand(k('Tab'), 'end')!)).toBe(1);
    expect(listStep(menuKeyCommand(k('KeyW'), 'end')!)).toBe(-1);
    expect(listStep(menuKeyCommand(k('ArrowRight'), 'end')!)).toBe(1);
    expect(menuKeyCommand(k('Escape'), 'end')?.kind).toBe('back');
    expect(menuKeyCommand(k('Backspace'), 'end')).toBeNull();
    expect(menuKeyCommand(k('Numpad4'), 'end')).toBeNull();
  });

  it('paso en una lista: izquierda/arriba -1, derecha/abajo +1, lo demas 0', () => {
    expect(listStep({ kind: 'move', dx: -1, dy: 0 })).toBe(-1);
    expect(listStep({ kind: 'move', dx: 0, dy: 1 })).toBe(1);
    expect(listStep({ kind: 'ok', repeat: false })).toBe(0);
  });
});
