// Escribe los .ashfox de los modelos fijos (terreno, decorado y edificios) a partir de descripciones
// cortas (models/*.mjs, un grupo por fichero): cada modelo son cubos con su pintura. Ashfox no coloca
// solo los trozos de textura de cada cubo (charts): aqui se calculan y se empaquetan en el atlas.
// Despues, con --export, saca cada GLB a public/assets/models/<grupo>/ (hace falta el CLI de Ashfox:
// ver README.md).
//
//   node tools/art/ashfox/generate.mjs            escribe los .ashfox
//   node tools/art/ashfox/generate.mjs --export   y exporta los GLB (ASHFOX=<ruta del ejecutable>)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as buildings from './models/buildings.mjs';
import * as terrain from './models/terrain.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
/** Cada grupo: sus modelos y la carpeta de sus fuentes (tools/art/ashfox/<grupo>) y de sus GLB. */
const GROUPS = { terrain: terrain.MODELS, buildings: buildings.MODELS };
const PAINTS = { ...terrain.PAINTS, ...buildings.PAINTS };
const sourcesOf = (group) => join(ROOT, 'tools/art/ashfox', group);
const outputOf = (group) => join(ROOT, 'public/assets/models', group);
/** Separacion entre trozos del atlas (texeles): que no se mezclen al filtrar. */
const GAP = 1;
const IDENTITY_FRAME = 'frame { x = (1, 0, 0); y = (0, 1, 0); z = (0, 0, 1); }';

const vec = (values, unit) => `(${values.map((value) => `${value}${unit}`).join(', ')})`;
const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(value, 1)));

/** El trozo de textura de una caja: su desarrollo (2·ancho + 2·fondo) × (alto + fondo). */
const chartSize = ([width, height, depth]) => [2 * width + 2 * depth, height + depth];

/** Coloca los trozos en filas (de mas alto a mas bajo) en un atlas de ancho potencia de dos. */
function packCharts(cubes) {
  const charts = cubes.map((cube) => ({ cube, size: chartSize(cube.size) }));
  const width = nextPowerOfTwo(Math.max(64, ...charts.map((chart) => chart.size[0])));
  const sorted = [...charts].sort((a, b) => b.size[1] - a.size[1]);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const chart of sorted) {
    if (x + chart.size[0] > width) [x, y, rowHeight] = [0, y + rowHeight + GAP, 0];
    chart.origin = [x, y];
    x += chart.size[0] + GAP;
    rowHeight = Math.max(rowHeight, chart.size[1]);
  }
  return { charts, atlas: [width, nextPowerOfTwo(y + rowHeight)] };
}

/** Los colores de la paleta que usa un modelo: cada pintura con su rampa y la de sus manchas. */
function paletteOf(cubes) {
  const roles = new Map();
  for (const cube of cubes) {
    const paint = PAINTS[cube.paint];
    if (!paint) throw new Error(`No existe la pintura ${cube.paint}`);
    roles.set(cube.paint, paint.ramp);
    if (paint.blotch) roles.set(`${cube.paint}_spots`, paint.blotch.ramp);
    for (const stamp of cube.stamps ?? [])
      for (const [symbol, color] of Object.entries(stamp.colors)) roles.set(stampRole(stamp, symbol), color);
  }
  return roles;
}

const stampRole = (stamp, symbol) => `${stamp.name}_${symbol}`;
const colorList = (colors) => (Array.isArray(colors) ? `(${colors.join(', ')})` : colors);

function stampDeclarations(cubes) {
  const stamps = new Map(cubes.flatMap((cube) => (cube.stamps ?? []).map((stamp) => [stamp.name, stamp])));
  return [...stamps.values()].map((stamp) => {
    const mappings = Object.keys(stamp.colors).map((symbol) => `${symbol} = ${stampRole(stamp, symbol)};`);
    return `      stamp ${stamp.name} { pixels = "${stamp.pixels}"; ${mappings.join(' ')} }`;
  });
}

