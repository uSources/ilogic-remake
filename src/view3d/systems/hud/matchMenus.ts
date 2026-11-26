/**
 * La pausa de la partida 3D (seguir, ver amenaza y ordenes, opciones, ayuda, salir guardando,
 * rendirse), con «Cómo va» la partida. Rendirse pide pulsar dos veces (y salir, si no se guarda). Con
 * la pausa abierta, el teclado es suyo (es un KeyPanel, systems/input/keyInput.ts): sus opciones y sus
 * atajos, nada del mapa. Por la red no se guarda aqui: la partida se sigue desde el servidor. La
 * pantalla del final, en matchEnd.ts.
 */
import { missionById } from '../../../core/missions';
import { canBeLost, gameModeOf } from '../../../core/modes';
import type { GameState, Pos, TeamId } from '../../../core/model';
import type { InputCommand } from '../../../controls/inputCommands';
import { REBINDABLE_KEYS, type KeyBindingId } from '../../../controls/keyboard';
import type { MenuCommand, MenuContext } from '../../../controls/menu';
import type { GameSession } from '../../../core/session';
import { objectiveText } from '../../../campaign';
import { keyLabelOf } from '../../../hud/keyLabels';
import { showToast, ui, type MenuItemVM } from '../../../hud/store';
import { navGrid } from '../../../menu/nav';
import { settings, t, type TextKey } from '../../../settings';
import { seedToCode } from '../../../setup';
import { standingVM } from '../../../ui/hudModels';
import { backToMenu } from '../../app/gameStart';
import type { MenuView } from '../turn/turnControls';

/**
 * Las opciones de la pausa, en el orden en que salen (el lienzo «Todo en estilo C», «Pausa en la
 * partida»). Terminar el turno no esta: su boton y su tecla ya estan siempre en la partida.
 */
type PauseChoice = 'resume' | 'threat' | 'intents' | 'options' | 'help' | 'quit' | 'surrender';
const PAUSE_CHOICES: readonly PauseChoice[] = ['resume', 'threat', 'intents', 'options', 'help', 'quit', 'surrender'];
/**
 * La orden del mapa que hace lo mismo que la opcion: con la pausa abierta, su tecla (la que tenga el
 * jugador) la elige, y se enseña a su lado.
 */
const PAUSE_SHORTCUTS: Partial<Record<PauseChoice, KeyBindingId>> = {
  resume: 'cancel',
  threat: 'threat',
  intents: 'intents',
  options: 'options',
  help: 'help',
};
/** Lo que no se deshace: en rojo y aparte (TextEntry, `danger`). */
const DANGEROUS_CHOICES: readonly PauseChoice[] = ['surrender'];
/** Lo que se dice debajo de una opcion. */
const PAUSE_NOTES: Partial<Record<PauseChoice, TextKey>> = { surrender: 'surrenderNote' };
/** Lo que hay para pulsar otra vez y confirmar (milisegundos). */
const CONFIRM_MS = 2500;

