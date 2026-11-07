import { describe, expect, it } from 'vitest';
import { settingsWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import { RULE_MODULES, hooksOf, isRuleOn, resolveRuleset, rulesetFor, type RuleModuleId } from '@core/rules';
import { changeSettings } from '@core/gameState';
import { deserialize, serialize } from '@core/save';
import type { MatchSettings } from '@core/model';
import { mergeHooks } from '@core/ruleModules/mergeHooks';
import { blankState } from './helpers';

/** Modulos de reglas (core/ruleModules/): cada pieza se enchufa segun los ajustes y aporta sus entradas. */

const DEFAULTS = settingsWith(defaultContent());

/** Los ajustes que apagan cada modulo (los que tienen interruptor). */
const SWITCHED_OFF: Partial<Record<RuleModuleId, Partial<MatchSettings>>> = {
  abilities: { abilities: false },
  veterancy: { veterancy: false },
  flank: { flankBonus: 0 },
  weather: { weather: false },
  controlPoints: { controlPoints: 0 },
  upkeep: { upkeep: 0 },
  noHealUnderFire: { noHealUnderFire: false },
  forestHides: { forestHides: false },
  terrainCost: { terrainCost: false },
  passAllies: { passAllies: false },
  ambush: { ambush: false },
  counterattack: { counterattack: false },
  bounty: { bounty: 0 },
};

describe('modulos de reglas (RULE_MODULES)', () => {
  it('tienen nombres distintos', () => {
    const ids = RULE_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada interruptor quita su modulo, y solo ese', () => {
    for (const [id, change] of Object.entries(SWITCHED_OFF)) {
      const on = blankState(DEFAULTS);
      const off = blankState(settingsWith(defaultContent(), change));
      expect(isRuleOn(on, id as RuleModuleId), id).toBe(true);
      expect(isRuleOn(off, id as RuleModuleId), id).toBe(false);
      const othersOn = RULE_MODULES.filter((module) => module.id !== id).map((module) => isRuleOn(off, module.id));
      expect(othersOn, id).toEqual(RULE_MODULES.filter((module) => module.id !== id).map((module) => isRuleOn(on, module.id)));
    }
  });

  it('todos los modulos con interruptor estan en la prueba', () => {
    const switched = RULE_MODULES.map((module) => module.id).filter((id) => id !== 'generals' && id !== 'noFog');
    expect(Object.keys(SWITCHED_OFF).sort()).toEqual([...switched].sort());
  });

  it('los generales van siempre; sin niebla, el modulo que lo enseña todo', () => {
    expect(isRuleOn(blankState(DEFAULTS), 'generals')).toBe(true);
    expect(isRuleOn(blankState(DEFAULTS), 'noFog')).toBe(false);
    expect(isRuleOn(blankState(settingsWith(defaultContent(), { fog: false })), 'noFog')).toBe(true);
  });

  it('hooksOf junta las entradas de los modulos puestos, en el orden de RULE_MODULES', () => {
    const s = blankState(DEFAULTS);
    const expected = RULE_MODULES.filter((module) => module.isOn(s.settings)).flatMap((module) => module.hooks.hitModifiers ?? []);
    expect(hooksOf(s, 'hitModifiers')).toEqual(expected);
    const plain = blankState(settingsWith(defaultContent(), { abilities: false, veterancy: false, flankBonus: 0, weather: false }));
    expect(hooksOf(plain, 'hitModifiers').map((modifier) => modifier.id)).toEqual(['generals']);
  });

  it('se resuelven una vez por partida: al crearla, al leerla y al cambiar sus ajustes', () => {
    const s = blankState(DEFAULTS);
    expect(Object.isFrozen(s.ruleset)).toBe(true);
    // El modelo de daño es una funcion hecha con los ajustes: se compara lo que reparte, no la funcion.
    const { damageModel, ...rest } = rulesetFor(s, s.settings);
    expect(s.ruleset).toMatchObject(rest);
    expect(s.ruleset.damageModel.distribution(10, 0.5)).toEqual(damageModel.distribution(10, 0.5));
    const loaded = deserialize(serialize(s), defaultContent())!;
    expect(loaded.ruleset.modules.map((module) => module.id)).toEqual(s.ruleset.modules.map((module) => module.id));
    changeSettings(s, settingsWith(defaultContent(), { veterancy: false }));
    expect(isRuleOn(s, 'veterancy')).toBe(false);
    expect(s.settings.veterancy).toBe(false);
  });

  it('resolveRuleset: solo los que se enchufan con esos ajustes, con sus listas juntas en orden', () => {
    const ruleset = resolveRuleset(RULE_MODULES, settingsWith(defaultContent(), { weather: false }));
    expect(ruleset.modules.map((module) => module.id)).not.toContain('weather');
    expect(ruleset.hooks.roundPhases.map((phase) => phase.id)).toEqual(['generals', 'control', 'upkeep']);
  });

  it('mergeHooks: cada lista con las entradas de todas las piezas, una detras de otra y en su orden', () => {
    const first = { id: 'first', factor: () => 2 };
    const second = { id: 'second', factor: () => 3 };
    const stop = { id: 'stop', stopTiles: () => [] };
    const merged = mergeHooks([{ hitModifiers: [first] }, { stopRules: [stop] }, { hitModifiers: [second] }]);
    expect(merged).toEqual({ hitModifiers: [first, second], stopRules: [stop] });
    expect(mergeHooks([])).toEqual({});
  });
});
