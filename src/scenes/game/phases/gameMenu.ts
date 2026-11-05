/** Fase 'gameMenu': el menu de pausa (seguir, terminar turno, guardar, repetir, opciones...). */
import { missionById } from '../../../core/missions';
import { objectiveText } from '../../../campaign';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { settings, t, type TextKey } from '../../../settings';
import { seedToCode } from '../../../setup';
import type { MenuInput, MenuModel } from '../menuModel';
import { CONFIRM_MS, GAME_MENU, type GameMenuKey } from '../types';
import type { PhaseHandler } from './phase';

/** Lo que el menu de pausa necesita de la escena. */
export interface GameMenuHost {
  /** Instante de la escena (ms), para las confirmaciones con dos pulsaciones. */
  readonly now: number;
  readonly canReplay: boolean;
  toMap(): void;
  openOptions(): void;
  showHelp(): void;
  /** Guardar la partida; false si no se ha podido. */
  saveGame(): boolean;
  endTurn(): void;
  replayOthers(): void;
  surrender(): void;
  quitToMenu(): void;
}

/** Atajo de teclado que se enseña junto a la opcion. */
const MENU_KEY_HINT: Partial<Record<GameMenuKey, string>> = { endTurn: 'E', resume: 'Esc', help: 'H', options: 'O' };

/** Lo que hace cada opcion del menu de pausa. Rendirse y salir piden pulsar dos veces. */
export class GameMenuChoices {
  private armedAt: Partial<Record<'surrender' | 'quit', number>> = {};

  constructor(private readonly host: GameMenuHost) {}

  /** Partida nueva. */
  reset(): void {
    this.armedAt = {};
  }

  choose(choice: GameMenuKey): void {
    const host = this.host;
    switch (choice) {
      case 'options':
        return host.openOptions();
      case 'resume':
        return host.toMap();
      case 'help':
        host.toMap();
        return host.showHelp();
      case 'save':
        if (host.saveGame()) showToast(t('saved'));
        return host.toMap();
      case 'endTurn':
        return host.endTurn();
      case 'replay':
        if (!host.canReplay) return showToast(t('noReplay'));
        return host.replayOthers();
      case 'surrender':
        return this.confirmTwice('surrender', 'confirmSurrender', () => host.surrender());
      case 'quit':
        // [CAMBIO] en el original Esc abandonaba la partida al instante, sin confirmar.
        return this.confirmTwice('quit', 'confirmQuit', () => host.quitToMenu());
    }
  }

  /** La primera pulsacion avisa; la segunda, si llega a tiempo, lo hace. */
  private confirmTwice(choice: 'surrender' | 'quit', warning: TextKey, run: () => void): void {
    const now = this.host.now;
    if (now - (this.armedAt[choice] ?? -Infinity) < CONFIRM_MS) return run();
    this.armedAt[choice] = now;
    showToast(t(warning));
  }
}

export const gameMenuPhase: PhaseHandler = {
  enter: (host) => {
    if (host.phase !== 'map' && host.phase !== 'gameMenu') host.abandonSelection();
    host.menuSel = 0;
    host.phase = 'gameMenu';
    host.refresh();
  },
  accept: (host) => {
    const choice = GAME_MENU[host.menuSel];
    if (choice) host.gameMenu.choose(choice);
  },
  back: (host) => host.toMap(),
  menu: gameMenuModel,
};

function gameMenuModel(input: MenuInput): MenuModel {
  const s = input.s;
  const items: MenuItemVM[] = GAME_MENU.map((choice) => ({
    id: choice,
    label: t(choice as TextKey),
    hint: MENU_KEY_HINT[choice],
    danger: choice === 'quit' || choice === 'surrender',
    disabled: choice === 'replay' && !input.canReplay,
  }));
  const dayLimit = s.rules.dayLimit ? ` / ${s.rules.dayLimit}` : '';
  // Codigo del mapa, para volver a jugarlo (Nueva partida > Codigo del mapa).
  const subtitle = s.setup ? `${t('mapCode')}: ${seedToCode(s.setup.seed)} · ${s.setup.size}×${s.setup.size}` : undefined;
  const mission = s.mission ? missionById(s.mission.id) : undefined;
  const info = mission ? [`${mission.title[settings.lang]}: ${objectiveText(mission, s)}`] : undefined;
  return { kind: 'game', title: `${t('day')} ${s.day}${dayLimit}`, subtitle, info, items, at: input.cursor };
}
