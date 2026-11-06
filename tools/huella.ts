/**
 * Huella del comportamiento del juego: juega partidas IA contra IA con semilla fija y resume en un
 * solo codigo todo lo que pasa (cada suceso, tambien los del fin de ronda, y el estado entero tras
 * cada ronda). Sirve para
 * reescribir codigo sin cambiar lo que hace: la huella de antes y la de despues tienen que ser
 * iguales. Mas estricta que tests/aiGolden.test.ts: varias reglas, tamaños, generales y escuadras
 * del jugador con ordenes.
 *
 *   npm run huella            imprime la huella de cada partida y la total
 *   npm run huella -- --total solo la total (para comparar de un vistazo)
 */
import { createHash } from 'node:crypto';
import { aiTurn, assistTurn } from '@core/ai';
import { createGame } from '@core/defaultGames';
import { seededRng } from '@core/util/random';
import { appointGeneral } from '@core/generals';
import { endRound, isMatchOver, outcome, turnTakers } from '@core/rules';
import { serialize } from '@core/save';
import { dispatch } from '@core/actions';
import { posOf } from '@core/geom';
import { duel, enemiesOf, playerTeam, teamIds } from '@core/teams';
import type { GameState, RulesConfig } from '@core/model';

const MAX_DAYS = 30;

/** Reglas que se prueban: las de siempre y variantes que apagan las partes con mas condiciones. */
const RULE_SETS: readonly Partial<RulesConfig>[] = [
  {},
  { fog: false, counterattack: false, veterancy: false },
  { ambush: false, terrainCost: false, weather: false, passAllies: false },
  { abilities: false, controlPoints: 0, noHealUnderFire: false, forestHides: false },
];

const MAP_SIZES = [16, 24, 32] as const;

interface Scenario {
  seed: number;
  rules: Partial<RulesConfig>;
  size: number;
  withGenerals: boolean;
  withSquad: boolean;
}

function scenarios(): Scenario[] {
  const list: Scenario[] = [];
  let seed = 1;
  for (const rules of RULE_SETS)
    for (const size of MAP_SIZES) {
      list.push({ seed: seed++, rules, size, withGenerals: false, withSquad: true });
      list.push({ seed: seed++, rules, size, withGenerals: true, withSquad: false });
    }
  return list;
}

/** La persona junta sus tres primeras unidades en una escuadra y la manda a atacar un edificio enemigo. */
function orderPlayerSquad(s: GameState): void {
  const person = playerTeam(s);
  const enemies = enemiesOf(s, person);
  const target = s.buildings.find((building) => building.owner !== null && enemies.includes(building.owner));
  if (!target) return;
  const uids = s.units.filter((unit) => unit.team === person && unit.squad === undefined).map((unit) => unit.uid);
  const squad = uids.slice(0, 3);
  if (squad.length < 2 || !dispatch(s, person, { kind: 'formSquad', uids: squad }).ok) return;
  dispatch(s, person, { kind: 'giveStandingOrder', uids: squad, order: { kind: 'attack', at: posOf(target) } });
}

function playScenario(scenario: Scenario): string {
  const rng = seededRng(scenario.seed);
  const s = createGame(rng, { size: scenario.size, ruleChanges: scenario.rules, teams: duel('human', 'ai') });
  // El equipo de la persona (el primero de duel): el que tiene escuadras con ordenes.
  const person = playerTeam(s);
  const generals = s.content.generals.list;
  if (scenario.withGenerals) for (const team of teamIds(s)) appointGeneral(s, team, generals[team]?.id);
  if (scenario.withSquad) orderPlayerSquad(s);

  const hash = createHash('sha256');
  const record = (value: unknown) => hash.update(JSON.stringify(value));
  const isOver = () => isMatchOver(s);

  while (!isOver() && s.day <= MAX_DAYS) {
    for (const team of turnTakers(s)) {
      if (team === person && scenario.withSquad) for (const event of assistTurn(s, person)) record(event);
      for (const event of aiTurn(s, rng, team)) {
        record(event);
        if (isOver()) break;
      }
      if (isOver()) break;
    }
    for (const event of endRound(s)) record(event);
    hash.update(serialize(s));
  }
  record(outcome(s, person));
  return hash.digest('hex').slice(0, 16);
}

const onlyTotal = process.argv.includes('--total');
const total = createHash('sha256');
for (const scenario of scenarios()) {
  const fingerprint = playScenario(scenario);
  total.update(fingerprint);
  if (!onlyTotal)
    console.log(
      `${fingerprint}  semilla ${scenario.seed}, mapa ${scenario.size}, ${JSON.stringify(scenario.rules)}${scenario.withGenerals ? ', generales' : ''}${scenario.withSquad ? ', escuadra' : ''}`,
    );
}
console.log(`huella total: ${total.digest('hex').slice(0, 16)}`);
