/**
 * Los menus de la partida 3D que no son del tablero: el de pausa (seguir, terminar turno, guardar,
 * opciones, ayuda, rendirse, salir) y la pantalla del final (resumen y botones: revancha, nueva,
 * siguiente mision...). Rendirse y salir piden pulsar dos veces. Con la pausa abierta, el teclado es
 * suyo (es un KeyPanel, systems/input/keyInput.ts): sus opciones y sus atajos, nada del mapa. Por
 * la red no se guarda aqui (la partida se sigue desde el servidor) y el final solo vuelve al menu
 * (la revancha seria otra sala).
 */
import { missionById, type Mission } from '../../../core/missions';
import { canBeLost, gameModeOf } from '../../../core/modes';
import { rematchOf } from '../../../core/match';
import { decidingFall, isDefeatReason, outcomeFor } from '../../../core/rules';
import type { EndReason, GameState, Pos, TeamId } from '../../../core/model';
import type { InputCommand } from '../../../controls/inputCommands';
import { REBINDABLE_KEYS, type KeyBindingId } from '../../../controls/keyboard';
import type { MenuCommand, MenuContext } from '../../../controls/menu';
import { screenEnd, type GameSession, type PersonEnd } from '../../../core/session';
import { serialize } from '../../../core/save';
import { bestDays, campaignMissions, markCompleted, objectiveText } from '../../../campaign';
import { keyLabelOf } from '../../../hud/keyLabels';
import { showToast, ui, type EndOutcome, type MenuItemVM } from '../../../hud/store';
import { navGrid } from '../../../menu/nav';
import { settings, t, type TextKey } from '../../../settings';
import { randomSeed, seedToCode } from '../../../setup';
import { deleteSave, writeSave } from '../../../storage';
import { armyChartVM, endScoreVM, endStatsVM } from '../../../ui/hudModels';
import { sideOf, type Side } from '../../../ui/sides';
import { backToMenu, startGame, type GameStart } from '../../app/gameStart';
import type { MenuView } from '../turn/turnControls';

type PauseChoice = 'resume' | 'endTurn' | 'threat' | 'intents' | 'save' | 'options' | 'help' | 'surrender' | 'quit';
const PAUSE_CHOICES: readonly PauseChoice[] = ['resume', 'endTurn', 'threat', 'intents', 'save', 'options', 'help', 'surrender', 'quit'];
/**
 * La orden del mapa que hace lo mismo que la opcion: con la pausa abierta, su tecla (la que tenga el
 * jugador) la elige, y se enseña a su lado.
 */
const PAUSE_SHORTCUTS: Partial<Record<PauseChoice, KeyBindingId>> = {
  resume: 'cancel',
  endTurn: 'endTurn',
  threat: 'threat',
  intents: 'intents',
  options: 'options',
  help: 'help',
};
/** Las que se apartan abajo, en su fila (Pause.tsx). */
const DANGEROUS_CHOICES: readonly PauseChoice[] = ['surrender', 'quit'];
/** Columnas de la rejilla de las demas (pause.css, `.pause-grid`); la primera va a todo lo ancho. */
const PAUSE_COLUMNS = 2;
/** Lo que hay para pulsar otra vez y confirmar (milisegundos). */
const CONFIRM_MS = 2500;

/** Lo que el menu de pausa le pide a la partida. */
export interface PauseHost {
  readonly session: GameSession;
  readonly viewer: TeamId;
  /** La partida se puede guardar en esta pantalla (por la red, no). */
  readonly savesHere: boolean;
  endTurn(): void;
  /** Rendirse (lo hace quien lleva la partida) y enseñar el final. */
  surrender(): void;
  openOptions(): void;
  /** Ver amenaza y ver ordenes (sin sitio fijo en pantalla: la pausa, T y V). */
  toggleThreat(): void;
  toggleIntents(): void;
  isThreatOn(): boolean;
  isIntentsOn(): boolean;
  /** Alguna unidad propia lleva orden (si no, «Ver órdenes» no sale). */
  hasOrders(): boolean;
  /** Juegan los demas: lo que se hace en el turno propio (terminarlo, guardar) no sale. */
  isWatching(): boolean;
  /** Se ha abierto, cerrado o cambiado: volver a publicar la interfaz. */
  refresh(): void;
}

export class PauseMenu {
  private opened = false;
  private selected = 0;
  private armedAt: Partial<Record<PauseChoice, number>> = {};

