import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { loadGame, saveContext } from '@core/defaultGames';
import { missionById, missionRules } from '@core/missions';
import { deserialize, readSave, serialize } from '@core/save';
import { MIGRATIONS, migrateChecked, migrateRead } from '@core/saveMigrations';
import { SAVE_VERSION } from '@core/saveVersion';
import { formSquad } from '@core/squads/membership';
import { giveStandingOrder } from '@core/squads/standingOrders';
import { newUnit, outcome } from '@core/rules';
import { blankState, unitTypeNamed, someUnits, act } from './helpers';
import { isHostile } from '@core/teams';
import { loadContent, type Content } from '@core/content';
import { mutableCopy } from '@core/util/freeze';

/**
 * Partidas guardadas de verdad con el formato 1: las genero el codigo de origin/main (ac92f17) con
 * generateGame/buildMission/giveCommand y serialize, sin tocarlas a mano:
 * - skirmish-v1: reglas elegidas (sin niebla, mantenimiento 0.05, 20 puntos de mando, ingresos x1.5,
 *   30 dias), una escuadra con orden (`command`), una unidad con orden propia y otra de viaje (`order`);
 * - mission-no-rules-v1: la mision bridgehead recien empezada (main no le ponia reglas);
 * - mission-skirmish-rules-v1: la misma, cargada y vuelta a guardar con las reglas de escaramuza que le
 *   ponia la escena de main al cargar (el fallo K1);
 * - squad-unit-orders-v1: una escuadra sin orden cuyas dos unidades llevan la misma (dada a cada una).
 */
const fixture = (name: string) => readFileSync(`tests/fixtures/saves/${name}.json`, 'utf8');

describe('partidas guardadas con el formato 1 (de origin/main)', () => {
  it('escaramuza: sus reglas, la orden de la escuadra, la propia y el viaje, con los nombres de ahora', () => {
    const s = loadGame(fixture('skirmish-v1'))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.rules).toMatchObject({ fog: false, upkeep: 0.05, commandPoints: 20, incomeScale: 1.5, dayLimit: 30 });
    expect(s.squads![0]!.standingOrder).toEqual({ kind: 'attack', at: { x: 19, y: 5 } });
    const [inSquad, loner, traveller] = s.units.filter((unit) => unit.team === 0);
    expect(inSquad!.squad).toBe(s.squads![0]!.id);
    expect(loner!.standingOrder).toEqual({ kind: 'defend', at: { x: 1, y: 3 } });
    expect(traveller!.travelTo).toEqual({ x: 10, y: 10 });
    const saved = serialize(s);
    expect(saved).not.toContain('"command"');
    expect(saved).not.toContain('"order"');
    expect(saved).toContain(`"version":${SAVE_VERSION}`);
    expect(s.units.every((unit) => typeof unit.type === 'string')).toBe(true);
    expect(s.teams.map((team) => team.controller)).toEqual(['human', 'ai']);
    expect(s.squads![0]!.team).toBe(0);
    // Lo que se vuelve a guardar ya es del formato nuevo y se lee igual.
    expect(serialize(loadGame(saved)!)).toBe(saved);
  });

  it('escuadra sin orden cuyas unidades llevan la misma: la orden pasa a la escuadra', () => {
    const s = loadGame(fixture('squad-unit-orders-v1'))!;
    const squad = s.squads![0]!;
    expect(squad.standingOrder).toEqual({ kind: 'attack', at: { x: 18, y: 13 } });
    for (const unit of s.units.filter((candidate) => candidate.squad === squad.id)) expect(unit.standingOrder).toBeUndefined();
  });

  it.each(['mission-no-rules-v1', 'mission-skirmish-rules-v1'])('%s: la mision se juega con sus reglas (K1)', (name) => {
    const s = loadGame(fixture(name))!;
    const mission = missionById(s.mission!.id)!;
    expect(s.rules).toEqual(missionRules(mission, defaultContent()));
    expect(s.rules).not.toEqual(defaultContent().defaultRules);
  });
});

