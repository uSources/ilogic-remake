import { describe, expect, it } from 'vitest';
import { HELP_TEXTS, TEXTS, TEXTS_BY_FEATURE } from '../src/i18n';
import { defaultContent } from '@core/content/default';
import { settingsWith } from '@core/matchSettings';
import { ruleFactsFor } from '../src/hud/helpText';

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
    expect(en.controls.length).toBe(es.controls.length);
    expect(en.colors.map(([color]) => color)).toEqual(es.colors.map(([color]) => color));
    expect(en.goalBasics.length).toBe(es.goalBasics.length);
    const ruleLineIsShown = (lines: string[]) => lines.map((line) => line !== '');
    const facts = ruleFactsFor(defaultContent().defaultSettings);
    expect(ruleLineIsShown(en.ruleLines(facts))).toEqual(ruleLineIsShown(es.ruleLines(facts)));
  });

  it('las frases de un modulo salen si la partida lo lleva (lo dice el modulo, no la ayuda)', () => {
    const { es } = HELP_TEXTS;
    const lines = (changes: Parameters<typeof settingsWith>[1]) => es.ruleLines(ruleFactsFor(settingsWith(defaultContent(), changes)));
    const weatherLine = (text: string[]) => text.some((line) => line.startsWith('Clima'));
    expect(weatherLine(lines({ weather: true }))).toBe(true);
    expect(weatherLine(lines({ weather: false }))).toBe(false);
    const ambushLine = (text: string[]) => text.some((line) => line.includes('emboscada'));
    expect(ambushLine(lines({ ambush: true, fog: true }))).toBe(true);
    expect(ambushLine(lines({ ambush: true, fog: false }))).toBe(false);
  });
});
