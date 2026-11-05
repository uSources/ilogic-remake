/**
 * Final de la partida: el mapa tal como acabo, la camara en la jugada decisiva, confeti o humo y la
 * pantalla con el resumen y sus botones (volver a jugar, siguiente mision, menu...).
 */
import type Phaser from 'phaser';
import { tablesOf } from '../../core/gameContent';
import { mapGrid } from '../../core/mapGrid';
import { missionById, MISSIONS, type MissionDef } from '../../core/missions';
import { score } from '../../core/rules';
import { sampleArmy, statsOf } from '../../core/stats';
import type { GameState, Pos, Team } from '../../core/model';
import { bestDays, markCompleted } from '../../campaign';
import { listStep, type MenuCommand } from '../../controls/menu';
import { ui, type UIState } from '../../hud/store';
import { TILE } from '../../layout';
import { settings, t } from '../../settings';
import { burst, center, COLORS, reducedMotion, tileFlash } from '../../ui/fx';
import type { MapView } from '../../ui/mapView';
import { PAL } from '../../ui/palette';
import { END_LABEL, type EndButton, type GameStartData } from './types';

export type EndReason = NonNullable<UIState['end']>['reason'];

/** Filtro del lienzo al perder: casi gris y oscuro. */
const DEFEAT_FILTER = 'grayscale(0.9) brightness(0.55)';

/** Esperas del final (con "reducir movimiento", la camara salta y apenas se espera). */
const BEFORE_PAN_MS = 500;
const PAN_MS = 1200;
const AFTER_PAN_MS = 1250;
const AFTER_PAN_REDUCED_MS = 100;
const CELEBRATION_MS = 1300;
const CELEBRATION_REDUCED_MS = 200;
/** Cada cuanto sale otro confeti (al ganar) u otra columna de humo (al perder). */
const CONFETTI_EVERY_MS = 420;
const SMOKE_EVERY_MS = 650;
const CONFETTI_COLORS = [PAL.gold, 0xfff1a8, PAL.blue, 0x8fd0ff, 0xffffff];

/** Filtro CSS del lienzo del juego (gris al perder). */
export function setEndFilter(filter: string | null): void {
  const gameElement = document.getElementById('game');
  if (!gameElement) return;
  gameElement.style.transition = filter ? 'filter 1.2s steps(6)' : '';
  gameElement.style.filter = filter ?? '';
}

/** Mision que va detras de esta (ninguna si es la ultima). */
const nextMission = (mission: MissionDef): MissionDef | undefined => MISSIONS[MISSIONS.indexOf(mission) + 1];

/** Botones del final: en una mision, siguiente (si se gana y la hay), repetir y menu; si no, revancha, nueva y menu. */
export function endButtonsFor(mission: MissionDef | undefined, won: boolean): EndButton[] {
  if (!mission) return ['rematch', 'new', 'menu'];
  if (!won) return ['retry', 'menu'];
  return nextMission(mission) ? ['next', 'retry', 'menu'] : ['retry', 'menu'];
}

