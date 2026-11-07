/**
 * Herramienta de equilibrio de Ilogic. Ejemplos:
 *
 *   npm run balance -- run --games 200 --name actual
 *   npm run balance -- run --variant balance/variants/contraataque.json
 *   npm run balance -- run --set SETTINGS.counterattack=true --set UNIT.cost.Tank=10000 --name prueba
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
import { FIRST_SIDE, SECOND_SIDE, type Policy } from './play';
import { buildReport, compareMarkdown, DEFAULT_TARGETS, duelMarkdown, reportMarkdown, type Report, type Targets } from './report';
import { buildVariant, type Variant } from './variant';
import { runDuels, runGames } from './runner';
import { defaultContent } from '@core/content/default';
import { commandLine, usageOf, type CliArgs } from '../cliArgs';

const ROOT = new URL('../../', import.meta.url).pathname;
const REPORTS = join(ROOT, 'balance/reports');
const VARIANTS = join(ROOT, 'balance/variants');

const BALANCE_OPTIONS = {
  variant: 'text',
  set: 'texts',
  name: 'text',
  games: 'number',
  seed: 'number',
  days: 'number',
  threads: 'number',
  size: 'number',
  vs: 'text',
  first: 'number',
  swap: 'flag',
  terrain: 'text',
  duel: 'flag',
  trials: 'number',
  iterations: 'number',
  'target-days': 'text',
} as const;

type BalanceArgs = CliArgs<typeof BALANCE_OPTIONS>;

function parseValue(text: string): number | string | boolean | null {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (/^-?\d*\.?\d+$/.test(text)) return Number(text);
  return text;
}

function loadVariant(parsed: BalanceArgs): Variant {
  let variant: Variant = { name: 'actual', set: {} };
  const file = parsed.text('variant');
  if (file) {
    const path = existsSync(file) ? file : join(VARIANTS, file.endsWith('.json') ? file : `${file}.json`);
    variant = JSON.parse(readFileSync(path, 'utf8')) as Variant;
    variant.set ??= {};
  }
  for (const setting of parsed.texts('set')) {
    const separator = setting.indexOf('=');
    if (separator < 0) throw new Error(`--set necesita ruta=valor: ${setting}`);
    variant.set![setting.slice(0, separator)] = parseValue(setting.slice(separator + 1));
  }
  const name = parsed.text('name');
  if (name) variant.name = name;
  else if (parsed.texts('set').length && !file) variant.name = 'prueba';
  return variant;
}

function targetsFrom(parsed: BalanceArgs): Targets {
  const targets = { ...DEFAULT_TARGETS };
  const days = parsed.text('target-days');
  if (days) targets.days = days.split('-').map(Number) as [number, number];
  return targets;
}

function save(name: string, markdown: string, json?: unknown): string {
  mkdirSync(REPORTS, { recursive: true });
  const base = join(REPORTS, name.replace(/[^\w.-]+/g, '-'));
  writeFileSync(`${base}.md`, markdown);
  if (json !== undefined) writeFileSync(`${base}.json`, JSON.stringify(json, null, 1));
  return `${base}.md`;
}

async function evaluate(variant: Variant, parsed: BalanceArgs): Promise<Report> {
  const games = parsed.number('games', 200);
  const seed0 = parsed.number('seed', 1);
  const maxDays = parsed.number('days', 60);
  const vs = parsed.text('vs', 'ai') as Policy;
  const policies: [Policy, Policy] = vs === 'passive' ? ['passive', 'ai'] : ['ai', 'ai'];
  const threads = Math.max(1, Math.min(parsed.number('threads', cpus().length), games));
  const seeds = Array.from({ length: games }, (_, i) => seed0 + i);
  const setup = buildVariant(variant, defaultContent()); // aqui se valida: una ruta o un valor mal escrito para antes de jugar
  const changes = setup.changes;
  console.log(`Variante "${variant.name}": ${changes.length} cambios. ${games} partidas, ${threads} hilos...`);
  const records = await runGames(
    setup,
    seeds,
    maxDays,
    policies,
    threads,
    parsed.number('first') === 1 ? SECOND_SIDE : FIRST_SIDE,
    parsed.flag('swap') === true,
    parsed.number('size', 32),
  );
  const terrain = parsed.text('terrain', 'Grass');
  const duel = parsed.flag('duel') === false ? undefined : { terrain, cells: await runDuels(setup, { trials: 200, terrain, seed: seed0 }) };
  const report = buildReport(
    records,
    { name: variant.name, variant, changes, maxDays, seeds: [seeds[0]!, seeds[seeds.length - 1]!], policies: policies.join(' vs ') },
    targetsFrom(parsed),
    setup.content,
    duel,
  );
  return report;
}

function printSummary(report: Report, path: string): void {
  const outcome = report.outcome;
  console.log(
    `\n${report.name}: victorias ${outcome.wins[0]}/${outcome.wins[1]}, sin terminar ${outcome.unfinished} (ventaja ${outcome.adjudicated[0]}/${outcome.adjudicated[1]}, igualadas ${outcome.even}), dias mediana ${outcome.days.median} (${outcome.days.p10}-${outcome.days.p90})`,
  );
  for (const flag of report.flags) console.log(`  ! ${flag}`);
  for (const s of report.suggestions) console.log(`  → ${s.path}: ${s.from} → ${s.to} (${s.why})`);
  console.log(`Informe: ${path}`);
}

/** Cada orden de la herramienta (la primera palabra); sin ninguna o con otra, la ayuda. */
const COMMANDS: Record<string, (parsed: BalanceArgs) => void | Promise<void>> = {
  async run(parsed) {
    const variant = loadVariant(parsed);
    const report = await evaluate(variant, parsed);
    printSummary(report, save(report.name, reportMarkdown(report), report));
  },
  async duel(parsed) {
    const variant = loadVariant(parsed);
    const terrain = parsed.text('terrain', 'Grass');
    const cells = await runDuels(buildVariant(variant, defaultContent()), {
      trials: parsed.number('trials', 300),
      terrain,
      seed: parsed.number('seed', 1),
    });
    const path = save(`duelos-${variant.name}-${terrain}`, duelMarkdown(cells, terrain));
    console.log(`Duelos: ${path}`);
  },
  compare(parsed) {
    const [before, after] = parsed.positionals.slice(1);
    if (!before || !after) throw new Error('Uso: compare <informe-antes> <informe-despues>');
    const read = (name: string) => JSON.parse(readFileSync(name.endsWith('.json') ? name : join(REPORTS, `${name}.json`), 'utf8')) as Report;
    const markdown = compareMarkdown(read(before), read(after));
    console.log(markdown);
    save(`comparar-${before}-vs-${after}`.replace(/\.json/g, ''), markdown);
  },
  tune,
};

