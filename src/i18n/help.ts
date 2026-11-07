/** Forma de la ayuda ("Cómo se juega") y piezas para escribir sus frases en cada idioma. */
import type { MatchSettings } from '../core/model';
import type { RuleModuleId } from '../core/rules';
import type { KeyLabels } from '../controls/keyNames';

export type { KeyLabels };

/** Un color del mapa y lo que quiere decir. */
export type MapColor = readonly [color: string, meaning: string];

/** Una fila de la tabla de controles. */
export type ControlRow = readonly [action: string, keyboard: string, pointerOrTouch: string];

/**
 * Las reglas que cuenta la ayuda, como datos (van en el estado de la interfaz): los ajustes (las
 * cifras) y los modulos de reglas que van (que frases salen). En una partida, los que lleva (con los
 * de su modo); en el menu, los del juego que van con esos ajustes.
 */
export interface HelpRules {
  readonly settings: Readonly<MatchSettings>;
  readonly modules: readonly RuleModuleId[];
}

/** Lo que reciben las frases de la ayuda: los ajustes y si un modulo va (sale de HelpRules). */
export interface RuleFacts {
  readonly settings: Readonly<MatchSettings>;
  readonly on: (module: RuleModuleId) => boolean;
}

export interface HelpTexts {
  title: string;
  goalTitle: string;
  /** El objetivo sale asi: esta frase, luego las de `ruleLines` y al final `goalBasics`. */
  goalIntro: string;
  /** Frases que dependen de las reglas de la partida; "" si ese modulo no esta puesto (no sale). */
  ruleLines: (facts: RuleFacts) => string[];
  goalBasics: (keys: KeyLabels) => string[];
  colorsTitle: string;
  colors: (keys: KeyLabels) => MapColor[];
  controlsTitle: string;
  head: ControlRow;
  /** La tabla de controles con las teclas del jugador (`keys`: lo que pone en la tecla de cada orden). */
  controls: (keys: KeyLabels) => ControlRow[];
  close: string;
}

/** 0.05 → 5 (las reglas guardan los porcentajes como fraccion). */
export const percent = (fraction: number): number => Math.round(fraction * 100);

/** Junta las frases que salen (las vacias son reglas que no estan activas). */
export const joinSentences = (...sentences: string[]): string => sentences.filter(Boolean).join(' ');

/** Lado de la zona de un punto de control: el radio a cada lado mas la casilla del centro. */
export const controlZoneSide = (settings: MatchSettings): number => 2 * settings.controlRadius + 1;
