import type { KeyNames } from '../../controls/keyNames';

/**
 * Nombres de las teclas que no se leen de su codigo (KeyboardEvent.code). Las letras, numeros y
 * teclas de funcion salen solas ("KeyE" → "E"; ver controls/keyNames.ts).
 */
export const keyNames: KeyNames = {
  Escape: 'Esc',
  Backspace: 'Retroceso',
  Tab: 'Tab',
  Space: 'Espacio',
  Enter: 'Intro',
  NumpadEnter: 'Num Intro',
  Delete: 'Supr',
  Insert: 'Insert',
  Home: 'Inicio',
  End: 'Fin',
  PageUp: 'Re Pág',
  PageDown: 'Av Pág',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  CapsLock: 'Bloq Mayús',
  Equal: '+',
  Minus: '−',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  NumpadMultiply: 'Num ×',
  NumpadDivide: 'Num ÷',
  NumpadDecimal: 'Num ,',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  IntlBackslash: '<',
};
