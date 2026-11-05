import Phaser from 'phaser';
import type { Pos } from '../../core/model';
import { Grid, type GridBounds } from '../../core/util/grid';
import { dpr } from '../../display';
import type { Anchor } from '../../hud/store';
import { TILE } from '../../layout';
import { reducedMotion } from '../motion';
import { tileCenter } from './geometry';

/** Margen en pixeles CSS que se puede desplazar mas alla del mapa (para que no quede bajo la interfaz). */
const EDGE_CSS = 110;
/** ...pero nunca mas de esta parte del ancho de la ventana (moviles). */
const EDGE_MAX_FRACTION = 0.08;
/** Pixeles CSS por pixel del dibujo al empezar: casillas de ~64 px en escritorio, ~48 en movil. */
const START_SCALE = { desktop: 2, mobile: 1.5 };
/** Por debajo de este ancho CSS se cuenta como movil. */
const MOBILE_CSS_W = 720;
/** Zoom maximo, en pixeles CSS por pixel del dibujo (el minimo es 1). */
const MAX_SCALE = 4;
/** Desplazamiento suave: centrar en una casilla y empujar lo justo para que se vea. */
const PAN_MS = 220;
const NUDGE_MS = 160;
const PAN_EASE = 'Sine.easeOut';

/** Recuadro en pixeles de pantalla del lienzo (esquinas en cualquier orden). */
export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Camara del mapa: zoom entero en pixeles fisicos (el pixel art se ve siempre nitido), limites
 * con margen y conversiones entre casillas, mundo y pantalla.
 */
export class MapCamera {
  /** Pixeles fisicos por pixel del dibujo (zoom entero de la camara). */
  level: number;
  private lastDpr = dpr();
  /** Tamaño del mapa que se enseña (lo pone `showMap` al construir el terreno de una partida). */
  private map: GridBounds = Grid.filled({ width: 0, height: 0 }, 0);

  constructor(readonly cam: Phaser.Cameras.Scene2D.Camera) {
    cam.setRoundPixels(true);
    this.level = this.defaultLevel();
  }

  /** Pixeles fisicos por pixel del dibujo al empezar (ver START_SCALE). */
  private defaultLevel(): number {
    const ratio = dpr();
    const cssWidth = this.cam.width / ratio;
    const target = cssWidth < MOBILE_CSS_W ? START_SCALE.mobile : START_SCALE.desktop;
    return this.clampLevel(Math.round(target * ratio));
  }

  private clampLevel(level: number): number {
    const ratio = dpr();
    return Phaser.Math.Clamp(level, Math.max(1, Math.round(ratio)), Math.max(MAX_SCALE, Math.round(MAX_SCALE * ratio)));
  }

  /** El mapa que se enseña ahora: sus casillas y sus limites. */
  showMap(map: GridBounds): void {
    this.map = map;
    this.updateBounds();
  }

  /** Pone el zoom actual en la camara y recalcula los limites. */
  apply(): void {
    this.cam.setZoom(this.level);
    this.updateBounds();
  }

  /** Posicion en pantalla (pixeles del lienzo) del centro de una casilla. */
  screenOf(pos: Pos): { x: number; y: number } {
    const view = this.cam.worldView;
    const centerPoint = tileCenter(pos);
    return { x: (centerPoint.x - view.x) * this.cam.zoom, y: (centerPoint.y - view.y) * this.cam.zoom };
  }

  /** Rectangulo de una casilla en pixeles CSS de la ventana (para colocar la interfaz HTML). */
  tileRectCss(pos: Pos): Anchor {
    // worldView solo se actualiza al dibujar: recalcularlo por si la camara acaba de moverse.
    this.cam.preRender();
    const view = this.cam.worldView;
    const cssPerPixel = this.cam.zoom / dpr();
    return {
      x: (pos.x * TILE - view.x) * cssPerPixel,
      y: (pos.y * TILE - view.y) * cssPerPixel,
      w: TILE * cssPerPixel,
      h: TILE * cssPerPixel,
    };
  }

  /** Casilla bajo un punto de la pantalla (null si cae fuera del mapa). */
  tileAtScreen(sx: number, sy: number): Pos | null {
    const world = this.cam.getWorldPoint(sx, sy);
    const x = Math.floor(world.x / TILE);
    const y = Math.floor(world.y / TILE);
    return this.map.contains({ x, y }) ? { x, y } : null;
  }

  /** Esquinas de un recuadro de pantalla en coordenadas de mundo (arriba a la izquierda y abajo a la derecha). */
  worldBox(box: ScreenBox): { topLeft: Phaser.Math.Vector2; bottomRight: Phaser.Math.Vector2 } {
    const topLeft = this.cam.getWorldPoint(Math.min(box.x0, box.x1), Math.min(box.y0, box.y1));
    const bottomRight = this.cam.getWorldPoint(Math.max(box.x0, box.x1), Math.max(box.y0, box.y1));
    return { topLeft, bottomRight };
  }