/** Donde mirar al acabar. `lastAt`: ultima casilla con un combate o una captura. */
export function endFocus(s: GameState, won: boolean, reason: EndReason, lastAt: Pos | null): Pos {
  const hqOf = (team: Team) => s.buildings.find((building) => building.type === tablesOf(s).HQ && building.owner === team);
  const objective = s.mission?.objective;
  if (reason === 'objective' && objective?.kind === 'escort') return objective.to;
  const endedByAMove = reason === 'hq' || reason === 'wipeout' || reason === 'objective';
  if (endedByAMove && lastAt) return lastAt;
  const hq = hqOf(0) ?? hqOf(1);
  if (!won && hq) return hq;
  const map = mapGrid(s);
  return lastAt ?? hq ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
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
  private selected = 0;
  /** Confeti o humo que se repite hasta que se elige un boton. */
  private celebration: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly host: EndHost) {}

  /** Partida nueva. */
  reset(): void {
    this.buttons = [];
    this.selected = 0;
    this.celebration = null;
  }

  async finish(won: boolean, reason: EndReason): Promise<void> {
    const host = this.host;
    if (host.ended) return;
    const s = host.state;
    host.closeMatch();
    sampleArmy(s);
    const mission = s.mission ? missionById(s.mission.id) : undefined;
    const bestBefore = mission ? bestDays(mission.id) : null;
    if (mission && won) markCompleted(mission.id, s.day);
    host.refresh();
    hideMatchPanels();

    const match = host.match;
    const focus = endFocus(s, won, reason, host.lastAt);
    if (!(await this.panTo(focus, match))) return;
    this.celebrate(won, focus);
    await host.wait(reducedMotion() ? CELEBRATION_REDUCED_MS : CELEBRATION_MS);
    if (match !== host.match) return;
    this.showEndScreen(won, reason, mission, bestBefore);
  }

  /** Camara a la jugada que lo ha decidido. false si entre medias se ha cambiado de partida. */
  private async panTo(focus: Pos, match: number): Promise<boolean> {
    const host = this.host;
    await host.wait(BEFORE_PAN_MS);
    if (match !== host.match) return false;
    const centerPoint = center(focus);
    host.scene.cameras.main.pan(centerPoint.x, centerPoint.y, reducedMotion() ? 0 : PAN_MS, 'Sine.easeInOut', true);
    await host.wait(reducedMotion() ? AFTER_PAN_REDUCED_MS : AFTER_PAN_MS);
    return match === host.match;
  }

  /** Confeti al ganar; al perder, el mapa en gris y humo. Se repite (salvo con "reducir movimiento"). */
  private celebrate(won: boolean, focus: Pos): void {
    const { scene, view } = this.host;
    const centerPoint = center(focus);
    if (won) void tileFlash(scene, view, focus, PAL.gold);
    else setEndFilter(DEFEAT_FILTER);
    const puff = won ? () => this.confetti(centerPoint) : () => this.smoke(centerPoint);
    puff();
    if (reducedMotion()) return;
    this.celebration = scene.time.addEvent({ delay: won ? CONFETTI_EVERY_MS : SMOKE_EVERY_MS, loop: true, callback: puff });
  }

  /** Un estallido de confeti en un sitio al azar alrededor de la jugada. */
  private confetti(pos: { x: number; y: number }): void {
    const at = { x: pos.x + (Math.random() - 0.5) * TILE * 8, y: pos.y + (Math.random() - 0.5) * TILE * 5 };
    void burst(this.host.scene, this.host.view, at, { colors: CONFETTI_COLORS, count: 14, radius: 30, duration: 900 });
  }

  /** Una columna de humo sobre la jugada. */
  private smoke(pos: { x: number; y: number }): void {
    const at = { x: pos.x + (Math.random() - 0.5) * TILE, y: pos.y - TILE / 2 };
    void burst(this.host.scene, this.host.view, at, { colors: COLORS.smoke, count: 8, radius: 26, size: 6, duration: 1400 });
  }

  /** La pantalla del final, con el resumen y sus botones. */
  private showEndScreen(won: boolean, reason: EndReason, mission: MissionDef | undefined, bestBefore: number | null): void {
    const s = this.host.state;
    this.buttons = endButtonsFor(mission, won);
    this.selected = 0;
    const matchStats = statsOf(s);
    ui.set({
      screen: 'end',
      end: {
        won,
        day: s.day,
        stats: matchStats,
        reason,
        score: [score(s, 0), score(s, 1)],
        mission: mission ? mission.title[settings.lang] : null,
        chart: matchStats.army && matchStats.army.length > 1 ? matchStats.army : null,
        best: mission ? (won ? bestDays(mission.id) : bestBefore) : null,
        newBest: !!mission && won && (bestBefore === null || s.day < bestBefore),
        buttons: this.buttons.map((id) => ({ id, label: t(END_LABEL[id]) })),
        selected: 0,
      },
    });
    Object.assign(ui.actions, {
      endHover: (index: number) => {
        this.selected = index;
        this.publishSelected();
      },
      endPick: (index: number) => this.pick(index),
    });
  }

  private publishSelected(): void {
    const end = ui.get().end;
    if (end) ui.set({ end: { ...end, selected: this.selected } });
  }

  /** Menu de fin de partida: una fila de botones. */
  command(command: MenuCommand): void {
    if (ui.get().screen !== 'end') return;
    const step = listStep(command);
    if (step) {
      const count = this.buttons.length;
      this.selected = (this.selected + step + count) % count;
      this.publishSelected();
      return;
    }
    if (command.kind === 'ok' && !command.repeat) return this.pick(this.selected);
    if (command.kind === 'back') return this.pick(this.buttons.indexOf('menu'));
  }

  private pick(index: number): void {
    const id = this.buttons[index];
    if (!id || ui.get().screen !== 'end') return;
    this.celebration?.remove(false);
    this.celebration = null;
    setEndFilter(null);
    ui.set({ end: null });
    const s = this.host.state;
    const scenes = this.host.scene.scene;
    const mission = s.mission ? missionById(s.mission.id) : undefined;
    const sameGame: GameStartData = { mode: 'new', rules: s.rules, setup: s.setup };
    switch (id) {
      case 'rematch':
        return void scenes.start('Game', sameGame);
      case 'retry':
        return void scenes.start('Game', mission ? ({ mode: 'mission', mission: mission.id } satisfies GameStartData) : sameGame);
      case 'next': {
        const next = mission ? nextMission(mission) : undefined;
        return void scenes.start('Game', next ? ({ mode: 'mission', mission: next.id } satisfies GameStartData) : undefined);
      }
      case 'new':
        return void scenes.start('Menu', { open: 'setup' });
      case 'menu':
        return void scenes.start('Menu');
    }
  }
}

/** Al acabar se quita todo lo de la partida (menus, prevision, avisos...) y empieza el final. */
function hideMatchPanels(): void {
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
}
