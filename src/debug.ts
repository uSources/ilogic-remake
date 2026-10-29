import type Phaser from 'phaser';
import type { GameState } from './core/types';
import { ui, type UIState } from './hud/store';
import type { GameScene, GameStartData } from './scenes/GameScene';
import { setFrozen } from './ui/fx';

/**
 * API de depuracion para tests de navegador y agentes de IA: `window.ilogicDebug` en la consola o
 * desde Playwright (`page.evaluate(() => window.ilogicDebug.startGame({ seed: 7 }))`).
 * Lo que se haga con ella es lo mismo que haria un jugador (empezar partidas, volver al menu); para
 * jugar, pulsar teclas o hacer clic con Playwright. Documentada en docs/AGENTES.md.
 */
export interface IlogicDebug {
  /** Version del juego (package.json). */
  version: string;
  /** Espera a que este el menu principal (tras la carga y el logo). */
  ready(timeoutMs?: number): Promise<void>;
  /** Pantalla de la interfaz: 'loading' | 'logo' | 'menu' | 'setup' | 'campaign' | 'game' | 'outro' | 'end'. */
  screen(): UIState['screen'];
  /** Copia del estado de la interfaz HTML (fichas, menus, avisos...). */
  ui(): UIState;
  /**
   * Empieza una partida y espera a que se pueda jugar. Con `seed` (y opcionalmente `size` 20/32/40,
   * `theme` 0..4, `fog`) se genera el mismo mapa siempre; con `state` se carga esa partida (JSON de
   * GameState, ver `state()`); con `mission` una mision de la campaña.
   */
  startGame(opts: {
    seed?: number;
    size?: number;
    theme?: number | null;
    fog?: boolean;
    state?: GameState | string;
    mission?: string;
  }): Promise<void>;
  /** Partida en curso (copia) o null fuera de la partida. */
  state(): GameState | null;
  /** Fase de la partida ('map', 'move', 'attack', 'busy'...), dia y si ha terminado. */
  game(): { phase: string; busy: boolean; ended: boolean; day: number; cursor: { x: number; y: number } } | null;
  /** Espera a que la partida acepte ordenes (fin de animaciones y del turno enemigo). */
  idle(timeoutMs?: number): Promise<void>;
  /** Vuelve al menu principal. */
  toMenu(): Promise<void>;
  /** Congela animaciones y efectos (capturas que se puedan comparar). */
  freeze(on?: boolean): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`ilogicDebug: no ha llegado "${what}" en ${timeoutMs} ms`);
    await sleep(30);
  }
}

export function installDebug(game: Phaser.Game): void {
  const scene = (key: string) => game.scene.getScene(key);
  const gameScene = () => {
    const g = scene('Game') as GameScene | null;
    return g?.sys.isActive() ? g : null;
  };
  const activeScene = () => game.scene.getScenes(true)[0] ?? null;

  const api: IlogicDebug = {
    version: __APP_VERSION__,
    ready: (timeoutMs = 30000) => until(() => !!scene('Menu')?.sys.isActive() && ui.get().screen === 'menu', timeoutMs, 'menu'),
    screen: () => ui.get().screen,
    ui: () => structuredClone(ui.get()),
    async startGame(opts) {
      const data: GameStartData =
        opts.state !== undefined
          ? { mode: 'state', state: typeof opts.state === 'string' ? opts.state : JSON.stringify(opts.state) }
          : opts.mission
            ? { mode: 'mission', mission: opts.mission }
            : {
                mode: 'new',
                rules: { fog: opts.fog ?? false },
                setup: { seed: opts.seed ?? 1, size: opts.size ?? 20, theme: opts.theme ?? null },
              };
      const from = activeScene();
      if (!from) throw new Error('ilogicDebug: el juego aun no ha arrancado (usar ready())');
      from.scene.start('Game', data);
      await until(() => !!gameScene()?.debugSnapshot, 20000, 'partida');
      await sleep(50);
    },
    state() {
      const g = gameScene();
      return g ? (JSON.parse(g.debugSnapshot().state) as GameState) : null;
    },
    game() {
      const g = gameScene();
      if (!g) return null;
      const { phase, busy, ended, day, cursor } = g.debugSnapshot();
      return { phase, busy, ended, day, cursor };
    },
    idle: (timeoutMs = 60000) => until(() => !gameScene()?.debugSnapshot().busy, timeoutMs, 'turno del jugador'),
    async toMenu() {
      const from = activeScene();
      if (from && from.scene.key !== 'Menu') from.scene.start('Menu');
      await api.ready();
    },
    freeze: (on = true) => setFrozen(on),
  };
  (window as unknown as { ilogicDebug: IlogicDebug }).ilogicDebug = api;
}
