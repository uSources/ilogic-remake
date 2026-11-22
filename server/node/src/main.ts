/**
 * Arranca el servidor de Node (`npm run server:node` desde la raiz): lo configura con el entorno
 * (config.ts) y escucha hasta que se le pide parar (Ctrl+C o `docker stop`). Las salas quedan
 * guardadas: al arrancar otra vez, siguen.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serverConfig, type Environment } from './config';
import { startServer } from './nodeServer';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));
/** Lo que deja `vite build` en la raiz del repositorio. */
const GAME_DIR = fileURLToPath(new URL('../../../dist', import.meta.url));

const env: Environment = process.env;
const read = serverConfig(env, { dataDir: DATA_DIR, webDir: existsSync(GAME_DIR) ? GAME_DIR : null });
if (!read.ok) {
  console.error(read.error);
  process.exit(1);
}

const running = await startServer(read.options);
const serving = read.options.webDir ? `el juego (${read.options.webDir}) y las salas` : 'las salas (sin el juego)';
console.log(`Ilogic: ${serving} en ${running.url}; las salas se guardan en ${read.options.dataDir}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void running.close().then(() => process.exit(0));
  });
}
