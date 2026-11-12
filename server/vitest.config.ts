/**
 * Dos clases de tests: los de las piezas puras del servidor (test/unit, en Node, con la sala del
 * nucleo de verdad) y los de integracion (test/workers), que corren dentro de workerd con el Worker y
 * el Durable Object de verdad (@cloudflare/vitest-plugin, con la configuracion de wrangler.toml).
 */
import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const core = fileURLToPath(new URL('../src/core', import.meta.url));
/** El nucleo se importa como '@core/...' (tsconfig.json "paths"); los tests de fuera de server/ tambien. */
const resolve = { alias: { '@core': core } };
/** Los tests reutilizan el cliente simulado de tests/sim: Vite tiene que poder servir ficheros de fuera de server/. */
const server = { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } };

export default defineConfig({
  resolve,
  server,
  test: {
    projects: [
      { resolve, server, test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      {
        resolve,
        server,
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
        test: { name: 'workers', include: ['test/workers/**/*.test.ts'], testTimeout: 60_000 },
      },
    ],
  },
});