/** Ajuste automatico de precios: aplica las propuestas, vuelve a jugar y se queda con lo que mejore. */
async function tune(parsed: BalanceArgs): Promise<void> {
  let variant = loadVariant(parsed);
  if (!parsed.text('name')) variant.name = `${variant.name}-ajustada`;
  const iterations = parsed.number('iterations', 3);
  let best = await evaluate(variant, parsed);
  const score = (report: Report) => report.flags.length + report.suggestions.length * 0.5;
  console.log(`Punto de partida: ${best.flags.length} avisos, ${best.suggestions.length} propuestas`);
  for (let i = 1; i <= iterations && best.suggestions.length; i++) {
    const next: Variant = { ...variant, set: { ...variant.set } };
    for (const s of best.suggestions) next.set![s.path] = s.to;
    const report = await evaluate(next, parsed);
    console.log(`Ronda ${i}: ${report.flags.length} avisos, ${report.suggestions.length} propuestas`);
    if (score(report) > score(best)) {
      console.log('  No mejora: me quedo con la anterior.');
      break;
    }
    best = report;
    variant = next;
  }
  mkdirSync(VARIANTS, { recursive: true });
  const vpath = join(VARIANTS, `${variant.name}.json`);
  writeFileSync(vpath, JSON.stringify({ ...variant, notes: `Generada por "balance tune" el ${new Date().toISOString().slice(0, 10)}` }, null, 2) + '\n');
  printSummary(best, save(variant.name, reportMarkdown(best), best));
  console.log(`Variante: ${vpath}`);
}

async function main(): Promise<void> {
  const parsed = commandLine(import.meta.url, BALANCE_OPTIONS);
  const command = parsed.positionals[0] ?? 'help';
  if (Object.hasOwn(COMMANDS, command)) await COMMANDS[command]!(parsed);
  else console.log(usageOf(import.meta.url));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
