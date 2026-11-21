/**
 * Como juega cada IA de una partida (docs/PLAN-IA.md, fase 4), en ai.json: su **personalidad**
 * (agresiva, cauta...) y su **dificultad** (Facil, Normal, Dificil). Cada una cambia algunos pesos de
 * la IA (los demas, los de ai.json); la dificultad, ademas, el dinero con el que empieza. Cada equipo
 * lleva las suyas (`TeamState.personality`, `TeamState.difficulty`).
 */
import { AI_KEYS, type AiWeights } from './ai';
import type { Checker, Scope } from './check';
import type { Texts } from './types';

/** Una personalidad o una dificultad tal y como esta en ai.json. */
export interface AiStyleDef {
  id: string;
  name: Texts;
  /** La de quien no dice otra. Exactamente una de cada lista. */
  default?: boolean;
  /** Los pesos que cambia (los que no estan, los de ai.json). */
  weights: Partial<AiWeights>;
}

/** Una dificultad: ademas, el dinero con el que empieza la IA, en veces el de la partida. */
export interface AiDifficultyDef extends AiStyleDef {
  startFunds: number;
}

/** Una personalidad o una dificultad ya comprobada. */
export interface AiStyle {
  readonly id: string;
  readonly name: Texts;
  readonly isDefault: boolean;
  readonly weights: Readonly<Partial<AiWeights>>;
}

export interface AiDifficulty extends AiStyle {
  readonly startFunds: number;
}

/** El dinero de salida de una dificultad, como mucho (mas no seria dificil, seria otra partida). */
const MAX_START_FUNDS = 3;

/** Las dos listas de ai.json, sin comprobar. */
export interface AiStylesFile {
  personalities: AiStyleDef[];
  difficulties: AiDifficultyDef[];
}

/** Comprueba las personalidades y las dificultades de ai.json. */
export function validateAiStyles(ai: Partial<AiStylesFile>, check: Checker): void {
  validateList('personalities', ai.personalities, check);
  validateList('difficulties', ai.difficulties, check, (difficulty, scope) =>
    scope.num('startFunds', (difficulty as Partial<AiDifficultyDef>).startFunds, { min: 0.1, max: MAX_START_FUNDS }),
  );
}

function validateList(field: string, list: unknown, check: Checker, more?: (style: AiStyleDef, scope: Scope) => void): void {
  const top = check.scope(`ai.json ${field}`);
  if (!top.expect(Array.isArray(list) && list.length > 0, 'tiene que ser una lista con al menos una')) return;
  const styles = list as AiStyleDef[];
  const ids = new Set<string>();
  for (const style of styles) {
    const scope = check.scope(`ai.json ${field} ${typeof style?.id === 'string' ? style.id : '?'}`);
    scope.id(style?.id);
    scope.expect(!ids.has(style?.id), 'id repetido');
    ids.add(style?.id);
    scope.texts('name', style?.name);
    if (style?.default !== undefined) scope.bool('default', style.default);
    validateWeights(style?.weights, scope);
    more?.(style, scope);
  }
  top.expect(styles.filter((style) => style?.default).length === 1, 'tiene que haber exactamente una con "default": true');
}

/** Solo pesos que la IA lee, cada uno un numero no negativo. */
function validateWeights(weights: unknown, scope: Scope): void {
  const isObject = typeof weights === 'object' && weights !== null;
  if (!scope.expect(isObject, 'weights tiene que ser un objeto (vacio: como ai.json)')) return;
  for (const [weight, value] of Object.entries(weights as object)) {
    if (scope.expect((AI_KEYS as readonly string[]).includes(weight), `peso desconocido "${weight}"`)) scope.num(weight, value, { min: 0 });
  }
}

const styleOf = (def: AiStyleDef): AiStyle => ({
  id: def.id,
  name: def.name,
  isDefault: def.default === true,
  weights: { ...def.weights },
});

/** Las personalidades ya comprobadas (validateAiStyles). */
export const buildPersonalities = (ai: AiStylesFile): AiStyle[] => ai.personalities.map(styleOf);

/** Las dificultades ya comprobadas (validateAiStyles). */
export const buildDifficulties = (ai: AiStylesFile): AiDifficulty[] =>
  ai.difficulties.map((def) => ({ ...styleOf(def), startFunds: def.startFunds }));
