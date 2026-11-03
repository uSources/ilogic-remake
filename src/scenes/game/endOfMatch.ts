/**
 * Final de la partida: el mapa tal como acabo, la camara en la jugada decisiva, confeti o humo y la
 * pantalla con el resumen y sus botones (volver a jugar, siguiente mision, menu...).
 */
import type Phaser from 'phaser';
import { HQ, MAP_H, MAP_W } from '../../core/data';
import { missionById, MISSIONS, type MissionDef } from '../../core/missions';
import { score } from '../../core/rules';
import { sampleArmy, stats } from '../../core/stats';
import type { GameState, Pos } from '../../core/types';
import { bestDays, markCompleted } from '../../campaign';
import { listStep, type MenuCommand } from '../../controls/menu';
import { ui, type UIState } from '../../hud/store';
import { TILE } from '../../layout';
import { settings, t } from '../../settings';
import { burst, COLORS, reducedMotion, tileFlash } from '../../ui/fx';
import type { MapView } from '../../ui/mapView';
import { PAL } from '../../ui/palette';
import { END_LABEL, type EndButton, type GameStartData } from './types';

export type EndReason = NonNullable<UIState['end']>['reason'];

/** Filtro CSS del lienzo del juego (gris al perder). */
export function setEndFilter(f: string | null): void {
  const el = document.getElementById('game');
  if (!el) return;
  el.style.transition = f ? 'filter 1.2s steps(6)' : '';
  el.style.filter = f ?? '';
}

/** Botones del final: en una mision, siguiente (si se gana y la hay), repetir y menu; si no, revancha, nueva y menu. */
export function endButtonsFor(m: MissionDef | undefined, won: boolean): EndButton[] {
  const next = m ? MISSIONS[MISSIONS.indexOf(m) + 1] : undefined;
  return m ? (won ? [...(next ? ['next' as const] : []), 'retry', 'menu'] : ['retry', 'menu']) : ['rematch', 'new', 'menu'];
}

/** Donde mirar al acabar. `lastAt`: ultima casilla con un combate o una captura. */
export function endFocus(s: GameState, won: boolean, reason: EndReason, lastAt: Pos | null): Pos {
  const hq = (team: 0 | 1) => s.buildings.find((b) => b.type === HQ && b.owner === team);
  const obj = s.mission?.objective;
  if (reason === 'objective' && obj?.kind === 'escort') return obj.to;
  if ((reason === 'hq' || reason === 'wipeout' || reason === 'objective') && lastAt) return lastAt;
  const own = hq(0) ?? hq(1);
  if (!won && own) return own;
  return lastAt ?? own ?? { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
}

/** Lo que el final necesita de la escena. */
export interface EndHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  /** Partida en curso (las esperas comprueban que no ha cambiado). */
  readonly match: number;
  readonly ended: boolean;
  /** Ultima casilla con un combate o una captura. */
  readonly lastAt: Pos | null;
  /** Da la partida por terminada: sin entrada, sin zona de amenaza y sin su guardado. */
  closeMatch(): void;
  refresh(): void;
  wait(ms: number): Promise<void>;
}