/**
 * Partidas guardadas de verdad con el formato 2 (tipos por numero): las genero el codigo de
 * origin/main (8671268) con createGame/buildMission, aiTurn, endRound y serialize, sin tocarlas a mano:
 * - skirmish-v2: 13 dias de IA contra IA en pantano (tema 3) con lluvia, generales (Brisa y Roca),
 *   puntos de control, estadisticas, una escuadra con orden y un soldado dentro de un transporte;
 * - mission-capture-v2: la mision bridgehead (capturar 6 ciudades: `type: 0`) jugada 2 dias, con una
 *   captura a medias.
 */
describe('partidas guardadas con el formato 2 (de origin/main)', () => {
  it('escaramuza: unidades, edificios, terreno, tema y clima pasan de numero a id', () => {
    const s = loadGame(fixture('skirmish-v2'))!;
    expect(s.version).toBe(SAVE_VERSION);
    // Los numeros del fichero (0, 0, 0, 2, 5, 4, 16...) eran el puesto en el units.json de entonces.
    expect(s.units.slice(0, 7).map((unit) => unit.type)).toEqual([
      'Soldier',
      'Soldier',
      'Soldier',
      'Artillery',
      'Blocker',
      'LTank',
      'MSoldier',
    ]);
    // Terreno 0 y 2: hierba y bosque.
    expect(s.map[0]!.slice(0, 6)).toEqual(['Grass', 'Grass', 'Grass', 'Grass', 'Woods', 'Woods']);
    expect(s.theme).toBe('Swamp');
    expect(s.setup).toEqual({ seed: 3, size: 20, theme: 'Swamp' });
    expect(s.weather).toMatchObject({ kind: 'Rain', next: 'Clear' });
    expect(s.buildings.filter((building) => building.type === 'Base')).toHaveLength(2);
    expect(s.teams.map((team) => team.general?.id)).toEqual(['Brisa', 'Roca']);
    expect(s.units.some((unit) => unit.carrier !== null)).toBe(true);
    expect(s.squads![0]!.standingOrder).toEqual({ kind: 'attack', at: { x: 0, y: 2 } });
    const saved = serialize(s);
    expect(serialize(loadGame(saved)!)).toBe(saved);
  });

  it('escaramuza: los dos bandos fijos pasan a dos equipos enemigos con su dinero y sus estadisticas', () => {
    const raw = JSON.parse(fixture('skirmish-v2')) as {
      funds: [number, number];
      stats: { built: [number, number]; lost: [number, number]; army: [number, number][] };
    };
    const s = loadGame(fixture('skirmish-v2'))!;
    expect(s.teams.map((team) => [team.id, team.alliance, team.controller])).toEqual([
      [0, 0, 'human'],
      [1, 1, 'ai'],
    ]);
    expect(s.teams.map((team) => team.funds)).toEqual(raw.funds);
    expect(s.teams.map((team) => team.stats.built)).toEqual(raw.stats.built);
    expect(s.teams.map((team) => team.stats.lost)).toEqual(raw.stats.lost);
    expect(s.teams[1]!.stats.army).toEqual(raw.stats.army.map((day) => day[1]));
    expect(s.squads!.every((squad) => squad.team === 0)).toBe(true);
    expect(isHostile(s, 0, 1)).toBe(true);
    const saved = JSON.parse(serialize(s)) as Record<string, unknown>;
    expect(saved).not.toHaveProperty('funds');
    expect(saved).not.toHaveProperty('generals');
    expect(saved).not.toHaveProperty('stats');
  });

  it('con el contenido de ahora reordenado, la partida antigua da los mismos ids (el paso usa su copia fija)', () => {
    const files = mutableCopy<Content>(defaultContent().files);
    files.units.reverse();
    files.buildings.reverse();
    files.terrain.reverse();
    files.weather.reverse();
    const reordered = deserialize(fixture('skirmish-v2'), saveContext(loadContent(files)))!;
    const usual = loadGame(fixture('skirmish-v2'))!;
    expect(reordered.units.map((unit) => unit.type)).toEqual(usual.units.map((unit) => unit.type));
    expect(reordered.buildings.map((building) => building.type)).toEqual(usual.buildings.map((building) => building.type));
    expect(reordered.map).toEqual(usual.map);
    expect(reordered.weather).toEqual(usual.weather);
  });

  it('mision: el tipo del objetivo de captura y la captura a medias', () => {
    const s = loadGame(fixture('mission-capture-v2'))!;
    expect(s.mission!.objective).toEqual({ kind: 'capture', count: 6, type: 'City', days: 14 });
    // La mision era del jugador (el bando 0): ahora lo dice ella.
    expect(s.mission!.team).toBe(0);
    expect(outcome(s, 0)).toBe('playing');
    expect(s.theme).toBe('Plains');
    expect(s.buildings.some((building) => building.capture)).toBe(true);
    expect(s.rules).toEqual(missionRules(missionById('bridgehead')!, defaultContent()));
  });

  it('un numero de tipo que no existe no se convierte: la partida no se lee', () => {
    const raw = JSON.parse(fixture('skirmish-v2')) as { units: { type: number }[] };
    raw.units[0]!.type = 99;
    expect(loadGame(JSON.stringify(raw))).toBeNull();
  });
});

