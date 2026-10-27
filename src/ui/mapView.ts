import Phaser from 'phaser';
import { MAP_H, MAP_W } from '../core/data';
import type { GameState, Pos, Unit } from '../core/types';
import { dpr } from '../display';
import type { Anchor } from '../hud/store';
import { TILE } from '../layout';
import { reducedMotion } from './fx';
import { buildingKey, shoreKeys, terrainKey, unitKey } from './sprites';

export type HighlightKind = 'move' | 'merge' | 'load' | 'attack' | 'unload' | 'reach';

const HL: Record<HighlightKind, { fill: number; alpha: number; line: number }> = {
  move: { fill: 0x3aa8ff, alpha: 0.4, line: 0xcfe8ff },
  unload: { fill: 0x3aa8ff, alpha: 0.4, line: 0xcfe8ff },
  merge: { fill: 0xb15cff, alpha: 0.45, line: 0xe0b8ff },
  load: { fill: 0x2fd3c3, alpha: 0.45, line: 0xa8fff6 },
  attack: { fill: 0xff4d45, alpha: 0.42, line: 0xffb0b2 },
  reach: { fill: 0xff8a3d, alpha: 0.32, line: 0xffc9a0 },
};

export interface ViewOptions {
  vis: boolean[][];
  highlights: Map<string, HighlightKind>;
  hidden: Set<number>;
  /** Camino previsto (de la unidad al cursor). */
  path?: Pos[];
  /** Casillas que el enemigo puede atacar en su proximo turno (tecla T). */
  threat?: boolean[][] | null;
  /** Capturas a medias que se ven (barra encima del edificio). */
  captures?: { x: number; y: number; left: number; total: number; team: 0 | 1 }[];
}

/** Sprite persistente de una unidad: imagen + vida + marca de carga. */
interface UnitSprite {
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  life: Phaser.GameObjects.Image;
  cargo: Phaser.GameObjects.Rectangle;
  key: string;
  /** Unidad propia sin usar: se mueve un poco (animacion de espera). */
  idle: boolean;
}

/** Margen en pixeles CSS que se puede desplazar mas alla del mapa (para que no quede bajo la interfaz). */
const EDGE_CSS = 110;

/**
 * Mapa en coordenadas de mundo (1024x1024, 32 px por casilla). La camara tiene zoom
 * entero en pixeles fisicos, asi que el pixel art se ve siempre nitido.
 * Terreno: se crea una vez. Edificios y unidades: un sprite persistente por cada uno,
 * que se actualiza (no se redibuja todo en cada cambio).
 */
export class MapView {
  cursor: Pos = { x: 0, y: 0 };
  private readonly root: Phaser.GameObjects.Container;
  private readonly terrain: Phaser.GameObjects.Container;
  private readonly buildingLayer: Phaser.GameObjects.Container;
  private readonly unitLayer: Phaser.GameObjects.Container;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly fx: Phaser.GameObjects.Container;
  private readonly cloudLayer: Phaser.GameObjects.Container;
  private readonly cursorImg: Phaser.GameObjects.Image;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly units = new Map<number, UnitSprite>();
  private readonly buildings: Phaser.GameObjects.Image[] = [];
  private clouds: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private level = 2;
  private bobPhase = 0;
  private lastDpr = dpr();

  constructor(private readonly scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    this.cam.setRoundPixels(true);
    this.root = scene.add.container(0, 0);
    this.terrain = scene.add.container(0, 0);
    this.buildingLayer = scene.add.container(0, 0);
    this.unitLayer = scene.add.container(0, 0);
    this.overlay = scene.add.graphics();
    this.fx = scene.add.container(0, 0);
    this.cloudLayer = scene.add.container(0, 0);
    this.cursorImg = scene.add.image(0, 0, 'cursor').setOrigin(0).setDisplaySize(TILE, TILE);
    // Orden: terreno, edificios, niebla y resaltados, unidades, efectos, cursor, nubes.
    this.root.add([this.terrain, this.buildingLayer, this.overlay, this.unitLayer, this.fx, this.cursorImg, this.cloudLayer]);
    this.cam.setBackgroundColor('#0b1220');
    this.level = this.defaultLevel();
    this.cam.setZoom(this.level);
    this.updateBounds();
  }

