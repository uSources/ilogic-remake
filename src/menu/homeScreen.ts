/**
 * Pantalla de inicio del menu: tarjetas (Continuar, Partida rapida, Personalizada, Campaña) y la fila
 * de abajo (Novedades, Ayuda, Opciones, Creditos, Web). Pide a la escena lo poco que usa (`HomeHost`).
 */
import type { MenuCommand } from '../controls/menu';
import { MISSIONS } from '../core/missions';
import { mapGrid } from '../core/mapGrid';
import type { GameState } from '../core/model';
import { completedMissions, missionUnlocked, nextMissionIndex } from '../campaign';
import { ui, type MarkVM, type UIActions } from '../hud/store';
import { WEB_URL } from '../layout';
import { openNotes } from '../patchNotes';
import { randomSeed, type NewGameOptions } from '../setup';
import { settings, t, type TextKey } from '../settings';
import { navGrid } from './nav';
import { mapThumb } from './thumb';

export interface HomeHost {
  /** La partida guardada, si la hay (tarjeta Continuar). */
  readonly save: GameState | null;
  readonly palette: number[];
  readonly options: NewGameOptions;
  /** Ya se esta saliendo del menu: no hacer caso de mas ordenes. */
  readonly leaving: boolean;
  missionThumb(index: number): string;
  continueGame(): void;
  startNew(seed: number): void;
  openSetup(): void;
  openCampaign(): void;
  openOptions(): void;
}

type HomeCard = 'continue' | 'quick' | 'custom' | 'campaign' | 'news' | 'help' | 'options' | 'credits' | 'web';

const FOOTER_ROW: HomeCard[] = ['news', 'help', 'options', 'credits', 'web'];

/** Como se ve cada mision en la tarjeta de la campaña: hecha, abierta o cerrada. */
function missionMarks(done: Set<string>): MarkVM[] {
  return MISSIONS.map((mission, index) => {
    if (done.has(mission.id)) return 'done';
    return missionUnlocked(index, done) ? 'open' : 'locked';
  });
}

/** "Normal · 32×32 · 30 dias": el ajuste elegido para la partida rapida. */
function quickSummary(options: NewGameOptions): string {
  const presetName = t(`preset${options.preset[0]!.toUpperCase()}${options.preset.slice(1)}` as TextKey);
  const dayLimit = options.dayLimit ? ` · ${options.dayLimit} ${t('days')}` : '';
  return `${presetName} · ${options.size}×${options.size}${dayLimit}`;
}

export class HomeScreen {
  focus = 'quick';

  constructor(private readonly host: HomeHost) {}

  actions(): Partial<UIActions> {
    return {
      homeHover: (id: string) => {
        this.focus = id;
        this.publish();
      },
      homePick: (id: string) => {
        this.focus = id;
        this.pick();
      },
    };
  }

  publish(): void {
    ui.set({
      home: {
        focus: this.focus,
        save: this.savedGameCard(),
        quick: quickSummary(this.host.options),
        campaign: this.campaignCard(),
        credits: ui.get().home.credits,
      },
    });
  }

  command(cmd: MenuCommand): void {
    if (ui.get().home.credits && (cmd.kind === 'back' || cmd.kind === 'ok')) return this.setCredits(false);
    if (cmd.kind === 'ok' && !cmd.repeat) return this.pick();
    if (cmd.kind === 'options') return this.host.openOptions();
    if (cmd.kind !== 'move') return;
    this.focus = navGrid(this.rows(), this.focus, cmd.dx, cmd.dy);
    this.publish();
  }

  private rows(): HomeCard[][] {
    if (this.host.save) return [['continue', 'quick', 'campaign'], ['continue', 'custom', 'campaign'], FOOTER_ROW];
    return [['quick', 'campaign'], ['custom', 'campaign'], FOOTER_ROW];
  }

  private savedGameCard() {
    const save = this.host.save;
    if (!save) return null;
    const savedMission = save.mission;
    const mission = savedMission ? (MISSIONS.find((candidate) => candidate.id === savedMission.id)?.title[settings.lang] ?? null) : null;
    return {
      thumb: mapThumb(save, this.host.palette, { units: 'own' }),
      day: save.day,
      funds: save.funds[0],
      size: mapGrid(save).width,
      mission,
      limit: save.rules.dayLimit,
    };
  }

  private campaignCard() {
    const done = completedMissions();
    const marks = missionMarks(done);
    const nextIndex = nextMissionIndex(done);
    const next = nextIndex >= 0 ? MISSIONS[nextIndex]! : null;
    return {
      done: marks.filter((mark) => mark === 'done').length,
      total: MISSIONS.length,
      next: next ? `${nextIndex + 1}. ${next.title[settings.lang]}` : null,
      thumb: next ? this.host.missionThumb(nextIndex) : null,
      marks,
    };
  }

  private setCredits(isShown: boolean): void {
    ui.set({ home: { ...ui.get().home, credits: isShown } });
  }

  private pick(): void {
    if (this.host.leaving) return;
    switch (this.focus as HomeCard) {
      case 'continue':
        if (this.host.save) this.host.continueGame();
        return;
      case 'quick':
        return this.host.startNew(randomSeed());
      case 'custom':
        return this.host.openSetup();
      case 'campaign':
        return this.host.openCampaign();
      case 'news':
        return openNotes();
      case 'help':
        return ui.set({ help: true });
      case 'options':
        return this.host.openOptions();
      case 'credits':
        return this.setCredits(!ui.get().home.credits);
      case 'web':
        window.open(WEB_URL, '_blank', 'noopener');
        return;
      default:
        return;
    }
  }
}