  /** Casillas dentro de un recuadro de pantalla. */
  tilesInBox(box: ScreenBox): ScreenBox {
    const { topLeft, bottomRight } = this.worldBox(box);
    return {
      x0: Math.floor(topLeft.x / TILE),
      y0: Math.floor(topLeft.y / TILE),
      x1: Math.floor(bottomRight.x / TILE),
      y1: Math.floor(bottomRight.y / TILE),
    };
  }

  /** Lleva el centro de la vista a (wx, wy): de golpe, o deslizandose en `ms`. */
  private moveTo(wx: number, wy: number, instant: boolean, ms: number): void {
    if (instant || reducedMotion()) this.cam.centerOn(wx, wy);
    else this.cam.pan(wx, wy, ms, PAN_EASE, true);
  }

  centerOn(pos: Pos, instant = false): void {
    const centerPoint = tileCenter(pos);
    this.moveTo(centerPoint.x, centerPoint.y, instant, PAN_MS);
  }

  /** Desplaza la camara lo justo para que la casilla quede dentro con un margen (en casillas). */
  ensureVisible(pos: Pos, margin = 2, instant = false): void {
    const view = this.cam.worldView;
    // El margen no puede ser mayor que media vista (pantallas pequeñas o mucho zoom).
    const marginPx = Math.min(margin * TILE, Math.max(0, view.width / 2 - TILE), Math.max(0, view.height / 2 - TILE));
    let centerX = view.centerX;
    let centerY = view.centerY;
    const left = pos.x * TILE;
    const top = pos.y * TILE;
    if (left < view.x + marginPx) centerX -= view.x + marginPx - left;
    if (left + TILE > view.right - marginPx) centerX += left + TILE - (view.right - marginPx);
    if (top < view.y + marginPx) centerY -= view.y + marginPx - top;
    if (top + TILE > view.bottom - marginPx) centerY += top + TILE - (view.bottom - marginPx);
    if (centerX === view.centerX && centerY === view.centerY) return;
    this.moveTo(centerX, centerY, instant, NUDGE_MS);
  }

  isOnScreen(pos: Pos, margin = 1): boolean {
    const view = this.cam.worldView;
    const marginPx = margin * TILE;
    return (
      pos.x * TILE >= view.x + marginPx &&
      (pos.x + 1) * TILE <= view.right - marginPx &&
      pos.y * TILE >= view.y + marginPx &&
      (pos.y + 1) * TILE <= view.bottom - marginPx
    );
  }

  scrollBy(dx: number, dy: number): void {
    this.cam.setScroll(this.cam.scrollX + dx / this.cam.zoom, this.cam.scrollY + dy / this.cam.zoom);
  }

  /** Limites de la camara: el mapa con un margen; si cabe entero en la vista, centrado. */
  updateBounds(): void {
    const edgeCss = Math.min(EDGE_CSS, Math.round((this.cam.width / dpr()) * EDGE_MAX_FRACTION));
    const margin = (edgeCss * dpr()) / this.cam.zoom;
    const mapWidth = this.map.width * TILE;
    const mapHeight = this.map.height * TILE;
    const viewWidth = this.cam.width / this.cam.zoom;
    const viewHeight = this.cam.height / this.cam.zoom;
    const boundsWidth = Math.max(mapWidth + 2 * margin, viewWidth);
    const boundsHeight = Math.max(mapHeight + 2 * margin, viewHeight);
    this.cam.setBounds(mapWidth / 2 - boundsWidth / 2, mapHeight / 2 - boundsHeight / 2, boundsWidth, boundsHeight);
  }

  /** La ventana ha cambiado de tamaño: mantener el mismo punto en el centro. */
  resize(width: number, height: number): void {
    const mid = { x: this.cam.midPoint.x, y: this.cam.midPoint.y };
    this.cam.setSize(width, height);
    // Si cambia la densidad (otra pantalla, zoom del navegador), mantener el tamaño de casilla en CSS.
    const ratio = dpr();
    if (ratio !== this.lastDpr) {
      this.level = Math.round((this.level * ratio) / this.lastDpr);
      this.lastDpr = ratio;
    }
    this.level = this.clampLevel(this.level);
    this.apply();
    this.cam.centerOn(mid.x, mid.y);
  }

  /** Zoom entero por pasos alrededor de un punto de la pantalla. */
  zoomStep(dir: 1 | -1, sx: number, sy: number): void {
    const next = this.clampLevel(this.level + dir);
    if (next === this.level) return;
    const before = this.cam.getWorldPoint(sx, sy);
    this.level = next;
    this.apply();
    this.cam.preRender();
    const after = this.cam.getWorldPoint(sx, sy);
    this.cam.setScroll(this.cam.scrollX + before.x - after.x, this.cam.scrollY + before.y - after.y);
  }
}
