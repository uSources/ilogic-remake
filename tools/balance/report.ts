/** Resume muchas partidas en un informe, detecta desequilibrios y propone ajustes. */
import { UNIT, UNIT_NAMES, UNIT_TYPES } from '../../src/core/data';
import { unitLabelEs } from './names';
import type { DuelCell } from './duel';
import type { GameRecord } from './play';
import type { Variant } from './variant';

export interface Targets {
  /** Duracion deseada (mediana de dias). */
  days: [number, number];
  /** Diferencia maxima de victorias entre bandos (0.08 = 58/42). */
  sideGap: number;
  /** Maximo aceptable de partidas en las que gana quien iba por delante el dia 5. */
  snowball5: number;
  /** Maximo de partidas sin terminar. */
  timeouts: number;
  /** Margen de eficiencia (valor destruido / coste) respecto a la mediana antes de avisar. */
  efficiencyBand: [number, number];
  /** Entre unidades iguales: daño hecho / daño devuelto en un intercambio (maximo aceptable). */
  exchangeRatio: number;
}

export const DEFAULT_TARGETS: Targets = {
  days: [15, 25],
  sideGap: 0.08,
  snowball5: 0.8,
  timeouts: 0.1,
  efficiencyBand: [0.67, 1.5],
  exchangeRatio: 3,
};

export interface UnitRow {
  type: string;
  label: string;
  cost: number;
  bought: number;
  share: number;
  spent: number;
  valueDealt: number;
  valueLost: number;
  /** Valor destruido por cada 1 gastado (null si no ataca o casi no se compra). */
  efficiency: number | null;
  survival: number | null;
  kills: number;
  captures: number;
}

export interface Suggestion {
  path: string;
  from: number;
  to: number;
  why: string;
}

