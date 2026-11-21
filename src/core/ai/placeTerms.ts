/**
 * Las razones de la IA que miran el mapa entero (docs/PLAN-IA.md, fase 1), con sus mapas de influencia
 * (influence.ts): donde acabar el turno (`PLACE_TERMS`) y lo que cuesta quedarse expuesta despues de
 * atacar (`EXPOSURE_TERM`). Una razon nueva es una entrada mas.
 */
import { manhattan } from '../geom';
import { teamUnits } from '../rules/queries';
import { MAX_LIFE } from '../data';
import { isOnMap } from '../util/predicates';
import type { AttackScoreTerm, PlaceOption, PlaceScoreTerm } from '../autopilot/profile';
import { unitValue } from '../autopilot/scoring';
import type { GameState, Pos, Unit } from '../model';

/**
 * Cuanto pesa el peligro en una casilla: entero en zona enemiga o disputada; una parte
 * (`supportedDangerShare`) en zona propia, donde los suyos responderian.
 */
function dangerWeight(place: Pick<PlaceOption, 'weights' | 'influence'>, at: Pos): number {
  return place.influence.control(at) > 0 ? place.weights.supportedDangerShare : 1;
}

/** Hay otra unidad suya a `companyRadius` casillas o menos de `at` (en pasos en linea). */
function hasCompany(s: GameState, unit: Unit, at: Pos, radius: number): boolean {
  return teamUnits(s, unit.team).some((other) => other.uid !== unit.uid && isOnMap(other) && manhattan(other, at) <= radius);
}

/** Donde acabar el turno, ademas de los pasos que faltan hasta el objetivo (en pasos). */
export const PLACE_TERMS: readonly PlaceScoreTerm[] = [
  {
    // No acabar donde la pueden destruir (o casi) sin necesidad: cuesta hasta `dangerAversion` pasos.
    id: 'danger',
    cost: (place) => {
      const share = Math.min(place.influence.dangerFor(place.unit, place.at) / Math.max(1, place.unit.life), 1);
      return place.weights.dangerAversion * share * dangerWeight(place, place.at);
    },
  },
  {
    // Avanzar en grupo: acabar sin nadie de los suyos cerca cuesta `lonelinessCost` pasos.
    id: 'company',
    cost: (place) => (hasCompany(place.s, place.unit, place.at, place.weights.companyRadius) ? 0 : place.weights.lonelinessCost),
  },
];

/**
 * Lo que cuesta quedarse donde se dispara: la vida que le pueden quitar alli en el turno del enemigo,
 * en valor de la unidad, por `exposureShare` (menos en zona propia).
 */
export const EXPOSURE_TERM: AttackScoreTerm = {
  id: 'exposure',
  value: (attack) => {
    const { influence, attacker, from, weights, s } = attack;
    if (!influence) return 0;
    const danger = Math.min(influence.dangerFor(attacker, from), MAX_LIFE);
    return -danger * unitValue(s, weights, attacker) * weights.exposureShare * dangerWeight({ weights, influence }, from);
  },
};
