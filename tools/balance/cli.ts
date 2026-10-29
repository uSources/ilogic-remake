/**
 * Herramienta de equilibrio de Ilogic. Ejemplos:
 *
 *   npm run balance -- run --games 200 --name actual
 *   npm run balance -- run --variant balance/variants/contraataque.json
 *   npm run balance -- run --set RULES.counterattack=true --set UNIT.cost.Tank=10000 --name prueba
 *   npm run balance -- duel --terrain Woods
 *   npm run balance -- compare actual prueba
 *   npm run balance -- tune --iterations 3 --games 150
 *
 * Informes en balance/reports/<nombre>.md y .json. Todas las variantes usan las mismas semillas
 * por defecto, asi que las diferencias entre informes se deben a los cambios y no a la suerte.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { duelMatrix } from './duel';
import type { GameRecord, Policy } from './play';
import { buildReport, compareMarkdown, DEFAULT_TARGETS, duelMarkdown, reportMarkdown, type Report, type Targets } from './report';
import { applyVariant, restore, snapshot, type Variant } from './variant';

const ROOT = new URL('../../', import.meta.url).pathname;
const REPORTS = join(ROOT, 'balance/reports');
const VARIANTS = join(ROOT, 'balance/variants');

function args(argv: string[]) {
  const out: Record<string, string[]> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
      (out[key] ??= []).push(v);
    } else pos.push(a);
  }
  const one = (k: string, d?: string) => out[k]?.[out[k]!.length - 1] ?? d;
  return { pos, all: (k: string) => out[k] ?? [], one, num: (k: string, d: number) => Number(one(k, String(d))) };
}

function parseValue(v: string): number | string | boolean | null {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d*\.?\d+$/.test(v)) return Number(v);
  return v;
}

function loadVariant(a: ReturnType<typeof args>): Variant {
  let v: Variant = { name: 'actual', set: {} };
  const file = a.one('variant');
  if (file) {
    const path = existsSync(file) ? file : join(VARIANTS, file.endsWith('.json') ? file : `${file}.json`);
    v = JSON.parse(readFileSync(path, 'utf8')) as Variant;
    v.set ??= {};
  }
  for (const kv of a.all('set')) {
    const i = kv.indexOf('=');
    if (i < 0) throw new Error(`--set necesita ruta=valor: ${kv}`);
    v.set![kv.slice(0, i)] = parseValue(kv.slice(i + 1));
  }
  if (a.one('name')) v.name = a.one('name')!;
  else if (a.all('set').length && !file) v.name = 'prueba';
  return v;
}

function targetsFrom(a: ReturnType<typeof args>): Targets {
  const t = { ...DEFAULT_TARGETS };
  const d = a.one('target-days');
  if (d) t.days = d.split('-').map(Number) as [number, number];
  return t;
}

async function runGames(
  variant: Variant,
  seeds: number[],
  maxDays: number,
  policies: [Policy, Policy],
  threads: number,
  firstTeam: 0 | 1 = 0,
  swapSides = false,
  size = 32,
): Promise<GameRecord[]> {
  const chunks: number[][] = Array.from({ length: threads }, () => []);
  seeds.forEach((s, i) => chunks[i % threads]!.push(s));
  const records: GameRecord[] = [];
  let done = 0;
  const started = Date.now();
  await Promise.all(
    chunks
      .filter((c) => c.length)
      .map(
        (c) =>
          new Promise<void>((resolve, reject) => {
            const w = new Worker(new URL('./worker.ts', import.meta.url), {
              workerData: { variant, seeds: c, maxDays, policies, firstTeam, swapSides, size },
              execArgv: ['--import', 'tsx'],
            });
            w.on('message', (r: GameRecord) => {
              records.push(r);
              done++;
              if (process.stderr.isTTY || done % 25 === 0 || done === seeds.length)
                process.stderr.write(`\r  ${done}/${seeds.length} partidas (${((Date.now() - started) / 1000).toFixed(0)} s)   `);
            });
            w.on('error', reject);
            w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`hilo terminado con codigo ${code}`))));
          }),
      ),
  );
  process.stderr.write('\n');
  return records.sort((x, y) => x.seed - y.seed);
}

function save(name: string, md: string, json?: unknown): string {
  mkdirSync(REPORTS, { recursive: true });
  const base = join(REPORTS, name.replace(/[^\w.-]+/g, '-'));
  writeFileSync(`${base}.md`, md);
  if (json !== undefined) writeFileSync(`${base}.json`, JSON.stringify(json, null, 1));
  return `${base}.md`;
}

async function evaluate(variant: Variant, a: ReturnType<typeof args>): Promise<Report> {
  const games = a.num('games', 200);
  const seed0 = a.num('seed', 1);
  const maxDays = a.num('days', 60);
  const vs = a.one('vs', 'ai') as Policy;
  const policies: [Policy, Policy] = vs === 'passive' ? ['passive', 'ai'] : ['ai', 'ai'];
  const threads = Math.max(1, Math.min(a.num('threads', cpus().length), games));
  const seeds = Array.from({ length: games }, (_, i) => seed0 + i);
  const snap = snapshot();
  const changes = applyVariant(variant); // en este hilo: para el informe, los duelos y la validacion
  console.log(`Variante "${variant.name}": ${changes.length} cambios. ${games} partidas, ${threads} hilos...`);
  const records = await runGames(
    variant,
    seeds,
    maxDays,
    policies,
    threads,
    a.one('first') === '1' ? 1 : 0,
    a.one('swap') === 'true',
    a.num('size', 32),
  );
  const terrain = a.one('terrain', 'Grass')!;
  const duel = a.one('no-duel') ? undefined : { terrain, cells: duelMatrix({ trials: 200, terrain, seed: seed0 }) };
  const report = buildReport(
    records,
    { name: variant.name, variant, changes, maxDays, seeds: [seeds[0]!, seeds[seeds.length - 1]!], policies: policies.join(' vs ') },
    targetsFrom(a),
    duel,
  );
  restore(snap);
  return report;
}

function printSummary(r: Report, path: string): void {
  const o = r.outcome;
  console.log(
    `\n${r.name}: victorias ${o.wins[0]}/${o.wins[1]}, sin terminar ${o.unfinished} (ventaja ${o.adjudicated[0]}/${o.adjudicated[1]}, igualadas ${o.even}), dias mediana ${o.days.median} (${o.days.p10}-${o.days.p90})`,
  );
  for (const f of r.flags) console.log(`  ! ${f}`);
  for (const s of r.suggestions) console.log(`  → ${s.path}: ${s.from} → ${s.to} (${s.why})`);
  console.log(`Informe: ${path}`);
}

async function main(): Promise<void> {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const a = args(rest);
  switch (cmd) {
    case 'run': {
      const variant = loadVariant(a);
      const r = await evaluate(variant, a);
      printSummary(r, save(r.name, reportMarkdown(r), r));
      return;
    }
    case 'duel': {
      const variant = loadVariant(a);
      applyVariant(variant);
      const terrain = a.one('terrain', 'Grass')!;
      const cells = duelMatrix({ trials: a.num('trials', 300), terrain, seed: a.num('seed', 1) });
      const path = save(`duelos-${variant.name}-${terrain}`, duelMarkdown(cells, terrain));
      console.log(`Duelos: ${path}`);
      return;
    }
    case 'compare': {
      const [x, y] = a.pos;
      if (!x || !y) throw new Error('Uso: compare <informe-antes> <informe-despues>');
      const read = (n: string) => JSON.parse(readFileSync(n.endsWith('.json') ? n : join(REPORTS, `${n}.json`), 'utf8')) as Report;
      const md = compareMarkdown(read(x), read(y));
      console.log(md);
      save(`comparar-${x}-vs-${y}`.replace(/\.json/g, ''), md);
      return;
    }
    case 'tune': {
      // Ajuste automatico de precios: aplica las propuestas, vuelve a jugar y se queda con lo que mejore.
      let variant = loadVariant(a);
      if (!a.one('name')) variant.name = `${variant.name}-ajustada`;
      const iterations = a.num('iterations', 3);
      let best = await evaluate(variant, a);
      const score = (r: Report) => r.flags.length + r.suggestions.length * 0.5;
      console.log(`Punto de partida: ${best.flags.length} avisos, ${best.suggestions.length} propuestas`);
      for (let i = 1; i <= iterations && best.suggestions.length; i++) {
        const next: Variant = { ...variant, set: { ...variant.set } };
        for (const s of best.suggestions) next.set![s.path] = s.to;
        const r = await evaluate(next, a);
        console.log(`Ronda ${i}: ${r.flags.length} avisos, ${r.suggestions.length} propuestas`);
        if (score(r) <= score(best)) {
          best = r;
          variant = next;
        } else {
          console.log('  No mejora: me quedo con la anterior.');
          break;
        }
      }
      mkdirSync(VARIANTS, { recursive: true });
      const vpath = join(VARIANTS, `${variant.name}.json`);
      writeFileSync(
        vpath,
        JSON.stringify({ ...variant, notes: `Generada por "balance tune" el ${new Date().toISOString().slice(0, 10)}` }, null, 2) + '\n',
      );
      printSummary(best, save(variant.name, reportMarkdown(best), best));
      console.log(`Variante: ${vpath}`);
      return;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