/** Lo que el menu de pausa le pide a la partida. */
export interface PauseHost {
  readonly session: GameSession;
  readonly viewer: TeamId;
  /** La partida se puede guardar en esta pantalla (por la red, no). */
  readonly savesHere: boolean;
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
    if (command.kind === 'move') return this.move(command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'back') this.close();
  }

  /** Una orden del mapa que es el atajo de una opcion (T, V, O, H... o las que tenga el jugador) la elige. */
  shortcut(command: InputCommand): boolean {
    const choice = this.choices().find((candidate) => isShortcutFor(candidate, command));
    if (choice) this.choose(choice);
    return choice !== undefined;
  }

  /** Las opciones van una debajo de otra: solo cuentan arriba y abajo. */
  private move(dy: number): void {
    const choices = this.choices();
    const next = navGrid(
      choices.map((choice) => [choice]),
      choices[this.selected] ?? 'resume',
      0,
      dy,
    );
    this.hover(choices.findIndex((choice) => choice === next));
  }

  /** Las opciones en esta partida: rendirse si se puede perder y «Ver órdenes» si alguna unidad lleva una. */
  private choices(): PauseChoice[] {
    const isOffered: Partial<Record<PauseChoice, boolean>> = {
      surrender: canBeLost(gameModeOf(this.host.session.state)),
      intents: this.host.hasOrders(),
    };
    return PAUSE_CHOICES.filter((choice) => isOffered[choice] !== false);
  }

  /**
   * Al salir de la pagina la partida se guarda sola (`keepSaved`) si se guarda en esta pantalla: salir
   * no pierde nada y se dice. Si no (por la red, o un modo que no se guarda), salir pide confirmarlo.
   */
  private savesOnQuit(): boolean {
    return gameModeOf(this.host.session.state).saves && this.host.savesHere;
  }

  private choose(choice: PauseChoice): void {
    const { host } = this;
    switch (choice) {
      case 'resume':
        return this.close();
      case 'threat':
        host.toggleThreat();
        return this.close();
      case 'intents':
        host.toggleIntents();
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
        if (this.savesOnQuit()) return backToMenu();
        return this.confirmTwice('quit', 'confirmQuit', backToMenu);
      default:
        return choice satisfies never;
    }
  }

  /** El texto de cada opcion; los interruptores dicen lo que haran (ver u ocultar). */
  private labelOf(choice: PauseChoice): string {
    if (choice === 'threat') return t(this.host.isThreatOn() ? 'threatOn' : 'threatOff');
    if (choice === 'intents') return t(this.host.isIntentsOn() ? 'intentsOn' : 'intentsOff');
    if (choice === 'quit' && this.savesOnQuit()) return t('saveAndQuit');
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
    const { viewer } = this.host;
    const items: MenuItemVM[] = this.choices().map((choice) => ({
      id: choice,
      label: this.labelOf(choice),
      hint: shortcutLabel(choice),
      danger: DANGEROUS_CHOICES.includes(choice),
      detail: noteOf(choice),
    }));
    return {
      kind: 'game',
      title: t('pause'),
      subtitle: pauseKicker(s),
      info: missionObjective(s, viewer),
      standing: standingVM(s, viewer),
      items,
      selected: this.selected,
      at,
    };
  }
}

/** La tecla que se enseña junto a una opcion, si tiene atajo. */
function shortcutLabel(choice: PauseChoice): string | undefined {
  const binding = PAUSE_SHORTCUTS[choice];
  return binding && keyLabelOf(binding);
}

function noteOf(choice: PauseChoice): string | undefined {
  const note = PAUSE_NOTES[choice];
  return note && t(note);
}

function isShortcutFor(choice: PauseChoice, command: InputCommand): boolean {
  const binding = PAUSE_SHORTCUTS[choice];
  return binding !== undefined && REBINDABLE_KEYS[binding].command.kind === command.kind;
}

/** Encima del titulo: que se juega (la mision o una escaramuza), el dia y el mapa (para volver a jugarlo). */
function pauseKicker(s: GameState): string {
  const mission = s.mission ? missionById(s.content, s.mission.id) : undefined;
  const played = mission ? mission.title[settings.lang] : gameModeOf(s).id === 'skirmish' ? t('skirmish') : null;
  const day = `${t('day')} ${s.day}${s.settings.dayLimit ? ` / ${s.settings.dayLimit}` : ''}`;
  const map = s.setup ? `${t('mapCode')} ${seedToCode(s.setup.seed)} · ${s.setup.size}×${s.setup.size}` : null;
  return [played, day, map].filter((part) => part !== null).join(' · ');
}

/** En una mision, su objetivo. */
function missionObjective(s: GameState, viewer: TeamId): string[] {
  const mission = s.mission ? missionById(s.content, s.mission.id) : undefined;
  return mission ? [objectiveText(mission, { s, team: viewer })] : [];
}
