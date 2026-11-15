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
import * as units from './models/units.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
/** Cada grupo: sus modelos y la carpeta de sus fuentes (tools/art/ashfox/<grupo>) y de sus GLB. */
const GROUPS = { terrain: terrain.MODELS, buildings: buildings.MODELS, units: units.MODELS };
const PAINTS = mergePaints([terrain.PAINTS, buildings.PAINTS, units.PAINTS]);
/** Las pinturas de todos los grupos juntas: un nombre repetido con otros colores taparia al otro sin avisar. */
function mergePaints(groups) {
  const merged = {};
  for (const paints of groups)
    for (const [name, paint] of Object.entries(paints)) {
      if (merged[name] && JSON.stringify(merged[name]) !== JSON.stringify(paint))
        throw new Error(`La pintura ${name} esta en dos grupos con colores distintos: cambia el nombre de una`);
      merged[name] = paint;
    }
  return merged;
}
const sourcesOf = (group) => join(ROOT, 'tools/art/ashfox', group);
const outputOf = (group) => join(ROOT, 'public/assets/models', group);
/** Separacion entre trozos del atlas (texeles): que no se mezclen al filtrar. */
const GAP = 1;
const IDENTITY_FRAME = 'frame { x = (1, 0, 0); y = (0, 1, 0); z = (0, 0, 1); }';

/** Un numero sin los restos de la coma flotante (0.30000000000000004): Ashfox no los acepta. */
const tidy = (value) => Number(value.toFixed(4));
const vec = (values, unit) => `(${values.map((value) => `${tidy(value)}${unit}`).join(', ')})`;
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

/** Los cubos mas bajos no llevan borde: en uno tan pequeño seria la mitad de la cara. */
const RIM_MIN_HEIGHT = 3;
/** Las caras de lado y el eje que da su ancho. */
const SIDE_FACES = { north: 0, south: 0, east: 2, west: 2 };

/**
 * Si su pintura lo pide (`rim`), la fila de arriba de cada lado, mas clara: el borde iluminado del
 * pixel art, que separa las piezas del mismo color. Va antes que los stamps del cubo (que la tapan).
 */
function withRim(cube) {
  const rim = PAINTS[cube.paint]?.rim;
  if (!rim || cube.size[1] < RIM_MIN_HEIGHT) return cube;
  const rims = Object.entries(SIDE_FACES).map(([face, axis]) => {
    const width = cube.size[axis];
    return { name: `rim_${cube.paint}_${width}`, face, pixels: 'r'.repeat(width), colors: { r: rim }, at: [[0, 0]] };
  });
  return { ...cube, stamps: [...rims, ...(cube.stamps ?? [])] };
}

/** Sin huesos propios, el modelo es un solo hueso fijo (`body`) colgado de la raiz. */
const DEFAULT_BONES = [{ name: 'body', parent: 'root', pivot: [0, 0, 0] }];
const ROOT_PIVOT = [0, 0, 0];

const bonesOf = (model) => model.bones ?? DEFAULT_BONES;
const pivotOf = (bones, name) => (name === 'root' ? ROOT_PIVOT : bones.find((bone) => bone.name === name).pivot);

/** Los huesos: la raiz y los del modelo, todos con giro y escala (las animaciones usan los dos). */
function rigDeclarations(bones) {
  const joints = bones.map(
    (bone) =>
      `    joint ${bone.name} { parent = ${bone.parent}; role = body; ${IDENTITY_FRAME} channels = (rotation, scale); mirror = none; }`,
  );
  const binds = bones.map((bone) => {
    const offset = bone.pivot.map((value, axis) => value - pivotOf(bones, bone.parent)[axis]);
    return `    bind ${bone.name} { parent-origin = ${vec(offset, 'u')}; ${IDENTITY_FRAME} }`;
  });
  return `  rig contract ModelRig {
    handedness = right;
    ${IDENTITY_FRAME}
    joint root { parent = none; role = root; ${IDENTITY_FRAME} channels = (rotation, scale); mirror = none; }
${joints.join('\n')}
  }
  skeleton ModelSkeleton implements ModelRig {
    bind root { parent-origin = (0u, 0u, 0u); ${IDENTITY_FRAME} }
${binds.join('\n')}
  }`;
}

