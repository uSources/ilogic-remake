import { describe, expect, it } from 'vitest';
import {
  FIXED_KEYS,
  KEY_BINDING_IDS,
  KEY_BINDINGS,
  keyBindings,
  keyCommand,
  keyConflict,
  parseKeyOverrides,
  REBINDABLE_KEYS,
  withKeyBound,
  type KeyInput,
} from '../src/controls/keyboard';
import { keyLabel, keyLabels, keyName } from '../src/controls/keyNames';
import { menuKeyCommand } from '../src/controls/menu';
import { HELP_TEXTS, KEY_NAMES } from '../src/i18n';
import { parseSaved } from '../src/settings';

const key = (code: string, changes: Partial<KeyInput> = {}): KeyInput => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...changes,
});

describe('teclas que el jugador puede cambiar', () => {
  it('las de serie son las de siempre: sin cambios, la tabla es la misma', () => {
    expect(keyBindings({})).toEqual(KEY_BINDINGS);
    expect(keyCommand(key('KeyE'))).toEqual({ kind: 'endTurn' });
    expect(keyCommand(key('KeyE'), {})).toEqual({ kind: 'endTurn' });
  });

  it('un cambio manda: la tecla nueva da la orden y la de serie deja de hacerlo', () => {
    const overrides = { endTurn: 'KeyP' };
    expect(keyCommand(key('KeyP'), overrides)).toEqual({ kind: 'endTurn' });
    expect(keyCommand(key('KeyE'), overrides)).toBeNull();
    // Las demas siguen igual.
    expect(keyCommand(key('KeyT'), overrides)).toEqual({ kind: 'threat' });
    expect(keyCommand(key('Tab'), overrides)).toEqual({ kind: 'nextUnit' });
  });

  it('las teclas fijas no cambian aunque se cambien las otras', () => {
    const overrides = { cancel: 'KeyJ', zoomIn: 'KeyK' };
    expect(keyCommand(key('ArrowUp'), overrides)).toEqual({ kind: 'cursor', dx: 0, dy: -1 });
    expect(keyCommand(key('Enter'), overrides)).toEqual({ kind: 'accept', wait: false });
    expect(keyCommand(key('KeyZ', { ctrlKey: true }), overrides)).toEqual({ kind: 'undo' });
    expect(keyCommand(key('Digit2', { shiftKey: true }), overrides)).toEqual({ kind: 'group', n: 2, mode: 'add' });
    expect(keyCommand(key('KeyJ'), overrides)).toEqual({ kind: 'cancel' });
    expect(keyCommand(key('Escape'), overrides)).toBeNull();
  });

  it('cada orden que se puede cambiar tiene su tecla de serie y ninguna pide Ctrl ni Mayusculas', () => {
    for (const id of KEY_BINDING_IDS) expect(REBINDABLE_KEYS[id].codes.length, id).toBeGreaterThan(0);
    const fixedCodes = FIXED_KEYS.flatMap((binding) => binding.codes);
    for (const id of KEY_BINDING_IDS)
      for (const code of REBINDABLE_KEYS[id].codes) expect(fixedCodes, `${id}: ${code}`).not.toContain(code);
  });
});

describe('conflictos al cambiar una tecla', () => {
  it('una tecla libre vale, y la suya propia tambien', () => {
    expect(keyConflict('endTurn', 'KeyP', {})).toBeNull();
    expect(keyConflict('endTurn', 'KeyE', {})).toBeNull();
    expect(keyConflict('endTurn', 'KeyP', { endTurn: 'KeyP' })).toBeNull();
  });

  it('una tecla de otra orden dice de cual es (con los cambios puestos)', () => {
    expect(keyConflict('endTurn', 'KeyT', {})).toEqual({ kind: 'binding', id: 'threat' });
    expect(keyConflict('endTurn', 'KeyP', { threat: 'KeyP' })).toEqual({ kind: 'binding', id: 'threat' });
    // La tecla de serie de una orden que ya se ha cambiado queda libre.
    expect(keyConflict('endTurn', 'KeyT', { threat: 'KeyP' })).toBeNull();
  });

  it('las fijas (cursor, aceptar, deshacer, grupos) y las de modificar no valen', () => {
    for (const code of ['KeyW', 'ArrowLeft', 'Enter', 'Space', 'KeyZ', 'Digit1', 'Numpad8'])
      expect(keyConflict('endTurn', code, {}), code).toEqual({ kind: 'fixed' });
    expect(keyConflict('endTurn', 'ShiftLeft', {})).toEqual({ kind: 'modifier' });
    expect(keyConflict('endTurn', 'ControlRight', {})).toEqual({ kind: 'modifier' });
  });

  it('poner una tecla guarda solo el cambio; volver a la de serie lo quita', () => {
    const bound = withKeyBound({}, 'endTurn', 'KeyP');
    expect(bound).toEqual({ endTurn: 'KeyP' });
    expect(withKeyBound(bound, 'threat', 'KeyY')).toEqual({ endTurn: 'KeyP', threat: 'KeyY' });
    expect(withKeyBound(bound, 'endTurn', 'KeyE')).toEqual({});
    expect(withKeyBound(bound, 'zoomIn', 'NumpadAdd')).toEqual(bound);
  });
});