export interface Report {
  name: string;
  date: string;
  variant: Variant;
  changes: { path: string; from: unknown; to: unknown }[];
  games: number;
  maxDays: number;
  seeds: [number, number];
  policies: string;
  outcome: {
    wins: [number, number];
    /** Partidas sin terminar decididas por ventaja al final (ejercito + edificios), si es de al menos un 15 %. */
    adjudicated: [number, number];
    /** Sin terminar y sin ventaja clara. */
    even: number;
    winRate: [number, number];
    unfinished: number;
    reasons: Record<string, number>;
    days: { median: number; p10: number; p90: number; mean: number };
  };
  snowball: { day: number; leaderWins: number | null; games: number }[];
  economy: { day10Buildings: [number, number] | null; day10Army: [number, number] | null };
  units: UnitRow[];
  duel?: { terrain: string; firstStrikeMean: number | null; exchangeRatio: number | null; worst: DuelCell[] };
  flags: string[];
  suggestions: Suggestion[];
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const quant = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, r) => p - r);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))]!;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function buildReport(
  records: GameRecord[],
  meta: { name: string; variant: Variant; changes: Report['changes']; maxDays: number; seeds: [number, number]; policies: string },
  targets: Targets,
  duel?: { terrain: string; cells: DuelCell[] },
): Report {
  const n = records.length;
  const wins: [number, number] = [0, 0];
  const reasons: Record<string, number> = { hq: 0, wipeout: 0, days: 0, timeout: 0 };
  for (const r of records) {
    if (r.winner !== null) wins[r.winner]++;
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  }
  const finished = records.filter((r) => r.winner !== null);
  const days = finished.map((r) => r.days);

  // Fuerza de un bando: valor del ejercito + edificios (lo que rinden en unas rondas) + algo del dinero.
  const strength = (smp: GameRecord['samples'][number], t: 0 | 1) => smp.army[t] + smp.buildings[t] * 1500 + smp.funds[t] * 0.5;
  // Ganador "efectivo": el real, o en las partidas sin terminar quien va claramente por delante.
  const adjudicated: [number, number] = [0, 0];
  let even = 0;
  const effWinner = new Map<GameRecord, 0 | 1>();
  for (const r of records) {
    if (r.winner !== null) {
      effWinner.set(r, r.winner);
      continue;
    }
    const last = r.samples[r.samples.length - 1]!;
    const a = strength(last, 0),
      b = strength(last, 1);
    if (Math.max(a, b) >= 1.15 * Math.min(a, b)) {
      const w = a > b ? 0 : 1;
      adjudicated[w]++;
      effWinner.set(r, w);
    } else even++;
  }

  // Bola de nieve: ¿gana quien iba por delante tal dia?
  const snowball = [5, 10, 20].map((day) => {
    let leaderWins = 0,
      count = 0;
    for (const [r, w] of effWinner) {
      const smp = r.samples.find((x) => x.day === day);
      if (!smp || r.days <= day) continue;
      const a = strength(smp, 0),
        b = strength(smp, 1);
      if (Math.abs(a - b) < 1) continue;
      count++;
      if ((a > b ? 0 : 1) === w) leaderWins++;
    }
    return { day, leaderWins: count ? leaderWins / count : null, games: count };
  });

  const d10 = records.map((r) => r.samples.find((x) => x.day === 10)).filter((x) => !!x);
  const economy = {
    day10Buildings: d10.length ? ([mean(d10.map((x) => x.buildings[0])), mean(d10.map((x) => x.buildings[1]))] as [number, number]) : null,
    day10Army: d10.length ? ([mean(d10.map((x) => x.army[0])), mean(d10.map((x) => x.army[1]))] as [number, number]) : null,
  };

  // Unidades (los dos bandos juntos).
  const totalBought = records.reduce((a, r) => a + r.units.flat().reduce((x, t) => x + t.bought, 0), 0);
  const units: UnitRow[] = [];
  for (let T = 0; T < UNIT_TYPES; T++) {
    let bought = 0,
      spent = 0,
      valueDealt = 0,
      valueLost = 0,
      kills = 0,
      deaths = 0,
      captures = 0;
    for (const r of records)
      for (const team of [0, 1]) {
        const t = r.units[team]![T]!;
        bought += t.bought;
        spent += t.spent;
        valueDealt += t.valueDealt;
        valueLost += t.valueLost;
        kills += t.kills;
        deaths += t.deaths;
        captures += t.captures;
      }
    const fights = UNIT.canfight[T] && UNIT.alcance[T]! > 0;
    units.push({
      type: UNIT_NAMES[T]!,
      label: unitLabelEs(T),
      cost: UNIT.cost[T]!,
      bought,
      share: totalBought ? bought / totalBought : 0,
      spent,
      valueDealt: Math.round(valueDealt),
      valueLost: Math.round(valueLost),
      efficiency: fights && spent > 0 && bought >= Math.max(5, n * 0.2) ? valueDealt / spent : null,
      survival: bought > 0 ? Math.max(0, 1 - deaths / bought) : null,
      kills,
      captures,
    });
  }

  // Avisos y propuestas.
  const flags: string[] = [];
  const suggestions: Suggestion[] = [];
  const winRate: [number, number] = [n ? wins[0] / n : 0, n ? wins[1] / n : 0];
  // Contra un jugador pasivo solo interesan la duracion y si la IA gana: el resto no tiene sentido.
  const mirror = !meta.policies.includes('passive');
  const ew: [number, number] = [wins[0] + adjudicated[0], wins[1] + adjudicated[1]];
  const decided = ew[0] + ew[1];
  if (mirror && decided >= 20 && Math.abs(ew[0] / decided - 0.5) > targets.sideGap)
    flags.push(
      `Un bando gana mas (contando ventaja al final): bando 0 (el jugador) ${pct(ew[0] / decided)}, bando 1 (la IA) ${pct(ew[1] / decided)}.`,
    );
  const med = quant(days, 0.5);
  if (days.length && (med < targets.days[0] || med > targets.days[1]))
    flags.push(`Duracion mediana ${med} dias (objetivo ${targets.days[0]}-${targets.days[1]}).`);
  if (n && reasons.timeout! / n > targets.timeouts)
    flags.push(`${pct(reasons.timeout! / n)} de partidas sin terminar en ${meta.maxDays} dias.`);
  const sb5 = snowball[0]!.leaderWins;
  if (mirror && sb5 !== null && sb5 > targets.snowball5)
    flags.push(`Bola de nieve: quien va por delante el dia 5 gana el ${pct(sb5)} de las veces.`);

  const effs = units.filter((u) => u.efficiency !== null).map((u) => u.efficiency!);
  const medEff = quant(effs, 0.5);
  for (const u of mirror ? units : []) {
    const T = UNIT_NAMES.indexOf(u.type as (typeof UNIT_NAMES)[number]);
    if (u.efficiency !== null && medEff > 0) {
      const ratio = u.efficiency / medEff;
      if (ratio > targets.efficiencyBand[1] || ratio < targets.efficiencyBand[0]) {
        const k = Math.min(1.25, Math.max(0.8, Math.sqrt(ratio)));
        const to = Math.max(500, roundTo(u.cost * k, 500));
        flags.push(`${u.label}: rinde ${ratio.toFixed(2)}x la mediana (destruye ${u.efficiency.toFixed(2)} por cada 1 que cuesta).`);
        if (to !== u.cost)
          suggestions.push({
            path: `UNIT.cost.${u.type}`,
            from: u.cost,
            to,
            why: ratio > 1 ? 'rinde demasiado para lo que cuesta' : 'rinde poco para lo que cuesta',
          });
      }
    }
    if (UNIT.canfight[T] && totalBought > 200 && u.share < 0.005)
      flags.push(
        `${u.label}: casi nadie la compra (${(u.share * 100).toFixed(1)} % de las compras). Ojo: la IA elige compras con sus propias reglas.`,
      );
  }

  let duelSummary: Report['duel'];
  if (duel) {
    const fs = duel.cells.filter((c) => c.firstStrikeWins !== null && c.attacker === c.defender);
    const firstStrikeMean = fs.length ? mean(fs.map((c) => c.firstStrikeWins!)) : null;
    // Ventaja de atacar primero en un intercambio entre iguales: daño hecho / daño recibido.
    const same = duel.cells.filter((c) => c.attacker === c.defender && c.damage > 0);
    const ratios = same.map((c) => c.damage / Math.max(c.counter, 0.5));
    const exchangeRatio = ratios.length ? quant(ratios, 0.5) : null;
    if (exchangeRatio !== null && exchangeRatio > targets.exchangeRatio)
      flags.push(
        `Atacar primero sale muy a cuenta: entre unidades iguales se hace ${exchangeRatio > 50 ? 'todo el' : exchangeRatio.toFixed(1) + ' veces mas'} daño del que se recibe.`,
      );
    const worst = [...duel.cells].sort((a, b) => b.valuePer1000 - a.valuePer1000).slice(0, 8);
    duelSummary = { terrain: duel.terrain, firstStrikeMean, exchangeRatio, worst };
  }

  return {
    name: meta.name,
    date: new Date().toISOString(),
    variant: meta.variant,
    changes: meta.changes,
    games: n,
    maxDays: meta.maxDays,
    seeds: meta.seeds,
    policies: meta.policies,
    outcome: {
      wins,
      adjudicated,
      even,
      winRate,
      unfinished: reasons.timeout!,
      reasons,
      days: { median: med, p10: quant(days, 0.1), p90: quant(days, 0.9), mean: Math.round(mean(days) * 10) / 10 },
    },
    snowball,
    economy,
    units,
    duel: duelSummary,
    flags,
    suggestions,
  };
}

