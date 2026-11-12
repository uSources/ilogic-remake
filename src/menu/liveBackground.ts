import type Phaser from 'phaser';
import { startsTurn } from '../core/actions';
import { controllersFor } from '../core/controllers';
import { GameSession, playMatch, type ActedStep } from '../core/session';
import { createLayer, mapGrid } from '../core/mapGrid';
import { createMatch } from '../core/defaultGames';
import { skirmishConfig } from '../core/match';
import { duel, playerTeam } from '../core/teams';
import type { GameEvent, GameState, Pos } from '../core/model';
import { TILE } from '../layout';
import { randomSeed } from '../setup';
import { burst, center, COLORS, floatText, lunge, reducedMotion, tileFlash } from '../ui/fx';
import { MapView } from '../ui/mapView';
import { PAL, PAL_CSS } from '../ui/palette';

const MAP_SIZE = 32;
/** La partida de fondo se juega sin niebla: se ve todo lo que pasa. */
const BACKGROUND_SETTING_CHANGES = { fog: false };
/** La partida de fondo se corta a los 45 dias y empieza otra. */
const MAX_DAYS = 45;
const FIRST_PAUSE_MS = 600;
const BETWEEN_TURNS_MS = 400;
const AFTER_WAIT_MS = 30;
const AFTER_ACTION_MS = 220;
const STEP_MS = 90;
const CAMERA_PAN_MS = 1100;
/** Por debajo de este ancho la pantalla es estrecha: las tarjetas tapan menos y la accion va al centro. */
const NARROW_SCREEN = 900;

type AnimatedEvent = Extract<GameEvent, { kind: 'move' | 'merge' | 'load' | 'attack' | 'capture' | 'spawn' }>;

/** Punto en pantalla (pixeles de la camara) de una casilla del mapa. */
function screenPosition(camera: Phaser.Cameras.Scene2D.Camera, world: Pos): Pos {
  return { x: (world.x - camera.worldView.x) * camera.zoom, y: (world.y - camera.worldView.y) * camera.zoom };
}

/**
 * La accion ya se ve sin tapar: en pantalla, lejos de arriba y abajo y, en pantalla ancha, en un
 * lateral (el centro lo tapan las tarjetas).
 */
function isInVisibleBand(screen: Pos, width: number, height: number): boolean {
  const isNarrow = width < NARROW_SCREEN;
  const isInHeight = screen.y > height * 0.12 && screen.y < height * 0.88;
  const isInWidth = isNarrow ? screen.x > width * 0.1 && screen.x < width * 0.9 : screen.x < width * 0.3 || screen.x > width * 0.7;
  return isInHeight && isInWidth && screen.x > 0 && screen.x < width;
}

/**
 * Fondo del menu: una partida IA contra IA en directo, sin niebla. Cada accion se anima y la camara
 * la sigue por un lateral (el centro lo tapan las tarjetas). Al acabar una partida empieza otra.
 * La escena llama a start() al crearse, a tick() en update() y a destroy() al cerrarse.
 */
export class LiveBackground {
  private game: GameState | null = null;
  private view: MapView | null = null;
  /** La partida en juego (la IA lleva los dos equipos). */
  private session: GameSession | null = null;
  /** Cambia al empezar o parar: el bucle anterior se da cuenta y termina. */
  private token = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  get active(): boolean {
    return !!this.game && !!this.view;
  }

  resize(width: number, height: number): void {
    this.view?.resize(width, height);
    this.tightBounds();
  }

  tick(time: number): void {
    if (this.game && this.view) this.view.tick(time);
  }

  destroy(): void {
    this.token++;
    this.game = null;
    this.session = null;
    this.view?.destroy();
    this.view = null;
  }

