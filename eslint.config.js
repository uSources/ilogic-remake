// Reglas de calidad del codigo (npm run lint). El formato lo pone Prettier (npm run format).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** El nucleo no depende de Phaser, ni del DOM, ni de la interfaz. */
const CORE_IS_PURE = [
  { group: ['phaser', 'preact', 'preact/*'], message: 'src/core no puede depender de Phaser ni de la interfaz.' },
  {
    group: ['../scenes/*', '../ui/*', '../hud/*', '../menu/*', '../settings', '../storage', '../music'],
    message: 'src/core no puede depender de escenas, dibujo ni interfaz.',
  },
];
/** El contenido del juego solo lo eligen estos dos: el resto del nucleo usa el de la partida. */
const DEFAULT_CONTENT_FILES = ['src/core/defaultGames.ts', 'src/core/content/default.ts'];
const NO_DEFAULT_CONTENT = {
  group: [
    './defaultGames',
    '../defaultGames',
    '../../defaultGames',
    './content/default',
    '../content/default',
    '../../content/default',
    './default',
  ],
  message: 'El nucleo usa el contenido de la partida (tablesOf(s)); el del juego solo lo eligen defaultGames.ts y quien crea la partida.',
};

/**
 * Fuera del nucleo la partida solo cambia con acciones (core/actions.ts, `dispatch`), y el nucleo se
 * usa por sus fachadas: los modulos de dentro (rules/, squads/, actions/, ai/) tienen lo que cambia la
 * partida sin comprobarlo.
 */
const CORE_FACADES_ONLY = [
  {
    group: [
      '**/core/rules/*',
      '**/core/squads/*',
      '**/core/actions/*',
      '**/core/ai/*',
      '**/core/autopilot/*',
      '**/core/controllers/*',
      '@core/rules/*',
      '@core/squads/*',
      '@core/actions/*',
      '@core/ai/*',
      '@core/autopilot/*',
      '@core/controllers/*',
    ],
    message:
      "Fuera del nucleo se usan sus fachadas ('core/rules', 'core/squads', 'core/actions', 'core/ai', 'core/autopilot', 'core/controllers'); la partida cambia con dispatch.",
  },
  {
    group: ['**/core/generalPowers', '@core/generalPowers'],
    importNames: ['applyPower'],
    message: "Un poder se usa con la accion 'usePower' (dispatch).",
  },
];

/**
 * El banco de pruebas (core/sandbox.ts: combate sin comprobar) es de las herramientas y los tests, no
 * del juego: ningun fichero de src/ lo importa, con la ruta que sea (con o sin `.ts`, por alias).
 */
const SANDBOX_IS_NOT_THE_GAME = {
  regex: '(^|/)sandbox(\\.ts)?$',
  message: 'core/sandbox.ts no comprueba nada: es para tools/ y tests/. El juego cambia la partida con dispatch.',
};
/** El combate sin comprobar (`resolveAttack`) solo lo usan la accion 'attack' (su propio modulo) y sandbox.ts. */
const UNCHECKED_ATTACK_ONLY_IN_SANDBOX = {
  regex: '(^|/)actions/combat(\\.ts)?$|^\\./combat(\\.ts)?$',
  importNames: ['resolveAttack'],
  message: "resolveAttack no comprueba nada: el juego ataca con la accion 'attack' (dispatch); fuera de una partida, core/sandbox.ts.",
};
/**
 * Las reglas, las acciones, las ordenes permanentes y la sesion no dependen de la IA (ai/, ai.ts,
 * aiGenerals.ts, ni los controladores que la usan): una partida se juega, se repite o se lleva en un
 * servidor sin cargarla. La IA es un jugador mas: reutiliza autopilot/, no al reves.
 */
const NOT_THE_AI_FILES = [
  'src/core/actions/**/*.ts',
  'src/core/actions.ts',
  'src/core/rules/**/*.ts',
  'src/core/rules.ts',
  'src/core/squads/**/*.ts',
  'src/core/squads.ts',
  'src/core/autopilot/**/*.ts',
  'src/core/autopilot.ts',
  'src/core/session/**/*.ts',
  'src/core/session.ts',
];
const NO_AI = {
  regex: '(^|/)(ai|aiGenerals|controllers)(\\.ts)?(/.*)?$',
  message:
    'Las reglas, las acciones, las ordenes y la sesion no importan la IA (ai/, ai.ts, aiGenerals.ts, controllers/): la IA reutiliza autopilot/.',
};
/**
 * I1/I2: quien decide por un equipo (la IA: ai/, ai.ts, aiGenerals.ts; y los pasos de autopilot/)
 * solo propone acciones (`ActionPlan`) y solo lee la vista de su equipo (`PlayerView`): no manda
 * nada (ni dispatch ni la sesion), no se hace su propia vista de la partida de verdad y no tira de
 * los dados de la partida. Lo prueba tests/lintImports.test.ts.
 */