  constructor(private readonly host: PauseHost) {}

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.opened = true;
    this.selected = 0;
    this.host.refresh();
  }

  close(): void {
    this.opened = false;
    this.host.refresh();
  }

  hover(index: number): void {
    this.selected = index;
    this.host.refresh();
  }

  pick(index = this.selected): void {
    const choice = this.choices()[index];
    if (choice) this.choose(choice);
  }

  /** Que teclas valen con la pausa abierta (MENU_BINDINGS.pause); sus atajos, en `shortcut`. */
  context(): MenuContext {
    return 'pause';
  }

  /** Las flechas recorren las opciones como se ven, Enter elige la señalada y Esc cierra. */
  command(command: MenuCommand): void {
    if (command.kind === 'move') return this.move(command.dx, command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'back') this.close();
  }

  /** Una orden del mapa que es el atajo de una opcion (E, T, V, H... o las que tenga el jugador) la elige. */
  shortcut(command: InputCommand): boolean {
    const choice = this.choices().find((candidate) => isShortcutFor(candidate, command));
    if (choice) this.choose(choice);
    return choice !== undefined;
  }

  private move(dx: number, dy: number): void {
    const choices = this.choices();
    const next = navGrid(pauseRows(choices), choices[this.selected] ?? 'resume', dx, dy);
    this.hover(choices.findIndex((choice) => choice === next));
  }

  /**
   * Las opciones en esta partida: guardar si su modo se guarda, rendirse si se puede perder. Mirando
   * jugar a los demas, ni terminar el turno ni guardar (a medias del turno de otro); rendirse si
   * (vale en cualquier momento: `anyTime`).
   */
  private choices(): PauseChoice[] {
    const mode = gameModeOf(this.host.session.state);
    const isOwnTurn = !this.host.isWatching();
    const isOffered: Partial<Record<PauseChoice, boolean>> = {
      endTurn: isOwnTurn,
      save: mode.saves && this.host.savesHere && isOwnTurn,
      surrender: canBeLost(mode),
      intents: this.host.hasOrders(),
    };
    return PAUSE_CHOICES.filter((choice) => isOffered[choice] !== false);
  }

  private choose(choice: PauseChoice): void {
    const { host } = this;
    switch (choice) {
      case 'resume':
        return this.close();
      case 'endTurn':
        this.close();
        return host.endTurn();
      case 'threat':
        host.toggleThreat();
        return this.close();
      case 'intents':
        host.toggleIntents();
        return this.close();
      case 'save':
        if (saveGame(host.session.state)) showToast(t('saved'));
        return this.close();
      case 'options':
        return host.openOptions();
      case 'help':
        this.close();
        return ui.set({ help: true });
      case 'surrender':
        // Acaba la partida sin pasar por los turnos: su final, ya.
        return this.confirmTwice('surrender', 'confirmSurrender', () => {
          this.close();
          host.surrender();
        });
      case 'quit':
        return this.confirmTwice('quit', 'confirmQuit', backToMenu);
      default:
        return choice satisfies never;
    }
  }

  /** El texto de cada opcion; los interruptores dicen lo que haran (ver u ocultar). */
  private labelOf(choice: PauseChoice): string {
    if (choice === 'threat') return t(this.host.isThreatOn() ? 'threatOn' : 'threatOff');
    if (choice === 'intents') return t(this.host.isIntentsOn() ? 'intentsOn' : 'intentsOff');
    return t(choice);
  }

  /** La primera pulsacion avisa; la segunda, si llega a tiempo, lo hace. */
  private confirmTwice(choice: PauseChoice, warning: TextKey, run: () => void): void {
    const now = performance.now();
    if (now - (this.armedAt[choice] ?? -Infinity) < CONFIRM_MS) return run();
    this.armedAt[choice] = now;
    showToast(t(warning));
  }

  /** El menu de pausa para la interfaz (null si esta cerrado); `at`, la casilla junto a la que se ancla. */
  view(at: Pos): MenuView | null {
    if (!this.opened) return null;
    const s = this.host.session.state;
    const items: MenuItemVM[] = this.choices().map((choice) => ({
      id: choice,
      label: this.labelOf(choice),
      hint: shortcutLabel(choice),
      danger: DANGEROUS_CHOICES.includes(choice),
    }));
    return { kind: 'game', title: dayTitle(s), info: pauseInfo(s, this.host.viewer), items, selected: this.selected, at };
  }
}

/** La tecla que se enseña junto a una opcion, si tiene atajo. */
function shortcutLabel(choice: PauseChoice): string | undefined {
  const binding = PAUSE_SHORTCUTS[choice];
  return binding && keyLabelOf(binding);
}

function isShortcutFor(choice: PauseChoice, command: InputCommand): boolean {
  const binding = PAUSE_SHORTCUTS[choice];
  return binding !== undefined && REBINDABLE_KEYS[binding].command.kind === command.kind;
}

/** Las opciones en filas, como las pinta Pause.tsx: la primera a todo lo ancho, el resto de dos en dos y las peligrosas aparte. */
function pauseRows(choices: readonly PauseChoice[]): PauseChoice[][] {
  const [first, ...rest] = choices.filter((choice) => !DANGEROUS_CHOICES.includes(choice));
  const wide: PauseChoice[][] = first ? [Array.from({ length: PAUSE_COLUMNS }, () => first)] : [];
  const grid = Array.from({ length: Math.ceil(rest.length / PAUSE_COLUMNS) }, (_row, row) =>
    rest.slice(row * PAUSE_COLUMNS, (row + 1) * PAUSE_COLUMNS),
  );
  const dangerous = choices.filter((choice) => DANGEROUS_CHOICES.includes(choice));
  return [...wide, ...grid, dangerous].filter((row) => row.length > 0);
}

function dayTitle(s: GameState): string {
  return `${t('day')} ${s.day}${s.settings.dayLimit ? ` / ${s.settings.dayLimit}` : ''}`;
}

