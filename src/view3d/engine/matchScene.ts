/**
 * Todo lo que se dibuja de una partida en 3D: el mundo (lienzo, luz, bucle), el terreno, las piezas,
 * las marcas del tablero, los efectos, el clima y la camara de three.js. Lo crea y lo mueve en cada
 * fotograma; no decide nada: lo que se ve lo dicen los sistemas por sus puertos (las marcas, los
 * pasos de los sucesos, la pose de la camara) y app/match3d.ts los junta.
 */
import * as THREE from 'three';
import { mapGrid } from '../../core/mapGrid';
import type { GameState, Pos, TeamId } from '../../core/model';
import type { Anchor } from '../../hud/store';
import type { CameraPose, Point3 } from '../ports/camera';
import type { FrameListener } from '../ports/frame';
import type { EffectStage, PieceLookup, PieceStage, PuffKind } from '../ports/stage';
import type { TileMarks } from '../ports/turn';
import { ThreeCameraView } from './camera/cameraView';
import { World } from './core/world';
import { FxEffectStage } from './fx/effectStage';
import { Highlights } from './fx/highlights';
import { ParticleSystem } from './fx/particles';
import { BoardPieceStage } from './fx/pieceStage';
import { WeatherView } from './fx/weather3d';
import { BoardView } from './pieces/boardView';
import type { GlbLibrary } from './pieces/glbModels';
import { GroundMarks } from './pieces/groundMarks';
import { Wrecks } from './pieces/wrecks';
import { SandDust } from './terrain/sandDust';
import { buildTerrain, type TerrainView } from './terrain/terrain';

/** Cuanto alrededor de lo que se mira hay clima y polvo: un poco mas que lo que se ve. */
const WEATHER_REACH = 0.9;
/** Lo que alumbra la luz del sol alrededor del centro del mapa (por su lado mas largo). */
const LIGHT_REACH = 0.75;
/** Las esquinas de arriba de una casilla, desde su centro. */
const TILE_CORNERS = [-0.5, 0.5].flatMap((dx) => [-0.5, 0.5].map((dz) => new THREE.Vector3(dx, 0, dz)));

/** Los puertos con los que se animan los sucesos (systems/events). */
export interface SceneStages {
  lookup: PieceLookup;
  pieces: PieceStage;
  effects: EffectStage;
}

export class MatchScene {
  readonly world: World;
  readonly board: BoardView;
  readonly weather: WeatherView;
  readonly sandDust: SandDust;
  readonly wrecks = new Wrecks();
  readonly stages: SceneStages;
  /** El centro del mapa, en el suelo. */
  readonly center: Point3;
  private readonly terrain: TerrainView;
  private readonly highlights: Highlights;
  private readonly effects = new THREE.Group();
  private readonly particles = new ParticleSystem();
  private readonly marks = new GroundMarks();
  private readonly cameraView: ThreeCameraView;

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
    this.weather = new WeatherView(container);
    this.sandDust = new SandDust(this.terrain.sandTiles, (pos) => this.board.groundOf(pos));
    this.cameraView = new ThreeCameraView(this.world.camera);
    this.world.scene.add(
      this.terrain.object,
      this.board.object,
      this.highlights.object,
      this.effects,
      this.weather.object,
      this.sandDust.object,
    );
    this.world.scene.add(this.particles.object, this.marks.mesh, this.wrecks.object);
    const grid = mapGrid(state);
    const center = new THREE.Vector3((grid.width - 1) / 2, 0, (grid.height - 1) / 2);
    this.world.lightArea(center, Math.max(grid.width, grid.height) * LIGHT_REACH);
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

  /** La casilla señalada (el cuadro amarillo). */
  hover(pos: Pos | null): void {
    this.highlights.hover(pos);
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
    this.board.update(seconds);
    this.terrain.update(seconds);
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
    return this.terrain.tileOfHit(hit) ?? { x: Math.round(hit.point.x), y: Math.round(hit.point.z) };
  }
}
