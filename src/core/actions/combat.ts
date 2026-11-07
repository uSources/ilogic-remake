/**
 * La accion de atacar y lo que pasa en un ataque (COMBAT_RESOLUTION): el golpe, el contraataque y lo
 * que aportan los modulos de reglas (la carga de los generales, el botin).
 */
import { posOf } from '../geom';
import { attackProblem, canCounter, combatInfoBefore, strike } from '../rules/combat';
import { fallenIn, newAttackRecord } from '../rules/attackRecord';
import { unitById } from '../rules/queries';
import { endTravel } from '../rules/travel';
import { canStillMove, spendUnit } from '../rules/unitTurn';
import { engagement } from '../rules/engagement';
import type { CombatStage, CombatStep } from '../ruleModules/hooks';
import { hooksOf, inStageOrder } from '../ruleModules/ruleset';
import { isAlive } from '../util/predicates';
import type { ActionRegistry, AttackRecord, AttackRecordParts, Dice, GameEventOf, GameState, Unit } from '../model';
import { actorProblem, checkedUnit } from './checks';

/** Los momentos de un ataque, en orden: el golpe, el contraataque, lo de herir y lo de que una caiga. */
export const COMBAT_STAGES: readonly CombatStage[] = ['strike', 'counter', 'wound', 'kill'];

/** El atacante dispara: el defensor pierde la vida de la tirada y queda tocado hoy; atacar gasta el turno entero. */
function strikeDefender(s: GameState, attack: AttackRecord, dice: Dice): void {
  const { attacker, defender } = attack;
  attack.damage = strike(s, engagement(attacker, defender), dice);
  defender.life -= attack.damage;
  defender.hitDay = s.day;
  spendUnit(attacker);
}

/** Si el defensor puede responder (canCounter: las reglas de contraataque de los modulos), devuelve el golpe. */
function counterAttack(s: GameState, attack: AttackRecord, dice: Dice): void {
  const { attacker, defender } = attack;
  if (!canCounter(s, engagement(attacker, defender))) return;
  attack.counter = strike(s, engagement(defender, attacker), dice);
  attacker.life -= attack.counter;
}

/** Quien destruye a la otra gana una baja (la veterania sale de ahi, aunque la partida no la tenga puesta). */
function countKill(_s: GameState, attack: AttackRecord): void {
  const fallen = fallenIn(attack);
  if (fallen) fallen.winner.kills = (fallen.winner.kills ?? 0) + 1;
}

/**
 * Lo que pasa en cualquier ataque, cada paso en su momento. Lo que depende de la partida lo ponen sus
 * modulos de reglas (`combatSteps`): la carga de los generales al herir, el botin si una cae. Un
 * efecto nuevo de los combates (moral, experiencia por daño...) es un paso de su modulo.
 */
export const COMBAT_RESOLUTION: readonly CombatStep[] = [
  { id: 'strike', stage: 'strike', run: strikeDefender },
  { id: 'counter', stage: 'counter', run: counterAttack },
  { id: 'kills', stage: 'kill', run: countKill },
];

/** Los pasos de un ataque en esta partida, en orden: por momento y, en cada uno, los de siempre y luego los de sus modulos. */
export function combatResolutionOf(s: GameState): CombatStep[] {
  return inStageOrder(COMBAT_STAGES, COMBAT_RESOLUTION, hooksOf(s, 'combatSteps'));
}

/** Lo que han apuntado los modulos, por orden de nombre (el suceso sale igual sea cual sea el orden de sus pasos). */
const partsInNameOrder = (parts: Partial<AttackRecordParts>): Partial<AttackRecordParts> =>
  Object.fromEntries(Object.entries(parts).sort(([first], [second]) => (first < second ? -1 : 1)));

/**
 * El combate de `attacker` contra `defender`, ya comprobado (attackProblem): los pasos de
 * COMBAT_RESOLUTION en su orden. Devuelve su suceso, que lleva lo que hace falta para enseñarlo
 * aunque alguna de las dos ya no exista (ver CombatInfo). Las que caen las quita despues `dispatch`
 * (INVARIANTS).
 */
export function resolveAttack(s: GameState, attacker: Unit, defender: Unit, dice: Dice): GameEventOf<'attack'> {
  const combat = combatInfoBefore(s, engagement(attacker, defender));
  const at = posOf(defender);
  const attack = newAttackRecord(attacker, defender);
  for (const step of combatResolutionOf(s)) step.run(s, attack, dice);
  const killed = !isAlive(defender);
  // Si el defensor cae no hay contraataque, aunque pudiera haberlo.
  if (killed) combat.counterHit = null;
  return {
    kind: 'attack',
    actor: attacker.team,
    attacker: attacker.uid,
    target: defender.uid,
    at,
    damage: attack.damage,
    killed,
    counter: attack.counter,
    attackerKilled: !isAlive(attacker),
    ...partsInNameOrder(attack.parts),
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
      // Atacar sin haberse movido es mandarla a mano: acaba su viaje, como mover. Si ya ha dado el
      // paso del viaje este turno, atacar desde alli no lo acaba (como en main).
      const cancelled = canStillMove(attacker) ? endTravel(team, attacker) : [];
      return [...cancelled, resolveAttack(s, attacker, checkedUnit(s, action.target), dice)];
    },
  },
};