export const DECIDERS_ONLY_PROPOSE = [
  {
    regex: '(^|/)(actions/dispatch|actions)(\\.ts)?$|(^|/)session(\\.ts)?(/.*)?$',
    message: 'Quien decide (la IA, autopilot/) no manda acciones: las propone (ActionPlan) y las manda quien cumple el plan.',
  },
  {
    regex: '(^|/)playerView(\\.ts)?$',
    importNames: ['playerView'],
    message: 'Quien decide recibe la vista de su equipo (PlayerView): no se la hace de la partida de verdad.',
  },
  {
    regex: '(^|/)dice(\\.ts)?$',
    importNames: ['diceOf'],
    message: 'Los dados son de las reglas: quien decide usa su propio azar (decisionRng, que le da su controlador).',
  },
];
const AI_FILES = ['src/core/ai/**/*.ts', 'src/core/ai.ts', 'src/core/aiGenerals.ts'];
const AUTOPILOT_FILES = ['src/core/autopilot/**/*.ts', 'src/core/autopilot.ts'];

/**
 * L7: las reglas y las acciones no importan las piezas que se enchufan (generales, sus poderes, el
 * clima, las habilidades) ni los modulos de reglas concretos o su lista: preguntan a la partida por lo
 * que aportan (ruleModules/ruleset.ts) y los tipos de lo que se puede aportar (ruleModules/hooks.ts).
 * Vale con cualquier forma de la ruta: la pieza es el ultimo trozo y lo de antes sube o es el nucleo
 * (`../`, `./../`, `../util/../`, `../../core/`, `@core/`), con o sin extension (`.ts`, `.js`). Lo del
 * contenido (`content/abilities`, `model/weather`) no es una pieza y si se puede. La lista de
 * acciones (actions/registry.ts) es la excepcion: junta la accion de los poderes, que vive con ellos.
 * Tampoco las fachadas (`../rules`, `../actions`, `@core/rules`...), que las reexportan. Lo prueba
 * tests/lintImports.test.ts (los patrones y que la configuracion de verdad los pone).
 */
const PIECE_PATH = '(^|/)(\\.\\.?|@?core)/';
const EXTENSION = '(\\.[jt]s)?$';
const pluggedPieces = (pieces) => ({
  regex: `${PIECE_PATH}(${pieces})${EXTENSION}|${PIECE_PATH}ruleModules/(?!(hooks|ruleset)${EXTENSION})`,
  message:
    'Las reglas y las acciones no importan generales, poderes, clima, habilidades ni modulos concretos: lo que aportan llega por GameState.ruleset (hooksOf, ruleModules/ruleset.ts).',
});
/** Las fachadas (rules.ts, actions.ts, un index) reexportan las piezas: por ahi tambien se saltaria L7. */
const FACADES = 'rules|actions|index';
export const ONLY_THROUGH_RULE_MODULES = pluggedPieces(`generals|generalPowers|weather|abilities|${FACADES}`);
const ACTION_LIST_FILE = 'src/core/actions/registry.ts';
export const NO_PLUGGED_PIECES_EXCEPT_POWERS = pluggedPieces(`generals|weather|abilities|${FACADES}`);

