/**
 * Todo lo que se dibuja de una partida en 3D: el mundo (lienzo, luz, bucle), el terreno, las piezas,
 * las marcas del tablero, los efectos, el clima y la camara de three.js. Lo crea y lo mueve en cada
 * fotograma; no decide nada: lo que se ve lo dicen los sistemas por sus puertos (las marcas, los
 * pasos de los sucesos, la pose de la camara) y app/match3d.ts los junta.
 */
import * as THREE from 'three';
import { isOnBoard, mapGrid } from '../../core/mapGrid';
import type { GameState, Pos, TeamId } from '../../core/model';
import type { Anchor } from '../../hud/store';
import type { CameraPose, Point3 } from '../ports/camera';
import type { FrameListener } from '../ports/frame';
import type { EffectStage, PieceLookup, PieceStage, PuffKind } from '../ports/stage';
import type { MovePreview, ScreenView, TileMarks } from '../ports/turn';
import type { IntentMarks } from '../ports/orders';
import type { ThreatMarks } from '../ports/threat';
import type { ScreenBox, SelectionBoxView } from '../ports/pointer';
import { ThreeCameraView } from './camera/cameraView';
import { World } from './core/world';
import { ScreenBoxView } from './core/screenBox';
import { FxEffectStage } from './fx/effectStage';
import { DefenseStars } from './fx/defenseStars';
import { Highlights } from './fx/highlights';
import { ThreatLinesView } from './fx/threatLines';
import { MovePreviewView } from './fx/movePreview';
import { IntentArrowsView } from './fx/intentArrows';
import { ParticleSystem } from './fx/particles';
import { BoardPieceStage } from './fx/pieceStage';
import { WeatherView } from './fx/weather3d';
import { BoardView } from './pieces/boardView';
import type { GlbLibrary } from './pieces/glbModels';
import { GroundMarks } from './pieces/groundMarks';
import { Wrecks } from './pieces/wrecks';
import { SandDust } from './terrain/sandDust';
import { buildTerrain, type TerrainView } from './terrain/terrain';
import { buildIslets, planIslets } from './terrain/islets';
import { Sea } from './terrain/sea';

/** Cuanto alrededor de lo que se mira hay clima y polvo: un poco mas que lo que se ve. */
const WEATHER_REACH = 0.9;
/** Lo que alumbra la luz del sol alrededor del centro del mapa (por su lado mas largo). */
const LIGHT_REACH = 0.75;
/** Las esquinas de arriba de una casilla, desde su centro. */
/** Las esquinas de la pantalla (coordenadas de -1 a 1), para saber que parte del mapa se ve. */
const SCREEN_CORNERS = [-1, 1].flatMap((x) => [-1, 1].map((y) => new THREE.Vector2(x, y)));
/** Una esquina que mira por encima del horizonte llega hasta aqui (en casillas): mas que cualquier mapa. */
const HORIZON_REACH = 200;
/** Del centro de una casilla (el punto del mundo) a su borde: en el minimapa la casilla x va de x a x + 1. */
const TILE_HALF = 0.5;
const TILE_CORNERS = [-0.5, 0.5].flatMap((dx) => [-0.5, 0.5].map((dz) => new THREE.Vector3(dx, 0, dz)));

/** Los puertos con los que se animan los sucesos (systems/events). */
export interface SceneStages {
  lookup: PieceLookup;
  pieces: PieceStage;
  effects: EffectStage;
}

export class MatchScene implements ScreenView {
  readonly world: World;
  readonly board: BoardView;
  readonly weather: WeatherView;
  readonly sandDust: SandDust;
  readonly wrecks = new Wrecks();
  /** Hacia donde mira la camara en este fotograma (se reutiliza). */
  private readonly cameraForward = new THREE.Vector3();
  readonly stages: SceneStages;
  /** El centro del mapa, en el suelo. */
  readonly center: Point3;
  private readonly terrain: TerrainView;
  private readonly sea: Sea;
  private readonly highlights: Highlights;
  private readonly preview: MovePreviewView;
  private readonly intents: IntentArrowsView;
  private readonly effects = new THREE.Group();
  private readonly particles = new ParticleSystem();
  private readonly marks = new GroundMarks();
  private readonly stars = new DefenseStars();
  private readonly threatLines: ThreatLinesView;
  private readonly cameraView: ThreeCameraView;
  private readonly selectionBox: ScreenBoxView;

