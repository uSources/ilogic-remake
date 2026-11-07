/** Los tipos de lo que eslint.config.js exporta ademas de la configuracion (lo usa tests/lintImports.test.ts). */
import type { Linter } from 'eslint';

/** Un patron de `no-restricted-imports`. */
interface ImportPattern {
  readonly regex: string;
  readonly message: string;
}

export const ONLY_THROUGH_RULE_MODULES: ImportPattern;
export const NO_PLUGGED_PIECES_EXCEPT_POWERS: ImportPattern;
declare const config: Linter.Config[];
export default config;
