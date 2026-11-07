import { describe, expect, it } from 'vitest';
import { HELP_TEXTS, KEY_NAMES, TEXTS, TEXTS_BY_FEATURE } from '../src/i18n';
import { keyLabels } from '../src/controls/keyNames';
import { defaultContent } from '@core/content/default';
import { settingsWith } from '@core/matchSettings';
import { helpRulesForSettingsOnly, helpRulesOfMatch, ruleFactsOf } from '../src/hud/helpText';
import { blankState } from './helpers';

describe('textos por tema', () => {
  it('ninguna clave se repite entre temas (si no, un tema taparia el texto de otro en t())', () => {
    for (const byFeature of Object.values(TEXTS_BY_FEATURE)) {
      const keys = Object.values(byFeature).flatMap((feature) => Object.keys(feature));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('los dos idiomas tienen los mismos temas y las mismas claves', () => {
    expect(Object.keys(TEXTS_BY_FEATURE.en)).toEqual(Object.keys(TEXTS_BY_FEATURE.es));
    expect(Object.keys(TEXTS.en).sort()).toEqual(Object.keys(TEXTS.es).sort());
  });

  it('ningun texto esta vacio', () => {
    for (const texts of Object.values(TEXTS)) for (const text of Object.values(texts)) expect(text.trim()).not.toBe('');
  });
});

describe('ayuda', () => {
  it('los dos idiomas tienen las mismas filas, colores y frases segun las reglas', () => {
    const { es, en } = HELP_TEXTS;
    const keys = keyLabels({}, KEY_NAMES.es);
    expect(en.controls(keys).length).toBe(es.controls(keys).length);
    expect(en.colors(keys).map(([color]) => color)).toEqual(es.colors(keys).map(([color]) => color));
    expect(en.goalBasics(keys).length).toBe(es.goalBasics(keys).length);
    const ruleLineIsShown = (lines: string[]) => lines.map((line) => line !== '');
    const facts = ruleFactsOf(helpRulesForSettingsOnly(defaultContent().defaultSettings));
    expect(ruleLineIsShown(en.ruleLines(facts))).toEqual(ruleLineIsShown(es.ruleLines(facts)));
  });

  it('las frases de un modulo salen si la partida lo lleva (lo dice el modulo, no la ayuda)', () => {
    const { es } = HELP_TEXTS;
    const lines = (changes: Parameters<typeof settingsWith>[1]) =>
      es.ruleLines(ruleFactsOf(helpRulesForSettingsOnly(settingsWith(defaultContent(), changes))));
    const weatherLine = (text: string[]) => text.some((line) => line.startsWith('Clima'));
    expect(weatherLine(lines({ weather: true }))).toBe(true);
    expect(weatherLine(lines({ weather: false }))).toBe(false);
    const ambushLine = (text: string[]) => text.some((line) => line.includes('emboscada'));
    expect(ambushLine(lines({ ambush: true, fog: true }))).toBe(true);
    expect(ambushLine(lines({ ambush: true, fog: false }))).toBe(false);
  });

  it('en una partida cuenta los modulos que lleva ella (con los de su modo), no los que saldrian de sus ajustes', () => {
    const s = blankState(settingsWith(defaultContent(), { weather: true }));
    expect(helpRulesOfMatch(s).modules).toEqual(s.ruleset.modules.map((module) => module.id));
    const withoutWeather = { ...helpRulesOfMatch(s), modules: helpRulesOfMatch(s).modules.filter((id) => id !== 'weather') };
    expect(HELP_TEXTS.es.ruleLines(ruleFactsOf(withoutWeather)).some((line) => line.startsWith('Clima'))).toBe(false);
  });
});
