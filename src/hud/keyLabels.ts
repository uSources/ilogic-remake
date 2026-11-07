import { keyLabel, keyLabels, type KeyLabels } from '../controls/keyNames';
import { KEY_BINDING_IDS, type KeyBindingId } from '../controls/keyboard';
import { KEY_NAMES } from '../i18n';
import { settings } from '../settings';

/**
 * Las teclas del jugador tal como se enseñan (botones, ayuda, opciones): las de serie con sus cambios
 * (`settings.keys`) y los nombres del idioma elegido. Lo puro esta en controls/keyNames.ts.
 */

/** La tecla de una orden ("E", "Tab", "+ / Num +"). */
export const keyLabelOf = (id: KeyBindingId): string => keyLabel(id, settings.keys, KEY_NAMES[settings.lang]);

/** Las teclas de todas las ordenes, para la ayuda. */
export const currentKeyLabels = (): KeyLabels => keyLabels(settings.keys, KEY_NAMES[settings.lang]);

/** Un texto con huecos `{endTurn}`, `{threat}`... rellenos con la tecla de cada orden. */
export const withKeyLabels = (text: string): string =>
  KEY_BINDING_IDS.reduce((filled, id) => filled.replaceAll(`{${id}}`, keyLabelOf(id)), text);
