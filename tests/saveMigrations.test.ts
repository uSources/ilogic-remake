import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { loadGame, saveContext } from '@core/defaultGames';
import { missionById, missionRules } from '@core/missions';
import { serialize } from '@core/save';
import { MIGRATIONS, migrateChecked, migrateRead } from '@core/saveMigrations';
import { SAVE_VERSION } from '@core/saveVersion';
import { formSquad, giveStandingOrder } from '@core/squads';
import { newUnit } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';

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
    expect(old.units).toEqual([{ uid: 1, standingOrder: { kind: 'attack', at: { x: 1, y: 1 } }, travelTo: { x: 2, y: 2 } }]);
    // Sin reglas: las de siempre de ese contenido.
    expect(old.rules).toEqual(defaultContent().defaultRules);
  });

  it('los pasos sobre la partida comprobada van aparte y tambien miran la version', () => {
    const world = () => {
      const s = blankState();
      const units = [newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 }), newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 2 })];
      const squad = formSquad(s, units)!;
      // Partida de antes de que la escuadra tuviera orden: la llevaba copiada cada unidad.
      giveStandingOrder(s, [units[0]!], 'defend', { x: 5, y: 5 });
      giveStandingOrder(s, [units[1]!], 'defend', { x: 5, y: 5 });
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
