/**
 * [CAMBIO] La IA usa a su general (ver core/generals.ts). Un poder por turno, al empezarlo, antes
 * de mover: asi un ataque aereo debilita a quien luego puede rematar, y el reconocimiento le deja
 * ver antes de decidir.
 *
 * Cada poder se valora en "valor" (precio × vida que quita / 100, como el resto de la IA) con el
 * `aiValue` de su clase de efecto (POWER_EFFECTS, generalPowers.ts). Se usa el de mas valor si llega
 * a su minPowerValue (ai.json, en el perfil de la IA). Con la barra llena se usa cualquiera que valga algo, para no desperdiciar la
 * carga que seguiria ganando. Una clase de efecto nueva no toca esto.
 */
import { chargeStars, generalOf } from '../generals';
import { powerValue } from '../generalPowers';
import { act, type PlayCtx } from '../autopilot/context';
import type { AiWeights } from '../content';
import type { ActionPlan, GameState, Pos, TeamId } from '../model';
import { maxBy } from '../util/pick';

export interface PowerChoice {
  power: string;
  target: Pos | null;
  value: number;
}

/** Que poder usaria ahora la IA (null = ninguna, guarda la carga). */
export function choosePower(s: GameState, team: TeamId, weights: Readonly<AiWeights>): PowerChoice | null {
  const general = generalOf(s, team);
  if (!general || general.state.used) return null;
  const stars = chargeStars(general.state);
  const choices: PowerChoice[] = [];
  for (const power of general.definition.powers) {
    if (power.cost > stars) continue;
    const valued = powerValue(s, team, power, weights);
    if (valued) choices.push({ power: power.id, ...valued });
  }
  const best = maxBy(choices, (choice) => choice.value);
  if (!best) return null;
  const isChargeFull = stars >= general.definition.charge.max;
  return best.value >= weights.minPowerValue || (isChargeFull && best.value > 0) ? best : null;
}

/** Turno del general de la IA: como mucho un poder. */
export function* aiGeneral(s: GameState, play: PlayCtx): ActionPlan {
  const choice = choosePower(s, play.me, play.profile.weights);
  if (!choice) return;
  yield* act({ kind: 'usePower', power: choice.power, target: choice.target });
}
