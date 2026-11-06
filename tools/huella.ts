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
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { seededRng } from '@core/util/random';
import { appointGeneral } from '@core/generals';
import { isMatchOver, matchResult } from '@core/rules';
import { serialize } from '@core/save';
import { dispatch } from '@core/actions';
import { posOf } from '@core/geom';
import { aiController, controllersFor, standingOrderAutopilot } from '@core/controllers';
import { GameSession, runMatch, sequence, type Controller } from '@core/session';
import { duel, enemiesOf, playerTeam, teamIds } from '@core/teams';
import type { GameState, Rng, RulesConfig } from '@core/model';

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

/**
 * La persona junta sus tres primeras unidades en una escuadra y la manda a atacar un edificio
 * enemigo, al empezar su primer turno.
 */
function orderPlayerSquad(s: GameState): void {
  const person = playerTeam(s);
  const enemies = enemiesOf(s, person);
  const target = s.buildings.find((building) => building.owner !== null && enemies.includes(building.owner));
  if (!target) return;
  const uids = s.units.filter((unit) => unit.team === person && unit.squad === undefined).map((unit) => unit.uid);
  const squad = uids.slice(0, 3);
  if (squad.length < 2) return;
  dispatch(s, person, { kind: 'startTurn' });
  if (!dispatch(s, person, { kind: 'formSquad', uids: squad }).ok) return;
  dispatch(s, person, { kind: 'giveStandingOrder', uids: squad, order: { kind: 'attack', at: posOf(target) } });
}

/**
 * Quien juega cada equipo: la IA, con el mismo azar para todos; la persona, si lleva escuadra, deja
 * antes que su piloto automatico cumpla las ordenes (como la IA no las tiene, juega despues).
 */
function controllersOf(s: GameState, scenario: Scenario, rng: Rng): Controller[] {
  const person = playerTeam(s);
  const personController = scenario.withSquad ? sequence(standingOrderAutopilot(), aiController(rng)) : aiController(rng);
  return controllersFor(s, rng, new Map([[person, personController]]));
}

function playScenario(scenario: Scenario): string {
  const rng = seededRng(scenario.seed);
  const s = createMatch(
    skirmishConfig({ seed: scenario.seed, size: scenario.size, ruleChanges: scenario.rules, teams: duel('human', 'ai') }),
    rng,
  );
  const generals = s.content.generals.list;
  if (scenario.withGenerals) for (const team of teamIds(s)) appointGeneral(s, team, generals[team]?.id);
  if (scenario.withSquad) orderPlayerSquad(s);

  const hash = createHash('sha256');
  const record = (value: unknown) => hash.update(JSON.stringify(value));
  const session = new GameSession(s, controllersOf(s, scenario, rng));
  session.subscribe((step) => {
    // Cada suceso; si la partida acaba con esta accion, hasta el primero (como al jugarla suceso a suceso).
    for (const event of step.events) {
      record(event);
      if (isMatchOver(s)) break;
    }
    // Y el estado entero al acabar cada ronda.
    if (step.events.some((event) => event.kind === 'newDay')) hash.update(serialize(s));
  });
  runMatch(session, { until: (state) => state.day > MAX_DAYS });
  record(matchResult(s));
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