export function reportMarkdown(r: Report): string {
  const L: string[] = [];
  L.push(`# Informe de equilibrio: ${r.name}`, '');
  L.push(
    `${r.games} partidas (${r.policies}), semillas ${r.seeds[0]}-${r.seeds[1]}, maximo ${r.maxDays} dias. ${r.date.slice(0, 16).replace('T', ' ')}.`,
    '',
  );
  if (r.changes.length) {
    L.push('**Cambios de esta variante:**', '');
    for (const c of r.changes) L.push(`- \`${c.path}\`: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    L.push('');
  }
  L.push('## Avisos', '');
  L.push(...(r.flags.length ? r.flags.map((f) => `- ${f}`) : ['- Nada fuera de los objetivos.']), '');
  if (r.suggestions.length) {
    L.push('## Ajustes propuestos', '', 'Para probarlos: `npm run balance -- tune` o una variante con estos valores.', '');
    for (const s of r.suggestions) L.push(`- \`${s.path}\`: ${s.from} → **${s.to}** (${s.why})`);
    L.push('');
  }
  const o = r.outcome;
  L.push('## Resultado', '');
  L.push('| | |', '|---|---|');
  L.push(`| Victorias bando 0 / bando 1 | ${o.wins[0]} / ${o.wins[1]} (${pct(o.winRate[0])} / ${pct(o.winRate[1])}) |`);
  L.push(`| Sin terminar | ${o.unfinished}: con ventaja clara ${o.adjudicated[0]} / ${o.adjudicated[1]}, igualadas ${o.even} |`);
  L.push(
    `| Por Base / por quedarse sin nada / por puntos al limite de dias | ${o.reasons.hq} / ${o.reasons.wipeout} / ${o.reasons.days ?? 0} |`,
  );
  L.push(`| Dias (mediana, p10-p90, media) | ${o.days.median} (${o.days.p10}-${o.days.p90}), ${o.days.mean} |`);
  for (const sb of r.snowball)
    L.push(
      `| Gana (o va ganando al final) quien iba por delante el dia ${sb.day} | ${sb.leaderWins === null ? '—' : pct(sb.leaderWins)} (${sb.games} partidas) |`,
    );
  if (r.economy.day10Buildings)
    L.push(
      `| Dia 10: edificios / valor del ejercito | ${r.economy.day10Buildings.map((x) => x.toFixed(1)).join(' vs ')} / ${r.economy.day10Army!.map((x) => Math.round(x)).join(' vs ')} |`,
    );
  L.push('');
  L.push('## Unidades', '', 'Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).', '');
  L.push(
    '| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const u of [...r.units].sort((a, b) => b.bought - a.bought))
    L.push(
      `| ${u.label} | ${u.cost} | ${u.bought} | ${(u.share * 100).toFixed(1)} | ${u.efficiency === null ? '—' : u.efficiency.toFixed(2)} | ${u.survival === null ? '—' : pct(u.survival)} | ${u.kills} | ${u.captures} |`,
    );
  L.push('');
  if (r.duel) {
    L.push(`## Duelos (terreno ${r.duel.terrain})`, '');
    L.push(
      `Entre unidades iguales, daño hecho / daño devuelto al atacar primero: ${r.duel.exchangeRatio === null ? '—' : r.duel.exchangeRatio > 50 ? 'sin respuesta' : r.duel.exchangeRatio.toFixed(1)}. En un duelo a muerte gana quien empieza el ${r.duel.firstStrikeMean === null ? '—' : pct(r.duel.firstStrikeMean)} de las veces.`,
      '',
    );
    L.push('Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):', '');
    L.push('| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |', '|---|---|---:|---:|---:|---:|');
    for (const c of r.duel.worst)
      L.push(
        `| ${c.attacker} | ${c.defender} | ${c.damage.toFixed(1)} | ${c.counter.toFixed(1)} | ${pct(c.killChance)} | ${Math.round(c.valuePer1000)} |`,
      );
    L.push('');
  }
  return L.join('\n');
}

export function duelMarkdown(cells: DuelCell[], terrain: string): string {
  const L = [
    `# Duelos en ${terrain}`,
    '',
    'Una unidad a 100 de vida ataca a otra a 100. Valor/1000 = valor quitado por cada 1000 que cuesta el atacante.',
    '',
  ];
  L.push(
    '| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 | Gana quien ataca primero |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const c of cells)
    L.push(
      `| ${c.attacker} | ${c.defender} | ${c.damage.toFixed(1)} | ${c.counter.toFixed(1)} | ${pct(c.killChance)} | ${Math.round(c.valuePer1000)} | ${c.firstStrikeWins === null ? '—' : pct(c.firstStrikeWins)} |`,
    );
  return L.join('\n') + '\n';
}

export function compareMarkdown(a: Report, b: Report): string {
  const L: string[] = [`# ${a.name} → ${b.name}`, ''];
  if (a.seeds.join() !== b.seeds.join() || a.maxDays !== b.maxDays)
    L.push('> Ojo: no usan las mismas semillas o el mismo maximo de dias; la comparacion es menos fiable.', '');
  const row = (label: string, x: number | null, y: number | null, fmt: (v: number) => string) => {
    const d = x !== null && y !== null ? y - x : null;
    L.push(`| ${label} | ${x === null ? '—' : fmt(x)} | ${y === null ? '—' : fmt(y)} | ${d === null ? '' : (d > 0 ? '+' : '') + fmt(d)} |`);
  };
  L.push('| | antes | despues | cambio |', '|---|---:|---:|---:|');
  const p = (v: number) => `${Math.round(v * 100)} %`;
  row('Victorias bando 0', a.outcome.winRate[0], b.outcome.winRate[0], p);
  row('Victorias bando 1', a.outcome.winRate[1], b.outcome.winRate[1], p);
  row('Sin terminar', a.outcome.unfinished / a.games, b.outcome.unfinished / b.games, p);
  row('Dias (mediana)', a.outcome.days.median, b.outcome.days.median, (v) => `${v}`);
  row('Bola de nieve dia 5', a.snowball[0]!.leaderWins, b.snowball[0]!.leaderWins, p);
  if (a.duel || b.duel)
    row('Daño hecho / devuelto (iguales)', a.duel?.exchangeRatio ?? null, b.duel?.exchangeRatio ?? null, (v) =>
      v > 50 ? '∞' : v.toFixed(1),
    );
  L.push('', '## Unidades', '', '| Unidad | Coste | Compras (antes → despues) | Eficiencia (antes → despues) |', '|---|---|---|---|');
  for (const ua of a.units) {
    const ub = b.units.find((u) => u.type === ua.type)!;
    const e = (x: number | null) => (x === null ? '—' : x.toFixed(2));
    L.push(
      `| ${ua.label} | ${ua.cost}${ub.cost !== ua.cost ? ` → ${ub.cost}` : ''} | ${ua.bought} → ${ub.bought} | ${e(ua.efficiency)} → ${e(ub.efficiency)} |`,
    );
  }
  L.push('', `Avisos antes: ${a.flags.length}, despues: ${b.flags.length}.`, '');
  return L.join('\n');
}