  // --- Camara --------------------------------------------------------------

  /** Pixeles fisicos por pixel del dibujo: casillas de ~64 px CSS en escritorio, ~48 en movil. */
  private defaultLevel(): number {
    const r = dpr();
    const cssW = this.cam.width / r;
    const target = cssW < 720 ? 1.5 : 2;
    return this.clampLevel(Math.round(target * r));
  }

  private clampLevel(z: number): number {
    const r = dpr();
    return Phaser.Math.Clamp(z, Math.max(1, Math.round(r)), Math.max(4, Math.round(4 * r)));
  }

  /** Posicion en pantalla (pixeles del lienzo) del centro de una casilla. */
  screenOf(p: Pos): { x: number; y: number } {
    const wv = this.cam.worldView;
    return { x: (p.x * TILE + TILE / 2 - wv.x) * this.cam.zoom, y: (p.y * TILE + TILE / 2 - wv.y) * this.cam.zoom };
  }

  /** Rectangulo de una casilla en pixeles CSS de la ventana (para colocar la interfaz HTML). */
  tileRectCss(p: Pos): Anchor {
    // worldView solo se actualiza al dibujar: recalcularlo por si la camara acaba de moverse.
    this.cam.preRender();
    const wv = this.cam.worldView;
    const k = this.cam.zoom / dpr();
    return { x: (p.x * TILE - wv.x) * k, y: (p.y * TILE - wv.y) * k, w: TILE * k, h: TILE * k };
  }

  /** Casilla bajo un punto de la pantalla (null si cae fuera del mapa). */
  tileAtScreen(sx: number, sy: number): Pos | null {
    const wp = this.cam.getWorldPoint(sx, sy);
    const x = Math.floor(wp.x / TILE),
      y = Math.floor(wp.y / TILE);
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? { x, y } : null;
  }

  centerOn(p: Pos, instant = false): void {
    const wx = p.x * TILE + TILE / 2,
      wy = p.y * TILE + TILE / 2;
    if (instant || reducedMotion()) this.cam.centerOn(wx, wy);
    else this.cam.pan(wx, wy, 220, 'Sine.easeOut', true);
  }

  /** Desplaza la camara lo justo para que la casilla quede dentro con un margen (en casillas). */
  ensureVisible(p: Pos, margin = 2, instant = false): void {
    const wv = this.cam.worldView;
    // El margen no puede ser mayor que media vista (pantallas pequeñas o mucho zoom).
    const m = Math.min(margin * TILE, Math.max(0, wv.width / 2 - TILE), Math.max(0, wv.height / 2 - TILE));
    let cx = wv.centerX,
      cy = wv.centerY;
    const left = p.x * TILE,
      top = p.y * TILE;
    if (left < wv.x + m) cx -= wv.x + m - left;
    if (left + TILE > wv.right - m) cx += left + TILE - (wv.right - m);
    if (top < wv.y + m) cy -= wv.y + m - top;
    if (top + TILE > wv.bottom - m) cy += top + TILE - (wv.bottom - m);
    if (cx === wv.centerX && cy === wv.centerY) return;
    if (instant || reducedMotion()) this.cam.centerOn(cx, cy);
    else this.cam.pan(cx, cy, 160, 'Sine.easeOut', true);
  }

  isOnScreen(p: Pos, margin = 1): boolean {
    const wv = this.cam.worldView;
    return (
      p.x * TILE >= wv.x + margin * TILE &&
      (p.x + 1) * TILE <= wv.right - margin * TILE &&
      p.y * TILE >= wv.y + margin * TILE &&
      (p.y + 1) * TILE <= wv.bottom - margin * TILE
    );
  }

  scrollBy(dx: number, dy: number): void {
    this.cam.setScroll(this.cam.scrollX + dx / this.cam.zoom, this.cam.scrollY + dy / this.cam.zoom);
  }

