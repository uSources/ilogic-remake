// Reglas de calidad del codigo (npm run lint). El formato lo pone Prettier (npm run format).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dist-single/', 'node_modules/', 'improve/', 'src/assetList.ts', 'src/atlasPages.ts', 'src/ui/*Sets.ts', 'src/ui/sheets.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      curly: ['error', 'multi-line'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Promesas sin esperar ni marcar con void: suelen ser errores que se pierden.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
    },
  },
  {
    // La logica del juego es TypeScript puro: sin Phaser, sin DOM, sin interfaz.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'preact', 'preact/*'], message: 'src/core no puede depender de Phaser ni de la interfaz.' },
            {
              group: ['../scenes/*', '../ui/*', '../hud/*', '../menu/*', '../settings', '../storage', '../music'],
              message: 'src/core no puede depender de escenas, dibujo ni interfaz.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', 'tools/**/*.ts', 'tests/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
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
  prettier,
);
