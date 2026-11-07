/**
 * Nota del juego (0-100) a partir de partidas IA contra IA: lo que el sistema de automejora intenta
 * subir sin romper nada. Cada parte mide algo que un jugador notaria.
 *
 *   npm run metrics                       120 partidas, compara con improve/baseline.json
 *   npm run metrics -- --games 300 --name prueba
 *   npm run metrics -- --save-baseline    guarda el resultado como nueva linea base (tras aceptar un cambio)
 *
 * Mitad de las partidas con los bandos cambiados en el mismo mapa: asi el mapa no favorece a nadie.
 * Resultado en improve/metrics/<nombre>.json y .md.
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildReport, decidedWins, DEFAULT_TARGETS, EARLY_SNOWBALL_DAY, type Report } from '../balance/report';
import { FIRST_TEAM } from '../balance/play';
import { runGames } from '../balance/runner';
import { buildVariant } from '../balance/variant';
import { median, sum, toTenths } from '../balance/numbers';
import { defaultContent } from '@core/content/default';
import { DEFAULT_MAP_SIZE } from '@core/match';
import { commandLine } from '../cliArgs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${ROOT}improve/metrics/`;
const BASELINE = `${ROOT}improve/baseline.json`;

export interface Part {
  id: string;
  label: string;
  /** Puntos conseguidos y maximos. */
  score: number;
  max: number;
  /** Valor medido, legible. */
  value: string;
}

export interface Metrics {
  name: string;
  date: string;
  games: number;
  size: number;
  total: number;
  parts: Part[];
  flags: string[];
  /** Precio y compras por unidad (para el equilibrador). */
  units: Report['units'];
}

const clamp01 = (fraction: number) => Math.max(0, Math.min(1, fraction));

/** Lados: el azar mueve el reparto unos NOISE_SPREAD / sqrt(N) (95 %); lo que pase de ahi resta, a cero con SIDE_EXCESS_TO_ZERO mas. */
const NOISE_SPREAD = 2;
const SIDE_EXCESS_TO_ZERO = 0.2;
/** Duracion: cada dia fuera de los objetivos resta; a cero con DAYS_OFF_TO_ZERO dias fuera. */
const DAYS_OFF_TO_ZERO = 10;
/** Partidas que terminan: a cero con esta parte sin terminar. */
const UNFINISHED_TO_ZERO = 0.3;
/** Remontadas: puntos completos si quien va delante el dia de la bola de nieve gana menos de COMEBACK_FULL_BELOW; a cero COMEBACK_RANGE mas arriba. */
const COMEBACK_FULL_BELOW = 0.95;
const COMEBACK_RANGE = 0.25;
/** Variedad: puntos completos desde esta parte de la variedad maxima. */
const FULL_VARIETY = 0.85;
/** Precios: fuera de la banda, a cero cuando la unidad rinde este factor mas (o menos) que el borde. */
const PRICE_ZERO_FACTOR = 2;

/** Lo que mide una parte de la nota: que fraccion de sus puntos se lleva (se recorta a 0-1) y el valor, legible. */
interface Measure {
  fraction: number;
  value: string;
}

/** Una parte de la nota: cuantos puntos vale y como se mide en el informe. */
interface PartDef {
  id: string;
  label: string;
  max: number;
  measure(report: Report): Measure;
}

/**
 * Ningun equipo con ventaja: ganadas de verdad o, si no terminan, con ventaja clara al final (ver
 * buildReport). Con N partidas decididas, el azar solo ya mueve el reparto unos 2/sqrt(N) puntos (95 %):
 * una diferencia menor no es ventaja de nadie, es ruido. Puntos completos dentro del ruido y bajando
 * hasta 0 cuando la diferencia lo pasa en 20 puntos. (Antes 1 % de diferencia restaba 2.5 puntos y la
 * nota se movia mas por el azar que por los cambios.)
 */
function sidesMeasure({ outcome }: Report): Measure {
  const won = decidedWins(outcome);
  const decided = sum(won);
  const shares = won.map((count) => (decided ? count / decided : 1 / won.length));
  // Lo lejos que esta el que mas se aparta del reparto igual, de 0 (todos igual) a 1 (uno lo gana todo).
  const gap = Math.max(...shares.map((share) => Math.abs(won.length * share - 1) / (won.length - 1)));
  const noise = decided ? NOISE_SPREAD / Math.sqrt(decided) : 1;
  return {
    fraction: 1 - Math.max(0, gap - noise) / SIDE_EXCESS_TO_ZERO,
    value: `${shares.map((share) => `${Math.round(share * 100)} %`).join(' / ')} (ruido ±${Math.round((noise * 100) / NOISE_SPREAD)} %)`,
  };
}

