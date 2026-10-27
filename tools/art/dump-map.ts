// Vuelca un mapa generado (terreno y tema) en JSON, para probar los graficos fuera del juego.
// Uso: npx tsx tools/art/dump-map.ts <semilla> <tamaño> [tema]
import { seededRng } from '../../src/core/geom';
import { generateGame } from '../../src/core/mapgen';

const [seed = '1', size = '24', theme] = process.argv.slice(2);
const s = generateGame(seededRng(Number(seed)), { size: Number(size), theme: theme === undefined ? null : Number(theme) });
process.stdout.write(JSON.stringify({ theme: s.theme, map: s.map, buildings: s.buildings }));
