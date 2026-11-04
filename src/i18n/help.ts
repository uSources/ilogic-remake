/** Forma de la ayuda ("Cómo se juega") y piezas para escribir sus frases en cada idioma. */
import type { RulesConfig } from '../core/content/rules';

/** Un color del mapa y lo que quiere decir. */
export type MapColor = readonly [color: string, meaning: string];

/** Una fila de la tabla de controles. */
export type ControlRow = readonly [action: string, keyboard: string, pointerOrTouch: string];

export interface HelpTexts {
  title: string;
  goalTitle: string;
  /** El objetivo sale asi: esta frase, luego las de `ruleLines` y al final `goalBasics`. */
  goalIntro: string;
  /** Frases que dependen de las reglas de la partida; "" si esa regla no esta activa (no sale). */
  ruleLines: (rules: RulesConfig) => string[];
  goalBasics: string[];
  colorsTitle: string;
  colors: MapColor[];
  controlsTitle: string;
  head: ControlRow;
  controls: ControlRow[];
  close: string;
}

/** 0.05 → 5 (las reglas guardan los porcentajes como fraccion). */
export const percent = (fraction: number): number => Math.round(fraction * 100);

/** Junta las frases que salen (las vacias son reglas que no estan activas). */
export const joinSentences = (...sentences: string[]): string => sentences.filter(Boolean).join(' ');

/** Lado de la zona de un punto de control: el radio a cada lado mas la casilla del centro. */
export const controlZoneSide = (rules: RulesConfig): number => 2 * rules.controlRadius + 1;
