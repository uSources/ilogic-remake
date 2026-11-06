// Vuelca un mapa generado (terreno y tema) en JSON, para probar los graficos fuera del juego.
// Uso: npx tsx tools/art/dump-map.ts <semilla> <tamaño> [tema]
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { duel } from '@core/teams';

const [seed = '1', size = '24', theme] = process.argv.slice(2);
const s = createMatch(skirmishConfig({ seed: Number(seed), size: Number(size), theme: theme ?? null, teams: duel('human', 'ai') }));
process.stdout.write(JSON.stringify({ theme: s.theme, map: s.map, buildings: s.buildings }));
