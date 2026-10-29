import Phaser from 'phaser';
import { MAP_H, MAP_W } from '../core/data';
import type { GameState, Pos, Unit } from '../core/types';
import { dpr } from '../display';
import type { Anchor } from '../hud/store';
import { TILE } from '../layout';
import { reducedMotion } from './fx';
import { rank } from '../core/rules';
import { buildingKey, shoreKeys, terrainKey, unitKey } from './sprites';
import { frontKey, paintTerrain, terrainArtReady, terrainObjects, waterAnimCells, type AnimCell } from './terrainArt';
import { ANIM_FRAMES } from './sheets';
import { composeFog, visKey } from './fog';
import { settings } from '../settings';

export type HighlightKind = 'move' | 'merge' | 'load' | 'attack' | 'unload' | 'reach' | 'hover' | 'group';

const HL: Record<HighlightKind, { fill: number; alpha: number; line: number }> = {
  move: { fill: 0x3aa8ff, alpha: 0.4, line: 0xcfe8ff },
  unload: { fill: 0x3aa8ff, alpha: 0.4, line: 0xcfe8ff },
  merge: { fill: 0xb15cff, alpha: 0.45, line: 0xe0b8ff },
  load: { fill: 0x2fd3c3, alpha: 0.45, line: 0xa8fff6 },
  attack: { fill: 0xff4d45, alpha: 0.42, line: 0xffb0b2 },
  reach: { fill: 0xff8a3d, alpha: 0.32, line: 0xffc9a0 },
  hover: { fill: 0x3aa8ff, alpha: 0.16, line: 0x8fd0ff },
  group: { fill: 0xffd447, alpha: 0.18, line: 0xffd447 },
};

export interface ViewOptions {
  vis: boolean[][];
  highlights: Map<string, HighlightKind>;
  hidden: Set<number>;
  /** Camino previsto (de la unidad al cursor). */
  path?: Pos[];
  /** Casillas que el enemigo puede atacar en su proximo turno (tecla T). */
  threat?: boolean[][] | null;
  /** Al mover: todo lo que la unidad podria atacar (borde rojo) y destinos peligrosos (marca roja). */
  attackZone?: boolean[][] | null;
  danger?: boolean[][] | null;
  /** Ordenes de varios turnos: linea de puntos hasta el destino y banderita. */
  orders?: { from: Pos; to: Pos }[];
  /** Mision: casilla de destino (marco dorado) y unidad a escoltar (flecha encima). */
  goal?: Pos | null;
  vip?: Pos | null;
  /** Capturas a medias que se ven (barra encima del edificio). */
  captures?: { x: number; y: number; left: number; total: number; team: 0 | 1 }[];
}