  /** Limites de la camara: el mapa con un margen; si cabe entero en la vista, centrado. */
  updateBounds(): void {
    const edgeCss = Math.min(EDGE_CSS, Math.round((this.cam.width / dpr()) * 0.08));
    const margin = (edgeCss * dpr()) / this.cam.zoom;
    const mw = MAP_W * TILE,
      mh = MAP_H * TILE;
    const vw = this.cam.width / this.cam.zoom,
      vh = this.cam.height / this.cam.zoom;
    const bw = Math.max(mw + 2 * margin, vw),
      bh = Math.max(mh + 2 * margin, vh);
    this.cam.setBounds(mw / 2 - bw / 2, mh / 2 - bh / 2, bw, bh);
  }

  /** La ventana ha cambiado de tamaño: mantener el mismo punto en el centro. */
  resize(w: number, h: number): void {
    const mid = { x: this.cam.midPoint.x, y: this.cam.midPoint.y };
    this.cam.setSize(w, h);
    // Si cambia la densidad (otra pantalla, zoom del navegador), mantener el tamaño de casilla en CSS.
    const r = dpr();
    if (r !== this.lastDpr) {
      this.level = Math.round((this.level * r) / this.lastDpr);
      this.lastDpr = r;
    }
    this.level = this.clampLevel(this.level);
    this.cam.setZoom(this.level);
    this.updateBounds();
    this.cam.centerOn(mid.x, mid.y);
  }

  /** Zoom entero por pasos alrededor de un punto de la pantalla. */
  zoomStep(dir: 1 | -1, sx: number, sy: number): void {
    const next = this.clampLevel(this.level + dir);
    if (next === this.level) return;
    const before = this.cam.getWorldPoint(sx, sy);
    this.level = next;
    this.cam.setZoom(next);
    this.updateBounds();
    this.cam.preRender();
    const after = this.cam.getWorldPoint(sx, sy);
    this.cam.setScroll(this.cam.scrollX + before.x - after.x, this.cam.scrollY + before.y - after.y);
  }

  // --- Dibujado --------------------------------------------------------------