  constructor(
    container: HTMLElement,
    private readonly state: GameState,
    viewer: TeamId,
    glbModels: GlbLibrary,
  ) {
    this.world = new World(container);
    this.terrain = buildTerrain(state, glbModels);
    this.board = new BoardView(state, viewer, this.terrain, glbModels);
    this.highlights = new Highlights((pos) => this.board.groundOf(pos));
    this.threatLines = new ThreatLinesView((pos) => this.board.groundOf(pos));
    this.preview = new MovePreviewView(this.board);
    this.intents = new IntentArrowsView((pos) => this.board.groundOf(pos));
    this.weather = new WeatherView(container);
    this.sandDust = new SandDust(this.terrain.sandTiles, (pos) => this.board.groundOf(pos));
    this.cameraView = new ThreeCameraView(this.world.camera);
    this.selectionBox = new ScreenBoxView(container);
    this.world.scene.add(
      this.terrain.object,
      this.board.object,
      this.highlights.object,
      this.stars.object,
      this.threatLines.object,
      this.preview.object,
      this.intents.object,
      this.effects,
      this.weather.object,
      this.sandDust.object,
    );
    this.world.scene.add(this.particles.object, this.marks.mesh, this.wrecks.object);
    const grid = mapGrid(state);
    const center = new THREE.Vector3((grid.width - 1) / 2, 0, (grid.height - 1) / 2);
    this.world.lightArea(center, Math.max(grid.width, grid.height) * LIGHT_REACH);
    const half = new THREE.Vector2(grid.width / 2, grid.height / 2);
    const islets = planIslets(center, half);
    this.sea = new Sea(center, half, islets, state.theme);
    this.world.scene.add(this.sea.object, buildIslets(islets, state.theme));
    this.center = center;
    this.stages = this.buildStages();
  }

  private buildStages(): SceneStages {
    const animate = (seconds: number, step: (progress: number) => void) => this.world.animate(seconds, step);
    const puff = (kind: PuffKind, at: THREE.Vector3, count: number) => this.particles.emit(kind, at, count);
    const pieceStage = new BoardPieceStage({
      board: this.board,
      animate,
      puff,
      mark: (at, heading, motion) => this.marks.leave(at, heading, motion),
      wreck: (model) => this.wrecks.leave(model),
    });
    const effectStage = new FxEffectStage({ board: this.board, layer: this.effects, animate, puff, scorch: (at) => this.marks.scorch(at) });
    return { lookup: pieceStage, pieces: pieceStage, effects: effectStage };
  }

  /** Las marcas del tablero que pide el turno (alcance, objetivos, lo elegido). */
  get tileMarks(): TileMarks {
    return this.highlights;
  }

  /** A donde llegan los enemigos («Ver amenaza») y quien podria atacar a la unidad que se mira. */
  get threatMarks(): ThreatMarks {
    return {
      showThreat: (tiles) => this.highlights.showThreat(tiles),
      showThreatLines: (lines) => this.threatLines.show(lines),
    };
  }

  /** La flecha del camino y el fantasma de la unidad que se va a mover. */
  get movePreview(): MovePreview {
    return this.preview;
  }

  /** Lo que haran las ordenes al terminar el turno. */
  get intentMarks(): IntentMarks {
    return this.intents;
  }

  /** El recuadro de seleccion mientras se arrastra. */
  get box(): SelectionBoxView {
    return this.selectionBox;
  }

  /** El lienzo donde se dibuja (y donde se toca). */
  get canvas(): HTMLCanvasElement {
    return this.world.renderer.domElement;
  }

  /** Apertura vertical de la camara (grados), para la camara de estrategia. */
  get verticalFov(): number {
    return this.cameraView.verticalFov;
  }

  /** El punto del suelo de esa casilla (encima de su terreno). */
  groundOf(pos: Pos): Point3 {
    return this.board.groundOf(pos);
  }

  /** La casilla señalada: el cuadro amarillo y sus estrellas de defensa (cuantas, lo dice la partida). */
  hover(pos: Pos | null, stars = 0): void {
    this.highlights.hover(pos);
    this.stars.show(pos ? this.board.groundOf(pos) : null, stars);
  }

  /** Deja las piezas y el clima (su id, null si no hay) como estan en la partida. */
  sync(weather: string | null): void {
    this.board.sync();
    this.weather.set(weather);
    this.world.setWeather(weather);
  }

  onFrame(listener: FrameListener): void {
    this.world.onFrame(listener);
  }

  start(): void {
    this.world.start();
  }

  /** Un fotograma: la camara donde dice `pose` y todo lo que se mueve solo. */
  render(seconds: number, pose: CameraPose): void {
    this.cameraView.place(pose);
    this.highlights.update(seconds);
    this.stars.update(seconds);
    this.threatLines.update(seconds);
    this.preview.update(seconds, this.world.camera, this.canvas.clientHeight);
    this.board.update(seconds, this.world.camera.getWorldDirection(this.cameraForward));
    this.terrain.update(seconds);
    this.sea.update(seconds);
    const { target } = this.cameraView;
    const reach = pose.distance * WEATHER_REACH;
    const viewportHeight = this.canvas.clientHeight;
    this.weather.update(seconds, target, reach, this.world.camera, viewportHeight);
    this.sandDust.update(seconds, target, reach, this.world.camera, viewportHeight);
    this.wrecks.update(seconds);
    this.particles.keepEmitting([...this.board.smokeSources(), ...this.wrecks.smokeSources()], seconds);
    this.particles.update(seconds, this.world.camera, viewportHeight);
    this.marks.update(seconds);
  }

