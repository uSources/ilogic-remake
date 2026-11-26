/**
 * La pantalla del final de una partida 3D: como ha acabado para quien mira, sus cifras y que hacer
 * despues (otra escaramuza, la revancha, la siguiente mision, mirar el tablero, volver al menu). Es
 * un panel de teclas (systems/input/keyInput.ts): mientras se ve, el teclado es suyo y nada del mapa
 * (terminar el turno, la pausa...) la quita. «Mirar el tablero» la esconde para ver como ha quedado;
 * Esc o Enter la vuelven a enseñar. Por la red el final solo vuelve al menu (la revancha seria otra
 * sala) y el guardado de esta pantalla, que es de otra partida, no se toca.
 */
import { missionById, type Mission } from '../../../core/missions';
import { rematchOf, type SkirmishConfig } from '../../../core/match';
import { decidingFall, isDefeatReason, outcomeFor } from '../../../core/rules';
import type { EndReason, GameState, TeamId } from '../../../core/model';
import { listStep, type MenuCommand, type MenuContext } from '../../../controls/menu';
import { screenEnd, type GameSession, type PersonEnd } from '../../../core/session';
import { bestDays, campaignMissions, markCompleted } from '../../../campaign';
import { ui, type EndOutcome, type UIState } from '../../../hud/store';
import { navGrid } from '../../../menu/nav';
import { settings, t, type TextKey } from '../../../settings';
import { randomSeed, seedToCode } from '../../../setup';
import { deleteSave } from '../../../storage';
import { armyChartVM, buildingShare, endScoreVM, endStatsVM } from '../../../ui/hudModels';
import { sideOf, type Side } from '../../../ui/sides';
import { backToMenu, startGame, type GameStart } from '../../app/gameStart';
import type { KeyPanel } from '../input/keyInput';

type EndButton = 'another' | 'rematch' | 'next' | 'retry' | 'board' | 'menu';
const END_LABEL: Readonly<Record<EndButton, TextKey>> = {
  another: 'endAnother',
  rematch: 'endRematch',
  next: 'endNext',
  retry: 'endRetry',
  board: 'endBoard',
  menu: 'endMenu',
};

const REASON_TEXT: { readonly [Reason in Exclude<EndReason, 'surrender'>]: TextKey } = {
  hq: 'endHq',
  wipeout: 'endWipeout',
  days: 'endDays',
  objective: 'endObjective',
};
/** Quien se rindio, para quien mira: el, un aliado o un enemigo. */
const SURRENDER_BY: { readonly [Who in Side]: TextKey } = { own: 'endSurrender', ally: 'endAllySurrender', enemy: 'endEnemySurrender' };

/** Lo que enseña la pantalla del final, sin lo que cambia al moverse por ella (la elegida y si se mira el tablero). */
type EndView = Omit<NonNullable<UIState['end']>, 'selected' | 'peek'>;

/** Como acaba para quien mira: ganada, perdida o empate, y por que (si fue una caida, de quien para el). */
interface ScreenEnd {
  outcome: EndOutcome;
  reason: EndReason;
  fallenBy?: Side;
}

/** Lo que el final le pide a la partida. */
export interface EndHost {
  readonly session: GameSession;
  readonly viewer: TeamId;
  /** Por la red: solo se vuelve al menu y no se toca el guardado. */
  readonly isOnline: boolean;
}

export class MatchEnd implements KeyPanel {
  private shown: { view: EndView; start: (button: EndButton) => GameStart | null; buttons: EndButton[] } | null = null;
  private selected = 0;
  private peeking = false;

  constructor(private readonly host: EndHost) {}

  /** Se ve el final (o se mira el tablero desde el): el teclado es suyo. */
  get isOpen(): boolean {
    return this.shown !== null;
  }

  /** Mirando el tablero solo valen volver al resultado (Esc, Enter): las flechas no mueven nada escondido. */
  context(): MenuContext {
    return this.peeking ? 'endPeek' : 'end';
  }

  command(command: MenuCommand): void {
    if (this.peeking) {
      if (command.kind === 'back' || command.kind === 'ok') this.unpeek();
      return;
    }
    if (command.kind === 'move') return this.move(listStep(command));
    if (command.kind === 'ok' && !command.repeat) this.pick();
  }

  /**
   * Enseña el final si la partida se ha acabado para quien mira (true si se ve). La primera vez apunta
   * la mision ganada y borra el guardado de esta partida.
   */
  showIfOver(): boolean {
    if (this.shown) return true;
    const { session, viewer, isOnline } = this.host;
    const end = screenEnd(session, viewer);
    if (!end) return false;
    const s = session.state;
    const shown = screenEndFor(s, end, viewer);
    const mission = s.mission ? missionById(s.content, s.mission.id) : undefined;
    const best = recordBest(s, mission, shown.outcome);
    if (!isOnline) deleteSave();
    const buttons = endButtonsFor(s, mission, shown.outcome, isOnline);
    const view = endView(s, viewer, shown, mission, best, buttons);
    this.shown = { view, buttons, start: (button) => startFor(s, mission, button) };
    Object.assign(ui.actions, {
      endHover: (index: number) => this.hover(index),
      endPick: (index: number) => this.pick(index),
      endBack: () => this.unpeek(),
    });
    this.publish();
    return true;
  }