function chartRecipe({ cube, origin }) {
  const paint = PAINTS[cube.paint];
  const lines = [`      chart ${cube.name} box {`, `        origin = ${vec(origin, 'px')}; fill = ${cube.paint};`];
  if (paint.blotch) {
    const { scale, density } = paint.blotch;
    lines.push(
      `        pattern blotch { paint = ${cube.paint}_spots; scale = ${vec(scale, 'px')}; density = ${density}ratio; phase = ${cube.phase ?? 7}; }`,
    );
  }
  const byFace = Map.groupBy(cube.stamps ?? [], (stamp) => stamp.face);
  for (const [face, stamps] of byFace) {
    const placed = stamps.map((stamp) => stamp.at.map((at) => `stamp ${stamp.name} { at = ${vec(at, 'px')}; }`).join(' ')).join(' ');
    lines.push(`        face ${face} { ${placed} }`);
  }
  lines.push('      }');
  return lines.join('\n');
}

function source(name, model) {
  const cubes = model.cubes;
  const { charts, atlas } = packCharts(cubes);
  const palette = [...paletteOf(cubes)].map(([role, colors]) => `        ${role} = ${colorList(colors)};`);
  return `ashfox-model 1
asset ${name} {
  rig contract StaticRig {
    handedness = right;
    ${IDENTITY_FRAME}
    joint root { parent = none; role = root; ${IDENTITY_FRAME} channels = rotation; mirror = none; }
    joint body { parent = root; role = body; ${IDENTITY_FRAME} channels = rotation; mirror = none; }
  }
  skeleton StaticSkeleton implements StaticRig {
    bind root { parent-origin = (0u, 0u, 0u); ${IDENTITY_FRAME} }
    bind body { parent-origin = (0u, 0u, 0u); ${IDENTITY_FRAME} }
  }
  surface contract Skin {
    atlas { width = ${atlas[0]}px; height = ${atlas[1]}px; }
${charts.map(({ cube, size }) => `    chart ${cube.name} box { width = ${size[0]}px; height = ${size[1]}px; coverage = opaque; }`).join('\n')}
    material = opaque;
  }
  surface paint: Skin {
    material = opaque;
    texture atlas {
      atlas = ${vec(atlas, 'px')}; background = ${cubes[0].paint}; background-alpha = 255;
      palette {
${palette.join('\n')}
      }
${stampDeclarations(cubes).join('\n')}
${charts.map(chartRecipe).join('\n')}
      grain clustered { seed = ${model.seed ?? 2013}; }
      tone voxel;
    }
  }
  component Body {
    requires rig skeleton: StaticRig;
    requires surface skin: Skin;
    bind bone body to skeleton.body;
    geometry {
      bone body {
${cubes.map((cube) => `        cube ${cube.name} { origin = ${vec(cube.origin, 'u')}; size = ${vec(cube.size, 'u')}; surface = skin.${cube.name}; }`).join('\n')}
      }
    }
  }
  export asset ${name} {
    settings { density = 16; forward = north; }
    skeleton = StaticSkeleton;
    use Body as model { bind skeleton = StaticRig; bind skin = paint; };
  }
}
`;
}

function writeSources(group, models) {
  mkdirSync(sourcesOf(group), { recursive: true });
  for (const [name, model] of Object.entries(models)) writeFileSync(join(sourcesOf(group), `${name}.ashfox`), source(name, model));
  console.log(`${group}: ${Object.keys(models).length} modelos`);
}

/** Exporta cada modelo a su GLB (Ashfox no sobrescribe: se borra antes). */
function exportModels(group, models) {
  const ashfox = process.env.ASHFOX ?? 'ashfox';
  mkdirSync(outputOf(group), { recursive: true });
  for (const name of Object.keys(models)) {
    const output = join(outputOf(group), `${name}.glb`);
    rmSync(output, { force: true });
    const input = join(sourcesOf(group), `${name}.ashfox`);
    execFileSync(ashfox, ['export', input, '--output', output], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  console.log(`${group}: ${Object.keys(models).length} GLB`);
}

for (const [group, models] of Object.entries(GROUPS)) {
  writeSources(group, models);
  if (process.argv.includes('--export')) exportModels(group, models);
}
