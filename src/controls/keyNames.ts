import { KEY_BINDING_IDS, keyCodesOf, type KeyBindingId, type KeyOverrides } from './keyboard';

/**
 * Nombres de las teclas para el jugador: de un KeyboardEvent.code ("KeyE", "Backspace") a lo que pone
 * en la tecla ("E", "Retroceso"). Los nombres con idioma los da quien llama (src/i18n/<idioma>/keyNames.ts);
 * aqui solo las formas que salen del propio codigo.
 */
export type KeyNames = Readonly<Record<string, string>>;

/** Trozos del codigo que se quitan para leer la tecla: "KeyE" → "E", "Digit3" → "3", "Numpad7" → "Num 7". */
const CODE_PREFIXES: readonly { prefix: string; shown: string }[] = [
  { prefix: 'Key', shown: '' },
  { prefix: 'Digit', shown: '' },
  { prefix: 'Numpad', shown: 'Num ' },
];

/** El nombre de una tecla: el del idioma si lo tiene; si no, el que sale de su codigo. */
export function keyName(code: string, names: KeyNames): string {
  const named = names[code];
  if (named) return named;
  const stripped = CODE_PREFIXES.find(({ prefix }) => code.startsWith(prefix) && code.length > prefix.length);
  return stripped ? `${stripped.shown}${code.slice(stripped.prefix.length)}` : code;
}

/** La tecla con que se da una orden, para enseñarla (la principal: el teclado numerico es un extra). */
export const keyLabel = (id: KeyBindingId, overrides: KeyOverrides, names: KeyNames): string => {
  const [primary] = keyCodesOf(id, overrides);
  return primary ? keyName(primary, names) : '';
};

/** Lo que pone en la tecla de cada orden, para la ayuda y los botones. */
export type KeyLabels = Readonly<Record<KeyBindingId, string>>;

export const keyLabels = (overrides: KeyOverrides, names: KeyNames): KeyLabels =>
  Object.fromEntries(KEY_BINDING_IDS.map((id) => [id, keyLabel(id, overrides, names)])) as KeyLabels;