function cubeLine(cube, indent) {
  const turn = cube.rotation ? ` rotation = ${vec(cube.rotation, 'deg')}; pivot = ${vec(cube.pivot ?? cube.origin, 'u')};` : '';
  return `${indent}cube ${cube.name} { origin = ${vec(cube.origin, 'u')}; size = ${vec(cube.size, 'u')};${turn} surface = skin.${cube.name}; }`;
}

/** La geometria por huesos: cada hueso con sus cubos y, dentro, sus hijos. */
function boneGeometry(model, boneName, depth) {
  const indent = '  '.repeat(depth);
  const cubes = model.cubes.filter((cube) => (cube.bone ?? 'body') === boneName).map((cube) => cubeLine(cube, `${indent}  `));
  const children = bonesOf(model)
    .filter((bone) => bone.parent === boneName)
    .map((bone) => boneGeometry(model, bone.name, depth + 1));
  return [`${indent}bone ${boneName} {`, ...cubes, ...children, `${indent}}`].join('\n');
}

const trackValue = (channel, values) => (channel === 'rotation' ? vec(values, 'deg') : `(${values.map(tidy).join(', ')})`);

/** Una animacion: sus pistas (hueso, giro o escala) con sus claves (segundos y valor), todas con la misma interpolacion. */
function motionDeclaration(name, motion) {
  const tracks = motion.tracks.map((track) => {
    const keys = track.keys.map(
      ([time, values]) => `      key ${tidy(time)}s = ${trackValue(track.channel, values)} ${track.interp ?? 'linear'};`,
    );
    return `    track ${track.bone}.${track.channel} {\n${keys.join('\n')}\n    }`;
  });
  return `  motion ${name} for ModelRig {
    duration = ${motion.duration}s; fps = ${motion.fps ?? 20}; loop = ${motion.loop ?? 'loop'}; rest-relative = true;
${tracks.join('\n')}
  }`;
}

/** Cada cubo cuelga de un hueso que existe (si no, Ashfox dejaria su textura sin usar y no diria por que). */
function checkBones(name, model) {
  const names = new Set(bonesOf(model).map((bone) => bone.name));
  for (const cube of model.cubes)
    if (!names.has(cube.bone ?? 'body'))
      throw new Error(`${name}: el cubo ${cube.name} cuelga de ${cube.bone ?? 'body'}, que no es un hueso del modelo`);
}

function source(name, model) {
  checkBones(name, model);
  const cubes = model.cubes.map(withRim);
  const bones = bonesOf(model);
  const motions = Object.entries(model.motions ?? {});
  const { charts, atlas } = packCharts(cubes);
  const palette = [...paletteOf(cubes)].map(([role, colors]) => `        ${role} = ${colorList(colors)};`);
  const topBones = bones.filter((bone) => bone.parent === 'root');
  return `ashfox-model 1
asset ${name} {
${rigDeclarations(bones)}
${motions.map(([motion, spec]) => motionDeclaration(motion, spec)).join('\n')}
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
    requires rig skeleton: ModelRig;
    requires surface skin: Skin;
${bones.map((bone) => `    bind bone ${bone.name} to skeleton.${bone.name};`).join('\n')}
    geometry {
${topBones.map((bone) => boneGeometry(model, bone.name, 3)).join('\n')}
    }
  }
  export asset ${name} {
    settings { density = 16; forward = north; }
    skeleton = ModelSkeleton;
${motions.map(([motion]) => `    motion = ${motion};`).join('\n')}
    use Body as model { bind skeleton = ModelRig; bind skin = paint; };
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
