/**
 * Vuelca un mapa generado (terreno y tema) en JSON, para probar los graficos fuera del juego.
 *
 *   npx tsx tools/art/dump-map.ts <semilla> <tamaño> [tema]     (por defecto, semilla 1 y tamaño 24)
 */
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { duel } from '@core/teams';
import { commandLine, usageOf } from '../cliArgs';

const [seed = '1', size = '24', theme, ...extra] = commandLine(import.meta.url, {}).positionals;
const numberOf = (name: string, text: string): number => {
  const value = Number(text);
  if (!Number.isInteger(value) || extra.length)
    throw new Error(`${name} tiene que ser un numero entero (pone "${text}")\n\n${usageOf(import.meta.url)}`);
  return value;
};
const s = createMatch(
  skirmishConfig({
    seed: numberOf('La semilla', seed),
    size: numberOf('El tamaño', size),
    theme: theme ?? null,
    teams: duel('human', 'ai'),
  }),
);
process.stdout.write(JSON.stringify({ theme: s.theme, map: s.map, buildings: s.buildings }));
