// Compila todos los graficos del juego, en orden, a partir de los originales de tools/art/:
//   npm run assets            todo (se ejecuta solo antes de npm run build)
//   npm run assets -- --pack  solo lista de claves + atlas + comprobacion (sin rehacer laminas)
// No llama a ningun servicio de pago: usa los dibujos ya generados y guardados en tools/art/.
// Si falta algo, se para con error y el build no sigue.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// En Windows el ejecutable suele llamarse python (python3 no existe o abre la Tienda).
const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

/** [descripcion, programa, argumentos] */
const ART = [
  ['Suelos Wang (PixelLab)', py, ['tools/art/build_terrain.py']],
  ['Montañas y bosques (Retro Diffusion)', py, ['tools/art/rd_terrain.py']],
  ['Ajuste a la casilla', py, ['tools/art/fit_tile.py']],
  ['Edificios', py, ['tools/art/rd_buildings32.py']],
  ['Unidades y colores de bando', py, ['tools/art/rd_units32.py']],
  ['Flores y cactus', py, ['tools/art/rd_decor.py']],
  ['Muñecos de nieve', py, ['tools/art/rd_snowmen.py']],
  ['Laminas de costa', py, ['tools/art/build_blob.py']],
  ['Laminas de agua, olas, espuma y niebla', py, ['tools/art/build_sheets.py']],
  ['Iconos de la interfaz', py, ['tools/art/build_icons.py']],
  ['Letra Ilogic', py, ['tools/art/build_font.py']],
];
const PACK = [
  ['Lista de imagenes', process.execPath, ['scripts/gen-assets.mjs']],
  ['Atlas', py, ['tools/art/pack_atlas.py']],
  ['Comprobacion', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/assets.test.ts']],
];

const steps = process.argv.includes('--pack') ? PACK : [...ART, ...PACK];
const t0 = Date.now();
for (const [i, [name, cmd, args]] of steps.entries()) {
  console.log(`\n[${i + 1}/${steps.length}] ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  if (r.status !== 0) {
    console.error(`\nFallo en "${name}" (${[cmd, ...args].join(' ')}). Graficos sin compilar.`);
    process.exit(r.status ?? 1);
  }
}
console.log(`\nGraficos compilados en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