function lengthMeasure({ outcome }: Report): Measure {
  const [shortest, longest] = DEFAULT_TARGETS.days;
  const days = outcome.days.median;
  const daysOutside = days < shortest ? shortest - days : days > longest ? days - longest : 0;
  return { fraction: 1 - daysOutside / DAYS_OFF_TO_ZERO, value: `${days} dias` };
}

function finishedMeasure(report: Report): Measure {
  const unfinished = report.outcome.unfinished / Math.max(1, report.games);
  return { fraction: 1 - unfinished / UNFINISHED_TO_ZERO, value: `${Math.round(unfinished * 100)} % sin terminar` };
}

function comebackMeasure(report: Report): Measure {
  const early = report.snowball.find((point) => point.day === EARLY_SNOWBALL_DAY)?.leaderWins ?? null;
  if (early === null) return { fraction: 1, value: '-' };
  return { fraction: (COMEBACK_FULL_BELOW - early) / COMEBACK_RANGE, value: `${Math.round(early * 100)} %` };
}

/** Variedad de compras: la entropia del reparto entre tipos, sobre la maxima posible. */
function varietyMeasure(report: Report): Measure {
  const bought = report.units.map((unitRow) => unitRow.bought).filter((count) => count > 0);
  const total = sum(bought);
  const entropy = -bought.reduce((amount, count) => amount + (count / total) * Math.log(count / total), 0);
  const variety = report.units.length > 1 ? entropy / Math.log(report.units.length) : 0;
  return { fraction: variety / FULL_VARIETY, value: `${Math.round(variety * 100)} % de la variedad maxima` };
}

/**
 * Rendimiento de cada unidad (valor destruido por coste) respecto a la mediana: dentro de la banda
 * cuenta entero; fuera, cada vez menos segun lo lejos (en escala logaritmica: 2x por encima de la
 * banda = 0). Asi acercar una unidad a la banda suma aunque aun no entre, y una que roza el borde no
 * hace saltar la nota.
 */
function pricesMeasure(report: Report): Measure {
  const [bandLow, bandHigh] = DEFAULT_TARGETS.efficiencyBand;
  const efficiencies = report.units.map((unitRow) => unitRow.efficiency).filter((entry): entry is number => entry !== null);
  const middle = efficiencies.length ? median(efficiencies) : 1;
  const bandFit = (value: number) => {
    const logRatio = Math.log(value / middle);
    const outsideBand =
      logRatio > Math.log(bandHigh) ? logRatio - Math.log(bandHigh) : logRatio < Math.log(bandLow) ? Math.log(bandLow) - logRatio : 0;
    return clamp01(1 - outsideBand / Math.log(PRICE_ZERO_FACTOR));
  };
  const inBand = efficiencies.filter((value) => value >= middle * bandLow && value <= middle * bandHigh).length;
  const priceFit = efficiencies.length ? efficiencies.reduce((amount, value) => amount + bandFit(value), 0) / efficiencies.length : 1;
  return { fraction: priceFit, value: `${inBand} de ${efficiencies.length} en la banda, ajuste ${Math.round(priceFit * 100)} %` };
}

/** Las partes de la nota, en orden; suman 100. */
const PARTS: readonly PartDef[] = [
  { id: 'lados', label: 'Ningun bando con ventaja (ganadas o con ventaja clara)', max: 25, measure: sidesMeasure },
  {
    id: 'duracion',
    label: `Duracion (mediana entre ${DEFAULT_TARGETS.days[0]} y ${DEFAULT_TARGETS.days[1]} dias)`,
    max: 15,
    measure: lengthMeasure,
  },
  { id: 'decididas', label: 'Partidas que terminan', max: 15, measure: finishedMeasure },
  {
    id: 'remontadas',
    label: `Se puede remontar (quien va delante el dia ${EARLY_SNOWBALL_DAY} no gana siempre)`,
    max: 15,
    measure: comebackMeasure,
  },
  { id: 'variedad', label: 'Variedad de unidades compradas', max: 15, measure: varietyMeasure },
  { id: 'precios', label: 'Unidades que rinden lo que cuestan', max: 15, measure: pricesMeasure },
];