  private tileImage(key: string, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x * TILE, (y + 1) * TILE, key).setOrigin(0, 1);
    img.setDisplaySize(TILE, img.height);
    return img;
  }

  /** Terreno y orillas: solo al empezar la partida (el terreno no cambia). */
  buildTerrain(s: GameState): void {
    this.terrain.removeAll(true);
    const objs: Phaser.GameObjects.GameObject[] = [];
    for (let x = 0; x < MAP_W; x++) {
      for (let y = 0; y < MAP_H; y++) {
        objs.push(this.tileImage(terrainKey(s.map[x]![y]!), x, y));
        for (const k of shoreKeys(s, x, y)) {
          if (this.scene.textures.exists(k)) objs.push(this.scene.add.image(x * TILE, y * TILE, k).setOrigin(0).setDisplaySize(TILE, TILE));
        }
      }
    }
    this.terrain.add(objs);
  }

  /** Pone al dia edificios, unidades, niebla y resaltados. */
  render(s: GameState, opts: ViewOptions): void {
    this.syncBuildings(s, opts.vis);
    this.syncUnits(s, opts);
    this.drawOverlay(opts);
    this.placeCursor();
  }

  private syncBuildings(s: GameState, vis: boolean[][]): void {
    const tex = this.scene.textures;
    s.buildings.forEach((b, i) => {
      const key = buildingKey(tex, s, b, vis[b.x]![b.y]!);
      let img = this.buildings[i];
      if (!key) {
        img?.setVisible(false);
        return;
      }
      if (!img) {
        img = this.tileImage(key, b.x, b.y);
        this.buildings[i] = img;
        this.buildingLayer.add(img);
      } else if (img.texture.key !== key) {
        img.setTexture(key);
        img.setDisplaySize(TILE, img.frame.height);
      }
      img.setVisible(true);
    });
  }

  private newUnitSprite(key: string): UnitSprite {
    const img = this.scene.add.image(0, TILE, key).setOrigin(0, 1);
    img.setDisplaySize(TILE, img.height);
    const life = this.scene.add.image(17, 17, 'n_9').setOrigin(0).setDisplaySize(14, 14);
    const cargo = this.scene.add.rectangle(2, 2, 8, 8, 0x2fd3c3).setOrigin(0).setStrokeStyle(2, 0x0b1220);
    const root = this.scene.add.container(0, 0, [img, life, cargo]);
    this.unitLayer.add(root);
    return { root, img, life, cargo, key, idle: false };
  }

  private syncUnits(s: GameState, opts: ViewOptions): void {
    const tex = this.scene.textures;
    const seen = new Set<number>();
    for (const u of s.units) {
      if (u.carrier !== null || opts.hidden.has(u.uid) || !opts.vis[u.x]![u.y]) continue;
      const key = unitKey(tex, s, u);
      if (!key) continue;
      seen.add(u.uid);
      let sp = this.units.get(u.uid);
      if (!sp) {
        sp = this.newUnitSprite(key);
        this.units.set(u.uid, sp);
      } else if (sp.key !== key) {
        sp.img.setTexture(key);
        sp.img.setDisplaySize(TILE, sp.img.frame.height);
        sp.key = key;
      }
      this.updateUnitSprite(sp, u);
    }
    for (const [uid, sp] of this.units) {
      if (!seen.has(uid)) {
        sp.root.destroy();
        this.units.delete(uid);
      }
    }
    // Las de mas abajo se dibujan encima (los sprites altos tapan la casilla de arriba).
    this.unitLayer.sort('y');
  }

  private updateUnitSprite(sp: UnitSprite, u: Unit): void {
    sp.root.setPosition(u.x * TILE, u.y * TILE);
    const n = Math.ceil(u.life / 10);
    const showLife = u.life < 100 && n >= 1 && n <= 9;
    sp.life.setVisible(showLife);
    if (showLife) sp.life.setTexture(`n_${n}`).setDisplaySize(14, 14);
    sp.cargo.setVisible(u.cargo.some((c) => c !== null));
    sp.idle = u.team === 0 && u.active;
    sp.img.y = TILE - (sp.idle ? this.bobPhase : 0);
  }

  private drawOverlay(opts: ViewOptions): void {
    const g = this.overlay;
    g.clear();
    // Niebla de guerra.
    g.fillStyle(0x05080c, 0.5);
    for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) if (!opts.vis[x]![y]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    // Zona de amenaza enemiga: relleno rojo suave y borde de 2 px por fuera de la zona.
    const th = opts.threat;
    if (th) {
      const at = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && th[x]![y]!;
      g.fillStyle(0xff4d45, 0.2);
      for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) if (th[x]![y]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      g.fillStyle(0xff4d45, 0.9);
      for (let x = 0; x < MAP_W; x++)
        for (let y = 0; y < MAP_H; y++) {
          if (!th[x]![y]) continue;
          const px = x * TILE,
            py = y * TILE;
          if (!at(x, y - 1)) g.fillRect(px, py, TILE, 2);
          if (!at(x, y + 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
          if (!at(x - 1, y)) g.fillRect(px, py, 2, TILE);
          if (!at(x + 1, y)) g.fillRect(px + TILE - 2, py, 2, TILE);
        }
    }
    // Resaltados (bordes de 1 px dibujados con rectangulos para que queden nitidos).
    for (const [k, kind] of opts.highlights) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const st = HL[kind];
      const px = x * TILE,
        py = y * TILE;
      g.fillStyle(st.fill, st.alpha);
      g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle(st.line, 0.75);
      g.fillRect(px + 1, py + 1, TILE - 2, 1);
      g.fillRect(px + 1, py + TILE - 2, TILE - 2, 1);
      g.fillRect(px + 1, py + 2, 1, TILE - 4);
      g.fillRect(px + TILE - 2, py + 2, 1, TILE - 4);
    }
    // Barras de captura: fondo oscuro y relleno del color de quien captura.
    for (const c of opts.captures ?? []) {
      const px = c.x * TILE + 3,
        py = c.y * TILE + 1;
      const w = TILE - 6;
      g.fillStyle(0x0b1220, 0.9);
      g.fillRect(px - 1, py - 1, w + 2, 6);
      g.fillStyle(c.team === 0 ? 0x3aa8ff : 0xff4d45, 1);
      g.fillRect(px, py, Math.max(1, Math.round((w * (c.total - c.left)) / c.total)), 4);
    }
    // Camino previsto: tramos de 4 px con borde oscuro.
    const path = opts.path;
    if (path && path.length > 1) {
      for (const [w, color] of [
        [8, 0x0b1220],
        [4, 0xffffff],
      ] as const) {
        g.fillStyle(color, color === 0xffffff ? 1 : 0.6);
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i]!,
            b = path[i + 1]!;
          const x0 = Math.min(a.x, b.x) * TILE + TILE / 2 - w / 2,
            y0 = Math.min(a.y, b.y) * TILE + TILE / 2 - w / 2;
          g.fillRect(x0, y0, Math.abs(a.x - b.x) * TILE + w, Math.abs(a.y - b.y) * TILE + w);
        }
      }
      const end = path[path.length - 1]!;
      g.fillStyle(0x0b1220, 0.6);
      g.fillRect(end.x * TILE + TILE / 2 - 6, end.y * TILE + TILE / 2 - 6, 12, 12);
      g.fillStyle(0xffd447, 1);
      g.fillRect(end.x * TILE + TILE / 2 - 4, end.y * TILE + TILE / 2 - 4, 8, 8);
    }
  }

  placeCursor(visible = true): void {
    this.cursorImg.setPosition(this.cursor.x * TILE, this.cursor.y * TILE).setVisible(visible);
  }

  /** Animaciones por pasos (estilo pixel): parpadeo del cursor, unidades en espera y nubes. */
  tick(time: number, delta: number): void {
    const still = reducedMotion();
    this.cursorImg.setAlpha(!still && Math.floor(time / 450) % 2 ? 0.7 : 1);
    const phase = still ? 0 : Math.floor(time / 500) % 2;
    if (phase !== this.bobPhase) {
      this.bobPhase = phase;
      for (const sp of this.units.values()) sp.img.y = TILE - (sp.idle ? phase : 0);
    }
    // Nubes: cruzan el mapa despacio, de vez en cuando.
    const dy = delta * 0.006;
    this.clouds = this.clouds.filter((c) => {
      c.y += dy;
      c.img.setPosition(Math.round(c.x), Math.round(c.y));
      if (c.y > MAP_H * TILE + 40) {
        c.img.destroy();
        return false;
      }
      return true;
    });
    if (this.clouds.length < 3 && Math.random() < delta / 25000) {
      const img = this.scene.add
        .image(0, 0, `cl_${Math.floor(Math.random() * 5)}`)
        .setOrigin(0, 1)
        .setDisplaySize(64, 128)
        .setAlpha(0.75);
      this.cloudLayer.add(img);
      this.clouds.push({ img, x: Math.random() * (MAP_W * TILE - 64), y: -8 });
    }
  }

  /** Sprite (contenedor) de una unidad tal como esta dibujada ahora, si se ve. */
  unitSprite(uid: number): Phaser.GameObjects.Container | null {
    return this.units.get(uid)?.root ?? null;
  }

  /** Imagen de la unidad dibujada en una casilla (antes de volver a pintar), para efectos. */
  unitKeyAt(p: Pos): string | null {
    for (const sp of this.units.values()) if (sp.root.x === p.x * TILE && sp.root.y === p.y * TILE && sp.root.visible) return sp.key;
    return null;
  }

  /** Objeto temporal para animaciones (coordenadas de mundo). */
  addFx(obj: Phaser.GameObjects.GameObject): void {
    this.fx.add(obj);
  }

  /** Imagen de unidad para animar, colocada en una casilla (x = centro de la casilla). */
  ghost(key: string, p: Pos): Phaser.GameObjects.Image {
    // Origen en el centro de abajo: asi se puede voltear (mirar a la izquierda) sin desplazarse.
    const img = this.scene.add.image(p.x * TILE + TILE / 2, (p.y + 1) * TILE, key).setOrigin(0.5, 1);
    img.setDisplaySize(TILE, img.height);
    this.fx.add(img);
    return img;
  }
}
