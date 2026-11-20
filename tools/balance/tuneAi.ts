/**
 * Ajustar los pesos de la IA jugando sola (docs/PLAN-IA.md, fase 5; `npm run balance -- tune-ai`):
 * prueba a subir y bajar cada peso, juega la IA con ese cambio (perfil 'ai', con los pesos de la
 * variante) contra la del juego de ahora (perfil 'actual', con los de ai.json) con los lados alternos,
 * y se queda con cada cambio que gane claramente. Aqui solo lo que no juega (que probar y que vale):
 * jugar, la linea de ordenes (cli.ts).
 */
import type { AiWeights } from '@core/content';
import type { Report } from './report';

/** Los perfiles de las partidas: la IA con los pesos de la variante contra la del juego de ahora (profiles.ts). */
export const TUNED_PROFILE = 'ai';
export const CURRENT_PROFILE = 'actual';

/** Los pesos que prueba si no se dicen: los que cambian las personalidades (ai.json). */
export const DEFAULT_TUNED_WEIGHTS: readonly (keyof AiWeights)[] = [
  'dangerAversion',
  'retreatBelowLife',
  'pushAdvantage',
  'attackNeedRatio',
  'maxCaptureDistance',
  'minCapturers',
  'ownedBuildingPreference',
  'enemyHqPreference',
];

/** Lo que vale un peso subido o bajado `factor` veces: un entero sigue entero y cambia al menos 1. */
export function steppedValues(value: number, factor: number): number[] {
  const up = value * factor;
  const down = value / factor;
  if (!Number.isInteger(value)) return [round(up), round(down)];
  return [Math.max(value + 1, Math.round(up)), Math.max(0, Math.min(value - 1, Math.round(down)))].filter((next) => next !== value);
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Lo que saca el perfil `profile` en el informe: ganadas o con ventaja clara al final, de las que jugo (0 a 1). */
export function shareOf(report: Report, profile: string): number {
  const outcome = report.ai?.profiles.find((entry) => entry.profile === profile);
  return outcome && outcome.games ? (outcome.wins + outcome.adjudicated) / outcome.games : 0;
}

/** Cuanto saca la IA con los pesos probados por encima de la de ahora (en partes de 1). */
export const edgeOf = (report: Report): number => shareOf(report, TUNED_PROFILE) - shareOf(report, CURRENT_PROFILE);

/** Una prueba: el peso, su valor y lo que saco. */
export interface TuneTry {
  weight: string;
  value: number;
  edge: number;
  kept: boolean;
}

/** Se queda con un cambio que gane por `margin` o mas y mas que lo que ya tenia. */
export const isBetter = (edge: number, best: number, margin: number): boolean => edge >= margin && edge > best;

/** El informe de las pruebas, en markdown. */
export function tuneMarkdown(name: string, tries: readonly TuneTry[], kept: Readonly<Record<string, number>>, games: number): string {
  const lines = [
    `# Ajuste de los pesos de la IA: ${name}`,
    '',
    `Cada prueba, ${games} partidas con los lados alternos contra la IA de ahora. «Ventaja»: lo que saca de más (ganadas o con ventaja clara al final).`,
    '',
    '| Peso | Valor | Ventaja | Se queda |',
    '|---|---:|---:|---|',
    ...tries.map((entry) => `| ${entry.weight} | ${entry.value} | ${Math.round(entry.edge * 100)} % | ${entry.kept ? 'sí' : ''} |`),
    '',
    Object.keys(kept).length
      ? `Pesos que cambia: ${Object.entries(kept)
          .map(([weight, value]) => `\`${weight}\` ${value}`)
          .join(', ')}.`
      : 'Ningún cambio gana claramente: los pesos de ahora se quedan.',
  ];
  return lines.join('\n') + '\n';
}
