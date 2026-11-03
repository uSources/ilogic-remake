import type Phaser from 'phaser';
import type { GameState, Pos } from '../core/types';
import type { Anchor } from '../hud/store';
import { settings } from '../settings';
import { MapCamera, type ScreenBox } from './map/camera';
import { BuildingLayer } from './map/buildingLayer';
import { MapCursor } from './map/cursor';
import { DecalLayer } from './map/decals';
import { FlagLayer } from './map/flagLayer';
import { FogLayer } from './map/fogLayer';
import type { AnimatedLayer, MapLayer } from './map/layer';
import { MarkLayer } from './map/markLayer';
import { OverlayLayer } from './map/overlayLayer';
import { SelectionBox } from './map/selectionBox';
import { TerrainLayer } from './map/terrainLayer';
import { tileImage } from './map/tileImage';
import { UnitLayer, type Facing } from './map/unitLayer';
import type { ViewOptions } from './map/viewOptions';
import { reducedMotion } from './motion';
import { PAL_CSS } from './palette';
import { terrainArtReady } from './terrainArt';

// La escena, el menu y los efectos importan estos tipos de aqui.
export type { HighlightKind, ViewOptions } from './map/viewOptions';
export { baseFacing, faceFlip, type Facing } from './map/unitLayer';

/**
 * Mapa en coordenadas de mundo (1024x1024, 32 px por casilla). La camara tiene zoom
 * entero en pixeles fisicos, asi que el pixel art se ve siempre nitido.
 * Terreno: se crea una vez. Edificios y unidades: un sprite persistente por cada uno,
 * que se actualiza (no se redibuja todo en cada cambio).
 *
 * Es solo la fachada: cada parte del dibujo es una capa de src/ui/map/ (camara, terreno,
 * edificios, unidades, niebla, resaltados, banderines, marcas, cursor, quemados) y aqui solo se
 * crean, se apilan en orden y se les pasa lo que piden la escena y el menu (ver map/layer.ts).
 */
export class MapView {
  cursor: Pos = { x: 0, y: 0 };
  /** Marco rojo: eligiendo objetivo de ataque. */
  cursorAttack = false;
  /** La camara de la escena (las pruebas de tests/visual la leen). */
  readonly cam: Phaser.Cameras.Scene2D.Camera;

  private readonly root: Phaser.GameObjects.Container;
  private readonly camera: MapCamera;
  private readonly terrain: TerrainLayer;
  /** Marcas en el suelo (quemados), bajo edificios y unidades. */
  private readonly decals: DecalLayer;
  private readonly buildings: BuildingLayer;
  /** Niebla del dibujo nuevo (lienzo con borde organico). */
  private readonly fog: FogLayer;
  /** Resaltados, zonas, ordenes y flechas (y la niebla del dibujo de 2013). */
  private readonly overlay: OverlayLayer;
  /** [CAMBIO] Banderines de los puntos de control y de las ordenes, encima de la zona y debajo de las unidades. */
  private readonly flags: FlagLayer;
  private readonly units: UnitLayer;
  /** Marcas de mision y aros de seleccion, por encima de las unidades. */
  private readonly marks: MarkLayer;
  /** Objetos temporales de las animaciones (ui/fx.ts, ui/combatFx.ts) y recuadro de seleccion. */
  private readonly fx: Phaser.GameObjects.Container;
  private readonly box: SelectionBox;
  private readonly cursorView: MapCursor;
  /** Capas con animacion por pasos, en el orden en que se mueven en `tick`. */
  private readonly animated: AnimatedLayer[];

  /** Claves propias de los lienzos de esta vista (el menu y la partida tienen cada uno la suya). */
  private static count = 0;

  constructor(private readonly scene: Phaser.Scene) {
    MapView.count++;
    this.cam = scene.cameras.main;
    this.camera = new MapCamera(this.cam);
    this.root = scene.add.container(0, 0);
    this.buildings = new BuildingLayer(scene);
    this.terrain = new TerrainLayer(scene, `terrainBake${MapView.count}`, this.buildings);
    this.units = new UnitLayer(scene);
    this.overlay = new OverlayLayer(scene);
    this.fx = scene.add.container(0, 0);
    this.fog = new FogLayer(scene, `fogBake${MapView.count}`);
    this.cursorView = new MapCursor(scene);
    this.marks = new MarkLayer(scene);
    this.decals = new DecalLayer(scene);
    this.flags = new FlagLayer(scene);
    this.box = new SelectionBox(scene, this.camera, this.fx);
    // Orden: terreno, edificios, niebla y resaltados, unidades, efectos, cursor.
    const stack: (MapLayer | Phaser.GameObjects.GameObject)[] = [
      this.terrain,
      this.decals,
      this.buildings,
      this.fog,
      this.overlay,
      this.flags,
      this.units,
      this.marks,
      this.fx,
      this.cursorView,
    ];
    this.root.add(stack.map((l) => ('object' in l ? l.object : l)));
    this.animated = [this.terrain, this.cursorView, this.marks, this.units];
    this.cam.setBackgroundColor(PAL_CSS.ink);
    this.camera.apply();
  }

  // --- Camara (map/camera.ts) ------------------------------------------------

  /** Pixeles fisicos por pixel del dibujo (zoom entero); lo leen las pruebas de tests/visual. */
  get level(): number {
    return this.camera.level;
  }

