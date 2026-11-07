/**
 * Final de la partida: el mapa tal como acabo, la camara en la jugada decisiva, confeti o humo y la
 * pantalla con el resumen y sus botones (volver a jugar, siguiente mision, menu...).
 */
import type Phaser from 'phaser';
import { isHq } from '../../core/gameContent';
import { mapGrid } from '../../core/mapGrid';
import { rematchOf } from '../../core/match';
import { missionById, MISSIONS, type MissionDef } from '../../core/missions';
import { decidingFall, isDefeatReason, isWinner, outcomeFor } from '../../core/rules';
import { enemiesOf } from '../../core/teams';
import type { DefeatReason, EndReason, GameState, MatchResult, Pos, TeamId } from '../../core/model';
import type { PersonEnd } from '../../core/session';
import { bestDays, markCompleted } from '../../campaign';
import { listStep, type MenuCommand } from '../../controls/menu';
import { ui, type EndOutcome } from '../../hud/store';
import { TILE } from '../../layout';
import { settings, t, type TextKey } from '../../settings';
import { randomSeed } from '../../setup';
import { burst, center, COLORS, reducedMotion, tileFlash } from '../../ui/fx';
import type { MapView } from '../../ui/mapView';
import { sideOf, type Side } from '../../ui/sides';
import { PAL } from '../../ui/palette';
import { armyChartVM, endScoreVM, endStatsVM } from '../../ui/hudModels';
import { END_LABEL, type EndButton, type GameStartData } from './types';

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

/**
 * Como acaba para esta pantalla: lo que ve el que mira (ganada, perdida o empate), por que y, si lo
 * decidio una caida, de quien fue para el (`fallenBy`: suya, de un aliado o de un enemigo). Asi «te
 * has rendido» solo lo lee quien se rindio. Sin caida (limite de dias, objetivo), no hay `fallenBy`.
 */
export type ScreenEnd =
  { outcome: EndOutcome; reason: Exclude<EndReason, DefeatReason> } | { outcome: EndOutcome; reason: DefeatReason; fallenBy: Side };

/** El final de esta pantalla segun la sesion (GameSession.screenEnd), visto por `viewer`. */
export function screenEndFor(s: GameState, end: PersonEnd, viewer: TeamId): ScreenEnd {
  if (end.kind === 'out') return { outcome: 'lost', reason: end.fall.reason, fallenBy: 'own' };
  const { result } = end;
  const outcome = outcomeFor(result, viewer);
  return isDefeatReason(result.reason)
    ? { outcome, reason: result.reason, fallenBy: sideOf(s, viewer, decidingFall(s, result).team) }
    : { outcome, reason: result.reason };
}

const REASON_TEXT: { readonly [Reason in Exclude<EndReason, 'surrender'>]: TextKey } = {
  hq: 'endHq',
  wipeout: 'endWipeout',
  days: 'endDays',
  objective: 'endObjective',
};

/** Quien se rindio, para quien mira: el, un aliado o un enemigo. */
const SURRENDER_BY: { readonly [Who in Side]: TextKey } = { own: 'endSurrender', ally: 'endAllySurrender', enemy: 'endEnemySurrender' };

/** Por que ha acabado, para quien mira: si fue por rendirse, «te has rendido» solo lo lee quien se rindio. */
export function reasonText(end: ScreenEnd): TextKey {
  if (!('fallenBy' in end)) return REASON_TEXT[end.reason];
  return end.reason === 'surrender' ? SURRENDER_BY[end.fallenBy] : REASON_TEXT[end.reason];
}

/**
 * Desde que equipo se ve el final: el que miraba o, si ha perdido y gana otra persona de esta
 * pantalla (varias por turnos), la que gana.
 */
export function endViewer(result: MatchResult, viewer: TeamId, people: readonly TeamId[]): TeamId {
  if (isWinner(result, viewer)) return viewer;
  return people.find((team) => isWinner(result, team)) ?? viewer;
}

