/* global setTimeout, fetch */
// Arranca un servidor de desarrollo (vite) propio para las herramientas que miran el juego en el
// navegador (npm run shots, npm run perf), en un puerto libre, y espera a que conteste. Al ser propio,
// dos herramientas a la vez (o el `npm run dev` de quien programa) no se pisan. Lo para quien lo arranco.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Devuelve { url, stop } de un servidor de desarrollo nuevo. */
export async function startDevServer() {
  const port = await freePort();
  const url = `http://localhost:${port}/`;
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await responds(url)) return { url, stop: () => child.kill() };
    await new Promise((done) => setTimeout(done, 500));
  }
  child.kill();
  throw new Error(`El servidor de desarrollo no contesta en ${url}`);
}

/** Un puerto que el sistema da por libre ahora mismo. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on('error', fail);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function responds(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
