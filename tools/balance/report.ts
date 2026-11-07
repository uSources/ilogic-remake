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
/** El dia en el que se compara la economia (edificios, ejercito y unidades), y el de despues para las unidades. */
const ECONOMY_DAY = 10;
const LATE_ECONOMY_DAY = 20;
/** Una unidad tiene eficiencia si se ha comprado al menos tantas veces, y en una de cada cinco partidas. */
const MIN_BOUGHT_FOR_EFFICIENCY = 5;
const MIN_BOUGHT_PER_GAME = 0.2;
/** Partidas decididas que hacen falta para avisar de que un equipo gana mas. */
const MIN_DECIDED_FOR_SIDE_FLAG = 20;
/** Los precios propuestos: de PRICE_STEP en PRICE_STEP, nunca menos de uno, y como mucho un 25 % mas o un 20 % menos. */
const PRICE_STEP = 500;
const MAX_PRICE_RISE = 1.25;
const MAX_PRICE_DROP = 0.8;
/** "Casi nadie la compra": menos de esta parte de las compras, con al menos tantas compras en total. */
const RARE_PURCHASE_SHARE = 0.005;
const MIN_PURCHASES_FOR_RARE = 200;
/** Por encima de esta razon de daño hecho / devuelto, el devuelto es casi nada ("sin respuesta"). */
const NO_REPLY_RATIO = 50;
/** El contraataque mas pequeño con el que se divide (con 0, la razon seria infinita). */
const MIN_COUNTER = 0.5;
/** Cuantos cruces de la tabla de duelos salen en el informe: los mas rentables para el atacante. */
const WORST_DUELS_SHOWN = 8;

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
  const samples = records.map((record) => sampleOn(record, ECONOMY_DAY)).filter((sample) => !!sample);
  const meanOf = (valueOf: (sample: DaySample) => PerTeam<number>) =>
    samples.length ? teams.map((team) => mean(samples.map((sample) => valueOf(sample)[team]!))) : null;
  const unitsOnEconomyDay = unitsOnDay(records, ECONOMY_DAY);
  return {
    day10Buildings: meanOf((sample) => sample.buildings),
    day10Army: meanOf((sample) => sample.army),
    unitsOnMap: unitsOnEconomyDay === null ? null : { day10: unitsOnEconomyDay, day20: unitsOnDay(records, LATE_ECONOMY_DAY) ?? 0 },
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
    efficiency:
      fights && spent > 0 && bought >= Math.max(MIN_BOUGHT_FOR_EFFICIENCY, games * MIN_BOUGHT_PER_GAME) ? valueDealt / spent : null,
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
  if (decided < MIN_DECIDED_FOR_SIDE_FLAG || !uneven) return [];
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

/** Lo que cuesta una unidad que rinde `ratio` veces la mediana: hacia la mediana, sin pasarse de los limites de cambio. */
const fairerCost = (cost: number, ratio: number): number =>
  Math.max(PRICE_STEP, roundTo(cost * Math.min(MAX_PRICE_RISE, Math.max(MAX_PRICE_DROP, Math.sqrt(ratio))), PRICE_STEP));

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
    if (content.units.byId[row.type]?.attack && totalBought > MIN_PURCHASES_FOR_RARE && row.share < RARE_PURCHASE_SHARE)
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
  const ratios = same.map((cell) => cell.damage / Math.max(cell.counter, MIN_COUNTER));
  const exchangeRatio = ratios.length ? median(ratios) : null;
  const worst = [...duel.cells]
    .sort((firstCell, secondCell) => secondCell.valuePer1000 - firstCell.valuePer1000)
    .slice(0, WORST_DUELS_SHOWN);
  return { terrain: duel.terrain, firstStrikeMean, exchangeRatio, worst };
}