/** Botones del final: en una mision, siguiente (si se gana y la hay), repetir y menu; si no, revancha, nueva y menu. */
export function endButtonsFor(mission: MissionDef | undefined, outcome: EndOutcome): EndButton[] {
  if (!mission) return ['rematch', 'new', 'menu'];
  if (outcome !== 'won') return ['retry', 'menu'];
  return nextMission(mission) ? ['next', 'retry', 'menu'] : ['retry', 'menu'];
}

/** Donde mirar al acabar (para el equipo que mira, `viewer`). `lastAt`: ultima casilla con un combate o una captura. */
export function endFocus(s: GameState, viewer: TeamId, outcome: EndOutcome, reason: EndReason, lastAt: Pos | null): Pos {
  const hqOf = (team: TeamId) => s.buildings.find((building) => isHq(s, building) && building.owner === team);
  const objective = s.mission?.objective;
  if (reason === 'objective' && objective?.kind === 'escort') return objective.to;
  const endedByAMove = reason === 'hq' || reason === 'wipeout' || reason === 'objective';
  if (endedByAMove && lastAt) return lastAt;
  const hq =
    hqOf(viewer) ??
    enemiesOf(s, viewer)
      .map(hqOf)
      .find((found) => found !== undefined);
  if (outcome !== 'won' && hq) return hq;
  const map = mapGrid(s);
  return lastAt ?? hq ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
}

/** Lo que el final necesita de la escena. */
export interface EndHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
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

  /** El final para esta pantalla (`ScreenEnd`: de la partida decidida o de quien se ha quedado fuera). */
  async finish(end: ScreenEnd): Promise<void> {
    const host = this.host;
    if (host.ended) return;
    const s = host.state;
    const { outcome, reason } = end;
    const won = outcome === 'won';
    host.closeMatch();
    const mission = s.mission ? missionById(s.mission.id) : undefined;
    const bestBefore = mission ? bestDays(mission.id) : null;
    if (mission && won) markCompleted(mission.id, s.day);
    host.refresh();
    hideMatchPanels();

    const match = host.match;
    const focus = endFocus(s, host.viewer, outcome, reason, host.lastAt);
    if (!(await this.panTo(focus, match))) return;
    this.celebrate(won, focus);
    await host.wait(reducedMotion() ? CELEBRATION_REDUCED_MS : CELEBRATION_MS);
    if (match !== host.match) return;
    this.showEndScreen(end, mission, bestBefore);
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
  private showEndScreen(end: ScreenEnd, mission: MissionDef | undefined, bestBefore: number | null): void {
    const { outcome } = end;
    const s = this.host.state;
    const won = outcome === 'won';
    this.buttons = endButtonsFor(mission, outcome);
    this.selected = 0;
    const viewer = this.host.viewer;
    ui.set({
      screen: 'end',
      end: {
        outcome,
        day: s.day,
        stats: endStatsVM(s, viewer),
        reasonText: reasonText(end),
        score: endScoreVM(s, viewer),
        mission: mission ? mission.title[settings.lang] : null,
        chart: armyChartVM(s, viewer),
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
    const rematch = rematchOf(s);
    const sameGame: GameStartData | undefined = rematch ? { start: 'new', match: rematch } : undefined;
    switch (id) {
      case 'rematch':
        return void scenes.start('Game', sameGame);
      case 'retry':
        return void scenes.start('Game', mission ? missionStart(mission) : sameGame);
      case 'next': {
        const next = mission ? nextMission(mission) : undefined;
        return void scenes.start('Game', next ? missionStart(next) : undefined);
      }
      case 'new':
        return void scenes.start('Menu', { open: 'setup' });
      case 'menu':
        return void scenes.start('Menu');
    }
  }
}

/** Empezar una mision (cada vez con otros dados). */
const missionStart = (mission: MissionDef): GameStartData => ({
  start: 'new',
  match: { mode: 'mission', mission: mission.id, seed: randomSeed() },
});

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
