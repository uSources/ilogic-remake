import Phaser from 'phaser';
import { MAP_H, MAP_W } from '../core/data';
import type { GameState, Pos } from '../core/types';
import { MAP_MARGIN, MAP_PX, TILE, ZOOMS } from '../layout';
import { buildingKey, shoreKeys, terrainKey, unitKey } from './sprites';

export type HighlightKind = 'move' | 'merge' | 'load' | 'attack' | 'unload' | 'danger';

const HL: Record<HighlightKind, { fill: number; alpha: number; line: number }> = {
  move: { fill: 0x2f8fff, alpha: 0.42, line: 0xcfe8ff },
  unload: { fill: 0x2f8fff, alpha: 0.42, line: 0xcfe8ff },
  merge: { fill: 0xb15cff, alpha: 0.45, line: 0xe0b8ff },
  load: { fill: 0x2fd3c3, alpha: 0.45, line: 0xa8fff6 },
  attack: { fill: 0xe5484d, alpha: 0.42, line: 0xffb0b2 },
  danger: { fill: 0xe5484d, alpha: 0.16, line: 0xe5484d },
};

export interface ViewOptions {
  vis: boolean[][];
  highlights: Map<string, HighlightKind>;
  hidden: Set<number>;
  /** Camino previsto (de la unidad al cursor). */
  path?: Pos[];
}

/**
 * Mapa completo en coordenadas de mundo (1024x1024). La camara principal se mueve
 * y hace zoom; la interfaz va en otra camara fija encima.
 * El terreno se dibuja una sola vez; edificios, unidades, niebla y resaltados al cambiar algo.
 */