  /** Situa la camara sin esperar al fotograma (al empezar). */
  placeCamera(pose: CameraPose): void {
    this.cameraView.place(pose);
  }

  /** El rectangulo de una casilla en la pantalla (pixeles CSS de la ventana): sus cuatro esquinas de arriba proyectadas. */
  anchorOf(pos: Pos): Anchor {
    const canvas = this.canvas.getBoundingClientRect();
    const ground = this.board.groundOf(pos);
    const corners = TILE_CORNERS.map((corner) => ground.clone().add(corner).project(this.world.camera));
    const xs = corners.map((corner) => canvas.left + ((corner.x + 1) / 2) * canvas.width);
    const ys = corners.map((corner) => canvas.top + ((1 - corner.y) / 2) * canvas.height);
    const [left, top] = [Math.min(...xs), Math.min(...ys)];
    return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
  }

  /**
   * Encima de lo que hay en esa casilla (la barra de vida de su unidad), para las chapas: la casilla
   * en la pantalla, con su borde de arriba a esa altura.
   */
  overheadOf(pos: Pos): Anchor {
    const tile = this.anchorOf(pos);
    const canvas = this.canvas.getBoundingClientRect();
    const top = canvas.top + ((1 - this.board.overheadOf(pos).project(this.world.camera).y) / 2) * canvas.height;
    return { ...tile, y: Math.min(tile.y, top) };
  }

  /** El punto de la pantalla (pixeles CSS de la ventana) del suelo de esa casilla; null si queda detras de la camara. */
  screenOf(pos: Pos): { x: number; y: number } | null {
    const point = this.board.groundOf(pos).project(this.world.camera);
    if (point.z > 1) return null;
    const canvas = this.canvas.getBoundingClientRect();
    return { x: canvas.left + ((point.x + 1) / 2) * canvas.width, y: canvas.top + ((1 - point.y) / 2) * canvas.height };
  }

  /** La casilla se ve ahora en la pantalla. */
  isOnScreen(pos: Pos): boolean {
    const point = this.screenOf(pos);
    if (!point) return false;
    const canvas = this.canvas.getBoundingClientRect();
    return point.x >= canvas.left && point.x <= canvas.right && point.y >= canvas.top && point.y <= canvas.bottom;
  }

  /** Las casillas de esa lista que quedan dentro del recuadro de la pantalla. */
  tilesInBox<T extends Pos>(tiles: readonly T[], box: ScreenBox): T[] {
    return tiles.filter((pos) => {
      const point = this.screenOf(pos);
      return !!point && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
    });
  }

  /**
   * La parte del mapa que se ve, en casillas del minimapa (la casilla x va de x a x + 1): el rectangulo
   * que encierra lo que tocan del suelo (a la altura `groundHeight`) las cuatro esquinas de la pantalla,
   * dentro del mapa. Las esquinas que miran por encima del horizonte llegan hasta el borde del mapa.
   */
  viewedArea(groundHeight: number): { x: number; y: number; w: number; h: number } {
    const grid = mapGrid(this.state);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundHeight);
    const raycaster = new THREE.Raycaster();
    const corners = SCREEN_CORNERS.map((corner) => {
      raycaster.setFromCamera(corner, this.world.camera);
      return raycaster.ray.intersectPlane(ground, new THREE.Vector3()) ?? raycaster.ray.at(HORIZON_REACH, new THREE.Vector3());
    });
    const side = (pick: (point: THREE.Vector3) => number, size: number) => {
      const values = corners.map((point) => THREE.MathUtils.clamp(pick(point) + TILE_HALF, 0, size));
      return { from: Math.min(...values), to: Math.max(...values) };
    };
    const across = side((point) => point.x, grid.width);
    const deep = side((point) => point.z, grid.height);
    return { x: across.from, y: deep.from, w: across.to - across.from, h: deep.to - deep.from };
  }

  /** La casilla bajo un punto de la pantalla: la de la unidad si se toca una, si no la del terreno. */
  tileAt(clientX: number, clientY: number): Pos | null {
    const canvas = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - canvas.left) / canvas.width) * 2 - 1, -((clientY - canvas.top) / canvas.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.world.camera);
    const [hit] = raycaster.intersectObjects([this.board.object, ...this.terrain.pickables], true);
    if (!hit) return null;
    const uid = this.board.unitHit(hit.object);
    if (uid !== null) return this.state.units.find((unit) => unit.uid === uid) ?? null;
    const pos = this.terrain.tileOfHit(hit) ?? { x: Math.round(hit.point.x), y: Math.round(hit.point.z) };
    // Una pieza que asoma por el borde del mapa (un edificio alto) no da una casilla de fuera.
    return isOnBoard(this.state, pos) ? pos : null;
  }
}
