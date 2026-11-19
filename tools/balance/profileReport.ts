/**
 * La parte del informe de equilibrio sobre la IA (docs/PLAN-IA.md, fase 0): quien gana cuando se
 * enfrentan dos perfiles (`--vs`) y las medidas de «humanidad» de cada perfil (humanity.ts).
 */
import type { TeamId } from '@core/model';
import { humanityRowsOf, type HumanityRow } from './humanity';
import { comparisonRow, orDash, tableHead, tableRow } from './markdown';
import { pct } from './numbers';
import type { GameRecord } from './play';

/** Como le ha ido a un perfil contra los demas. */
export interface ProfileOutcome {
  profile: string;
  /** Partidas que ha jugado (con un equipo). */
  games: number;
  /** Ganadas de verdad, y las sin terminar en las que iba claramente por delante. */
  wins: number;
  adjudicated: number;
}

/** Lo que el informe cuenta de la IA. */
export interface AiFindings {
  /** Solo con dos perfiles o mas (con uno, es el resultado de siempre). */
  profiles: ProfileOutcome[];
  humanity: HumanityRow[];
}

/**
 * Lo de la IA en estas partidas. `effective`: los ganadores de verdad o, en las sin terminar, quien
 * iba claramente por delante (como el resto del informe).
 */
export function aiFindingsOf(records: readonly GameRecord[], effective: ReadonlyMap<GameRecord, readonly TeamId[]>): AiFindings {
  const humanity = humanityRowsOf(
    records.map((record) => record.humanity.map((tally, team) => ({ profile: record.profiles[team] ?? '?', tally }))),
  );
  return { profiles: playsSeveralProfiles(records) ? profileOutcomesOf(records, effective) : [], humanity };
}

const playsSeveralProfiles = (records: readonly GameRecord[]): boolean => new Set(records.flatMap((record) => record.profiles)).size > 1;

/** Con un solo perfil de IA en todas (sin 'passive'): los dos lados son iguales y valen los avisos de precios y lados. */
export const isMirror = (records: readonly GameRecord[]): boolean =>
  records.every((record) => new Set(record.profiles).size === 1 && record.profiles[0] !== 'passive');

function profileOutcomesOf(records: readonly GameRecord[], effective: ReadonlyMap<GameRecord, readonly TeamId[]>): ProfileOutcome[] {
  const outcomes = new Map<string, ProfileOutcome>();
  const outcomeOf = (profile: string): ProfileOutcome => {
    const known = outcomes.get(profile) ?? { profile, games: 0, wins: 0, adjudicated: 0 };
    outcomes.set(profile, known);
    return known;
  };
  for (const record of records) {
    const winners = effective.get(record) ?? [];
    record.profiles.forEach((profile, team) => {
      const outcome = outcomeOf(profile);
      outcome.games++;
      if (!winners.includes(team)) return;
      if (record.winners.includes(team)) outcome.wins++;
      else outcome.adjudicated++;
    });
  }
  return [...outcomes.values()];
}

const ms = (value: number): string => `${Math.round(value)} ms`;
const tenths = (value: number): string => value.toFixed(1);

/** La seccion del informe: perfiles enfrentados (si hay) y la «humanidad» de cada uno. */
export function aiSection({ profiles, humanity }: AiFindings): string[] {
  const lines = ['## IA', ''];
  if (profiles.length) {
    lines.push(...tableHead(['Perfil', 'Partidas', 'Gana', 'Con ventaja al final', 'Total'], [false, true, true, true, true]));
    for (const outcome of profiles) {
      const total = outcome.games ? (outcome.wins + outcome.adjudicated) / outcome.games : 0;
      lines.push(tableRow([outcome.profile, outcome.games, outcome.wins, outcome.adjudicated, pct(total)]));
    }
    lines.push('');
  }
  lines.push(
    ...tableHead(
      ['Perfil', 'Regaladas por partida', 'Regaladas / bajas', 'Al aliado más cercano', 'Vaivenes', 'Turno (media / p95)'],
      [false, true, true, true, true, true],
    ),
    ...humanity.map((row) =>
      tableRow([
        row.profile,
        tenths(row.giftedPerTeam),
        orDash(row.giftedShare, pct),
        orDash(row.cohesion, (value) => `${tenths(value)} casillas`),
        orDash(row.reversalShare, pct),
        `${ms(row.turnMsMean)} / ${ms(row.turnMsP95)}`,
      ]),
    ),
    '',
    'Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. ' +
      'Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.',
    '',
  );
  return lines;
}

/** Las filas de la comparacion de dos informes: la «humanidad» de cada perfil que tengan los dos. */
export function aiComparisonRows(before: AiFindings | undefined, after: AiFindings | undefined): string[] {
  const rowsAfter = after?.humanity ?? [];
  return (before?.humanity ?? []).flatMap((rowBefore) => {
    const rowAfter = rowsAfter.find((row) => row.profile === rowBefore.profile);
    if (!rowAfter) return [];
    const label = (what: string) => `${what} (${rowBefore.profile})`;
    return [
      comparisonRow(label('Regaladas por partida'), rowBefore.giftedPerTeam, rowAfter.giftedPerTeam, tenths),
      comparisonRow(label('Al aliado más cercano'), rowBefore.cohesion, rowAfter.cohesion, tenths),
      comparisonRow(label('Vaivenes'), rowBefore.reversalShare, rowAfter.reversalShare, pct),
      comparisonRow(label('Turno (media)'), rowBefore.turnMsMean, rowAfter.turnMsMean, ms),
    ];
  });
}