export class MapView {
  cursor: Pos = { x: 0, y: 0 };
  readonly root: Phaser.GameObjects.Container;
  private readonly terrain: Phaser.GameObjects.Container;
  private readonly things: Phaser.GameObjects.Container;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly fx: Phaser.GameObjects.Container;
  private readonly cursorImg: Phaser.GameObjects.Image;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private zoomIndex = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    this.root = scene.add.container(0, 0);
    this.terrain = scene.add.container(0, 0);
    this.things = scene.add.container(0, 0);
    this.overlay = scene.add.graphics();
    this.fx = scene.add.container(0, 0);
    this.cursorImg = scene.add.image(0, 0, 'cursor').setOrigin(0.5).setDisplaySize(TILE, TILE);
    this.root.add([this.terrain, this.things, this.overlay, this.fx, this.cursorImg]);
    this.updateBounds();
    this.cam.setBackgroundColor('#0b0f14');
    // Cursor que "respira" suavemente.
    scene.tweens.add({ targets: this.cursorImg, scale: { from: 1, to: 1.12 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // --- Camara --------------------------------------------------------------

  get zoom(): number {
    return this.cam.zoom;
  }

  /** Posicion en pantalla del centro de una casilla. */
  screenOf(p: Pos): { x: number; y: number } {
    const wv = this.cam.worldView;
    return { x: (p.x * TILE + TILE / 2 - wv.x) * this.cam.zoom, y: (p.y * TILE + TILE / 2 - wv.y) * this.cam.zoom };
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
    if (instant) this.cam.centerOn(wx, wy);
    else this.cam.pan(wx, wy, 220, 'Sine.easeOut', true);
  }

  /** Desplaza la camara lo justo para que la casilla quede dentro con un margen (en casillas). */
  ensureVisible(p: Pos, margin = 2, instant = false): void {
    const wv = this.cam.worldView;
    const m = margin * TILE;
    let cx = wv.centerX,
      cy = wv.centerY;
    const left = p.x * TILE,
      top = p.y * TILE;
    if (left < wv.x + m) cx -= wv.x + m - left;
    if (left + TILE > wv.right - m) cx += left + TILE - (wv.right - m);
    if (top < wv.y + m) cy -= wv.y + m - top;
    if (top + TILE > wv.bottom - m) cy += top + TILE - (wv.bottom - m);
    if (cx === wv.centerX && cy === wv.centerY) return;
    if (instant) this.cam.centerOn(cx, cy);
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
  private updateBounds(): void {
    const full = MAP_PX + 2 * MAP_MARGIN;
    const vw = this.cam.width / this.cam.zoom,
      vh = this.cam.height / this.cam.zoom;
    const bw = Math.max(full, vw),
      bh = Math.max(full, vh);
    this.cam.setBounds(MAP_PX / 2 - bw / 2, MAP_PX / 2 - bh / 2, bw, bh);
  }

  /** Zoom por pasos alrededor de un punto de la pantalla. */
  zoomStep(dir: 1 | -1, sx: number, sy: number): void {
    const next = Phaser.Math.Clamp(this.zoomIndex + dir, 0, ZOOMS.length - 1);
    if (next === this.zoomIndex) return;
    const before = this.cam.getWorldPoint(sx, sy);
    this.zoomIndex = next;
    this.cam.setZoom(ZOOMS[next]!);
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

  render(s: GameState, opts: ViewOptions): void {
    this.things.removeAll(true);
    const tex = this.scene.textures;
    const objs: Phaser.GameObjects.GameObject[] = [];
    for (const b of s.buildings) {
      const key = buildingKey(tex, s, b, opts.vis[b.x]![b.y]!);
      if (key) objs.push(this.tileImage(key, b.x, b.y));
    }
    for (const u of s.units) {
      if (u.carrier !== null || opts.hidden.has(u.uid) || !opts.vis[u.x]![u.y]) continue;
      const key = unitKey(tex, s, u);
      if (key) objs.push(this.tileImage(key, u.x, u.y));
      const n = Math.ceil(u.life / 10);
      if (u.life < 100 && n <= 9) objs.push(this.scene.add.image(u.x * TILE + 17, u.y * TILE + 17, `n_${n}`).setOrigin(0).setDisplaySize(14, 14));
      if (u.cargo.some((c) => c !== null)) objs.push(this.cargoBadge(u.x, u.y));
    }
    this.things.add(objs);

    const g = this.overlay;
    g.clear();
    // Niebla de guerra.
    g.fillStyle(0x05080c, 0.5);
    for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) if (!opts.vis[x]![y]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    // Resaltados.
    for (const [k, kind] of opts.highlights) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const st = HL[kind];
      g.fillStyle(st.fill, st.alpha);
      g.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      if (kind !== 'danger') {
        g.lineStyle(1, st.line, 0.7);
        g.strokeRect(x * TILE + 1.5, y * TILE + 1.5, TILE - 3, TILE - 3);
      }
    }
    // Camino previsto.
    if (opts.path && opts.path.length > 1) {
      g.lineStyle(6, 0x0b0f14, 0.55);
      this.strokePath(g, opts.path);
      g.lineStyle(3, 0xffffff, 0.95);
      this.strokePath(g, opts.path);
      const end = opts.path[opts.path.length - 1]!;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(end.x * TILE + TILE / 2, end.y * TILE + TILE / 2, 4);
    }
    this.placeCursor();
  }

  private strokePath(g: Phaser.GameObjects.Graphics, path: Pos[]): void {
    g.beginPath();
    g.moveTo(path[0]!.x * TILE + TILE / 2, path[0]!.y * TILE + TILE / 2);
    for (const p of path.slice(1)) g.lineTo(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
    g.strokePath();
  }

  private cargoBadge(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(0x0b0f14, 0.9);
    g.fillRoundedRect(x * TILE + 1, y * TILE + 1, 11, 11, 3);
    g.fillStyle(0x2fd3c3, 1);
    g.fillRoundedRect(x * TILE + 3, y * TILE + 3, 7, 7, 2);
    return g;
  }

  placeCursor(visible = true): void {
    this.cursorImg.setPosition(this.cursor.x * TILE + TILE / 2, this.cursor.y * TILE + TILE / 2).setVisible(visible);
  }

  /** Objeto temporal para animaciones (coordenadas de mundo). */
  addFx(obj: Phaser.GameObjects.GameObject): void {
    this.fx.add(obj);
  }

  /** Imagen de unidad para animar, colocada en una casilla. */
  ghost(key: string, p: Pos): Phaser.GameObjects.Image {
    const img = this.scene.add.image(p.x * TILE, (p.y + 1) * TILE, key).setOrigin(0, 1);
    img.setDisplaySize(TILE, img.height);
    this.fx.add(img);
    return img;
  }
}
