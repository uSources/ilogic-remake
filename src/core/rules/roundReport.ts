/**
 * El resumen de una ronda que enseña la escena, sacado de los sucesos del fin de ronda. Solo tipos:
 * lo rellenan las partes del resumen (`ROUND_REPORT_PARTS` en rules/round.ts, lo de cualquier
 * partida, y las `roundReportParts` de los modulos), cada una con los sucesos que son suyos.
 */
import type { TeamId } from '../model';

/**
 * Lo que apunta cada modulo en el resumen, por su nombre. Esta vacia aqui: cada modulo que apunta
 * algo anade su parte ampliandola (`declare module '../rules/roundReport' { interface
 * RoundReportParts { upkeep: number[] } }`), y solo esta en el resumen si la ha apuntado.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- se amplia con declare module
export interface RoundReportParts {}

export interface RoundReport extends Partial<RoundReportParts> {
  /** Lo que ha cobrado cada equipo, por numero de equipo. */
  income: number[];
  /** Unidades curadas en un edificio propio (uid, equipo, vida recuperada). */
  healed: { uid: number; team: TeamId; amount: number }[];
}
