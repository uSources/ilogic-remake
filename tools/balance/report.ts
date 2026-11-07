/** Resume muchas partidas en un informe, detecta desequilibrios y propone ajustes. */
import type { GameContent, UnitType } from '@core/content';
import type { TeamId } from '@core/model';
import type { DuelCell } from './duel';
import { emptyTally, type DaySample, type GameRecord, type PerTeam, type UnitTally } from './play';
import { unitFieldPath, type Variant } from './variant';
import { clearLeader, strengthRanking, type Holdings } from './strength';
import { mean, median, pct, quantile, roundTo, sum } from './numbers';

export interface Targets {
  /** Duracion deseada (mediana de dias). */
  days: [min: number, max: number];
  /** Diferencia maxima entre lo que gana un equipo y lo que le tocaria repartiendo igual (0.08 = 58/42 con dos). */
  sideGap: number;
  /** Maximo aceptable de partidas en las que gana quien iba por delante el dia 5. */
  snowball5: number;
  /** Maximo de partidas sin terminar. */
  timeouts: number;
  /** Margen de eficiencia (valor destruido / coste) respecto a la mediana antes de avisar. */
  efficiencyBand: [low: number, high: number];
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

/** Como acabaron las partidas, por equipo. */
export interface Outcome {
  wins: PerTeam<number>;
  /** Partidas sin terminar decididas por ventaja al final (ejercito + edificios), si es de al menos un 15 %. */
  adjudicated: PerTeam<number>;
  /** Sin terminar y sin ventaja clara. */
  even: number;
  winRate: PerTeam<number>;
  unfinished: number;
  reasons: Record<string, number>;
  days: { median: number; p10: number; p90: number; mean: number };
}

/** ¿Gana quien iba por delante tal dia? (entre las partidas que siguen ese dia y con alguien por delante) */
export interface SnowballPoint {
  day: number;
  leaderWins: number | null;
  games: number;
}

export interface Economy {
  /** Medias por equipo el dia 10 (null si ninguna partida llega). */
  day10Buildings: PerTeam<number> | null;
  day10Army: PerTeam<number> | null;
  /** Media de unidades en el mapa por equipo los dias 10 y 20. */
  unitsOnMap: { day10: number; day20: number } | null;
}

export interface DuelSummary {
  terrain: string;
  firstStrikeMean: number | null;
  exchangeRatio: number | null;
  worst: DuelCell[];
}

/** Lo que se sabe de las partidas antes de resumirlas: nombre, variante, dias, semillas y quien juega. */
export interface ReportMeta {
  name: string;
  variant: Variant;
  changes: { path: string; from: unknown; to: unknown }[];
  maxDays: number;
  seeds: [first: number, last: number];
  policies: string;
}

export interface Report extends ReportMeta {
  date: string;
  games: number;
  outcome: Outcome;
  snowball: SnowballPoint[];
  economy: Economy;
  units: UnitRow[];
  duel?: DuelSummary;
  flags: string[];
  suggestions: Suggestion[];
}

/**
 * Lo que se perdona al comparar un reparto con `sideGap`: con decimales, 29/50 - 0.5 da 0.0799... y
 * 0.5 - 21/50 da 0.0800...2, asi que 58/42 pasaba y 42/58 avisaba, con la misma diferencia.
 */
const SHARE_TOLERANCE = 1e-9;

/** Los dias en los que se mira si gana quien iba por delante. */
const SNOWBALL_DAYS = [5, 10, 20];

/** Los equipos de las partidas (todas tienen los mismos). */
const teamsOf = (records: readonly GameRecord[]): TeamId[] => (records[0]?.units ?? []).map((_, team) => team);

/** Lo que tiene cada equipo en una muestra. */
const holdingsOf = (sample: DaySample): Holdings[] =>
  sample.army.map((army, team) => ({ army, buildings: sample.buildings[team]!, funds: sample.funds[team]! }));

const lastSampleOf = (record: GameRecord): DaySample => record.samples[record.samples.length - 1]!;

const sampleOn = (record: GameRecord, day: number): DaySample | undefined => record.samples.find((sample) => sample.day === day);

/** Cuantas partidas gana cada equipo y por que acaban. */
function winsOf(records: readonly GameRecord[], teams: readonly TeamId[]): { wins: PerTeam<number>; reasons: Record<string, number> } {
  const wins = teams.map(() => 0);
  const reasons: Record<string, number> = { hq: 0, wipeout: 0, days: 0, timeout: 0 };
  for (const record of records) {
    if (record.winner !== null) wins[record.winner]!++;
    reasons[record.reason] = (reasons[record.reason] ?? 0) + 1;
  }
  return { wins, reasons };
}

/**
 * El ganador "efectivo" de cada partida: el real o, en las sin terminar, quien va claramente por
 * delante al final (`adjudicated`); las demas quedan igualadas (`even`).
 */
function effectiveWinners(records: readonly GameRecord[], teams: readonly TeamId[]) {
  const adjudicated = teams.map(() => 0);
  let even = 0;
  const winners = new Map<GameRecord, TeamId>();
  for (const record of records) {
    const winner = record.winner ?? clearLeader(holdingsOf(lastSampleOf(record)));
    if (winner === null) even++;
    else {
      if (record.winner === null) adjudicated[winner]!++;
      winners.set(record, winner);
    }
  }
  return { adjudicated, even, winners };
}

/** Bola de nieve: entre las partidas que siguen tal dia con alguien por delante, en cuantas gana el que iba primero. */
function snowballOf(winners: ReadonlyMap<GameRecord, TeamId>): SnowballPoint[] {
  return SNOWBALL_DAYS.map((day) => {
    const leaders = [...winners]
      .filter(([record]) => record.days > day)
      .map(([record, winner]) => ({ sample: sampleOn(record, day), winner }))
      .filter((entry): entry is { sample: DaySample; winner: TeamId } => entry.sample !== undefined)
      .map(({ sample, winner }) => ({ ranking: strengthRanking(holdingsOf(sample)), winner }))
      .filter(
        ({ ranking: [leader, runnerUp] }) => leader !== undefined && runnerUp !== undefined && leader.strength - runnerUp.strength >= 1,
      );
    const leaderWins = leaders.filter(({ ranking: [leader], winner }) => leader!.team === winner).length;
    return { day, leaderWins: leaders.length ? leaderWins / leaders.length : null, games: leaders.length };
  });
}

/** Media de unidades en el mapa por equipo ese dia (null si ninguna partida llega). */
function unitsOnDay(records: readonly GameRecord[], day: number): number | null {
  const counts = records.map((record) => sampleOn(record, day)?.units).filter((units) => !!units);
  return counts.length ? mean(counts.map((units) => mean(units))) : null;
}

function economyOf(records: readonly GameRecord[], teams: readonly TeamId[]): Economy {
  const day10 = records.map((record) => sampleOn(record, 10)).filter((sample) => !!sample);
  const meanOf = (valueOf: (sample: DaySample) => PerTeam<number>) =>
    day10.length ? teams.map((team) => mean(day10.map((sample) => valueOf(sample)[team]!))) : null;
  const unitsOnDay10 = unitsOnDay(records, 10);
  return {
    day10Buildings: meanOf((sample) => sample.buildings),
    day10Army: meanOf((sample) => sample.army),
    unitsOnMap: unitsOnDay10 === null ? null : { day10: unitsOnDay10, day20: unitsOnDay(records, 20) ?? 0 },
  };
}

const TALLY_FIELDS = Object.keys(emptyTally()) as (keyof UnitTally)[];

/** Lo de un tipo de unidad en todas las partidas, todos los equipos juntos. */
function totalTally(records: readonly GameRecord[], type: string): UnitTally {
  const total = emptyTally();
  for (const record of records)
    for (const teamTallies of record.units) for (const field of TALLY_FIELDS) total[field] += teamTallies[type]![field];
  return total;
}

/** La fila de un tipo de unidad: compras, gasto, valor destruido y perdido, eficiencia y supervivencia. */
function unitRowOf(unitType: UnitType, tally: UnitTally, totalBought: number, games: number): UnitRow {
  const { bought, spent, valueDealt, deaths } = tally;
  const fights = unitType.attack !== null;
  return {
    type: unitType.id,
    label: unitType.name.es,
    cost: unitType.cost,
    bought,
    share: totalBought ? bought / totalBought : 0,
    spent,
    valueDealt: Math.round(valueDealt),
    valueLost: Math.round(tally.valueLost),
    efficiency: fights && spent > 0 && bought >= Math.max(5, games * 0.2) ? valueDealt / spent : null,
    survival: bought > 0 ? Math.max(0, 1 - deaths / bought) : null,
    kills: tally.kills,
    captures: tally.captures,
  };
}

/** Una fila por tipo de unidad (todos los equipos juntos). */
function unitRowsOf(records: readonly GameRecord[], content: GameContent): UnitRow[] {
  const tallies = content.units.list.map((unitType) => ({ unitType, tally: totalTally(records, unitType.id) }));
  const totalBought = records.reduce(
    (amount, record) => amount + sum(record.units.flatMap((teamTallies) => Object.values(teamTallies)).map((tally) => tally.bought)),
    0,
  );
  return tallies.map(({ unitType, tally }) => unitRowOf(unitType, tally, totalBought, records.length));
}

/** El nombre de un equipo en los avisos: el primero es el de la persona en el juego; los demas, la IA. */
const teamLabel = (team: TeamId): string => `bando ${team} (${team === 0 ? 'el jugador' : 'la IA'})`;

/** Lo que el informe mira de las partidas para avisar y proponer. */
interface Findings {
  games: number;
  outcome: Outcome;
  snowball: readonly SnowballPoint[];
  units: readonly UnitRow[];
}

/** Avisa si algun equipo gana (contando ventaja al final) mas de lo que le toca. */
function sideFlags({ outcome }: Findings, targets: Targets): string[] {
  const won = outcome.wins.map((wins, team) => wins + outcome.adjudicated[team]!);
  const decided = sum(won);
  const fairShare = 1 / won.length;
  const uneven = won.some((count) => Math.abs(count / decided - fairShare) > targets.sideGap + SHARE_TOLERANCE);
  if (decided < 20 || !uneven) return [];
  const shares = won.map((count, team) => `${teamLabel(team)} ${pct(count / decided)}`);
  return [`Un bando gana mas (contando ventaja al final): ${shares.join(', ')}.`];
}

function lengthFlags({ games, outcome }: Findings, targets: Targets, maxDays: number): string[] {
  const flags: string[] = [];
  const [shortest, longest] = targets.days;
  const days = outcome.days.median;
  const finished = sum(outcome.wins);
  if (finished > 0 && (days < shortest || days > longest)) flags.push(`Duracion mediana ${days} dias (objetivo ${shortest}-${longest}).`);
  const timeouts = outcome.reasons.timeout!;
  if (games && timeouts / games > targets.timeouts) flags.push(`${pct(timeouts / games)} de partidas sin terminar en ${maxDays} dias.`);
  return flags;
}

function snowballFlags({ snowball }: Findings, targets: Targets): string[] {
  const day5 = snowball[0]!.leaderWins;
  return day5 !== null && day5 > targets.snowball5
    ? [`Bola de nieve: quien va por delante el dia 5 gana el ${pct(day5)} de las veces.`]
    : [];
}

/** Lo que cuesta una unidad que rinde `ratio` veces la mediana: hacia la mediana, como mucho un 25 %, de 500 en 500. */
const fairerCost = (cost: number, ratio: number): number =>
  Math.max(500, roundTo(cost * Math.min(1.25, Math.max(0.8, Math.sqrt(ratio))), 500));

/** Avisa de las unidades que rinden demasiado o demasiado poco para lo que cuestan, con su precio propuesto, y de las que casi nadie compra. */
function priceFindings({ units }: Findings, targets: Targets, content: GameContent): { flags: string[]; suggestions: Suggestion[] } {
  const flags: string[] = [];
  const suggestions: Suggestion[] = [];
  const medianEfficiency = median(units.filter((row) => row.efficiency !== null).map((row) => row.efficiency!));
  const totalBought = sum(units.map((row) => row.bought));
  for (const row of units) {
    const ratio = row.efficiency !== null && medianEfficiency > 0 ? row.efficiency / medianEfficiency : null;
    if (ratio !== null && (ratio > targets.efficiencyBand[1] || ratio < targets.efficiencyBand[0])) {
      flags.push(`${row.label}: rinde ${ratio.toFixed(2)}x la mediana (destruye ${row.efficiency!.toFixed(2)} por cada 1 que cuesta).`);
      const to = fairerCost(row.cost, ratio);
      if (to !== row.cost)
        suggestions.push({
          path: unitFieldPath('cost', row.type),
          from: row.cost,
          to,
          why: ratio > 1 ? 'rinde demasiado para lo que cuesta' : 'rinde poco para lo que cuesta',
        });
    }
    if (content.units.byId[row.type]?.attack && totalBought > 200 && row.share < 0.005)
      flags.push(
        `${row.label}: casi nadie la compra (${(row.share * 100).toFixed(1)} % de las compras). Ojo: la IA elige compras con sus propias reglas.`,
      );
  }
  return { flags, suggestions };
}

/** El resumen de la tabla de duelos: ventaja de atacar primero entre iguales y los cruces mas rentables. */
function duelSummaryOf(duel: { terrain: string; cells: DuelCell[] }): DuelSummary {
  const firstStrikes = duel.cells.filter((cell) => cell.firstStrikeWins !== null && cell.attacker === cell.defender);
  const firstStrikeMean = firstStrikes.length ? mean(firstStrikes.map((cell) => cell.firstStrikeWins!)) : null;
  // Ventaja de atacar primero en un intercambio entre iguales: daño hecho / daño recibido.
  const same = duel.cells.filter((cell) => cell.attacker === cell.defender && cell.damage > 0);
  const ratios = same.map((cell) => cell.damage / Math.max(cell.counter, 0.5));
  const exchangeRatio = ratios.length ? median(ratios) : null;
  const worst = [...duel.cells].sort((firstCell, secondCell) => secondCell.valuePer1000 - firstCell.valuePer1000).slice(0, 8);
  return { terrain: duel.terrain, firstStrikeMean, exchangeRatio, worst };
}

function duelFlags(summary: DuelSummary | undefined, targets: Targets): string[] {
  const ratio = summary?.exchangeRatio ?? null;
  if (ratio === null || ratio <= targets.exchangeRatio) return [];
  return [
    `Atacar primero sale muy a cuenta: entre unidades iguales se hace ${ratio > 50 ? 'todo el' : ratio.toFixed(1) + ' veces mas'} daño del que se recibe.`,
  ];
}

function outcomeOf(records: readonly GameRecord[], teams: readonly TeamId[], winners: ReturnType<typeof effectiveWinners>): Outcome {
  const games = records.length;
  const { wins, reasons } = winsOf(records, teams);
  const days = records.filter((record) => record.winner !== null).map((record) => record.days);
  return {
    wins,
    adjudicated: winners.adjudicated,
    even: winners.even,
    winRate: wins.map((count) => (games ? count / games : 0)),
    unfinished: reasons.timeout!,
    reasons,
    days: { median: median(days), p10: quantile(days, 0.1), p90: quantile(days, 0.9), mean: Math.round(mean(days) * 10) / 10 },
  };
}

export function buildReport(
  records: GameRecord[],
  meta: ReportMeta,
  targets: Targets,
  /** Contenido con el que se ha jugado (el de la variante): sus tablas y sus nombres. */
  content: GameContent,
  duel?: { terrain: string; cells: DuelCell[] },
): Report {
  const teams = teamsOf(records);
  const winners = effectiveWinners(records, teams);
  const findings: Findings = {
    games: records.length,
    outcome: outcomeOf(records, teams, winners),
    snowball: snowballOf(winners.winners),
    units: unitRowsOf(records, content),
  };
  const duelSummary = duel ? duelSummaryOf(duel) : undefined;
  // Contra un jugador pasivo solo interesan la duracion y si la IA gana: el resto no tiene sentido.
  const mirror = !meta.policies.includes('passive');
  const prices = mirror ? priceFindings(findings, targets, content) : { flags: [], suggestions: [] };
  const flags = [
    ...(mirror ? sideFlags(findings, targets) : []),
    ...lengthFlags(findings, targets, meta.maxDays),
    ...(mirror ? snowballFlags(findings, targets) : []),
    ...prices.flags,
    ...duelFlags(duelSummary, targets),
  ];
  return {
    name: meta.name,
    date: new Date().toISOString(),
    variant: meta.variant,
    changes: meta.changes,
    games: records.length,
    maxDays: meta.maxDays,
    seeds: meta.seeds,
    policies: meta.policies,
    outcome: findings.outcome,
    snowball: [...findings.snowball],
    economy: economyOf(records, teams),
    units: [...findings.units],
    duel: duelSummary,
    flags,
    suggestions: prices.suggestions,
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
  const teams = outcome.wins.map((_, team) => `bando ${team}`).join(' / ');
  lines.push(`| Victorias ${teams} | ${outcome.wins.join(' / ')} (${outcome.winRate.map(pct).join(' / ')}) |`);
  lines.push(`| Sin terminar | ${outcome.unfinished}: con ventaja clara ${outcome.adjudicated.join(' / ')}, igualadas ${outcome.even} |`);
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
  const teamCount = Math.max(before.outcome.winRate.length, after.outcome.winRate.length);
  for (let team = 0; team < teamCount; team++)
    row(`Victorias bando ${team}`, before.outcome.winRate[team] ?? null, after.outcome.winRate[team] ?? null, pct);
  row('Sin terminar', before.outcome.unfinished / before.games, after.outcome.unfinished / after.games, pct);
  row('Dias (mediana)', before.outcome.days.median, after.outcome.days.median, (value) => `${value}`);
  row('Bola de nieve dia 5', before.snowball[0]!.leaderWins, after.snowball[0]!.leaderWins, pct);
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