  hover(index: number): void {
    this.selected = index;
    this.publish();
  }

  pick(index = this.selected): void {
    const button = this.shown?.buttons[index];
    if (!button) return;
    if (button === 'board') return this.peek();
    const start = this.shown?.start(button);
    // «Volver al menú» (y lo que no tiene partida que empezar) vuelve al menu principal.
    if (start) return startGame(start);
    backToMenu();
  }

  private move(delta: number): void {
    const buttons = this.shown?.buttons ?? [];
    const current = buttons[this.selected];
    if (!current) return;
    const next = navGrid(
      buttons.map((button) => [button]),
      current,
      0,
      delta,
    );
    this.hover(buttons.findIndex((button) => button === next));
  }

  /** «Mirar el tablero»: esconde el final; Esc, Enter o su boton lo vuelven a enseñar. */
  private peek(): void {
    this.peeking = true;
    this.publish();
  }

  private unpeek(): void {
    this.peeking = false;
    this.publish();
  }

  private publish(): void {
    if (!this.shown) return;
    ui.set({
      screen: 'end',
      menu: null,
      toast: null,
      forecast: null,
      tile: null,
      end: { ...this.shown.view, selected: this.selected, peek: this.peeking },
    });
  }
}

function screenEndFor(s: GameState, end: PersonEnd, viewer: TeamId): ScreenEnd {
  if (end.kind === 'out') return { outcome: 'lost', reason: end.fall.reason, fallenBy: 'own' };
  const { result } = end;
  const outcome = outcomeFor(result, viewer);
  if (!isDefeatReason(result.reason)) return { outcome, reason: result.reason };
  return { outcome, reason: result.reason, fallenBy: sideOf(s, viewer, decidingFall(s, result).team) };
}

function reasonText({ reason, fallenBy }: ScreenEnd): TextKey {
  if (reason === 'surrender') return SURRENDER_BY[fallenBy ?? 'own'];
  return REASON_TEXT[reason];
}

/** En una mision: apunta la ganada y da la mejor marca (la de antes si no se gano) y si se acaba de batir. */
function recordBest(s: GameState, mission: Mission | undefined, outcome: EndOutcome): { best: number | null; newBest: boolean } {
  if (!mission) return { best: null, newBest: false };
  const before = bestDays(mission.id);
  if (outcome !== 'won') return { best: before, newBest: false };
  markCompleted(mission.id, s.day);
  return { best: bestDays(mission.id), newBest: before === null || s.day < before };
}

/** Encima del titulo: que se ha jugado (la mision o una escaramuza) y en que mapa. */
function endKicker(s: GameState, mission: Mission | undefined): string {
  const played = mission ? `${t('campaign')} · ${mission.title[settings.lang]}` : t('skirmish');
  const map = s.setup && !mission ? `${t('mapCode')} ${seedToCode(s.setup.seed)}` : null;
  return [played, map].filter((part) => part !== null).join(' · ');
}

function endView(
  s: GameState,
  viewer: TeamId,
  shown: ScreenEnd,
  mission: Mission | undefined,
  { best, newBest }: { best: number | null; newBest: boolean },
  buttons: readonly EndButton[],
): EndView {
  return {
    outcome: shown.outcome,
    day: s.day,
    kicker: endKicker(s, mission),
    stats: endStatsVM(s, viewer),
    buildings: buildingShare(s, viewer),
    reasonText: reasonText(shown),
    score: s.settings.dayLimit ? endScoreVM(s, viewer) : null,
    mission: mission ? mission.title[settings.lang] : null,
    chart: armyChartVM(s, viewer),
    best,
    newBest,
    buttons: buttons.map((id) => ({ id, label: t(END_LABEL[id]) })),
  };
}

const nextMission = (mission: Mission): Mission | undefined => {
  const missions = campaignMissions();
  return missions[missions.findIndex((candidate) => candidate.id === mission.id) + 1];
};

function endButtonsFor(s: GameState, mission: Mission | undefined, outcome: EndOutcome, isOnline: boolean): EndButton[] {
  if (isOnline) return ['board', 'menu'];
  if (!mission) return rematchOf(s) ? ['another', 'rematch', 'board', 'menu'] : ['board', 'menu'];
  const next = outcome === 'won' && nextMission(mission) ? (['next'] as const) : [];
  return [...next, 'retry', 'board', 'menu'];
}

const missionStart = (mission: Mission): GameStart => ({
  start: 'new',
  match: { mode: 'mission', mission: mission.id, seed: randomSeed() },
});

/** «Otra escaramuza»: las mismas reglas, equipos y tamaño, en otro mapa. */
const anotherMap = (rematch: SkirmishConfig): SkirmishConfig => ({ ...rematch, map: { ...rematch.map, seed: randomSeed() } });

/** La partida que empieza ese boton (null: ninguna, se vuelve al menu). */
function startFor(s: GameState, mission: Mission | undefined, button: EndButton): GameStart | null {
  const rematch = rematchOf(s);
  const next = mission && nextMission(mission);
  if (button === 'another' && rematch) return { start: 'new', match: anotherMap(rematch) };
  if (button === 'rematch' && rematch) return { start: 'new', match: rematch };
  if (button === 'retry' && mission) return missionStart(mission);
  if (button === 'next' && next) return missionStart(next);
  return null;
}
