/**
 * Lo que vale la vida de una unidad: su precio por la vida, entre 100 (una unidad entera vale su
 * precio). Lo usan la carga de los generales, lo que vale un poder para la IA y el valor de un
 * ejercito en las estadisticas.
 */
import { unitTypeOf } from './gameContent';
import type { GameState, Unit } from './model';

/** Lo que valen `life` puntos de vida de una unidad de ese tipo (precio × vida / 100). */
export const lifeValue = (s: GameState, life: number, unit: Pick<Unit, 'type'>): number => (life * unitTypeOf(s, unit).cost) / 100;