export class EndOfMatch {
  private buttons: EndButton[] = [];
  private sel = 0;
  private fx: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly h: EndHost) {}

  /** Partida nueva. */
  reset(): void {
    this.buttons = [];
    this.sel = 0;
    this.fx = null;
  }

  async finish(won: boolean, reason: EndReason): Promise<void> {
    const h = this.h;
    if (h.ended) return;
    const s = h.state;
    h.closeMatch();
    sampleArmy(s);
    const m = s.mission ? missionById(s.mission.id) : undefined;
    const before = m ? bestDays(m.id) : null;
    if (m && won) markCompleted(m.id, s.day);
    h.refresh();
    ui.set({
      screen: 'outro',
      menu: null,
      forecast: null,
      moveTip: null,
      tile: null,
      options: null,
      help: false,
      toast: null,
      report: null,
    });

    // Camara a la jugada que lo ha decidido.
    const focus = endFocus(s, won, reason, h.lastAt);
    const match = h.match;
    await h.wait(500);
    if (match !== h.match) return;
    const sc = h.scene;
    const c = { x: focus.x * TILE + TILE / 2, y: focus.y * TILE + TILE / 2 };
    sc.cameras.main.pan(c.x, c.y, reducedMotion() ? 0 : 1200, 'Sine.easeInOut', true);
    await h.wait(reducedMotion() ? 100 : 1250);
    if (match !== h.match) return;
    if (won) {
      void tileFlash(sc, h.view, focus, PAL.gold);
      const confetti = () => {
        const p = { x: c.x + (Math.random() - 0.5) * TILE * 8, y: c.y + (Math.random() - 0.5) * TILE * 5 };
        void burst(sc, h.view, p, {
          colors: [PAL.gold, 0xfff1a8, PAL.blue, 0x8fd0ff, 0xffffff],
          count: 14,
          radius: 30,
          duration: 900,
        });
      };
      confetti();
      if (!reducedMotion()) this.fx = sc.time.addEvent({ delay: 420, loop: true, callback: confetti });
    } else {
      setEndFilter('grayscale(0.9) brightness(0.55)');
      const smoke = () =>
        void burst(
          sc,
          h.view,
          { x: c.x + (Math.random() - 0.5) * TILE, y: c.y - TILE / 2 },
          { colors: COLORS.smoke, count: 8, radius: 26, size: 6, duration: 1400 },
        );
      smoke();
      if (!reducedMotion()) this.fx = sc.time.addEvent({ delay: 650, loop: true, callback: smoke });
    }
    await h.wait(reducedMotion() ? 200 : 1300);
    if (match !== h.match) return;

    // Botones del final.
    this.buttons = endButtonsFor(m, won);
    this.sel = 0;
    const st = stats(s);
    ui.set({
      screen: 'end',
      end: {
        won,
        day: s.day,
        stats: st,
        reason,
        score: [score(s, 0), score(s, 1)],
        mission: m ? m.title[settings.lang] : null,
        chart: st.army && st.army.length > 1 ? st.army : null,
        best: m ? (won ? bestDays(m.id) : before) : null,
        newBest: !!m && won && (before === null || s.day < before),
        buttons: this.buttons.map((id) => ({ id, label: t(END_LABEL[id]) })),
        selected: 0,
      },
    });
    Object.assign(ui.actions, {
      endHover: (i: number) => {
        this.sel = i;
        this.publishSel();
      },
      endPick: (i: number) => this.pick(i),
    });
  }

  private publishSel(): void {
    const e = ui.get().end;
    if (e) ui.set({ end: { ...e, selected: this.sel } });
  }

  /** Menu de fin de partida: una fila de botones. */
  command(cmd: MenuCommand): void {
    if (ui.get().screen !== 'end') return;
    const n = this.buttons.length;
    const step = listStep(cmd);
    if (step) this.sel = (this.sel + step + n) % n;
    else if (cmd.kind === 'ok' && !cmd.repeat) return this.pick(this.sel);
    else if (cmd.kind === 'back') return this.pick(this.buttons.indexOf('menu'));
    else return;
    this.publishSel();
  }

  private pick(i: number): void {
    const id = this.buttons[i];
    if (!id || ui.get().screen !== 'end') return;
    this.fx?.remove(false);
    this.fx = null;
    setEndFilter(null);
    ui.set({ end: null });
    const s = this.h.state;
    const scene = this.h.scene.scene;
    const m = s.mission ? missionById(s.mission.id) : undefined;
    switch (id) {
      case 'rematch':
        return void scene.start('Game', { mode: 'new', rules: s.rules, setup: s.setup } satisfies GameStartData);
      case 'retry':
        return void scene.start(
          'Game',
          (m ? { mode: 'mission', mission: m.id } : { mode: 'new', rules: s.rules, setup: s.setup }) satisfies GameStartData,
        );
      case 'next': {
        const next = m ? MISSIONS[MISSIONS.indexOf(m) + 1] : undefined;
        return void scene.start('Game', next ? ({ mode: 'mission', mission: next.id } satisfies GameStartData) : undefined);
      }
      case 'new':
        return void scene.start('Menu', { open: 'setup' });
      case 'menu':
        return void scene.start('Menu');
    }
  }
}
