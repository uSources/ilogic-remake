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
import { skirmishConfig, type MatchTeam } from '@core/match';
import { seededRng } from '@core/util/random';
import { defaultContent } from '@core/content/default';
import { isMatchOver, matchResult } from '@core/rules';
import { serialize } from '@core/save';
import { posOf } from '@core/geom';
import { assistTurn } from '@core/autopilot';
import { aiController, controllersFor, type AiBrain } from '@core/controllers';
import { GameSession, runMatch, scriptedController, sequence, type Controller } from '@core/session';
import { duel, enemiesOf, playerTeam } from '@core/teams';
import type { GameAction, GameState, Rng, RulesConfig, TeamId } from '@core/model';

const MAX_DAYS = 30;
const FIRST_DAY = 1;
const GENERALS = defaultContent().generals;

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
 * Las ordenes de la persona en su primer turno: junta sus tres primeras unidades en una escuadra y la
 * manda a atacar un edificio enemigo.
 */
function squadOrders(s: GameState, person: TeamId): GameAction[] {
  if (s.day !== FIRST_DAY) return [];
  const enemies = enemiesOf(s, person);
  const target = s.buildings.find((building) => building.owner !== null && enemies.includes(building.owner));
  const squad = s.units
    .filter((unit) => unit.team === person && unit.squad === undefined)
    .map((unit) => unit.uid)
    .slice(0, 3);
  if (!target || squad.length < 2) return [];
  return [
    { kind: 'formSquad', uids: squad },
    { kind: 'giveStandingOrder', uids: squad, order: { kind: 'attack', at: posOf(target) } },
  ];
}

/**
 * Solo de la huella: la persona cumple ya, en su turno, las ordenes que acaba de dar (lo que hacia el
 * piloto automatico de antes; al acabar el turno las cumpliria igual la partida, TURN_END_PHASES).
 */
const followOrdersNow: AiBrain = (s, _rng, team, dispatcher) => assistTurn(s, team, dispatcher);

/**
 * Quien juega cada equipo: la IA, con el mismo azar para todos; la persona, si lleva escuadra, da sus
 * ordenes el primer dia y deja antes que su piloto automatico las cumpla (como la IA no las tiene,
 * juega despues).
 */
function controllersOf(s: GameState, scenario: Scenario, rng: Rng): Controller[] {
  const person = playerTeam(s);
  const withSquad = sequence(scriptedController(squadOrders), aiController(rng, followOrdersNow), aiController(rng));
  return controllersFor(s, rng, new Map([[person, scenario.withSquad ? withSquad : aiController(rng)]]));
}

/** Una persona contra la IA; con generales, cada equipo el de su numero en generals.json. */
function teamsOf(scenario: Scenario): MatchTeam[] {
  const generals = GENERALS.list;
  return duel('human', 'ai').map((team, id) => (scenario.withGenerals ? { ...team, general: generals[id]?.id ?? null } : team));
}

function playScenario(scenario: Scenario): string {
  const rng = seededRng(scenario.seed);
  const s = createMatch(
    skirmishConfig({ seed: scenario.seed, size: scenario.size, ruleChanges: scenario.rules, teams: teamsOf(scenario) }),
    rng,
  );

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
