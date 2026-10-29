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
import { buildReport, DEFAULT_TARGETS, type Report } from '../balance/report';
import { runGames } from '../balance/runner';

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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Convierte el informe de equilibrio en la nota por partes. */
export function score(r: Report, size: number): Metrics {
  const o = r.outcome;
  const parts: Part[] = [];
  const add = (id: string, label: string, max: number, frac: number, value: string) =>
    parts.push({ id, label, max, score: Math.round(max * clamp01(frac) * 10) / 10, value });

  // Ganadas de verdad o, si no terminan, con ventaja clara al final (ver buildReport).
  const eff = [o.wins[0] + o.adjudicated[0], o.wins[1] + o.adjudicated[1]];
  const decided = eff[0]! + eff[1]!;
  const rate0 = decided ? eff[0]! / decided : 0.5;
  add('lados', 'Ningun bando con ventaja (ganadas o con ventaja clara)', 25, 1 - Math.abs(2 * rate0 - 1) / 0.2, `${Math.round(rate0 * 100)} % / ${Math.round((1 - rate0) * 100)} %`);
  const [lo, hi] = DEFAULT_TARGETS.days;
  const med = o.days.median;
  const off = med < lo ? lo - med : med > hi ? med - hi : 0;
  add('duracion', `Duracion (mediana entre ${lo} y ${hi} dias)`, 15, 1 - off / 10, `${med} dias`);
  const unfinished = o.unfinished / Math.max(1, r.games);
  add('decididas', 'Partidas que terminan', 15, 1 - unfinished / 0.3, `${Math.round(unfinished * 100)} % sin terminar`);
  const s5 = r.snowball.find((x) => x.day === 5)?.leaderWins ?? null;
  add('remontadas', 'Se puede remontar (quien va delante el dia 5 no gana siempre)', 15, s5 === null ? 1 : (0.95 - s5) / 0.25, s5 === null ? '-' : `${Math.round(s5 * 100)} %`);
  const bought = r.units.map((u) => u.bought).filter((b) => b > 0);
  const total = bought.reduce((a, b) => a + b, 0);
  const H = -bought.reduce((a, b) => a + (b / total) * Math.log(b / total), 0);
  const variety = r.units.length > 1 ? H / Math.log(r.units.length) : 0;
  add('variedad', 'Variedad de unidades compradas', 15, variety / 0.85, `${Math.round(variety * 100)} % de la variedad maxima`);
  const [blo, bhi] = DEFAULT_TARGETS.efficiencyBand;
  const effs = r.units.map((u) => u.efficiency).filter((e): e is number => e !== null);
  const med2 = [...effs].sort((a, b) => a - b)[Math.floor(effs.length / 2)] ?? 1;
  const inBand = effs.filter((e) => e >= med2 * blo && e <= med2 * bhi).length;
  add('precios', 'Unidades que rinden lo que cuestan', 15, effs.length ? inBand / effs.length : 1, `${inBand} de ${effs.length}`);

  return {
    name: r.name,
    date: new Date().toISOString().slice(0, 10),
    games: r.games,
    size,
    total: Math.round(parts.reduce((a, p) => a + p.score, 0) * 10) / 10,
    parts,
    flags: r.flags,
    units: r.units,
  };
}

export function metricsMarkdown(m: Metrics, base?: Metrics | null): string {
  const delta = (id: string, v: number) => {
    const b = base?.parts.find((p) => p.id === id)?.score;
    return b === undefined ? '' : ` (${v - b >= 0 ? '+' : ''}${(v - b).toFixed(1)})`;
  };
  const rows = m.parts.map((p) => `| ${p.label} | ${p.value} | ${p.score} / ${p.max}${delta(p.id, p.score)} |`).join('\n');
  const tot = base ? ` (linea base ${base.total}, ${m.total - base.total >= 0 ? '+' : ''}${(m.total - base.total).toFixed(1)})` : '';
  return `# Nota del juego: ${m.total} / 100${tot}

${m.games} partidas IA contra IA en mapas de ${m.size}x${m.size} (mitad con los bandos cambiados), ${m.date}.

| Parte | Medido | Puntos |
|---|---|---|
${rows}

${m.flags.length ? `Avisos del informe de equilibrio:\n${m.flags.map((f) => `- ${f}`).join('\n')}\n` : ''}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
  const games = Number(opt('games') ?? 120);
  const size = Number(opt('size') ?? 32);
  const name = opt('name') ?? 'actual';
  const threads = Math.max(1, Math.min(cpus().length, games));
  const seeds = Array.from({ length: Math.ceil(games / 2) }, (_, i) => 1 + i);
  const variant = { name, set: {} };
  const a = await runGames(variant, seeds, 40, ['ai', 'ai'], threads, 0, false, size);
  const b = await runGames(variant, seeds, 40, ['ai', 'ai'], threads, 0, true, size);
  const report = buildReport([...a, ...b], { name, variant, changes: [], maxDays: 40, seeds: [1, seeds.length], policies: 'ai-ai' }, DEFAULT_TARGETS);
  const m = score(report, size);
  const base = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Metrics) : null;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(m, null, 1));
  const md = metricsMarkdown(m, base && base.games === m.games && base.size === m.size ? base : null);
  writeFileSync(`${OUT}${name}.md`, md);
  console.log(md);
  if (args.includes('--save-baseline')) {
    writeFileSync(BASELINE, JSON.stringify(m, null, 1));
    console.log('Guardado como linea base (improve/baseline.json).');
  } else if (base && (base.games !== m.games || base.size !== m.size)) {
    console.log(`(La linea base es de ${base.games} partidas de ${base.size}x${base.size}: no se compara.)`);
  }
}

if (process.argv[1]?.endsWith('metrics.ts')) await main();