  /** Posicion en pantalla (pixeles del lienzo) del centro de una casilla. */
  screenOf(p: Pos): { x: number; y: number } {
    return this.camera.screenOf(p);
  }

  /** Rectangulo de una casilla en pixeles CSS de la ventana (para colocar la interfaz HTML). */
  tileRectCss(p: Pos): Anchor {
    return this.camera.tileRectCss(p);
  }

  /** Casilla bajo un punto de la pantalla (null si cae fuera del mapa). */
  tileAtScreen(sx: number, sy: number): Pos | null {
    return this.camera.tileAtScreen(sx, sy);
  }

  centerOn(p: Pos, instant = false): void {
    this.camera.centerOn(p, instant);
  }

  /** Desplaza la camara lo justo para que la casilla quede dentro con un margen (en casillas). */
  ensureVisible(p: Pos, margin = 2, instant = false): void {
    this.camera.ensureVisible(p, margin, instant);
  }

  isOnScreen(p: Pos, margin = 1): boolean {
    return this.camera.isOnScreen(p, margin);
  }

  scrollBy(dx: number, dy: number): void {
    this.camera.scrollBy(dx, dy);
  }

  /** Limites de la camara: el mapa con un margen; si cabe entero en la vista, centrado. */
  updateBounds(): void {
    this.camera.updateBounds();
  }

  /** La ventana ha cambiado de tamaño: mantener el mismo punto en el centro. */
  resize(w: number, h: number): void {
    this.camera.resize(w, h);
  }

  /** Zoom entero por pasos alrededor de un punto de la pantalla. */
  zoomStep(dir: 1 | -1, sx: number, sy: number): void {
    this.camera.zoomStep(dir, sx, sy);
  }

  /** Casillas dentro de un recuadro de pantalla. */
  tilesInBox(r: ScreenBox): ScreenBox {
    return this.camera.tilesInBox(r);
  }

  // --- Dibujado --------------------------------------------------------------

  /** Dibujo nuevo elegido en Opciones y con sus imagenes en el atlas. */
  private newArt(): boolean {
    return settings.terrainArt === 'new' && terrainArtReady(this.scene.textures);
  }

  /** Terreno y orillas: solo al empezar la partida (el terreno no cambia). */
  buildTerrain(s: GameState): void {
    this.terrain.build(s, this.newArt());
  }

  /** Pone al dia edificios, unidades, niebla y resaltados. */
  render(s: GameState, opts: ViewOptions): void {
    const newArt = this.newArt();
    this.buildings.sync(s, opts.vis);
    this.units.sync(s, opts, newArt);
    this.fog.sync(opts.vis, newArt);
    this.flags.sync(opts);
    this.overlay.draw(opts, { textures: this.scene.textures, newArt });
    this.marks.set(opts);
    this.placeCursor();
  }

  /** Suelta los lienzos de esta vista (los objetos los destruye la escena al cerrarse). Llamar en SHUTDOWN. */
  destroy(): void {
    this.terrain.destroy();
    this.fog.destroy();
  }

  /** Recuadro de seleccion (en pixeles de pantalla del lienzo), o null para quitarlo. */
  setBox(r: ScreenBox | null): void {
    this.box.set(r);
  }

  placeCursor(visible = true): void {
    this.cursorView.place(this.cursor, visible);
  }

  /** Animaciones por pasos (estilo pixel): agua, parpadeo del cursor, marcas y unidades en espera. */
  tick(time: number): void {
    this.cursorView.attack = this.cursorAttack;
    const clock = { time, still: reducedMotion() };
    for (const layer of this.animated) layer.tick(clock);
  }

  // --- Unidades (map/unitLayer.ts) y efectos ---------------------------------

  /** Sprite (contenedor) de una unidad tal como esta dibujada ahora, si se ve. */
  unitSprite(uid: number): Phaser.GameObjects.Container | null {
    return this.units.sprite(uid);
  }

  /** Imagen de la unidad dibujada en una casilla (antes de volver a pintar), para efectos. */
  unitKeyAt(p: Pos): string | null {
    return this.units.keyAt(p);
  }

  /** Gira una unidad hacia un lado (y la deja asi). */
  face(uid: number, dir: Facing): void {
    this.units.face(uid, dir);
  }

  facingOf(uid: number, team: 0 | 1): Facing {
    return this.units.facingOf(uid, team);
  }

  /** Objeto temporal para animaciones (coordenadas de mundo). */
  addFx(obj: Phaser.GameObjects.GameObject): void {
    this.fx.add(obj);
  }

  /** Imagen de unidad para animar, colocada en una casilla (x = centro de la casilla). */
  ghost(key: string, p: Pos): Phaser.GameObjects.Image {
    // Origen en el centro de abajo: asi se puede voltear (mirar a la izquierda) sin desplazarse.
    const img = tileImage(this.scene, key, p.x, p.y);
    this.fx.add(img);
    return img;
  }

  /** Marca de quemado bajo las unidades: dura hasta el turno siguiente (ver pruneScorch). */
  scorch(p: Pos, day: number): void {
    this.decals.scorch(p, day);
  }

  /** Quita las marcas de hace mas de un dia. */
  pruneScorch(day: number): void {
    this.decals.prune(day);
  }
}
