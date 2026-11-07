/**
 * npm run play -- [--seed 7] [--size 20] [--theme Plains] [--fog | --no-fog] [--mission tutorial]
 *                 [--load partida.json] [--general Brisa] [--enemy-general Brisa]
 *                 [--script ordenes.txt | -e "move 3 5 6; end; map"]  (-e es --inline)
 * Sin --script ni -e: modo interactivo (una orden por linea; help para la lista).
 * Con ordenes por stdin tambien funciona: echo "map" | npm run play --silent
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { commandLine } from '../cliArgs';
import { TextMatch } from './textMatch';

const args = commandLine(import.meta.url, {
  seed: 'number',
  size: 'number',
  theme: 'text',
  fog: 'flag',
  mission: 'text',
  load: 'text',
  general: 'text',
  'enemy-general': 'text',
  script: 'text',
  inline: { kind: 'text', short: 'e' },
});
const saved = args.text('load');
const session = new TextMatch({
  seed: args.number('seed'),
  size: args.number('size'),
  theme: args.text('theme'),
  fog: args.flag('fog'),
  mission: args.text('mission'),
  general: args.text('general'),
  enemyGeneral: args.text('enemy-general'),
  state: saved ? readFileSync(saved, 'utf8') : undefined,
});

const inline = args.text('inline');
const script = args.text('script');
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
