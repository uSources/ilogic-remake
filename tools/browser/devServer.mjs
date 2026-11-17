/* global setTimeout, fetch */
// Arranca el servidor de desarrollo (vite) para las herramientas que miran el juego en el navegador,
// y espera a que conteste. Lo para quien lo arranco.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Devuelve { url, stop }. Usa el puerto dado; si ya hay un servidor en el, lo reutiliza. */
export async function startDevServer(port = 5179) {
  const url = `http://localhost:${port}/`;
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await responds(url)) return { url, stop: () => child.kill() };
    await new Promise((done) => setTimeout(done, 500));
  }
  child.kill();
  throw new Error(`El servidor de desarrollo no contesta en ${url}`);
}

async function responds(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
