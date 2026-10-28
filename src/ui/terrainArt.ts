import type Phaser from 'phaser';
import type { GameState } from '../core/types';
import { TILE } from '../layout';
import { WANG_SETS } from './wangSets';

/**
 * Terreno nuevo (piezas Wang de PixelLab) en "rejilla doble": cada pieza se dibuja centrada en
 * la esquina comun de cuatro casillas, y sus cuatro esquinas son esas casillas. Asi las orillas
 * y los bordes del bosque pasan por el medio de las casillas y encajan solos.
 *
 * Capas de abajo arriba:
 *  1. Suelo por niveles: agua profunda < agua < agua poco profunda (o hielo) < tierra
 *     (hierba, arena o nieve segun el tema del mapa).
 *  2. Encima: bosque y montaña (piezas recortadas, con el suelo transparente).
 *  3. Decorados sueltos: flores, cactus y muñeco de nieve.
 */

// Terrenos: 0 Grass, 1 Water, 2 Woods, 3 Sand, 4 Cactus, 5 SandCliff, 6 Flowers, 7 GrassCliff,
// 8 SWater, 9 DWater, 10 Snow, 11 Frosty, 12 SnowCliff, 13 SnowWood, 14 Ice
const LEVEL = [3, 1, 3, 3, 3, 3, 3, 3, 2, 0, 3, 3, 3, 3, 2];
/** Decorados sueltos y cuantas variantes hay de cada uno. */
const DECOR: Record<number, [string, number]> = { 6: ['wang/decor_flowers', 3], 4: ['wang/decor_cactus', 3], 11: ['wang/decor_frosty', 3] };
const decorKeys = (): string[] => Object.values(DECOR).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${k}_${i}`));

function groundSets(theme: number): [string, string, string] {
  const snow = theme === 4;
  const land = theme === 1 ? 'ts_shallow_sand' : snow ? 'ts_ice_snow' : 'ts_shallow_grass';
  return ['ts_deep_water', snow ? 'ts_water_ice' : 'ts_water_shallow2', land];
}

function overlaySets(theme: number): { set: string; cells: number[] }[] {
  const snow = theme === 4;
  return [
    { set: snow ? 'ts_snow_forest' : 'ts_grass_forest', cells: snow ? [2, 13] : [2] },
    ...(snow ? [] : [{ set: 'ts_snow_forest', cells: [13] }]),
  ];
}

/**
 * Borde organico entre dos aguas (o agua y hielo): en vez de las piezas Wang, cuyos bordes son
 * rectos en las casillas de lado, se calcula pixel a pixel un campo suave (las esquinas de las
 * casillas interpoladas y un poco de ruido) y se rellena con la textura lisa del terreno de arriba,
 * con una linea clara en el borde.
 */
function organicPass(ctx: CanvasRenderingContext2D, textures: Phaser.Textures.TextureManager, set: string, s: GameState, up: (t: number) => boolean): void {
  if (!textures.exists(`wang/${set}`)) return;
  const W = s.map.length,
    H = s.map[0]!.length;
  const PW = W * TILE,
    PH = H * TILE;
  // Textura lisa del terreno de arriba (pieza 15) repetida por todo el mapa.
  const pat = document.createElement('canvas');
  pat.width = PW;
  pat.height = PH;
  const pc = pat.getContext('2d')!;
  const img = textures.get(`wang/${set}`).getSourceImage() as CanvasImageSource;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) pc.drawImage(img, 15 * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
  const src = pc.getImageData(0, 0, PW, PH).data;
  const dst = ctx.getImageData(0, 0, PW, PH);
  const d = dst.data;
  const v = (x: number, y: number) => (up(s.map[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!) ? 1 : 0);
  // Ruido suave (rejilla de 8 px) para que el borde serpentee.
  const G = 8;
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263) ^ (s.setup?.seed ?? 7);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
  };
  const noise = (px: number, py: number) => {
    const i = Math.floor(px / G),
      j = Math.floor(py / G);
    const fx = px / G - i,
      fy = py / G - j;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
  const inside = new Uint8Array(PW * PH);
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      // Posicion relativa a los centros de las casillas.
      const gx = (px + 0.5) / TILE - 0.5,
        gy = (py + 0.5) / TILE - 0.5;
      const cx = Math.floor(gx),
        cy = Math.floor(gy);
      const fx = gx - cx,
        fy = gy - cy;
      const sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy);
      const a = v(cx, cy) + (v(cx + 1, cy) - v(cx, cy)) * sx;
      const b = v(cx, cy + 1) + (v(cx + 1, cy + 1) - v(cx, cy + 1)) * sx;
      const f = a + (b - a) * sy + noise(px, py) * 0.42;
      if (f > 0.5) inside[py * PW + px] = 1;
    }
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      const i = py * PW + px;
      if (!inside[i]) continue;
      const o = i * 4;
      const edge =
        (px > 0 && !inside[i - 1]) || (px < PW - 1 && !inside[i + 1]) || (py > 0 && !inside[i - PW]) || (py < PH - 1 && !inside[i + PW]);
      if (edge) {
        // Linea clara en el borde.
        d[o] = Math.min(255, src[o]! + 70);
        d[o + 1] = Math.min(255, src[o + 1]! + 70);
        d[o + 2] = Math.min(255, src[o + 2]! + 60);
      } else {
        d[o] = src[o]!;
        d[o + 1] = src[o + 1]!;
        d[o + 2] = src[o + 2]!;
      }
      d[o + 3] = 255;
    }
  ctx.putImageData(dst, 0, 0);
}

/** Todas las imagenes que hacen falta (para saber si se puede usar el terreno nuevo). */
export function terrainArtKeys(): string[] {
  return [...Object.keys(WANG_SETS).map((k) => `wang/${k}`), ...decorKeys()];
}

export function terrainArtReady(textures: Phaser.Textures.TextureManager): boolean {
  return terrainArtKeys().every((k) => textures.exists(k));
}

/** Pinta el terreno entero del mapa en un lienzo (una sola vez por partida). */
export function paintTerrain(textures: Phaser.Textures.TextureManager, s: GameState): { canvas: HTMLCanvasElement; land: HTMLCanvasElement } {
  const W = s.map.length,
    H = s.map[0]!.length;
  const cv = document.createElement('canvas');
  cv.width = W * TILE;
  cv.height = H * TILE;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const src = (key: string) => textures.get(key).getSourceImage() as CanvasImageSource;
  const cell = (x: number, y: number) => s.map[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!;
  const half = TILE / 2;

  /** Recorre las piezas de la rejilla doble: `up(t)` dice si la casilla cuenta como "arriba". */
  const pass = (set: string, up: (t: number) => boolean, always: boolean, into = ctx) => {
    const frames = WANG_SETS[set];
    if (!frames || !textures.exists(`wang/${set}`)) return;
    const img = src(`wang/${set}`);
    for (let x = 0; x <= W; x++)
      for (let y = 0; y <= H; y++) {
        const k = (up(cell(x - 1, y - 1)) ? 8 : 0) | (up(cell(x, y - 1)) ? 4 : 0) | (up(cell(x - 1, y)) ? 2 : 0) | (up(cell(x, y)) ? 1 : 0);
        if (!k && !always) continue;
        into.drawImage(img, frames[k]! * TILE, 0, TILE, TILE, x * TILE - half, y * TILE - half, TILE, TILE);
      }
  };

  /**
   * Tierra al estilo Advance Wars, dibujada por pixeles (vale para cualquier forma: canales de una
   * casilla, islas sueltas, esquinas interiores...):
   *  - cada casilla de tierra es tierra entera (textura lisa del set), con las esquinas de fuera
   *    redondeadas cuando no hay tierra alrededor;
   *  - en el agua se pinta la franja de orilla segun la distancia a la tierra. Su aspecto sale de
   *    las piezas rectas del set (12 tierra arriba, 3 abajo, 10 izquierda, 5 derecha), eligiendo
   *    la del lado donde esta la tierra mas cercana.
   */
  const passLand = (set: string, up: (t: number) => boolean, into: CanvasRenderingContext2D) => {
    const frames = WANG_SETS[set];
    if (!frames || !textures.exists(`wang/${set}`)) return;
    const img = src(`wang/${set}`);
    const PW = W * TILE,
      PH = H * TILE;
    const pc = document.createElement('canvas');
    pc.width = 16 * TILE;
    pc.height = TILE;
    const pctx = pc.getContext('2d')!;
    pctx.drawImage(img, 0, 0);
    const piece = (k: number) => pctx.getImageData(frames[k]! * TILE, 0, TILE, TILE).data;
    const flat = piece(15);
    // Color medio de la tierra lisa (para saber donde acaba la orilla dentro de cada pieza).
    let mr = 0,
      mg = 0,
      mb = 0;
    for (let i = 0; i < TILE * TILE; i++) {
      mr += flat[i * 4]!;
      mg += flat[i * 4 + 1]!;
      mb += flat[i * 4 + 2]!;
    }
    mr /= TILE * TILE;
    mg /= TILE * TILE;
    mb /= TILE * TILE;
    /** Perfil de orilla de una pieza recta: lineas desde el lado de tierra, la franja y su largo. */
    type Prof = { data: Uint8ClampedArray; side: 'T' | 'B' | 'L' | 'R'; start: number; len: number };
    const at = (p: Prof, i: number, j: number) => {
      // i: linea desde el lado de tierra; j: posicion a lo largo de la orilla.
      const [x, y] = p.side === 'T' ? [j, i] : p.side === 'B' ? [j, TILE - 1 - i] : p.side === 'L' ? [i, j] : [TILE - 1 - i, j];
      return (y * TILE + x) * 4;
    };
    const profile = (k: number, side: Prof['side']): Prof => {
      const p: Prof = { data: piece(k), side, start: 0, len: 0 };
      let e = TILE;
      for (let i = 0; i < TILE; i++) {
        let opaque = 0;
        for (let j = 0; j < TILE; j++) opaque += p.data[at(p, i, j) + 3]! > 0 ? 1 : 0;
        if (opaque < TILE / 2) {
          e = i;
          break;
        }
      }
      // Hacia la tierra, mientras el color se aparte de la tierra lisa, es orilla (acantilado, arena).
      let s0 = e - 1;
      const diff = (i: number) => {
        let d = 0;
        for (let j = 0; j < TILE; j++) {
          const o = at(p, i, j);
          d += Math.abs(p.data[o]! - mr) + Math.abs(p.data[o + 1]! - mg) + Math.abs(p.data[o + 2]! - mb);
        }
        return d / TILE;
      };
      while (s0 > 0 && e - s0 < 10 && diff(s0 - 1) > 45) s0--;
      p.start = Math.max(0, Math.min(s0, e - 3));
      p.len = Math.max(3, e - p.start);
      return p;
    };
    const profs = { T: profile(12, 'T'), B: profile(3, 'B'), L: profile(10, 'L'), R: profile(5, 'R') };
    const BAND = Math.max(profs.T.len, profs.B.len, profs.L.len, profs.R.len);
    // Mascara de tierra con las esquinas de fuera redondeadas.
    const R = 5;
    const mask = new Uint8Array(PW * PH);
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        if (!up(cell(x, y))) continue;
        for (let j = 0; j < TILE; j++) mask.fill(1, (y * TILE + j) * PW + x * TILE, (y * TILE + j) * PW + x * TILE + TILE);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          if (up(cell(x + dx, y)) || up(cell(x, y + dy)) || up(cell(x + dx, y + dy))) continue;
          for (let j = 0; j < R; j++)
            for (let i = 0; i < R; i++)
              if ((R - i - 0.5) ** 2 + (R - j - 0.5) ** 2 > R * R) {
                const px = dx < 0 ? x * TILE + i : x * TILE + TILE - 1 - i;
                const py = dy < 0 ? y * TILE + j : y * TILE + TILE - 1 - j;
                mask[py * PW + px] = 0;
              }
        }
      }
    const out = into.createImageData(PW, PH);
    const o = out.data;
    for (let py = 0; py < PH; py++)
      for (let px = 0; px < PW; px++) {
        const i = py * PW + px;
        if (mask[i]) {
          const t = ((py % TILE) * TILE + (px % TILE)) * 4;
          o[i * 4] = flat[t]!;
          o[i * 4 + 1] = flat[t + 1]!;
          o[i * 4 + 2] = flat[t + 2]!;
          o[i * 4 + 3] = 255;
          continue;
        }
        // Tierra mas cercana dentro de la franja.
        let best = 1e9,
          bx = 0,
          by = 0;
        for (let dy = -BAND; dy <= BAND; dy++) {
          const yy = py + dy;
          if (yy < 0 || yy >= PH) continue;
          for (let dx = -BAND; dx <= BAND; dx++) {
            const xx = px + dx;
            if (xx < 0 || xx >= PW || !mask[yy * PW + xx]) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) {
              best = d2;
              bx = dx;
              by = dy;
            }
          }
        }
        if (best > BAND * BAND) continue;
        const p = Math.abs(by) >= Math.abs(bx) ? (by < 0 ? profs.T : profs.B) : bx < 0 ? profs.L : profs.R;
        const d = Math.ceil(Math.sqrt(best));
        if (d > p.len) continue;
        const along = p.side === 'T' || p.side === 'B' ? px % TILE : py % TILE;
        const s = at(p, p.start + d - 1, along);
        if (p.data[s + 3]! === 0) continue;
        o[i * 4] = p.data[s]!;
        o[i * 4 + 1] = p.data[s + 1]!;
        o[i * 4 + 2] = p.data[s + 2]!;
        o[i * 4 + 3] = 255;
      }
    into.putImageData(out, 0, 0);
  };

  const [l1, l2, l3] = groundSets(s.theme);
  pass(l1, () => false, true); // todo agua profunda
  organicPass(ctx, textures, l1, s, (t) => LEVEL[t]! >= 1);
  organicPass(ctx, textures, l2, s, (t) => LEVEL[t]! >= 2);
  // La tierra se pinta aparte para saber luego donde esta la orilla (para animarla).
  const land = document.createElement('canvas');
  land.width = cv.width;
  land.height = cv.height;
  const lc = land.getContext('2d')!;
  lc.imageSmoothingEnabled = false;
  passLand(l3, (t) => LEVEL[t]! >= 3, lc);
  ctx.drawImage(land, 0, 0);
  // Bosques: si hay arboles sueltos (Retro Diffusion) se dibujan como sprites mas abajo; si no, el tileset Wang.
  const trees = textures.exists('flat/tree_grass_0');
  treesLoaded = trees;
  if (!trees)
    for (const o of overlaySets(s.theme)) if (s.map.some((col) => col.some((t) => o.cells.includes(t)))) pass(o.set, (t) => o.cells.includes(t), false);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const d = DECOR[s.map[x]![y]!];
      if (!d) continue;
      // Variante fija por casilla (la misma cada vez que se dibuja el mapa).
      const k = `${d[0]}_${(((x * 73856093) ^ (y * 19349663)) >>> 0) % d[1]}`;
      if (textures.exists(k)) ctx.drawImage(src(k), x * TILE, y * TILE);
    }
  // Montañas y bosques no se pintan aqui: van como sprites en la capa de los edificios
  // (terrainObjects), ordenados por fila, para que lo de delante tape a lo de detras.
  return { canvas: cv, land };
}

/** Sprites de terreno (montañas y bosques) por casilla, para ponerlos en la capa de los edificios. */
export function terrainObjects(textures: Phaser.Textures.TextureManager, s: GameState): { key: string; x: number; y: number }[] {
  const out: { key: string; x: number; y: number }[] = [];
  const trees = textures.exists('flat/tree_grass_0');
  for (let y = 0; y < s.map[0]!.length; y++)
    for (let x = 0; x < s.map.length; x++) {
      const k = objectKey(s, x, y);
      if (!k || !textures.exists(k) || (!trees && k.startsWith('flat/tree_'))) continue;
      out.push({ key: k, x, y });
    }
  return out;
}

// ---------------------------------------------------------------------------
// Orilla animada: olas que llegan a la costa y se retiran
// ---------------------------------------------------------------------------

/** Tramos horizontales [x, y, largo] de agua a cada distancia (1..SHORE_MAX px) de la tierra. */
type Rings = [number, number, number][][];
const SHORE_MAX = 6;

export function shoreRings(land: HTMLCanvasElement, seed = 1): Rings {
  const PW = land.width,
    PH = land.height;
  const a = land.getContext('2d')!.getImageData(0, 0, PW, PH).data;
  const dist = new Uint8Array(PW * PH);
  let frontier: number[] = [];
  for (let i = 0; i < PW * PH; i++)
    if (a[i * 4 + 3]! > 0) {
      dist[i] = 255; // tierra
      frontier.push(i);
    }
  // Distancia (4 vecinos) desde la tierra, solo hasta SHORE_MAX.
  for (let d = 1; d <= SHORE_MAX; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % PW,
        y = (i / PW) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < PW - 1 ? i + 1 : -1, y > 0 ? i - PW : -1, y < PH - 1 ? i + PW : -1]) {
        if (j < 0 || dist[j]) continue;
        dist[j] = d;
        next.push(j);
      }
    }
    frontier = next;
  }
  // Huecos fijos en la espuma (para que no sea una linea continua).
  const gap = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) % 100 < 18;
  };
  const rings: Rings = Array.from({ length: SHORE_MAX + 1 }, () => []);
  for (let y = 0; y < PH; y++) {
    let x = 0;
    while (x < PW) {
      const d = dist[y * PW + x]!;
      if (d === 0 || d === 255 || gap(x >> 1, y >> 1)) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < PW && dist[y * PW + x + len] === d && !gap((x + len) >> 1, y >> 1)) len++;
      rings[d]!.push([x, y, len]);
      x += len;
    }
  }
  return rings;
}

/** La ola llega desde lejos hasta la orilla (fotogramas 0-5) y se retira dejando la arena mojada. */
const WAVE_AT = [6, 5, 4, 3, 2, 1, 1, 2, 3, 0, 0, 0];

export function drawShore(g: Phaser.GameObjects.Graphics, rings: Rings, f: number): void {
  if (!rings.length) return;
  // Linea de espuma fija pegada a la costa, que brilla mas cuando llega la ola.
  const hit = WAVE_AT[f] === 1;
  g.fillStyle(0xffffff, hit ? 0.85 : 0.45);
  for (const [x, y, l] of rings[1]!) g.fillRect(x, y, l, 1);
  const r = WAVE_AT[f % WAVE_AT.length]!;
  if (r > 1) {
    // Frente de la ola: mas opaco cuanto mas cerca de la orilla.
    const back = f >= 6; // retirandose: mas tenue
    g.fillStyle(0xffffff, (back ? 0.35 : 0.55) + (SHORE_MAX - r) * 0.06);
    for (const [x, y, l] of rings[r]!) g.fillRect(x, y, l, 1);
  }
}

// ---------------------------------------------------------------------------
// Agua animada: olas que van y vienen, brillos que parpadean y espuma en la orilla
// ---------------------------------------------------------------------------

interface WaterMark {
  x: number;
  y: number;
  kind: 'wave' | 'spark' | 'foam';
  /** Desfase (0..1) para que no se muevan todas a la vez. */
  phase: number;
  /** Para la espuma: direccion hacia la tierra. */
  dx?: number;
  dy?: number;
  len?: number;
}

/** Puntos del agua que se animan (se calculan una vez por mapa). */
export function waterMarks(s: GameState, seed = 1): WaterMark[] {
  const W = s.map.length,
    H = s.map[0]!.length;
  let r = seed >>> 0 || 1;
  const rnd = () => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;
  const water = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && LEVEL[s.map[x]![y]!]! < 3 && s.map[x]![y]! !== 14;
  const out: WaterMark[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (!water(x, y)) continue;
      const deep = s.map[x]![y]! === 9;
      // Olas: dos por casilla (tres en las profundas), repartidas en filas para que no se pisen.
      const n = deep ? 3 : 2;
      for (let i = 0; i < n; i++)
        out.push({ x: x * TILE + 3 + Math.floor(rnd() * 18), y: y * TILE + 4 + Math.floor(((i + rnd() * 0.8) * 24) / n), kind: 'wave', phase: rnd(), len: 5 + Math.floor(rnd() * 5) });
      if (rnd() < 0.7) out.push({ x: x * TILE + 4 + Math.floor(rnd() * 24), y: y * TILE + 4 + Math.floor(rnd() * 24), kind: 'spark', phase: rnd() });
    }
  return out;
}

export const WATER_FRAMES = 12;

/** Dibuja el fotograma `f` (0..WATER_FRAMES-1) del agua. */
export function drawWater(g: Phaser.GameObjects.Graphics, marks: WaterMark[], f: number): void {
  g.clear();
  for (const m of marks) {
    const p = (f / WATER_FRAMES + m.phase) % 1;
    if (m.kind === 'wave') {
      // Ola: una cresta clara que aparece, se desplaza 3 px y se deshace.
      if (p > 0.75) continue;
      const q = p / 0.75;
      const a = q < 0.2 ? 0.35 : q > 0.8 ? 0.35 : 0.7;
      const off = Math.round(q * 3);
      const len = q < 0.2 || q > 0.8 ? m.len! - 2 : m.len!;
      const x = m.x + off;
      g.fillStyle(0xffffff, a);
      g.fillRect(x + 1, m.y, len - 2, 1);
      g.fillRect(x, m.y + 1, 1, 1);
      g.fillRect(x + len - 1, m.y + 1, 1, 1);
      g.fillStyle(0x0b3a6b, a * 0.45);
      g.fillRect(x + 1, m.y + 1, len - 2, 1);
    } else if (m.kind === 'spark') {
      // Brillo: punto, cruz pequeña, cruz grande y otra vez punto.
      g.fillStyle(0xffffff, 1);
      if (p < 0.05 || (p >= 0.2 && p < 0.25)) g.fillRect(m.x, m.y, 1, 1);
      else if ((p >= 0.05 && p < 0.1) || (p >= 0.15 && p < 0.2)) {
        g.fillRect(m.x - 1, m.y, 3, 1);
        g.fillRect(m.x, m.y - 1, 1, 3);
      } else if (p >= 0.1 && p < 0.15) {
        g.fillRect(m.x - 2, m.y, 5, 1);
        g.fillRect(m.x, m.y - 2, 1, 5);
        g.fillStyle(0xffffff, 0.5);
        g.fillRect(m.x - 1, m.y - 1, 3, 3);
      }
    } else {
      // Espuma: una raya blanca que entra y sale de la orilla.
      const k = Math.round((Math.sin(p * Math.PI * 2) + 1) * 1.5);
      const x = m.x - m.dx! * k,
        y = m.y - m.dy! * k;
      g.fillStyle(0xffffff, 0.85 - k * 0.12);
      if (m.dx) g.fillRect(x, y, 1, m.len!);
      else g.fillRect(x, y, m.len!, 1);
    }
  }
}

/** Si el mapa actual se pinto con arboles sueltos (para elegir el primer plano). */
let treesLoaded = false;

/** Variantes de cada sprite de terreno (tools/art/rd_terrain.py). */
const OBJ_VARIANTS: Record<string, number> = { mount_grass: 4, mount_snow: 4, mount_mesa: 4, tree_grass: 4, tree_snow: 2 };

/** Nombre base del sprite de la casilla (montaña o bosque), sin variante. */
function objectBase(s: GameState, x: number, y: number): string | null {
  const t = s.map[x]?.[y];
  if (t === 2) return s.theme === 4 ? 'tree_snow' : 'tree_grass';
  if (t === 13) return 'tree_snow';
  const m = mountainKind(s, x, y);
  return m ? `mount_${m}` : null;
}

/** Sprite de la casilla con su variante fija (la misma en cada dibujo). */
function objectKey(s: GameState, x: number, y: number, prefix = ''): string | null {
  const b = objectBase(s, x, y);
  if (!b) return null;
  return `flat/${prefix}${b}_${(((x * 2654435761) ^ (y * 40503)) >>> 0) % OBJ_VARIANTS[b]!}`;
}

function mountainKind(s: GameState, x: number, y: number): 'grass' | 'snow' | 'mesa' | null {
  const t = s.map[x]?.[y];
  if (t === 7) return s.theme === 4 ? 'snow' : 'grass';
  if (t === 12) return 'snow';
  if (t === 5) return 'mesa';
  return null;
}

/** Primer plano que tapa los pies de una unidad en esa casilla (null si no hay). */
export function frontKey(s: GameState, x: number, y: number): string | null {
  const t = s.map[x]?.[y];
  const snow = s.theme === 4;
  if ((t === 2 || t === 13) && !treesLoaded) return t === 13 || snow ? 'wang/front_snow_forest' : 'wang/front_grass_forest';
  return objectKey(s, x, y, 'front_');
}
