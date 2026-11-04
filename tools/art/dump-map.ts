// Vuelca un mapa generado (terreno y tema) en JSON, para probar los graficos fuera del juego.
// Uso: npx tsx tools/art/dump-map.ts <semilla> <tamaño> [tema]
import { rulesWith } from '@core/data';
import { seededRng } from '@core/geom';
import { createGame } from '@core/defaultGames';
import { defaultContent } from '@core/content/default';

const [seed = '1', size = '24', theme] = process.argv.slice(2);
const s = createGame(seededRng(Number(seed)), {
  size: Number(size),
  theme: theme === undefined ? null : Number(theme),
  rules: rulesWith(defaultContent()),
});
process.stdout.write(JSON.stringify({ theme: s.theme, map: s.map, buildings: s.buildings }));
