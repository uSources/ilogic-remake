import type Phaser from 'phaser';
import { aiTurn } from '../core/ai';
import { DEFAULT_RULES, useRules } from '../core/data';
import { seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { endRound, outcome } from '../core/rules';
import type { GameEvent, GameState, Pos, Team } from '../core/types';
import { TILE } from '../layout';
import { randomSeed } from '../setup';
import { burst, center, COLORS, floatText, lunge, reducedMotion, tileFlash } from '../ui/fx';
import { MapView } from '../ui/mapView';
import { PAL, PAL_CSS } from '../ui/palette';

/**
 * Fondo del menu: una partida IA contra IA en directo, sin niebla. Cada accion se anima y la camara
 * la sigue por un lateral (el centro lo tapan las tarjetas). Al acabar una partida empieza otra.
 * La escena llama a start() al crearse, a tick() en update() y a destroy() al cerrarse.
 */
export class LiveBackground {
  private game: GameState | null = null;
  private view: MapView | null = null;
  private events: Generator<GameEvent> | null = null;
  private team: Team = 0;
  private rng = seededRng(1);
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
    this.events = null;
    this.view?.destroy();
    this.view = null;
  }

  start(): void {
    useRules({ ...DEFAULT_RULES, fog: false });
    const seed = randomSeed();
    this.rng = seededRng(seed ^ 0x5bd1e995);
    this.game = generateGame(seededRng(seed), { size: 32 });
    if (!this.view) this.view = new MapView(this.scene);
    this.view.buildTerrain(this.game);
    const hq = this.game.buildings.find((b) => b.owner === 0) ?? { x: 16, y: 16 };
    this.view.centerOn(hq, true);
    this.tightBounds();
    this.view.placeCursor(false);
    this.team = 0;
    this.events = aiTurn(this.game, this.rng, 0);
    this.render();
    void this.loop();
  }

  /** Que la camara del fondo no salga del mapa (sin los margenes de la partida). */
  tightBounds(): void {
    const s = this.game;
    if (!s) return;
    const cam = this.scene.cameras.main;
    const mw = s.map.length * TILE,
      mh = s.map[0]!.length * TILE;
    const vw = cam.width / cam.zoom,
      vh = cam.height / cam.zoom;
    cam.setBounds(Math.min(0, (mw - vw) / 2), Math.min(0, (mh - vh) / 2), Math.max(mw, vw), Math.max(mh, vh));
  }

  private render(): void {
    const s = this.game;
    if (!s || !this.view) return;
    const vis = Array.from({ length: s.map.length }, () => Array<boolean>(s.map.length).fill(true));
    this.view.render(s, { vis, highlights: new Map(), hidden: new Set() });
    this.view.placeCursor(false);
  }

  /** Bucle de la partida de fondo: cada accion de la IA se anima y la camara la sigue. */
  private async loop(): Promise<void> {
    const token = ++this.token;
    const alive = () => token === this.token && !!this.game && this.scene.scene.isActive();
    await this.pause(600);
    while (alive()) {
      const s = this.game!;
      const r = this.events!.next();
      if (r.done) {
        if (this.team === 0) this.team = 1;
        else {
          endRound(s);
          this.team = 0;
        }
        if (outcome(s) !== 'playing' || s.day > 45) {
          this.start();
          continue;
        }
        this.events = aiTurn(s, this.rng, this.team);
        await this.pause(400);
        continue;
      }
      await this.animate(r.value);
      if (!alive()) return;
      this.render();
      await this.pause(r.value.kind === 'wait' ? 30 : 220);
    }
  }

  private pause(ms: number): Promise<void> {
    return new Promise((res) => this.scene.time.delayedCall(ms, res));
  }

  /**
   * Lleva la camara (despacio) para que la accion se vea en un lateral de la pantalla: el centro lo
   * tapan las tarjetas del menu.
   */
  private async follow(p: Pos): Promise<void> {
    const cam = this.scene.cameras.main;
    const c = center(p);
    const z = cam.zoom;
    const W = cam.width,
      H = cam.height;
    const sx = (c.x - cam.worldView.x) * z,
      sy = (c.y - cam.worldView.y) * z;
    const side = W < 900 ? 0.5 : 0.16;
    const inBand =
      sy > H * 0.12 && sy < H * 0.88 && (W < 900 ? sx > W * 0.1 && sx < W * 0.9 : sx < W * 0.3 || sx > W * 0.7) && sx > 0 && sx < W;
    if (inBand) return;
    const tx = sx < W / 2 ? W * side : W * (1 - side);
    const midX = c.x + (W / 2 - tx) / z;
    const ms = 1100;
    if (reducedMotion()) {
      cam.centerOn(midX, c.y);
      return;
    }
    cam.pan(midX, c.y, ms, 'Sine.easeInOut', true);
    await this.pause(ms);
  }

  private async animate(ev: GameEvent): Promise<void> {
    const view = this.view!;
    switch (ev.kind) {
      case 'move':
      case 'merge':
      case 'load': {
        const sp = view.unitSprite(ev.uid);
        if (!sp || ev.path.length < 2) return;
        await this.follow(ev.path[ev.path.length - 1]!);
        for (const p of ev.path.slice(1)) {
          await new Promise<void>((res) =>
            this.scene.tweens.add({ targets: sp, x: p.x * TILE, y: p.y * TILE, duration: 90, onComplete: () => res() }),
          );
        }
        return;
      }
      case 'attack': {
        await this.follow(ev.target);
        const sp = view.unitSprite(ev.attacker);
        const s = this.game!;
        const atk = s.units.find((u) => u.uid === ev.attacker);
        if (sp && atk) await lunge(this.scene, sp, { dx: Math.sign(ev.target.x - atk.x), dy: Math.sign(ev.target.y - atk.y) });
        const c = center(ev.target);
        void burst(this.scene, view, c, {
          colors: ev.killed ? COLORS.smoke : COLORS.fire,
          count: ev.killed ? 16 : 10,
          radius: ev.killed ? 26 : 18,
        });
        await floatText(this.scene, view, { x: c.x, y: c.y - 6 }, `-${ev.damage}`, PAL_CSS.redSoft);
        return;
      }
      case 'capture':
        await this.follow(ev.at);
        void burst(this.scene, view, center(ev.at), { colors: COLORS.gold, count: 12, radius: 22 });
        await tileFlash(this.scene, view, ev.at, PAL.gold);
        return;
      case 'spawn':
        await this.follow(ev.at);
        this.render();
        await tileFlash(this.scene, view, ev.at, 0xffffff);
        return;
      default:
        break;
    }
  }
}