/** Codigo del mapa (para volver a jugarlo) y, en una mision, su objetivo. */
function pauseInfo(s: GameState, viewer: TeamId): string[] {
  const code = s.setup ? [`${t('mapCode')}: ${seedToCode(s.setup.seed)} · ${s.setup.size}×${s.setup.size}`] : [];
  const mission = s.mission ? missionById(s.content, s.mission.id) : undefined;
  const objective = mission ? [`${mission.title[settings.lang]}: ${objectiveText(mission, { s, team: viewer })}`] : [];
  return [...code, ...objective];
}

/** Guarda la partida (si su modo se guarda); false si no se ha podido. */
export function saveGame(s: GameState): boolean {
  return gameModeOf(s).saves && writeSave(serialize(s));
}

// ---- Final ----

type EndButton = 'rematch' | 'new' | 'menu' | 'next' | 'retry';
const END_LABEL: Readonly<Record<EndButton, TextKey>> = {
  rematch: 'endRematch',
  new: 'newGame',
  menu: 'endMenu',
  next: 'endNext',
  retry: 'endRetry',
};

const REASON_TEXT: { readonly [Reason in Exclude<EndReason, 'surrender'>]: TextKey } = {
  hq: 'endHq',
  wipeout: 'endWipeout',
  days: 'endDays',
  objective: 'endObjective',
};
/** Quien se rindio, para quien mira: el, un aliado o un enemigo. */
const SURRENDER_BY: { readonly [Who in Side]: TextKey } = { own: 'endSurrender', ally: 'endAllySurrender', enemy: 'endEnemySurrender' };

/** Como acaba para quien mira: ganada, perdida o empate, y por que (si fue una caida, de quien para el). */
interface ScreenEnd {
  outcome: EndOutcome;
  reason: EndReason;
  fallenBy?: Side;
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

const nextMission = (mission: Mission): Mission | undefined => {
  const missions = campaignMissions();
  return missions[missions.findIndex((candidate) => candidate.id === mission.id) + 1];
};

function endButtonsFor(mission: Mission | undefined, outcome: EndOutcome, isOnline: boolean): EndButton[] {
  if (isOnline) return ['menu'];
  if (!mission) return ['rematch', 'new', 'menu'];
  if (outcome !== 'won') return ['retry', 'menu'];
  return nextMission(mission) ? ['next', 'retry', 'menu'] : ['retry', 'menu'];
}

const missionStart = (mission: Mission): GameStart => ({
  start: 'new',
  match: { mode: 'mission', mission: mission.id, seed: randomSeed() },
});

/**
 * La pantalla del final para quien mira, si la partida se ha acabado para el (true si se ha
 * enseñado). Apunta la mision ganada y borra el guardado de esta partida (por la red, `isOnline`,
 * el guardado de esta pantalla es de otra partida: no se toca).
 */
export function showEndIfOver(session: GameSession, viewer: TeamId, isOnline = false): boolean {
  const end = screenEnd(session, viewer);
  if (!end) return false;
  const s = session.state;
  const shown = screenEndFor(s, end, viewer);
  const mission = s.mission ? missionById(s.content, s.mission.id) : undefined;
  const won = shown.outcome === 'won';
  const bestBefore = mission ? bestDays(mission.id) : null;
  if (mission && won) markCompleted(mission.id, s.day);
  if (!isOnline) deleteSave();
  const buttons = endButtonsFor(mission, shown.outcome, isOnline);
  ui.set({
    screen: 'end',
    menu: null,
    toast: null,
    forecast: null,
    tile: null,
    end: {
      outcome: shown.outcome,
      day: s.day,
      stats: endStatsVM(s, viewer),
      reasonText: reasonText(shown),
      score: endScoreVM(s, viewer),
      mission: mission ? mission.title[settings.lang] : null,
      chart: armyChartVM(s, viewer),
      best: mission ? (won ? bestDays(mission.id) : bestBefore) : null,
      newBest: !!mission && won && (bestBefore === null || s.day < bestBefore),
      buttons: buttons.map((id) => ({ id, label: t(END_LABEL[id]) })),
      selected: 0,
    },
  });
  Object.assign(ui.actions, {
    endHover: (index: number) => {
      const shownEnd = ui.get().end;
      if (shownEnd) ui.set({ end: { ...shownEnd, selected: index } });
    },
    endPick: (index: number) => pickEnd(s, mission, buttons[index]),
  });
  return true;
}

function pickEnd(s: GameState, mission: Mission | undefined, button: EndButton | undefined): void {
  const rematch = rematchOf(s);
  const sameGame: GameStart | null = rematch ? { start: 'new', match: rematch } : null;
  const next = mission ? nextMission(mission) : undefined;
  const start: GameStart | null =
    button === 'rematch'
      ? sameGame
      : button === 'retry'
        ? mission
          ? missionStart(mission)
          : sameGame
        : button === 'next' && next
          ? missionStart(next)
          : null;
  if (start) return startGame(start);
  // «Nueva» y «Menu» vuelven al menu principal.
  backToMenu();
}
