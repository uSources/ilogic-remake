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
      '@core/rules/*',
      '@core/squads/*',
      '@core/actions/*',
      '@core/ai/*',
    ],
    message:
      "Fuera del nucleo se usan sus fachadas ('core/rules', 'core/squads', 'core/actions', 'core/ai'); la partida cambia con dispatch.",
  },
  {
    group: ['**/core/generals', '@core/generals'],
    importNames: ['applyPower'],
    message: "Un poder se usa con la accion 'usePower' (dispatch).",
  },
];

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
      'no-restricted-imports': ['error', { patterns: [...CORE_IS_PURE, NO_DEFAULT_CONTENT] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
  {
    files: DEFAULT_CONTENT_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_IS_PURE }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
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
            ...CORE_IS_PURE,
            NO_DEFAULT_CONTENT,
            { group: ['./missions'], message: 'save.ts recibe las reglas de las misiones en SaveContext.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', 'tools/**/*.ts', 'tests/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/core/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: CORE_FACADES_ONLY }] },
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