/** Lo que se prohibe en todo el nucleo (cada bloque de src/core lo repite, porque cada uno pone su lista entera). */
const CORE_LIMITS = [...CORE_IS_PURE, SANDBOX_IS_NOT_THE_GAME, UNCHECKED_ATTACK_ONLY_IN_SANDBOX];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'dist-single/',
      'node_modules/',
      'improve/',
      'src/assetList.ts',
      'src/atlasPages.ts',
      'src/ui/*Sets.ts',
      'src/ui/sheets.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      // Un import por modulo (los tipos van dentro, con `type`).
      'no-duplicate-imports': 'error',
      curly: ['error', 'multi-line'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Promesas sin esperar ni marcar con void: suelen ser errores que se pierden.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
    },
  },
  {
    // La logica del juego es TypeScript puro: sin Phaser, sin DOM, sin interfaz. Y no elige contenido:
    // lo recibe con la partida (solo defaultGames.ts y content/default.ts conocen el del juego).
    files: ['src/core/**/*.ts'],
    ignores: DEFAULT_CONTENT_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
  {
    files: DEFAULT_CONTENT_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_LIMITS }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
  {
    // Sin la IA debajo de las reglas (NO_AI): la ultima de las de todo el nucleo para estos ficheros.
    files: NOT_THE_AI_FILES,
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT, NO_AI] }] },
  },
  {
    // La IA solo propone y solo lee su vista (DECIDERS_ONLY_PROPOSE).
    files: AI_FILES,
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT, ...DECIDERS_ONLY_PROPOSE] }] },
  },
  {
    // Y autopilot/, ademas, sin la IA (NO_AI).
    files: AUTOPILOT_FILES,
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT, NO_AI, ...DECIDERS_ONLY_PROPOSE] }] },
  },
  {
    // Y las reglas y las acciones, ademas, sin las piezas que se enchufan (ONLY_THROUGH_RULE_MODULES).
    files: ['src/core/rules/**/*.ts', 'src/core/actions/**/*.ts'],
    ignores: [ACTION_LIST_FILE],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT, NO_AI, ONLY_THROUGH_RULE_MODULES] }] },
  },
  {
    files: [ACTION_LIST_FILE],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...CORE_LIMITS, NO_DEFAULT_CONTENT, NO_AI, NO_PLUGGED_PIECES_EXCEPT_POWERS] }],
    },
  },
  {
    // El modelo es la capa de abajo del nucleo: solo tipos, sin depender de nada (ni del contenido).
    files: ['src/core/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Nada de fuera de model/: ni otras carpetas (../), ni alias (@core/...), ni paquetes.
          patterns: [{ regex: '^(?!\\./)', message: 'src/core/model no depende de nada: solo tipos de partida (importa solo de ./).' }],
        },
      ],
      // Solo tipos: las constantes y funciones van fuera del modelo (p. ej. CONTROLLER_KINDS en teams.ts).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > :matches(VariableDeclaration, FunctionDeclaration, ClassDeclaration)',
          message: 'src/core/model solo tiene tipos.',
        },
        { selector: 'TSEnumDeclaration', message: 'src/core/model solo tiene tipos (sin enum).' },
      ],
    },
  },
  {
    // Leer partidas no depende del catalogo de misiones: lo da quien lee (SaveContext).
    files: ['src/core/save.ts', 'src/core/saveMigrations.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...CORE_LIMITS,
            NO_DEFAULT_CONTENT,
            { group: ['./missions'], message: 'save.ts recibe las reglas de las misiones en SaveContext.' },
          ],
        },
      ],
    },
  },
  {
    // El banco de pruebas es el unico sitio del nucleo que usa el combate sin comprobar.
    files: ['src/core/sandbox.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_IS_PURE, NO_DEFAULT_CONTENT] }] },
  },
  {
    files: ['**/*.js', '**/*.mjs', 'tools/**/*.ts', 'tests/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/core/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_FACADES_ONLY, SANDBOX_IS_NOT_THE_GAME] }] },
  },
  {
    // Las herramientas solo usan el nucleo, y por su alias: asi se podrian separar en su propio paquete
    // sin tocar nada (ver docs/ARQUITECTURA.md, "Herramientas").
    files: ['tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src', '**/src/**'],
              message: "tools/ solo puede usar el nucleo del juego, importandolo como '@core/...' (nada de escenas, interfaz ni ajustes).",
            },
            { group: ['phaser', 'preact', 'preact/*'], message: 'tools/ no puede depender de Phaser ni de la interfaz.' },
            ...CORE_FACADES_ONLY,
          ],
        },
      ],
    },
  },
  {
    // Los tests pueden probar la interfaz (../src/ui...), pero el nucleo se importa por su alias.
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/src/core', '**/src/core/**'], message: "Importa el nucleo como '@core/...'." }] },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  {
    // Lo que va dentro de page.evaluate() se ejecuta en el navegador.
    files: ['tests/visual/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { window: 'readonly', localStorage: 'readonly', document: 'readonly' } },
  },
  {
    // El service worker de la PWA se ejecuta en el navegador, fuera de la pagina.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Promise: 'readonly', URL: 'readonly' },
    },
  },
  prettier,
);