/** Sprite persistente de una unidad: imagen + vida + marca de carga. */
interface UnitSprite {
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  /** Primer plano del terreno (bosque, rocas) delante de la unidad. */
  front: Phaser.GameObjects.Image;
  life: Phaser.GameObjects.Image;
  cargo: Phaser.GameObjects.Rectangle;
  /** Estrellas de veterania (arriba a la derecha). */
  stars: Phaser.GameObjects.Graphics;
  rank: number;
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
  /** Marcas de mision, por encima de las unidades. */
  private readonly marks: Phaser.GameObjects.Graphics;
  private goal: Pos | null = null;
  private vip: Pos | null = null;
  private readonly cursorImg: Phaser.GameObjects.Image;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly units = new Map<number, UnitSprite>();
  private readonly buildings: Phaser.GameObjects.Image[] = [];
  /** Niebla del dibujo nuevo (lienzo con borde organico). */
  private readonly fogLayer: Phaser.GameObjects.Container;
  private fogImg: Phaser.GameObjects.Image | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogSig = '';
  private fogVis: boolean[][] | null = null;
  private level = 2;
  private bobPhase = 0;
  /** Agua animada del terreno nuevo. */
  /** Agua animada: una imagen por casilla con su lamina (anim/water o anim/shore_<set>) y fila. */
  private waterAnim: { img: Phaser.GameObjects.Image; cell: AnimCell }[] = [];
  private waterFrame = -1;
  /** Montañas y bosques: en la capa de los edificios, ordenados por fila con ellos. */
  private objImgs: Phaser.GameObjects.Image[] = [];
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
    this.fogLayer = scene.add.container(0, 0);
    this.cursorImg = scene.add.image(0, 0, 'cursor').setOrigin(0).setDisplaySize(TILE, TILE);
    // Orden: terreno, edificios, niebla y resaltados, unidades, efectos, cursor.
    this.marks = scene.add.graphics();
    this.root.add([this.terrain, this.buildingLayer, this.fogLayer, this.overlay, this.unitLayer, this.marks, this.fx, this.cursorImg]);
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
    // Origen abajo en el centro: los dibujos nuevos pueden ser algo mas anchos que la casilla.
    const img = this.scene.add.image(x * TILE + TILE / 2, (y + 1) * TILE + 0, key).setOrigin(0.5, 1);
    img.setDisplaySize(Math.max(TILE, img.width), img.height);
    return img;
  }

  /** Terreno y orillas: solo al empezar la partida (el terreno no cambia). */
  buildTerrain(s: GameState): void {
    this.terrain.removeAll(true);
    this.waterAnim = [];
    for (const o of this.objImgs) o.destroy();
    this.objImgs = [];
    const tex = this.scene.textures;
    if (settings.terrainArt === 'new' && terrainArtReady(tex)) {
      // Terreno nuevo: pintado una vez en un lienzo.
      const key = 'terrainBake';
      if (tex.exists(key)) tex.remove(key);
      tex.addCanvas(key, paintTerrain(tex, s));
      this.terrain.add(this.scene.add.image(0, 0, key).setOrigin(0));
      // Agua animada: piezas precompiladas, una por casilla; en tick() solo se cambia el fotograma.
      for (const cell of waterAnimCells(s)) {
        this.ensureAnimFrames(cell.key);
        const img = this.scene.add.image(cell.x * TILE, cell.y * TILE, cell.key, `${cell.row}_0`).setOrigin(0);
        this.waterAnim.push({ img, cell });
        this.terrain.add(img);
      }
      this.waterFrame = -1;
      for (const o of terrainObjects(tex, s)) {
        const img = this.tileImage(o.key, o.x, o.y);
        this.objImgs.push(img);
        this.buildingLayer.add(img);
      }
      this.sortBuildingLayer();
      return;
    }
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
    this.goal = opts.goal ?? null;
    this.vip = opts.vip ?? null;
    this.drawMarks(0);
    this.placeCursor();
  }

  /** Destino (esquinas doradas) y flecha sobre la unidad a escoltar; se mueven a saltos. */
  private drawMarks(phase: number): void {
    const g = this.marks;
    g.clear();
    if (this.goal) {
      const d = phase ? 2 : 0;
      const x = this.goal.x * TILE - d,
        y = this.goal.y * TILE - d,
        w = TILE + 2 * d;
      g.fillStyle(0x0b1220, 0.8);
      for (const [cx, cy] of [[x - 1, y - 1], [x + w - 9, y - 1], [x - 1, y + w - 9], [x + w - 9, y + w - 9]] as const) g.fillRect(cx, cy, 10, 10);
      g.fillStyle(0xffd447, 1);
      g.fillRect(x, y, 8, 2), g.fillRect(x, y, 2, 8);
      g.fillRect(x + w - 8, y, 8, 2), g.fillRect(x + w - 2, y, 2, 8);
      g.fillRect(x, y + w - 2, 8, 2), g.fillRect(x, y + w - 8, 2, 8);
      g.fillRect(x + w - 8, y + w - 2, 8, 2), g.fillRect(x + w - 2, y + w - 8, 2, 8);
    }
    if (this.vip) {
      const cx = this.vip.x * TILE + TILE / 2,
        top = this.vip.y * TILE - 10 - (phase ? 2 : 0);
      g.fillStyle(0x0b1220, 1);
      g.fillRect(cx - 6, top - 1, 12, 5);
      g.fillRect(cx - 4, top + 4, 8, 3);
      g.fillRect(cx - 2, top + 7, 4, 3);
      g.fillStyle(0xffd447, 1);
      g.fillRect(cx - 5, top, 10, 3);
      g.fillRect(cx - 3, top + 3, 6, 2);
      g.fillRect(cx - 1, top + 5, 2, 3);
    }
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
        img.setDisplaySize(Math.max(TILE, img.frame.width), img.frame.height);
        img.setPosition(b.x * TILE + TILE / 2, (b.y + 1) * TILE);
      }
      img.setVisible(true);
    });
    this.sortBuildingLayer();
  }

  /** Lo que esta mas abajo en el mapa se dibuja delante (los sprites tienen el origen abajo). */
  private sortBuildingLayer(): void {
    this.buildingLayer.sort('y');
  }

  private newUnitSprite(key: string): UnitSprite {
    // Origen abajo en el centro: las unidades nuevas pueden ser algo mas anchas que la casilla.
    const img = this.scene.add.image(TILE / 2, TILE, key).setOrigin(0.5, 1);
    img.setDisplaySize(Math.max(TILE, img.width), img.height);
    const life = this.scene.add.image(17, 17, 'n_9').setOrigin(0).setDisplaySize(14, 14);
    const cargo = this.scene.add.rectangle(2, 2, 8, 8, 0x2fd3c3).setOrigin(0).setStrokeStyle(2, 0x0b1220);
    const stars = this.scene.add.graphics();
    // Primer plano (copas de arbol o rocas) que tapa los pies de la unidad en bosques y montañas.
    const front = this.scene.add.image(0, TILE, '__DEFAULT').setOrigin(0, 1).setVisible(false);
    const root = this.scene.add.container(0, 0, [img, front, life, cargo, stars]);
    this.unitLayer.add(root);
    return { root, img, front, life, cargo, stars, rank: 0, key, idle: false };
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
        sp.img.setDisplaySize(Math.max(TILE, sp.img.frame.width), sp.img.frame.height);
        sp.key = key;
      }
      this.updateUnitSprite(sp, u, s);
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

  private updateUnitSprite(sp: UnitSprite, u: Unit, s?: GameState): void {
    sp.root.setPosition(u.x * TILE, u.y * TILE);
    // Integrar la unidad en el terreno (dibujo nuevo): bosque y montaña le tapan los pies y la oscurecen un poco.
    const front = s && this.newArt() ? frontKey(s, u.x, u.y) : null;
    if (front && this.scene.textures.exists(front)) {
      sp.front.setTexture(front).setVisible(true);
      sp.img.setTint(front.includes('forest') || front.includes('tree') ? 0xd8e4d8 : 0xe8e8e8);
    } else {
      sp.front.setVisible(false);
      sp.img.clearTint();
    }
    const n = Math.ceil(u.life / 10);
    const showLife = u.life < 100 && n >= 1 && n <= 9;
    sp.life.setVisible(showLife);
    if (showLife) sp.life.setTexture(`n_${n}`).setDisplaySize(14, 14);
    sp.cargo.setVisible(u.cargo.some((c) => c !== null));
    const r = rank(u);
    if (r !== sp.rank) {
      // Una "estrella" pixel por rango: rombo dorado de 3x3 con borde oscuro.
      sp.rank = r;
      const g = sp.stars;
      g.clear();
      for (let i = 0; i < r; i++) {
        const x = TILE - 5 - i * 5,
          y = 1;
        g.fillStyle(0x0b1220, 1);
        g.fillRect(x - 1, y, 5, 5);
        g.fillStyle(0xffd447, 1);
        g.fillRect(x, y + 1, 3, 3);
        g.fillStyle(0xfff1a8, 1);
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    sp.idle = u.team === 0 && u.active;
    sp.img.y = TILE - (sp.idle ? this.bobPhase : 0);
  }

  private newArt(): boolean {
    return settings.terrainArt === 'new' && terrainArtReady(this.scene.textures);
  }

  /** Da nombre a las piezas de una lamina animada (fila_fotograma), respetando su sitio en el atlas. */
  private ensureAnimFrames(key: string): void {
    const t = this.scene.textures.get(key);
    if (t.has('0_0')) return;
    const base = this.scene.textures.getFrame(key);
    const rows = Math.floor(base.cutHeight / TILE);
    for (let r = 0; r < rows; r++)
      for (let f = 0; f < ANIM_FRAMES; f++) t.add(`${r}_${f}`, base.sourceIndex, base.cutX + f * TILE, base.cutY + r * TILE, TILE, TILE);
  }

  /** Repinta la niebla nueva si ha cambiado lo que se ve. */
  private updateFog(vis: boolean[][]): void {
    this.fogVis = vis;
    const sig = visKey(vis);
    if (sig === this.fogSig && this.fogImg) return;
    this.fogSig = sig;
    const tex = this.scene.textures;
    this.fogCanvas = composeFog(vis, this.scene.textures, this.fogCanvas ?? undefined);
    if (!this.fogImg) {
      if (tex.exists('fogBake')) tex.remove('fogBake');
      tex.addCanvas('fogBake', this.fogCanvas);
      this.fogImg = this.scene.add.image(0, 0, 'fogBake').setOrigin(0);
      this.fogLayer.addAt(this.fogImg, 0);
    } else (tex.get('fogBake') as Phaser.Textures.CanvasTexture).refresh();
  }

  private drawOverlay(opts: ViewOptions): void {
    const g = this.overlay;
    g.clear();
    // Niebla de guerra.
    this.fogLayer.setVisible(this.newArt());
    if (this.newArt()) this.updateFog(opts.vis);
    else {
      g.fillStyle(0x05080c, 0.5);
      for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) if (!opts.vis[x]![y]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
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
    // Alcance de ataque al mover: relleno rojo tenue fuera del movimiento y borde de la zona.
    const z = opts.attackZone;
    if (z) {
      const inZ = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && z[x]![y]!;
      g.fillStyle(0xff4d45, 0.14);
      for (let x = 0; x < MAP_W; x++)
        for (let y = 0; y < MAP_H; y++) if (z[x]![y] && !opts.highlights.has(`${x},${y}`)) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      g.fillStyle(0xff4d45, 0.85);
      for (let x = 0; x < MAP_W; x++)
        for (let y = 0; y < MAP_H; y++) {
          if (!z[x]![y]) continue;
          const px = x * TILE,
            py = y * TILE;
          if (!inZ(x, y - 1)) g.fillRect(px, py, TILE, 2);
          if (!inZ(x, y + 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
          if (!inZ(x - 1, y)) g.fillRect(px, py, 2, TILE);
          if (!inZ(x + 1, y)) g.fillRect(px + TILE - 2, py, 2, TILE);
        }
    }
    // Destinos peligrosos (el enemigo visible podria atacar ahi): esquina roja.
    const dg = opts.danger;
    if (dg) {
      for (const [k, kind] of opts.highlights) {
        if (kind !== 'move') continue;
        const [x, y] = k.split(',').map(Number) as [number, number];
        if (!dg[x]![y]) continue;
        const px = x * TILE + TILE - 9,
          py = y * TILE + 3;
        g.fillStyle(0x0b1220, 0.8);
        g.fillRect(px - 1, py - 1, 8, 8);
        g.fillStyle(0xff4d45, 1);
        for (let i = 0; i < 6; i++) g.fillRect(px + i, py, 6 - i, 1), g.fillRect(px + i, py + i, 1, 1);
        g.fillRect(px, py, 6, 2);
        g.fillRect(px + 4, py, 2, 6);
      }
    }
    // Ordenes de varios turnos: puntos cada 8 px (primero en horizontal, luego en vertical) y banderita.
    for (const o of opts.orders ?? []) {
      const ax = o.from.x * TILE + TILE / 2,
        ay = o.from.y * TILE + TILE / 2,
        bx = o.to.x * TILE + TILE / 2,
        by = o.to.y * TILE + TILE / 2;
      g.fillStyle(0xffd447, 0.9);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x += 8) g.fillRect(x - 1, ay - 1, 3, 3);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += 8) g.fillRect(bx - 1, y - 1, 3, 3);
      g.fillStyle(0x0b1220, 1);
      g.fillRect(bx - 1, by - 12, 3, 14);
      g.fillStyle(0xffd447, 1);
      g.fillRect(bx + 2, by - 12, 8, 6);
      g.fillStyle(0xfff1a8, 1);
      g.fillRect(bx, by - 11, 1, 12);
    }
    // Camino previsto: flecha pixel (tramos de 4 px con borde oscuro y punta), como en Advance Wars.
    const path = opts.path;
    if (path && path.length > 1) {
      const end = path[path.length - 1]!,
        before = path[path.length - 2]!;
      const dx = Math.sign(end.x - before.x),
        dy = Math.sign(end.y - before.y);
      const cx = end.x * TILE + TILE / 2,
        cy = end.y * TILE + TILE / 2;
      for (const [w, color, alpha] of [
        [8, 0x0b1220, 0.7],
        [4, 0xffffff, 1],
      ] as const) {
        g.fillStyle(color, alpha);
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i]!,
            b = path[i + 1]!;
          // El ultimo tramo se queda antes del centro: ahi va la punta.
          const last = i === path.length - 2;
          let x0 = Math.min(a.x, b.x) * TILE + TILE / 2 - w / 2,
            y0 = Math.min(a.y, b.y) * TILE + TILE / 2 - w / 2;
          let ww = Math.abs(a.x - b.x) * TILE + w,
            hh = Math.abs(a.y - b.y) * TILE + w;
          if (last) {
            const cut = 6;
            if (dx > 0) ww -= cut;
            if (dx < 0) (x0 += cut), (ww -= cut);
            if (dy > 0) hh -= cut;
            if (dy < 0) (y0 += cut), (hh -= cut);
          }
          g.fillRect(x0, y0, ww, hh);
        }
        // Punta: triangulo hecho de lineas de 1 px, mirando en la direccion del ultimo paso.
        const H = w === 8 ? 8 : 6;
        const base = w === 8 ? -7 : -5;
        for (let i = 0; i <= H; i++) {
          const half = H - i;
          const along = base + i;
          if (dx !== 0) g.fillRect(cx + dx * along - (dx < 0 ? 0 : 0), cy - half, 1, half * 2 + 1);
          else g.fillRect(cx - half, cy + dy * along, half * 2 + 1, 1);
        }
      }
    }
  }

  private box: Phaser.GameObjects.Graphics | null = null;

  /** Recuadro de seleccion (en pixeles de pantalla del lienzo), o null para quitarlo. */
  setBox(r: { x0: number; y0: number; x1: number; y1: number } | null): void {
    if (!r) {
      this.box?.clear();
      return;
    }
    if (!this.box) {
      this.box = this.scene.add.graphics();
      this.fx.add(this.box);
    }
    const a = this.cam.getWorldPoint(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1));
    const b = this.cam.getWorldPoint(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1));
    const g = this.box;
    g.clear();
    g.fillStyle(0xffd447, 0.12);
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.fillStyle(0xffd447, 0.9);
    g.fillRect(a.x, a.y, b.x - a.x, 1);
    g.fillRect(a.x, b.y - 1, b.x - a.x, 1);
    g.fillRect(a.x, a.y, 1, b.y - a.y);
    g.fillRect(b.x - 1, a.y, 1, b.y - a.y);
  }

  /** Casillas dentro de un recuadro de pantalla. */
  tilesInBox(r: { x0: number; y0: number; x1: number; y1: number }): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.cam.getWorldPoint(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1));
    const b = this.cam.getWorldPoint(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1));
    return { x0: Math.floor(a.x / TILE), y0: Math.floor(a.y / TILE), x1: Math.floor(b.x / TILE), y1: Math.floor(b.y / TILE) };
  }

  placeCursor(visible = true): void {
    this.cursorImg.setPosition(this.cursor.x * TILE, this.cursor.y * TILE).setVisible(visible);
  }

  /** Animaciones por pasos (estilo pixel): parpadeo del cursor, unidades en espera y agua. */
  tick(time: number, delta: number): void {
    const still = reducedMotion();
    if (this.waterAnim.length) {
      const f = still ? 0 : Math.floor(time / 140) % ANIM_FRAMES;
      if (f !== this.waterFrame) {
        this.waterFrame = f;
        for (const { img, cell } of this.waterAnim) img.setFrame(`${cell.row}_${(f + cell.phase) % ANIM_FRAMES}`);
      }
    }
    this.cursorImg.setAlpha(!still && Math.floor(time / 450) % 2 ? 0.7 : 1);
    const phase = still ? 0 : Math.floor(time / 500) % 2;
    if (phase !== this.bobPhase) {
      this.bobPhase = phase;
      if (this.goal || this.vip) this.drawMarks(phase);
      for (const sp of this.units.values()) sp.img.y = TILE - (sp.idle ? phase : 0);
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
    img.setDisplaySize(Math.max(TILE, img.width), img.height);
    this.fx.add(img);
    return img;
  }
}
