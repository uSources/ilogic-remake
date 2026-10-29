/**
 * npm run play -- [--seed 7] [--size 20] [--theme 0] [--fog] [--mission tutorial] [--load partida.json]
 *                 [--script ordenes.txt | -e "move 3 5 6; end; map"]
 * Sin --script ni -e: modo interactivo (una orden por linea; help para la lista).
 * Con ordenes por stdin tambien funciona: echo "map" | npm run play --silent
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Session } from './session';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const num = (name: string) => (opt(name) === undefined ? undefined : Number(opt(name)));
const session = new Session({
  seed: num('seed'),
  size: num('size'),
  theme: num('theme'),
  fog: args.includes('--fog'),
  mission: opt('mission'),
  state: opt('load') ? readFileSync(opt('load')!, 'utf8') : undefined,
});

const inline = args.includes('-e') ? args[args.indexOf('-e') + 1] : undefined;
const script = opt('script');
const lines = inline ? inline.split(';') : script ? readFileSync(script, 'utf8').split(/\r?\n/) : null;

let failed = false;
const exec = (line: string) => {
  const out = session.run(line);
  if (out) console.log(out);
  if (out.startsWith('error:')) failed = true;
};

if (lines) {
  for (const l of lines) {
    if (!l.trim()) continue;
    console.log(`> ${l.trim()}`);
    exec(l);
  }
  process.exit(failed ? 1 : 0);
} else {
  if (process.stdin.isTTY) console.log(`${session.run('status')}\n(help para ver las ordenes, Ctrl+D para salir)`);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  if (process.stdin.isTTY) rl.setPrompt('> ');
  rl.prompt?.();
  rl.on('line', (l) => {
    if (/^(quit|exit|salir)$/i.test(l.trim())) return rl.close();
    exec(l);
    rl.prompt?.();
  });
}