describe('nombres de las teclas', () => {
  it('las letras, numeros y teclado numerico salen de su codigo', () => {
    expect(keyName('KeyE', {})).toBe('E');
    expect(keyName('Digit3', {})).toBe('3');
    expect(keyName('Numpad7', {})).toBe('Num 7');
    expect(keyName('F5', {})).toBe('F5');
  });

  it('las especiales tienen nombre en cada idioma', () => {
    expect(keyName('Backspace', KEY_NAMES.es)).toBe('Retroceso');
    expect(keyName('Backspace', KEY_NAMES.en)).toBe('Backspace');
    expect(keyName('Escape', KEY_NAMES.es)).toBe('Esc');
    expect(keyName('Tab', KEY_NAMES.en)).toBe('Tab');
    expect(Object.keys(KEY_NAMES.en).sort()).toEqual(Object.keys(KEY_NAMES.es).sort());
  });

  it('la tecla de una orden es la principal, con los cambios puestos', () => {
    expect(keyLabel('zoomIn', {}, KEY_NAMES.es)).toBe('+');
    expect(keyLabel('stepBack', {}, KEY_NAMES.es)).toBe('Retroceso');
    expect(keyLabel('endTurn', { endTurn: 'KeyP' }, KEY_NAMES.es)).toBe('P');
    expect(keyLabels({ nextUnit: 'KeyN' }, KEY_NAMES.en)).toMatchObject({ endTurn: 'E', nextUnit: 'N', cancel: 'Esc' });
  });
});

describe('la ayuda enseña las teclas del jugador', () => {
  const column = (rows: readonly (readonly string[])[], action: string) => rows.find((row) => row[0] === action)?.[1];

  it('de serie, las letras de siempre', () => {
    const keys = keyLabels({}, KEY_NAMES.es);
    const controls = HELP_TEXTS.es.controls(keys);
    expect(column(controls, 'Fin del turno')).toBe('E (dos veces si quedan unidades sin mover)');
    expect(column(controls, 'Atrás')).toBe('Esc / Retroceso');
    expect(column(controls, 'Zoom')).toBe('+ / −');
  });

  it('con cambios, las teclas nuevas (tambien en el objetivo y los colores)', () => {
    const keys = keyLabels({ endTurn: 'KeyP', threat: 'KeyY', orderHere: 'KeyJ' }, KEY_NAMES.en);
    const controls = HELP_TEXTS.en.controls(keys);
    expect(column(controls, 'End turn')).toBe('P (twice if units have not moved)');
    expect(column(controls, 'Enemy threat')).toBe('Y');
    expect(HELP_TEXTS.en.colors(keys)[1]?.[1]).toContain('(Y)');
    expect(HELP_TEXTS.en.goalBasics(keys).join(' ')).toContain('keyboard: J');
  });
});

describe('cambios de teclas guardados', () => {
  it('solo entran las ordenes que existen con una tecla de texto', () => {
    expect(parseKeyOverrides({ endTurn: 'KeyP', fly: 'KeyX', threat: 3, minimap: '' })).toEqual({ endTurn: 'KeyP' });
    expect(parseKeyOverrides(undefined)).toEqual({});
    expect(parseKeyOverrides('KeyP')).toEqual({});
    expect(parseKeyOverrides(null)).toEqual({});
  });

  it('al cargar las opciones, lo que no vale se ignora y sin nada guardado no hay cambios', () => {
    expect(parseSaved({}).keys).toEqual({});
    expect(parseSaved({ keys: { endTurn: 'KeyP', nothing: true } as never }).keys).toEqual({ endTurn: 'KeyP' });
    expect(parseSaved({ keys: 'KeyP' as never }).keys).toEqual({});
  });
});

describe('esperando la tecla nueva en Opciones', () => {
  it('cualquier tecla llega como `key`, menos Esc, que lo deja', () => {
    expect(menuKeyCommand({ code: 'KeyP', repeat: false }, 'keyCapture')).toEqual({ kind: 'key', code: 'KeyP' });
    expect(menuKeyCommand({ code: 'Tab', repeat: false }, 'keyCapture')).toEqual({ kind: 'key', code: 'Tab' });
    expect(menuKeyCommand({ code: 'Enter', repeat: false }, 'keyCapture')).toEqual({ kind: 'key', code: 'Enter' });
    expect(menuKeyCommand({ code: 'Escape', repeat: false }, 'keyCapture')).toEqual({ kind: 'back' });
    // En las opciones normales, una letra suelta no hace nada.
    expect(menuKeyCommand({ code: 'KeyP', repeat: false }, 'options')).toBeNull();
  });
});