function duelFlags(summary: DuelSummary | undefined, targets: Targets): string[] {
  const ratio = summary?.exchangeRatio ?? null;
  if (ratio === null || ratio <= targets.exchangeRatio) return [];
  return [
    `Atacar primero sale muy a cuenta: entre unidades iguales se hace ${ratio > NO_REPLY_RATIO ? 'todo el' : ratio.toFixed(1) + ' veces mas'} daño del que se recibe.`,
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

/** Los avisos y las propuestas. Contra un jugador pasivo solo interesan la duracion y si la IA gana: lo demas no tiene sentido. */
function adviceOf(
  findings: Findings,
  duel: DuelSummary | undefined,
  context: { meta: ReportMeta; targets: Targets; content: GameContent },
): Pick<Report, 'flags' | 'suggestions'> {
  const { meta, targets, content } = context;
  const mirror = !meta.policies.includes('passive');
  const prices = mirror ? priceFindings(findings, targets, content) : { flags: [], suggestions: [] };
  const flags = [
    ...(mirror ? sideFlags(findings, targets) : []),
    ...lengthFlags(findings, targets, meta.maxDays),
    ...(mirror ? snowballFlags(findings, targets) : []),
    ...prices.flags,
    ...duelFlags(duel, targets),
  ];
  return { flags, suggestions: prices.suggestions };
}

/** Lo que se mira de las partidas: como acabaron, la bola de nieve y cada tipo de unidad. */
function findingsOf(records: readonly GameRecord[], teams: readonly TeamId[], content: GameContent): Findings {
  const winners = effectiveWinners(records, teams);
  return {
    games: records.length,
    outcome: outcomeOf(records, teams, winners),
    snowball: snowballOf(winners.winners),
    units: unitRowsOf(records, content),
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
  const findings = findingsOf(records, teams, content);
  const duelSummary = duel ? duelSummaryOf(duel) : undefined;
  const { flags, suggestions } = adviceOf(findings, duelSummary, { meta, targets, content });
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
    suggestions,
  };
}

/** Una fila de una tabla de Markdown. */
const tableRow = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;

/** La cabecera de una tabla de Markdown: los nombres y cada columna a la izquierda o, con `right`, a la derecha. */
const tableHead = (headers: readonly string[], right: readonly boolean[]): string[] => [
  tableRow(headers),
  `|${right.map((alignedRight) => (alignedRight ? '---:' : '---')).join('|')}|`,
];

/** Un numero que puede faltar: con su formato, o una raya. */
const orDash = (value: number | null, format: (value: number) => string): string => (value === null ? '—' : format(value));

/** Una razon de daño hecho / devuelto: "sin respuesta" (o `noReply`) si casi no se devuelve nada. */
const exchangeText = (ratio: number, noReply = 'sin respuesta'): string => (ratio > NO_REPLY_RATIO ? noReply : ratio.toFixed(1));

function headerSection(report: Report): string[] {
  const when = report.date.slice(0, 16).replace('T', ' ');
  return [
    `# Informe de equilibrio: ${report.name}`,
    '',
    `${report.games} partidas (${report.policies}), semillas ${report.seeds[0]}-${report.seeds[1]}, maximo ${report.maxDays} dias. ${when}.`,
    '',
  ];
}

function changesSection(report: Report): string[] {
  if (!report.changes.length) return [];
  const changes = report.changes.map((change) => `- \`${change.path}\`: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`);
  return ['**Cambios de esta variante:**', '', ...changes, ''];
}

function flagsSection(report: Report): string[] {
  const flags = report.flags.length ? report.flags.map((flag) => `- ${flag}`) : ['- Nada fuera de los objetivos.'];
  return ['## Avisos', '', ...flags, ''];
}

function suggestionsSection(report: Report): string[] {
  if (!report.suggestions.length) return [];
  const suggestions = report.suggestions.map(
    (suggestion) => `- \`${suggestion.path}\`: ${suggestion.from} → **${suggestion.to}** (${suggestion.why})`,
  );
  return [
    '## Ajustes propuestos',
    '',
    'Para probarlos: `npm run balance -- tune` o una variante con estos valores.',
    '',
    ...suggestions,
    '',
  ];
}

function outcomeRows({ outcome }: Report): string[] {
  const teams = outcome.wins.map((_, team) => `bando ${team}`).join(' / ');
  const { reasons, days } = outcome;
  return [
    tableRow([`Victorias ${teams}`, `${outcome.wins.join(' / ')} (${outcome.winRate.map(pct).join(' / ')})`]),
    tableRow(['Sin terminar', `${outcome.unfinished}: con ventaja clara ${outcome.adjudicated.join(' / ')}, igualadas ${outcome.even}`]),
    tableRow([
      'Por Base / por quedarse sin nada / por puntos al limite de dias',
      `${reasons.hq} / ${reasons.wipeout} / ${reasons.days ?? 0}`,
    ]),
    tableRow(['Dias (mediana, p10-p90, media)', `${days.median} (${days.p10}-${days.p90}), ${days.mean}`]),
  ];
}

function snowballRows(report: Report): string[] {
  return report.snowball.map((point) =>
    tableRow([
      `Gana (o va ganando al final) quien iba por delante el dia ${point.day}`,
      `${orDash(point.leaderWins, pct)} (${point.games} partidas)`,
    ]),
  );
}

function economyRows({ economy }: Report): string[] {
  const rows: string[] = [];
  if (economy.day10Buildings) {
    const buildings = economy.day10Buildings.map((count) => count.toFixed(1)).join(' vs ');
    const army = economy.day10Army!.map((value) => Math.round(value)).join(' vs ');
    rows.push(tableRow([`Dia ${ECONOMY_DAY}: edificios / valor del ejercito`, `${buildings} / ${army}`]));
  }
  if (economy.unitsOnMap) {
    const { day10, day20 } = economy.unitsOnMap;
    rows.push(
      tableRow([
        `Unidades en el mapa por bando (dia ${ECONOMY_DAY} / dia ${LATE_ECONOMY_DAY})`,
        `${day10.toFixed(1)} / ${day20.toFixed(1)}`,
      ]),
    );
  }
  return rows;
}

function resultSection(report: Report): string[] {
  return ['## Resultado', '', '| | |', '|---|---|', ...outcomeRows(report), ...snowballRows(report), ...economyRows(report), ''];
}

function unitsSection(report: Report): string[] {
  const head = tableHead(
    ['Unidad', 'Coste', 'Compradas', '% compras', 'Eficiencia', 'Sobreviven', 'Bajas causadas', 'Capturas'],
    [false, true, true, true, true, true, true, true],
  );
  const byPurchases = [...report.units].sort((first, second) => second.bought - first.bought);
  const rows = byPurchases.map((row) =>
    tableRow([
      row.label,
      row.cost,
      row.bought,
      (row.share * 100).toFixed(1),
      orDash(row.efficiency, (efficiency) => efficiency.toFixed(2)),
      orDash(row.survival, pct),
      row.kills,
      row.captures,
    ]),
  );
  return [
    '## Unidades',
    '',
    'Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).',
    '',
    ...head,
    ...rows,
    '',
  ];
}

/** Las columnas de un cruce de la tabla de duelos: atacante, defensor, daño, contraataque, destruye y valor/1000. */
const duelCells = (cell: DuelCell): (string | number)[] => [
  cell.attacker,
  cell.defender,
  cell.damage.toFixed(1),
  cell.counter.toFixed(1),
  pct(cell.killChance),
  Math.round(cell.valuePer1000),
];

const DUEL_HEADERS = ['Atacante', 'Defensor', 'Daño', 'Contraataque', 'Destruye', 'Valor/1000'];
const DUEL_RIGHT = [false, false, true, true, true, true];

function duelSection({ duel }: Report): string[] {
  if (!duel) return [];
  const exchange = orDash(duel.exchangeRatio, (ratio) => exchangeText(ratio));
  return [
    `## Duelos (terreno ${duel.terrain})`,
    '',
    `Entre unidades iguales, daño hecho / daño devuelto al atacar primero: ${exchange}. En un duelo a muerte gana quien empieza el ${orDash(duel.firstStrikeMean, pct)} de las veces.`,
    '',
    'Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):',
    '',
    ...tableHead(DUEL_HEADERS, DUEL_RIGHT),
    ...duel.worst.map((cell) => tableRow(duelCells(cell))),
    '',
  ];
}

/** El informe en Markdown, seccion a seccion. */
export function reportMarkdown(report: Report): string {
  const sections = [headerSection, changesSection, flagsSection, suggestionsSection, resultSection, unitsSection, duelSection];
  return sections.flatMap((section) => section(report)).join('\n');
}

export function duelMarkdown(cells: DuelCell[], terrain: string): string {
  const lines = [
    `# Duelos en ${terrain}`,
    '',
    'Una unidad a 100 de vida ataca a otra a 100. Valor/1000 = valor quitado por cada 1000 que cuesta el atacante.',
    '',
    ...tableHead([...DUEL_HEADERS, 'Gana quien ataca primero'], [...DUEL_RIGHT, true]),
    ...cells.map((cell) => tableRow([...duelCells(cell), orDash(cell.firstStrikeWins, pct)])),
  ];
  return lines.join('\n') + '\n';
}

/** Una fila de la comparacion: antes, despues y el cambio (vacio si falta uno de los dos). */
function comparisonRow(label: string, before: number | null, after: number | null, format: (value: number) => string): string {
  const change = before !== null && after !== null ? after - before : null;
  return tableRow([label, orDash(before, format), orDash(after, format), change === null ? '' : (change > 0 ? '+' : '') + format(change)]);
}

function comparisonRows(before: Report, after: Report): string[] {
  const teamCount = Math.max(before.outcome.winRate.length, after.outcome.winRate.length);
  const rows = Array.from({ length: teamCount }, (_, team) =>
    comparisonRow(`Victorias bando ${team}`, before.outcome.winRate[team] ?? null, after.outcome.winRate[team] ?? null, pct),
  );
  rows.push(
    comparisonRow('Sin terminar', before.outcome.unfinished / before.games, after.outcome.unfinished / after.games, pct),
    comparisonRow('Dias (mediana)', before.outcome.days.median, after.outcome.days.median, (value) => `${value}`),
    comparisonRow('Bola de nieve dia 5', before.snowball[0]!.leaderWins, after.snowball[0]!.leaderWins, pct),
  );
  if (before.duel || after.duel)
    rows.push(
      comparisonRow('Daño hecho / devuelto (iguales)', before.duel?.exchangeRatio ?? null, after.duel?.exchangeRatio ?? null, (ratio) =>
        exchangeText(ratio, '∞'),
      ),
    );
  return rows;
}

function unitComparisonRows(before: Report, after: Report): string[] {
  const twoDecimals = (value: number | null) => orDash(value, (number) => number.toFixed(2));
  return before.units.map((rowBefore) => {
    const rowAfter = after.units.find((unitRow) => unitRow.type === rowBefore.type)!;
    const cost = `${rowBefore.cost}${rowAfter.cost !== rowBefore.cost ? ` → ${rowAfter.cost}` : ''}`;
    return tableRow([
      rowBefore.label,
      cost,
      `${rowBefore.bought} → ${rowAfter.bought}`,
      `${twoDecimals(rowBefore.efficiency)} → ${twoDecimals(rowAfter.efficiency)}`,
    ]);
  });
}

export function compareMarkdown(before: Report, after: Report): string {
  const sameRuns = before.seeds.join() === after.seeds.join() && before.maxDays === after.maxDays;
  return [
    `# ${before.name} → ${after.name}`,
    '',
    ...(sameRuns ? [] : ['> Ojo: no usan las mismas semillas o el mismo maximo de dias; la comparacion es menos fiable.', '']),
    '| | antes | despues | cambio |',
    '|---|---:|---:|---:|',
    ...comparisonRows(before, after),
    '',
    '## Unidades',
    '',
    ...tableHead(['Unidad', 'Coste', 'Compras (antes → despues)', 'Eficiencia (antes → despues)'], [false, false, false, false]),
    ...unitComparisonRows(before, after),
    '',
    `Avisos antes: ${before.flags.length}, despues: ${after.flags.length}.`,
    '',
  ].join('\n');
}
