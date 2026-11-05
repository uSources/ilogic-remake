/** La accion de atacar: el combate entero (daño, contraataque, veterania, botin y carga del general). */
import { posOf } from '../geom';
import { chargeFromCombat } from '../generals';
import { attackProblem, bountyFor, canCounter, combatInfoBefore, strike } from '../rules/combat';
import { unitById } from '../rules/queries';
import { endTravel } from '../rules/travel';
import { spendUnit } from '../rules/unitTurn';
import { earn } from '../rules/funds';
import { isAlive } from '../util/predicates';
import type { Dice, GameEventOf, GameState, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit } from './checks';
import type { ActionRegistry } from './types';

/** Quien destruye a otra unidad gana una baja (veterania), si sigue viva. */
function countKills(attacker: Unit, defender: Unit): void {
  if (!isAlive(defender) && isAlive(attacker)) attacker.kills = (attacker.kills ?? 0) + 1;
  if (!isAlive(attacker) && isAlive(defender)) defender.kills = (defender.kills ?? 0) + 1;
}

/** [CAMBIO] Botin: quien destruye cobra parte del precio de lo destruido (atacar sale a cuenta). Devuelve lo cobrado. */
function payBounty(s: GameState, attacker: Unit, defender: Unit): number {
  const loser = !isAlive(defender) ? defender : !isAlive(attacker) ? attacker : null;
  if (!loser) return 0;
  const winner: TeamId = loser === defender ? attacker.team : defender.team;
  const bounty = bountyFor(s, loser);
  earn(s, winner, bounty);
  return bounty;
}

/**
 * El combate de `attacker` contra `defender`, ya comprobado (attackProblem): daño, contraataque si las
 * reglas lo tienen, carga de los generales, bajas y botin. Devuelve su suceso, que lleva lo que hace
 * falta para enseñarlo aunque alguna de las dos ya no exista (ver CombatInfo). Las que caen las quita
 * despues `dispatch` (INVARIANTS).
 */
export function resolveAttack(s: GameState, attacker: Unit, defender: Unit, dice: Dice): GameEventOf<'attack'> {
  const combat = combatInfoBefore(s, attacker, defender);
  const at = posOf(defender);
  const damage = strike(s, attacker, defender, dice);
  defender.life -= damage;
  defender.hitDay = s.day;
  // Atacar gasta el turno entero de la unidad.
  spendUnit(attacker);
  const counter = canCounter(s, defender, attacker) ? strike(s, defender, attacker, dice) : 0;
  attacker.life -= counter;
  const charge = chargeFromCombat(s, attacker, defender, damage, counter);
  countKills(attacker, defender);
  const bounty = payBounty(s, attacker, defender);
  const killed = !isAlive(defender);
  // Si el defensor cae no hay contraataque, aunque pudiera haberlo.
  if (killed) combat.counterHit = null;
  return {
    kind: 'attack',
    actor: attacker.team,
    attacker: attacker.uid,
    target: defender.uid,
    at,
    damage,
    killed,
    counter,
    attackerKilled: !isAlive(attacker),
    ...(bounty ? { bounty } : {}),
    ...(charge.length ? { charge } : {}),
    combat,
  };
}

export const COMBAT_ACTIONS: Pick<ActionRegistry, 'attack'> = {
  attack: {
    validate: (s, team, action) => {
      const target = unitById(s, action.target);
      if (!target) return 'missing';
      return actorProblem(s, team, action.uid, (attacker) => attackProblem(s, attacker, target));
    },
    apply: (s, team, action, dice) => {
      const attacker = checkedUnit(s, action.uid);
      // Atacar a mano (tambien sin moverse) acaba su viaje, como mover.
      const cancelled = endTravel(team, attacker);
      return [...cancelled, resolveAttack(s, attacker, checkedUnit(s, action.target), dice)];
    },
  },
};
