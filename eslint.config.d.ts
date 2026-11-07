/** Los tipos de lo que eslint.config.js exporta ademas de la configuracion (lo usa tests/lintImports.test.ts). */
import type { Linter } from 'eslint';

/** Un patron de `no-restricted-imports`. */
interface ImportPattern {
  readonly regex: string;
  readonly message: string;
  readonly importNames?: readonly string[];
}

export const ONLY_THROUGH_RULE_MODULES: ImportPattern;
export const NO_PLUGGED_PIECES_EXCEPT_POWERS: ImportPattern;
export const DECIDERS_ONLY_PROPOSE: readonly ImportPattern[];
export const APPLY_STEPS: readonly ImportPattern[];
export const APPLY_STEP_NAMES: readonly string[];
declare const config: Linter.Config[];
export default config;