  start(): void {
    const seed = randomSeed();
    this.game = createMatch(skirmishConfig({ seed, size: MAP_SIZE, settingChanges: BACKGROUND_SETTING_CHANGES, teams: duel('ai', 'ai') }));
    if (!this.view) this.view = new MapView(this.scene);
    this.view.buildTerrain(this.game);
    const first = playerTeam(this.game);
    const firstBuilding = this.game.buildings.find((building) => building.owner === first) ?? { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
    this.view.centerOn(firstBuilding, true);
    this.tightBounds();
    this.view.placeCursor(false);
    this.session = new GameSession(this.game, controllersFor(this.game));
    this.render();
    void this.loop();
  }

  /** Que la camara del fondo no salga del mapa (sin los margenes de la partida). */
  tightBounds(): void {
    const s = this.game;
    if (!s) return;
    const camera = this.scene.cameras.main;
    const map = mapGrid(s);
    const mapWidth = map.width * TILE;
    const mapHeight = map.height * TILE;
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    camera.setBounds(
      Math.min(0, (mapWidth - viewWidth) / 2),
      Math.min(0, (mapHeight - viewHeight) / 2),
      Math.max(mapWidth, viewWidth),
      Math.max(mapHeight, viewHeight),
    );
  }

  private render(): void {
    const s = this.game;
    if (!s || !this.view) return;
    const visible = createLayer(s, true);
    this.view.render(s, { viewer: playerTeam(s), vis: visible, highlights: new Map(), hidden: new Set() });
    this.view.placeCursor(false);
  }

  /** Bucle de la partida de fondo: cada accion de la IA se anima y la camara la sigue; al acabar, otra. */
  private async loop(): Promise<void> {
    const token = ++this.token;
    const isAlive = () => token === this.token && !!this.game && this.scene.scene.isActive();
    const session = this.session;
    if (!session) return;
    await this.pause(FIRST_PAUSE_MS);
    const last = await playMatch(session, async (step) => {
      if (!isAlive()) return false;
      await this.show(step);
      return isAlive() && session.state.day <= MAX_DAYS;
    });
    if (isAlive() && last.kind !== 'awaitingInput') this.start();
  }

  /** Anima lo que ha pasado en un paso y espera un poco (mas entre turnos). */
  private async show(step: ActedStep): Promise<void> {
    if (startsTurn(step)) return this.pause(BETWEEN_TURNS_MS);
    for (const event of step.events) await this.animate(event);
    this.render();
    await this.pause(step.action.kind === 'wait' ? AFTER_WAIT_MS : AFTER_ACTION_MS);
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(ms, resolve));
  }

  /**
   * Lleva la camara (despacio) para que la accion se vea en un lateral de la pantalla: el centro lo
   * tapan las tarjetas del menu.
   */
  private async follow(tile: Pos): Promise<void> {
    const camera = this.scene.cameras.main;
    const world = center(tile);
    const { width, height } = camera;
    const screen = screenPosition(camera, world);
    if (isInVisibleBand(screen, width, height)) return;
    const side = width < NARROW_SCREEN ? 0.5 : 0.16;
    const targetX = screen.x < width / 2 ? width * side : width * (1 - side);
    const centerX = world.x + (width / 2 - targetX) / camera.zoom;
    if (reducedMotion()) {
      camera.centerOn(centerX, world.y);
      return;
    }
    camera.pan(centerX, world.y, CAMERA_PAN_MS, 'Sine.easeInOut', true);
    await this.pause(CAMERA_PAN_MS);
  }

  private animate(event: GameEvent): Promise<void> {
    switch (event.kind) {
      case 'move':
      case 'merge':
      case 'load':
        return this.animateMove(event);
      case 'attack':
        return this.animateAttack(event);
      case 'capture':
        return this.animateCapture(event);
      case 'spawn':
        return this.animateSpawn(event);
      default:
        return Promise.resolve();
    }
  }

  /** La unidad recorre su camino casilla a casilla. */
  private async animateMove(event: Extract<AnimatedEvent, { kind: 'move' | 'merge' | 'load' }>): Promise<void> {
    const sprite = this.view!.unitSprite(event.uid);
    if (!sprite || event.path.length < 2) return;
    await this.follow(event.path[event.path.length - 1]!);
    for (const step of event.path.slice(1))
      await new Promise<void>((resolve) =>
        this.scene.tweens.add({ targets: sprite, x: step.x * TILE, y: step.y * TILE, duration: STEP_MS, onComplete: () => resolve() }),
      );
  }

  private async animateAttack(event: Extract<AnimatedEvent, { kind: 'attack' }>): Promise<void> {
    const view = this.view!;
    await this.follow(event.at);
    const sprite = event.attacker === null ? null : view.unitSprite(event.attacker);
    const attacker = this.game!.units.find((unit) => unit.uid === event.attacker);
    if (sprite && attacker)
      await lunge(this.scene, sprite, { dx: Math.sign(event.at.x - attacker.x), dy: Math.sign(event.at.y - attacker.y) });
    const hitPoint = center(event.at);
    void burst(this.scene, view, hitPoint, {
      colors: event.killed ? COLORS.smoke : COLORS.fire,
      count: event.killed ? 16 : 10,
      radius: event.killed ? 26 : 18,
    });
    await floatText(this.scene, view, { x: hitPoint.x, y: hitPoint.y - 6 }, `-${event.damage}`, PAL_CSS.redSoft);
  }

  private async animateCapture(event: Extract<AnimatedEvent, { kind: 'capture' }>): Promise<void> {
    const view = this.view!;
    await this.follow(event.at);
    void burst(this.scene, view, center(event.at), { colors: COLORS.gold, count: 12, radius: 22 });
    await tileFlash(this.scene, view, event.at, PAL.gold);
  }

  private async animateSpawn(event: Extract<AnimatedEvent, { kind: 'spawn' }>): Promise<void> {
    const view = this.view!;
    await this.follow(event.at);
    this.render();
    await tileFlash(this.scene, view, event.at, 0xffffff);
  }
}