function scorePart(part: PartDef, report: Report): Part {
  const { fraction, value } = part.measure(report);
  return { id: part.id, label: part.label, max: part.max, score: toTenths(part.max * clamp01(fraction)), value };
}

/** Convierte el informe de equilibrio en la nota por partes. */
export function score(report: Report, size: number): Metrics {
  const parts = PARTS.map((part) => scorePart(part, report));
  return {
    name: report.name,
    date: new Date().toISOString().slice(0, 10),
    games: report.games,
    size,
    total: toTenths(sum(parts.map((part) => part.score))),
    parts,
    flags: report.flags,
    units: report.units,
  };
}

export function metricsMarkdown(metrics: Metrics, base?: Metrics | null): string {
  const delta = (id: string, value: number) => {
    const baseScore = base?.parts.find((part) => part.id === id)?.score;
    return baseScore === undefined ? '' : ` (${value - baseScore >= 0 ? '+' : ''}${(value - baseScore).toFixed(1)})`;
  };
  const rows = metrics.parts
    .map((part) => `| ${part.label} | ${part.value} | ${part.score} / ${part.max}${delta(part.id, part.score)} |`)
    .join('\n');
  const againstBase = base
    ? ` (linea base ${base.total}, ${metrics.total - base.total >= 0 ? '+' : ''}${(metrics.total - base.total).toFixed(1)})`
    : '';
  return `# Nota del juego: ${metrics.total} / 100${againstBase}

${metrics.games} partidas IA contra IA en mapas de ${metrics.size}x${metrics.size} (mitad con los bandos cambiados), ${metrics.date}.

| Parte | Medido | Puntos |
|---|---|---|
${rows}

${metrics.flags.length ? `Avisos del informe de equilibrio:\n${metrics.flags.map((flag) => `- ${flag}`).join('\n')}\n` : ''}`;
}

/** Partidas por defecto (la mitad de mapas, cada uno dos veces con las salidas cambiadas) y sus dias. */
const DEFAULT_GAMES = 120;
const METRICS_DAYS = 40;

/** El informe de equilibrio de la nota: la IA contra si misma, cada mapa dos veces (con las salidas giradas). */
async function metricsReport(name: string, games: number, size: number): Promise<Report> {
  const threads = Math.max(1, Math.min(cpus().length, games));
  const seeds = Array.from({ length: Math.ceil(games / 2) }, (_, index) => 1 + index);
  const variant = { name, set: {} };
  const setup = buildVariant(variant, defaultContent());
  const run = { seeds, maxDays: METRICS_DAYS, policies: ['ai', 'ai'] as const, threads, firstTeam: FIRST_TEAM, size };
  const records = await runGames(setup, { ...run, rotateStarts: 0 });
  const mirrored = await runGames(setup, { ...run, rotateStarts: 1 });
  return buildReport(
    [...records, ...mirrored],
    { name, variant, changes: [], maxDays: METRICS_DAYS, seeds: [1, seeds.length], policies: 'ai-ai' },
    DEFAULT_TARGETS,
    setup.content,
  );
}

/** La linea base guardada, si es comparable (mismas partidas y mismo mapa). */
const comparableBase = (base: Metrics | null, metrics: Metrics): Metrics | null =>
  base && base.games === metrics.games && base.size === metrics.size ? base : null;

async function main(): Promise<void> {
  const args = commandLine(import.meta.url, { games: 'number', size: 'number', name: 'text', 'save-baseline': 'flag' });
  const games = args.number('games', DEFAULT_GAMES);
  const size = args.number('size', DEFAULT_MAP_SIZE);
  const name = args.text('name', 'actual');
  const metrics = score(await metricsReport(name, games, size), size);
  const base = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Metrics) : null;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(metrics, null, 1));
  const markdown = metricsMarkdown(metrics, comparableBase(base, metrics));
  writeFileSync(`${OUT}${name}.md`, markdown);
  console.log(markdown);
  if (args.flag('save-baseline')) {
    writeFileSync(BASELINE, JSON.stringify(metrics, null, 1));
    console.log('Guardado como linea base (improve/baseline.json).');
  } else if (base && !comparableBase(base, metrics)) {
    console.log(`(La linea base es de ${base.games} partidas de ${base.size}x${base.size}: no se compara.)`);
  }
}

if (process.argv[1]?.endsWith('metrics.ts')) await main();
