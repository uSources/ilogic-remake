/** Resume muchas partidas en un informe, detecta desequilibrios y propone ajustes. */
import type { GameContent } from '@core/content';
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
  economy: {
    day10Buildings: [number, number] | null;
    day10Army: [number, number] | null;
    unitsOnMap?: { day10: number; day20: number } | null;
  };
  units: UnitRow[];
  duel?: { terrain: string; firstStrikeMean: number | null; exchangeRatio: number | null; worst: DuelCell[] };
  flags: string[];
  suggestions: Suggestion[];
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const quant = (xs: number[], fraction: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0);
const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function buildReport(
  records: GameRecord[],
  meta: { name: string; variant: Variant; changes: Report['changes']; maxDays: number; seeds: [number, number]; policies: string },
  targets: Targets,
  /** Contenido con el que se ha jugado (el de la variante): sus tablas y sus nombres. */
  content: GameContent,
  duel?: { terrain: string; cells: DuelCell[] },
): Report {
  const games = records.length;
  const wins: [number, number] = [0, 0];
  const reasons: Record<string, number> = { hq: 0, wipeout: 0, days: 0, timeout: 0 };
  for (const record of records) {
    if (record.winner !== null) wins[record.winner]++;
    reasons[record.reason] = (reasons[record.reason] ?? 0) + 1;
  }
  const finished = records.filter((record) => record.winner !== null);
  const days = finished.map((record) => record.days);

  // Fuerza de un bando: valor del ejercito + edificios (lo que rinden en unas rondas) + algo del dinero.
  const strength = (sample: GameRecord['samples'][number], team: 0 | 1) =>
    sample.army[team] + sample.buildings[team] * 1500 + sample.funds[team] * 0.5;
  // Ganador "efectivo": el real, o en las partidas sin terminar quien va claramente por delante.
  const adjudicated: [number, number] = [0, 0];
  let even = 0;
  const effWinner = new Map<GameRecord, 0 | 1>();
  for (const record of records) {
    if (record.winner !== null) {
      effWinner.set(record, record.winner);
      continue;
    }
    const last = record.samples[record.samples.length - 1]!;
    const playerStrength = strength(last, 0),
      aiStrength = strength(last, 1);
    if (Math.max(playerStrength, aiStrength) >= 1.15 * Math.min(playerStrength, aiStrength)) {
      const winner = playerStrength > aiStrength ? 0 : 1;
      adjudicated[winner]++;
      effWinner.set(record, winner);
    } else even++;
  }

  // Bola de nieve: ¿gana quien iba por delante tal dia?
  const snowball = [5, 10, 20].map((day) => {
    let leaderWins = 0,
      count = 0;
    for (const [record, winner] of effWinner) {
      const sample = record.samples.find((sample) => sample.day === day);
      if (!sample || record.days <= day) continue;
      const playerStrength = strength(sample, 0),
        aiStrength = strength(sample, 1);
      if (Math.abs(playerStrength - aiStrength) < 1) continue;
      count++;
      if ((playerStrength > aiStrength ? 0 : 1) === winner) leaderWins++;
    }
    return { day, leaderWins: count ? leaderWins / count : null, games: count };
  });

  const day10 = records.map((record) => record.samples.find((sample) => sample.day === 10)).filter((sample) => !!sample);
  const economy = {
    day10Buildings: day10.length
      ? ([mean(day10.map((sample) => sample.buildings[0])), mean(day10.map((sample) => sample.buildings[1]))] as [number, number])
      : null,
    day10Army: day10.length
      ? ([mean(day10.map((sample) => sample.army[0])), mean(day10.map((sample) => sample.army[1]))] as [number, number])
      : null,
    unitsOnMap: unitsOnDay(records, 10) === null ? null : { day10: unitsOnDay(records, 10)!, day20: unitsOnDay(records, 20) ?? 0 },
  };

  // Unidades (los dos bandos juntos).
  const totalBought = records.reduce(
    (amount, record) => amount + record.units.flat().reduce((count, unitTally) => count + unitTally.bought, 0),
    0,
  );
  const units: UnitRow[] = [];
  content.units.list.forEach((unitType, type) => {
    let bought = 0,
      spent = 0,
      valueDealt = 0,
      valueLost = 0,
      kills = 0,
      deaths = 0,
      captures = 0;
    for (const record of records)
      for (const team of [0, 1]) {
        const tally = record.units[team]![type]!;
        bought += tally.bought;
        spent += tally.spent;
        valueDealt += tally.valueDealt;
        valueLost += tally.valueLost;
        kills += tally.kills;
        deaths += tally.deaths;
        captures += tally.captures;
      }
    const fights = unitType.attack !== null;
    units.push({
      type: unitType.id,
      label: unitType.name.es,
      cost: unitType.cost,
      bought,
      share: totalBought ? bought / totalBought : 0,
      spent,
      valueDealt: Math.round(valueDealt),
      valueLost: Math.round(valueLost),
      efficiency: fights && spent > 0 && bought >= Math.max(5, games * 0.2) ? valueDealt / spent : null,
      survival: bought > 0 ? Math.max(0, 1 - deaths / bought) : null,
      kills,
      captures,
    });
  });

  // Avisos y propuestas.
  const flags: string[] = [];
  const suggestions: Suggestion[] = [];
  const winRate: [number, number] = [games ? wins[0] / games : 0, games ? wins[1] / games : 0];
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
  if (games && reasons.timeout! / games > targets.timeouts)
    flags.push(`${pct(reasons.timeout! / games)} de partidas sin terminar en ${meta.maxDays} dias.`);
  const sb5 = snowball[0]!.leaderWins;
  if (mirror && sb5 !== null && sb5 > targets.snowball5)
    flags.push(`Bola de nieve: quien va por delante el dia 5 gana el ${pct(sb5)} de las veces.`);

  const efficiencies = units.filter((unitRow) => unitRow.efficiency !== null).map((unitRow) => unitRow.efficiency!);
  const medEff = quant(efficiencies, 0.5);
  for (const row of mirror ? units : []) {
    if (row.efficiency !== null && medEff > 0) {
      const ratio = row.efficiency / medEff;
      if (ratio > targets.efficiencyBand[1] || ratio < targets.efficiencyBand[0]) {
        const factor = Math.min(1.25, Math.max(0.8, Math.sqrt(ratio)));
        const to = Math.max(500, roundTo(row.cost * factor, 500));
        flags.push(`${row.label}: rinde ${ratio.toFixed(2)}x la mediana (destruye ${row.efficiency.toFixed(2)} por cada 1 que cuesta).`);
        if (to !== row.cost)
          suggestions.push({
            path: `UNIT.cost.${row.type}`,
            from: row.cost,
            to,
            why: ratio > 1 ? 'rinde demasiado para lo que cuesta' : 'rinde poco para lo que cuesta',
          });
      }
    }
    if (content.units.byId[row.type]?.attack && totalBought > 200 && row.share < 0.005)
      flags.push(
        `${row.label}: casi nadie la compra (${(row.share * 100).toFixed(1)} % de las compras). Ojo: la IA elige compras con sus propias reglas.`,
      );
  }

  let duelSummary: Report['duel'];
  if (duel) {
    const firstStrikes = duel.cells.filter((cell) => cell.firstStrikeWins !== null && cell.attacker === cell.defender);
    const firstStrikeMean = firstStrikes.length ? mean(firstStrikes.map((cell) => cell.firstStrikeWins!)) : null;
    // Ventaja de atacar primero en un intercambio entre iguales: daño hecho / daño recibido.
    const same = duel.cells.filter((cell) => cell.attacker === cell.defender && cell.damage > 0);
    const ratios = same.map((cell) => cell.damage / Math.max(cell.counter, 0.5));
    const exchangeRatio = ratios.length ? quant(ratios, 0.5) : null;
    if (exchangeRatio !== null && exchangeRatio > targets.exchangeRatio)
      flags.push(
        `Atacar primero sale muy a cuenta: entre unidades iguales se hace ${exchangeRatio > 50 ? 'todo el' : exchangeRatio.toFixed(1) + ' veces mas'} daño del que se recibe.`,
      );
    const worst = [...duel.cells].sort((firstCell, secondCell) => secondCell.valuePer1000 - firstCell.valuePer1000).slice(0, 8);
    duelSummary = { terrain: duel.terrain, firstStrikeMean, exchangeRatio, worst };
  }

  return {
    name: meta.name,
    date: new Date().toISOString(),
    variant: meta.variant,
    changes: meta.changes,
    games: games,
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

export function reportMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push(`# Informe de equilibrio: ${report.name}`, '');
  lines.push(
    `${report.games} partidas (${report.policies}), semillas ${report.seeds[0]}-${report.seeds[1]}, maximo ${report.maxDays} dias. ${report.date.slice(0, 16).replace('T', ' ')}.`,
    '',
  );
  if (report.changes.length) {
    lines.push('**Cambios de esta variante:**', '');
    for (const change of report.changes) lines.push(`- \`${change.path}\`: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`);
    lines.push('');
  }
  lines.push('## Avisos', '');
  lines.push(...(report.flags.length ? report.flags.map((flag) => `- ${flag}`) : ['- Nada fuera de los objetivos.']), '');
  if (report.suggestions.length) {
    lines.push('## Ajustes propuestos', '', 'Para probarlos: `npm run balance -- tune` o una variante con estos valores.', '');
    for (const s of report.suggestions) lines.push(`- \`${s.path}\`: ${s.from} → **${s.to}** (${s.why})`);
    lines.push('');
  }
  const outcome = report.outcome;
  lines.push('## Resultado', '');
  lines.push('| | |', '|---|---|');
  lines.push(
    `| Victorias bando 0 / bando 1 | ${outcome.wins[0]} / ${outcome.wins[1]} (${pct(outcome.winRate[0])} / ${pct(outcome.winRate[1])}) |`,
  );
  lines.push(
    `| Sin terminar | ${outcome.unfinished}: con ventaja clara ${outcome.adjudicated[0]} / ${outcome.adjudicated[1]}, igualadas ${outcome.even} |`,
  );
  lines.push(
    `| Por Base / por quedarse sin nada / por puntos al limite de dias | ${outcome.reasons.hq} / ${outcome.reasons.wipeout} / ${outcome.reasons.days ?? 0} |`,
  );
  lines.push(`| Dias (mediana, p10-p90, media) | ${outcome.days.median} (${outcome.days.p10}-${outcome.days.p90}), ${outcome.days.mean} |`);
  for (const sb of report.snowball)
    lines.push(
      `| Gana (o va ganando al final) quien iba por delante el dia ${sb.day} | ${sb.leaderWins === null ? '—' : pct(sb.leaderWins)} (${sb.games} partidas) |`,
    );
  if (report.economy.day10Buildings)
    lines.push(
      `| Dia 10: edificios / valor del ejercito | ${report.economy.day10Buildings.map((x) => x.toFixed(1)).join(' vs ')} / ${report.economy.day10Army!.map((x) => Math.round(x)).join(' vs ')} |`,
    );
  if (report.economy.unitsOnMap)
    lines.push(
      `| Unidades en el mapa por bando (dia 10 / dia 20) | ${report.economy.unitsOnMap.day10.toFixed(1)} / ${report.economy.unitsOnMap.day20.toFixed(1)} |`,
    );
  lines.push('');
  lines.push('## Unidades', '', 'Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).', '');
  lines.push(
    '| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const row of [...report.units].sort((firstUnitRow, secondUnitRow) => secondUnitRow.bought - firstUnitRow.bought))
    lines.push(
      `| ${row.label} | ${row.cost} | ${row.bought} | ${(row.share * 100).toFixed(1)} | ${row.efficiency === null ? '—' : row.efficiency.toFixed(2)} | ${row.survival === null ? '—' : pct(row.survival)} | ${row.kills} | ${row.captures} |`,
    );
  lines.push('');
  if (report.duel) {
    lines.push(`## Duelos (terreno ${report.duel.terrain})`, '');
    lines.push(
      `Entre unidades iguales, daño hecho / daño devuelto al atacar primero: ${report.duel.exchangeRatio === null ? '—' : report.duel.exchangeRatio > 50 ? 'sin respuesta' : report.duel.exchangeRatio.toFixed(1)}. En un duelo a muerte gana quien empieza el ${report.duel.firstStrikeMean === null ? '—' : pct(report.duel.firstStrikeMean)} de las veces.`,
      '',
    );
    lines.push('Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):', '');
    lines.push('| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |', '|---|---|---:|---:|---:|---:|');
    for (const cell of report.duel.worst)
      lines.push(
        `| ${cell.attacker} | ${cell.defender} | ${cell.damage.toFixed(1)} | ${cell.counter.toFixed(1)} | ${pct(cell.killChance)} | ${Math.round(cell.valuePer1000)} |`,
      );
    lines.push('');
  }
  return lines.join('\n');
}

export function duelMarkdown(cells: DuelCell[], terrain: string): string {
  const lines = [
    `# Duelos en ${terrain}`,
    '',
    'Una unidad a 100 de vida ataca a otra a 100. Valor/1000 = valor quitado por cada 1000 que cuesta el atacante.',
    '',
  ];
  lines.push(
    '| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 | Gana quien ataca primero |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const cell of cells)
    lines.push(
      `| ${cell.attacker} | ${cell.defender} | ${cell.damage.toFixed(1)} | ${cell.counter.toFixed(1)} | ${pct(cell.killChance)} | ${Math.round(cell.valuePer1000)} | ${cell.firstStrikeWins === null ? '—' : pct(cell.firstStrikeWins)} |`,
    );
  return lines.join('\n') + '\n';
}

export function compareMarkdown(before: Report, after: Report): string {
  const lines: string[] = [`# ${before.name} → ${after.name}`, ''];
  if (before.seeds.join() !== after.seeds.join() || before.maxDays !== after.maxDays)
    lines.push('> Ojo: no usan las mismas semillas o el mismo maximo de dias; la comparacion es menos fiable.', '');
  const row = (label: string, beforeValue: number | null, afterValue: number | null, fmt: (value: number) => string) => {
    const diff = beforeValue !== null && afterValue !== null ? afterValue - beforeValue : null;
    lines.push(
      `| ${label} | ${beforeValue === null ? '—' : fmt(beforeValue)} | ${afterValue === null ? '—' : fmt(afterValue)} | ${diff === null ? '' : (diff > 0 ? '+' : '') + fmt(diff)} |`,
    );
  };
  lines.push('| | antes | despues | cambio |', '|---|---:|---:|---:|');
  const percent = (value: number) => `${Math.round(value * 100)} %`;
  row('Victorias bando 0', before.outcome.winRate[0], after.outcome.winRate[0], percent);
  row('Victorias bando 1', before.outcome.winRate[1], after.outcome.winRate[1], percent);
  row('Sin terminar', before.outcome.unfinished / before.games, after.outcome.unfinished / after.games, percent);
  row('Dias (mediana)', before.outcome.days.median, after.outcome.days.median, (value) => `${value}`);
  row('Bola de nieve dia 5', before.snowball[0]!.leaderWins, after.snowball[0]!.leaderWins, percent);
  if (before.duel || after.duel)
    row('Daño hecho / devuelto (iguales)', before.duel?.exchangeRatio ?? null, after.duel?.exchangeRatio ?? null, (value) =>
      value > 50 ? '∞' : value.toFixed(1),
    );
  lines.push('', '## Unidades', '', '| Unidad | Coste | Compras (antes → despues) | Eficiencia (antes → despues) |', '|---|---|---|---|');
  for (const rowBefore of before.units) {
    const rowAfter = after.units.find((unitRow) => unitRow.type === rowBefore.type)!;
    const twoDecimals = (value: number | null) => (value === null ? '—' : value.toFixed(2));
    lines.push(
      `| ${rowBefore.label} | ${rowBefore.cost}${rowAfter.cost !== rowBefore.cost ? ` → ${rowAfter.cost}` : ''} | ${rowBefore.bought} → ${rowAfter.bought} | ${twoDecimals(rowBefore.efficiency)} → ${twoDecimals(rowAfter.efficiency)} |`,
    );
  }
  lines.push('', `Avisos antes: ${before.flags.length}, despues: ${after.flags.length}.`, '');
  return lines.join('\n');
}

/** Media de unidades en el mapa por bando ese dia (null si las muestras no lo tienen). */
function unitsOnDay(records: readonly GameRecord[], day: number): number | null {
  const counts = records.map((record) => record.samples.find((sample) => sample.day === day)?.units).filter((sample) => !!sample);
  return counts.length ? mean(counts.map((unit) => (unit[0] + unit[1]) / 2)) : null;
}
