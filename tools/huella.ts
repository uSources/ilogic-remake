/**
 * Huella del comportamiento del juego: juega partidas IA contra IA con semilla fija y resume en un
 * solo codigo todo lo que pasa (cada suceso y el estado entero tras cada ronda). Sirve para
 * reescribir codigo sin cambiar lo que hace: la huella de antes y la de despues tienen que ser
 * iguales. Mas estricta que tests/aiGolden.test.ts: varias reglas, tamaños, generales y escuadras
 * del jugador con ordenes.
 *
 *   npm run huella            imprime la huella de cada partida y la total
 *   npm run huella -- --total solo la total (para comparar de un vistazo)
 */
import { createHash } from 'node:crypto';
import { aiTurn, assistTurn } from '@core/ai';
import { DEFAULT_RULES, GENERALS, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { newGeneral } from '@core/generals';
import { generateGame } from '@core/mapgen';
import { endRound, outcome } from '@core/rules';
import { formSquad, giveCommand } from '@core/squads';
import type { RulesConfig } from '@core/model';
import type { GameState, Team } from '@core/model';

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

/** El jugador junta sus tres primeras unidades en una escuadra y la manda a atacar la base enemiga. */
function orderPlayerSquad(s: GameState): void {
  const target = s.buildings.find((b) => b.owner === 1);
  if (!target) return;
  const squadUnits = s.units.filter((u) => u.team === 0 && u.squad === undefined).slice(0, 3);
  if (squadUnits.length < 2 || !formSquad(s, squadUnits)) return;
  giveCommand(s, squadUnits, 'attack', target);
}

function playScenario(scenario: Scenario): string {
  useRules({ ...DEFAULT_RULES, ...scenario.rules });
  const rng = seededRng(scenario.seed);
  const s = generateGame(rng, { size: scenario.size });
  if (scenario.withGenerals) s.generals = [newGeneral(GENERALS[0]?.id), newGeneral(GENERALS[1]?.id)];
  if (scenario.withSquad) orderPlayerSquad(s);

  const hash = createHash('sha256');
  const record = (value: unknown) => hash.update(JSON.stringify(value));
  const isOver = () => outcome(s) !== 'playing';

  while (!isOver() && s.day <= MAX_DAYS) {
    for (const team of [0, 1] as Team[]) {
      if (team === 0 && scenario.withSquad) for (const event of assistTurn(s, rng, 0)) record(event);
      for (const event of aiTurn(s, rng, team)) {
        record(event);
        if (isOver()) break;
      }
      if (isOver()) break;
    }
    endRound(s);
    record(s);
  }
  record(outcome(s));
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
useRules(DEFAULT_RULES);
console.log(`huella total: ${total.digest('hex').slice(0, 16)}`);