/**
 * Partida guardada de verdad con el formato 3: la genero el codigo de la fase 2 (3b96611, rama
 * nucleo/contenido-equipos) con 6 dias de IA contra IA (tema y generales, niebla y clima), una captura
 * a medias, una unidad movida, otra que ya ha esperado y una escuadra con orden, sin tocarla a mano.
 */
describe('partida guardada con el formato 3', () => {
  it('se lee, y sus dados salen de la propia partida: siempre los mismos', () => {
    const json = fixture('skirmish-v3');
    const s = loadGame(json)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.dice).toBe(loadGame(json)!.dice);
    expect(Number.isInteger(s.dice)).toBe(true);
    expect(s.buildings.some((building) => building.capture)).toBe(true);
    expect(s.squads?.[0]?.standingOrder?.kind).toBe('defend');
  });

  it('las tres banderas del turno de cada unidad pasan a su turnState', () => {
    const s = loadGame(fixture('skirmish-v3'))!;
    const turnOf = (uid: number) => s.units.find((unit) => unit.uid === uid)?.turnState;
    // La 10 ha capturado y la 2 ha esperado (active: false); la 1 se ha movido (canMove: false).
    expect([turnOf(10), turnOf(2), turnOf(1)]).toEqual(['done', 'done', 'moved']);
    expect(s.units.some((unit) => 'active' in unit || 'canMove' in unit || 'canFire' in unit)).toBe(false);
  });

  it('una del formato 4 sin dados esta rota', () => {
    const raw = JSON.parse(serialize(loadGame(fixture('skirmish-v3'))!)) as Record<string, unknown>;
    delete raw.dice;
    expect(loadGame(JSON.stringify(raw))).toBeNull();
  });
});

/**
 * Partida guardada de verdad con el formato 4: la genero el codigo de fc127b5 (esta rama, antes de
 * `nextSquadId`) con 4 dias de IA contra IA y tres escuadras del jugador, la tercera ya vaciada.
 */
