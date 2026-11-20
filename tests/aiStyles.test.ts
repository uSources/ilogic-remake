import { describe, expect, it } from 'vitest';
import { aiProfileFor, defaultAiProfile, styledAiProfile } from '@core/ai';
import { validateContent, type Content } from '@core/content';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { rematchOf, skirmishConfig } from '@core/match';
import { duel } from '@core/teams';
import { maxBy } from '@core/util/pick';
import { nearlyBest, seededRng } from '@core/util/random';
import { matchConfigFor, DEFAULT_OPTIONS } from '../src/setup';

const content = defaultContent();
const clone = (): Content => structuredClone(content.files) as Content;
type StyledFile = { personalities: { id: string; default?: boolean; weights: Record<string, number> }[] };

describe('personalidades y dificultades de la IA (docs/PLAN-IA.md, fase 4)', () => {
  it('cada una cambia sus pesos sobre los de ai.json (la dificultad manda); un id que no esta, la de siempre', () => {
    const base = defaultAiProfile(content).weights;
    const turtle = styledAiProfile(content, { personality: 'turtle', difficulty: 'easy' }).weights;
    expect(turtle).toEqual({ ...base, ...content.personalities.byId.turtle!.weights, ...content.difficulties.byId.easy!.weights });
    expect(styledAiProfile(content, { personality: 'nadie', difficulty: 'nada' }).weights).toEqual(base);
  });

  it('la IA de un equipo juega con lo suyo', () => {
    const s = createMatch(
      skirmishConfig({ seed: 3, size: 20, teams: [{ controller: 'human' }, { controller: 'ai', difficulty: 'easy' }] }),
    );
    expect(aiProfileFor(s, 1).weights.nerves).toBe(content.difficulties.byId.easy!.weights.nerves);
    expect(aiProfileFor(s, 0).weights.nerves).toBe(defaultAiProfile(content).weights.nerves);
  });

  it('en una escaramuza, cada IA lleva una personalidad al azar con la semilla del mapa; la revancha la repite', () => {
    const personalitiesOf = (seed: number) =>
      createMatch(skirmishConfig({ seed, size: 20, teams: duel('ai', 'ai') })).teams.map((team) => team.personality);
    expect(personalitiesOf(11)).toEqual(personalitiesOf(11));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(personalitiesOf));
    expect(seen.size).toBeGreaterThan(1);
    const s = createMatch(skirmishConfig({ seed: 11, size: 20, teams: duel('human', 'ai') }));
    expect(createMatch(rematchOf(s)!).teams.map((team) => team.personality)).toEqual(s.teams.map((team) => team.personality));
    // La persona no lleva una al azar (la de siempre: la usaria si se le diera a la IA).
    expect(s.teams[0]!.personality).toBe(content.defaultPersonality.id);
  });

  it('Nueva partida da la dificultad elegida a la IA (y su dinero de salida)', () => {
    const hard = createMatch(matchConfigFor({ ...DEFAULT_OPTIONS, difficulty: 'hard' }, 7));
    const normal = createMatch(matchConfigFor(DEFAULT_OPTIONS, 7));
    expect(hard.teams[1]!.difficulty).toBe('hard');
    expect(normal.teams[1]!.difficulty).toBe(content.defaultDifficulty.id);
    expect(hard.teams[1]!.funds).toBeGreaterThan(normal.teams[1]!.funds);
    expect(hard.teams[0]!.funds).toBe(normal.teams[0]!.funds);
  });

  it('el contenido se comprueba: pesos que la IA no lee y mas de una por defecto', () => {
    const files = clone();
    const styled = files.ai as unknown as StyledFile;
    styled.personalities[1]!.weights.valor = 3;
    styled.personalities[1]!.default = true;
    const errors = validateContent(files);
    expect(errors.some((error) => error.includes('peso desconocido "valor"'))).toBe(true);
    expect(errors.some((error) => error.includes('exactamente una'))).toBe(true);
  });
});

describe('nervios: casi siempre la mejor (nearlyBest)', () => {
  const scores = [10, 9.5, 6, 2];
  const id = (score: number) => score;

  it('sin nervios, la mejor y sin tirar el dado', () => {
    const rng = () => {
      throw new Error('no deberia tirar');
    };
    expect(nearlyBest(scores, id, 0, rng)).toBe(maxBy(scores, id));
  });

  it('con nervios, solo entre las que se le acercan', () => {
    const rng = seededRng(4);
    const picked = new Set(Array.from({ length: 200 }, () => nearlyBest(scores, id, 0.2, rng)));
    expect([...picked].sort()).toEqual([10, 9.5].sort());
  });

  it('una lista vacia, nada; un mejor de 0 no deja margen', () => {
    expect(nearlyBest([], id, 0.5, seededRng(1))).toBeNull();
    expect(nearlyBest([0, -1], id, 0.5, seededRng(1))).toBe(0);
  });
});
