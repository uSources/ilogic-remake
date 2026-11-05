/**
 * Temas de mapa (themes.json): llanura, desierto, bosque... Cada uno dice como crece el terreno en
 * el generador de mapas (probabilidades del original, RandomMap de 2013), que hace con el agua y que
 * terreno es cada letra de los mapas en texto de las misiones. El clima de cada tema esta en
 * weather.json ("chance").
 */
import type { DeepReadonly } from '../util/freeze';
import { type Checker, type Scope } from './check';
import type { Texts } from './types';

/** Probabilidad de un terreno en el generador: la base y lo que suma cada vecina igual ya generada. */
export interface TerrainChance {
  base: number;
  perNeighbour: number;
}

/** Como genera el mapa un tema. Los terrenos van por id (terrain.json). */
export interface ThemeGenerator {
  /** Probabilidad de cada terreno (los que no estan, 0). */
  terrainChance: Record<string, TerrainChance>;
  /** El agua que sale al crecer el terreno (la que se puede estrechar). */
  openWater: string;
  /** En lo que se convierte el agua estrecha (tierra a los dos lados), o null si no cambia. */
  narrowWater: string | null;
  /** En lo que se convierte el agua junto a tierra (hielo), o null si no cambia. */
  shoreWater: string | null;
  /** En lo que se convierte el agua rodeada de agua. */
  deepWater: string;
}

/** Un tema de mapa en themes.json. */
export interface ThemeDef {
  id: string;
  name: Texts;
  /** Letras de los mapas en texto que dependen del tema (las demas, terrain.json "mapLetter"). */
  mapLetters: Record<string, string>;
  generator: ThemeGenerator;
}

/** Un tema de mapa de la partida: el de themes.json tal cual (no hace falta resolver nada mas), de solo lectura. */
export type Theme = DeepReadonly<ThemeDef>;

function validateGenerator(scope: Scope, generator: ThemeGenerator | undefined, terrainIds: ReadonlySet<string>): void {
  if (!generator) {
    scope.fail('falta generator');
    return;
  }
  for (const [terrain, chance] of Object.entries(generator.terrainChance ?? {})) {
    scope.known('generator.terrainChance', terrain, terrainIds, 'el terreno ');
    scope.num(`generator.terrainChance.${terrain}.base`, chance?.base, { min: 0, max: 1 });
    scope.num(`generator.terrainChance.${terrain}.perNeighbour`, chance?.perNeighbour, { min: -1, max: 1 });
  }
  scope.expect(
    Object.values(generator.terrainChance ?? {}).some((chance) => chance.base > 0),
    'generator.terrainChance: algun terreno tiene que tener base > 0 (si no, el generador no acaba)',
  );
  scope.known('generator.openWater', generator.openWater, terrainIds, 'el terreno ');
  scope.known('generator.deepWater', generator.deepWater, terrainIds, 'el terreno ');
  for (const field of ['narrowWater', 'shoreWater'] as const)
    if (generator[field] !== null) scope.known(`generator.${field}`, generator[field], terrainIds, 'el terreno ');
}

export function validateThemes(themes: readonly ThemeDef[], terrainIds: ReadonlySet<string>, check: Checker): void {
  check.scope('themes.json').expect(Array.isArray(themes) && themes.length > 0, 'tiene que tener una lista "themes" con al menos un tema');
  const listed: readonly ThemeDef[] = Array.isArray(themes) ? themes : [];
  for (const theme of listed) {
    const scope = check.scope(`tema ${theme?.id}`);
    scope.texts('name', theme?.name);
    for (const [letter, terrain] of Object.entries(theme?.mapLetters ?? {})) {
      scope.expect(letter.length === 1, `mapLetters: "${letter}" tiene que ser una sola letra`);
      scope.known(`mapLetters.${letter}`, terrain, terrainIds, 'el terreno ');
    }
    validateGenerator(scope, theme?.generator, terrainIds);
  }
}