describe('partida guardada con el formato 4', () => {
  it('sigue numerando las escuadras desde la mayor, y desde ahi ningun numero se repite', () => {
    const json = fixture('skirmish-v4');
    expect(JSON.parse(json)).not.toHaveProperty('nextSquadId');
    const s = loadGame(json)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.squads?.map((squad) => squad.id)).toEqual([1, 2]);
    expect(s.nextSquadId).toBe(3);
    const loner = s.units.find((unit) => unit.team === 0 && unit.squad === undefined && unit.carrier === null)!;
    act(s, 0, { kind: 'formSquad', uids: [loner.uid] });
    act(s, 0, { kind: 'leaveSquad', uids: [loner.uid] });
    const [formed] = act(s, 0, { kind: 'formSquad', uids: [loner.uid] });
    expect(formed).toMatchObject({ kind: 'squad', change: 'formed', squad: 4 });
  });

  it('un nextSquadId roto o por debajo de las escuadras que hay se arregla al leer', () => {
    const raw = JSON.parse(serialize(loadGame(fixture('skirmish-v4'))!)) as Record<string, unknown>;
    raw.nextSquadId = 1;
    expect(loadGame(JSON.stringify(raw))!.nextSquadId).toBe(3);
    raw.nextSquadId = 'x';
    expect(loadGame(JSON.stringify(raw))!.nextSquadId).toBe(3);
  });

  /** La partida del formato 4 con `nextUid` y `nextSquadId` escritos a mano (como un fichero roto). */
  const withCounters = (written: string) => {
    const s = loadGame(fixture('skirmish-v4'))!;
    const json = serialize(s)
      .replace(/"nextUid":\d+/, `"nextUid":${written}`)
      .replace(/"nextSquadId":\d+/, `"nextSquadId":${written}`);
    return { s, read: readSave(json, saveContext(s.content)) };
  };

  it('los contadores rotos (1e300, 3,5, -4, null) se arreglan: el mayor que hay + 1', () => {
    for (const broken of ['1e300', '3.5', '-4', 'null']) {
      const { s, read } = withCounters(broken);
      const highestUid = Math.max(...s.units.map((unit) => unit.uid));
      expect(read.ok && [read.state.nextUid, read.state.nextSquadId]).toEqual([highestUid + 1, 3]);
    }
  });

  it('con Infinity el fichero no es JSON: no se lee', () => {
    expect(withCounters('Infinity').read).toEqual({ ok: false, error: 'notJson' });
  });
});

describe('MIGRATIONS', () => {
  it('cada paso es para versiones anteriores a la actual y tiene un nombre propio', () => {
    for (const migration of MIGRATIONS) expect(migration.upToVersion).toBeLessThan(SAVE_VERSION);
    expect(new Set(MIGRATIONS.map((migration) => migration.name)).size).toBe(MIGRATIONS.length);
  });

  it('los pasos sobre el JSON solo tocan las partidas de las versiones que los necesitan', () => {
    const raw = () => ({ version: 1, units: [{ uid: 1, command: { kind: 'attack', at: { x: 1, y: 1 } }, order: { x: 2, y: 2 } }] });
    const context = saveContext(defaultContent());
    const current = raw();
    migrateRead(current, SAVE_VERSION, context);
    expect(current).toEqual(raw());
    const old: Record<string, unknown> = raw();
    migrateRead(old, 1, context);
    // Sin banderas del turno (active...): la del formato 3 la da por gastada.
    expect(old.units).toEqual([
      { uid: 1, standingOrder: { kind: 'attack', at: { x: 1, y: 1 } }, travelTo: { x: 2, y: 2 }, turnState: 'done' },
    ]);
    // Sin reglas: las de siempre de ese contenido.
    expect(old.rules).toEqual(defaultContent().defaultRules);
  });

  it('los pasos sobre la partida comprobada van aparte y tambien miran la version', () => {
    const world = () => {
      const s = blankState();
      const units = [newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 }), newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 2 })];
      const squad = formSquad(s, 0, someUnits(units)).squad;
      // Partida de antes de que la escuadra tuviera orden: la llevaba copiada cada unidad.
      giveStandingOrder(s, 0, [units[0]!], 'defend', { x: 5, y: 5 });
      giveStandingOrder(s, 0, [units[1]!], 'defend', { x: 5, y: 5 });
      return { s, squad };
    };
    const context = saveContext(defaultContent());
    const current = world();
    migrateChecked(current.s, SAVE_VERSION, context);
    expect(current.squad.standingOrder).toBeUndefined();
    const old = world();
    migrateChecked(old.s, 1, context);
    expect(old.squad.standingOrder).toEqual({ kind: 'defend', at: { x: 5, y: 5 } });
  });
});
