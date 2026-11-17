/**
 * [CAMBIO] Elevacion (ajuste `elevation`; el original era plano): cada casilla tiene una altura
 * (core/elevation.ts, la prepara el modulo del relieve al empezar la partida) y con este ajuste cuenta:
 * - desde arriba se acierta mas y desde abajo menos (`elevationHit` por nivel de diferencia; tambien
 *   al contraatacar, que es el mismo combate al reves);
 * - desde arriba se ve mas (`elevationVision` casillas por nivel);
 * - subir cuesta (`elevationClimb` por nivel al entrar en una casilla mas alta; bajar no cuesta).
 * Los aviones van por encima de todo: ni ven mas, ni aciertan distinto, ni les cuesta subir. Como
 * todo pasa por las reglas (el acierto, la vision, el coste de cada paso), la prevision de combate,
 * el alcance y la IA lo tienen en cuenta solos.
 */
import { entryOf, type MoveType } from '../content';
import { elevationAt, heightDifference, MAX_ELEVATION } from '../elevation';
import { unitTypeOf } from '../gameContent';
import type { Engagement, GameState, Pos, Unit } from '../model';
import type { RuleModule } from './hooks';

/** El tipo de movimiento va por encima del terreno (los aviones: movements.json, "crossesEverything"). */
const fliesOver = (s: GameState, movement: MoveType): boolean => entryOf(s.content.movements, movement, 'movimiento').crossesEverything;
const isFlying = (s: GameState, unit: Pick<Unit, 'type'>): boolean => fliesOver(s, unitTypeOf(s, unit).movement);

/** El acierto por la altura: mas desde arriba, menos desde abajo; entre aviones (o contra ellos), nada. */
function highGround(s: GameState, { attacker, defender }: Engagement): number {
  if (isFlying(s, attacker.unit) || isFlying(s, defender.unit)) return 1;
  const levels = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, heightDifference(s, attacker.at, defender.at)));
  return 1 + s.settings.elevationHit * levels;
}

/** Lo que se ve de mas desde lo alto (solo quien esta en el suelo). */
function lookout(s: GameState, unit: Unit, radius: number): number {
  if (radius <= 0 || isFlying(s, unit)) return radius;
  return radius + s.settings.elevationVision * elevationAt(s, unit);
}

/** Lo que cuesta de mas subir a `pos` desde `from` (bajar o seguir llano no cuesta; volando, tampoco). */
function climb(s: GameState, movement: MoveType, pos: Pos, cost: number, from: Pos | null): number {
  if (!from || fliesOver(s, movement)) return cost;
  return cost + s.settings.elevationClimb * Math.max(0, heightDifference(s, pos, from));
}

export const ELEVATION: RuleModule = {
  id: 'elevation',
  isOn: (settings) => settings.elevation,
  hooks: {
    hitModifiers: [{ id: 'highGround', factor: highGround }],
    visionRadius: [{ id: 'elevation', radius: lookout }],
    enterCosts: [{ id: 'climb', cost: climb }],
  },
};
