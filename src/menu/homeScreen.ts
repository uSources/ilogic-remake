/**
 * Pantalla de inicio del menu: tarjetas (Continuar, Nueva partida, En línea, Campaña) y la fila de
 * abajo (Novedades, Ayuda, Opciones, Creditos, Web). Mientras se ve, pregunta como estan tus partidas
 * en linea (la tarjeta «En línea» dice si te toca). Pide a la escena lo poco que usa (`HomeHost`).
 */
import type { TerrainPalette } from '../ui/terrainColors';
import type { MenuCommand } from '../controls/menu';
import { mapGrid } from '../core/mapGrid';
import { playerTeam, teamState } from '../core/teams';
import type { GameState } from '../core/model';
import { campaignMissions, completedMissions, missionUnlocked, nextMissionIndex } from '../campaign';
import { ui, type MarkVM, type UIActions } from '../hud/store';
import { WEB_URL } from '../layout';
import { openNotes } from '../patchNotes';
import { randomSeed, type NewGameOptions } from '../setup';
import { settings, t, type TextKey } from '../settings';
import { readOnlineRooms } from '../net/onlineRooms';
import { serverUrl } from '../net/serverUrl';
import { navGrid } from './nav';
import { onlineCardOf } from './online/roomLines';
import type { RoomWatch } from './online/roomWatch';
import { mapThumb } from './thumb';

export interface HomeHost {
  /** La partida guardada, si la hay (tarjeta Continuar). */
  readonly save: GameState | null;
  readonly palette: TerrainPalette;
  readonly options: NewGameOptions;
  /** Ya se esta saliendo del menu: no hacer caso de mas ordenes. */
  readonly leaving: boolean;
  missionThumb(index: number): string;
  continueGame(): void;
  startNew(seed: number): void;
  openSetup(): void;
  openCampaign(): void;
  openOnline(): void;
  /** Lo que dice el servidor de tus partidas en linea (la misma que mira «Jugar en línea»). */
  readonly onlineRooms: RoomWatch;
  openOptions(): void;
}

type HomeCard = 'continue' | 'quick' | 'custom' | 'online' | 'campaign' | 'news' | 'help' | 'options' | 'credits' | 'web';

const FOOTER_ROW: HomeCard[] = ['news', 'help', 'options', 'credits', 'web'];

/** Lo que tiene el foco en cada fila de una tarjeta: Nueva partida tiene dos botones; las demas, uno que ocupa las dos. */
type CardColumn = [top: HomeCard, bottom: HomeCard];

/** Como se ve cada mision en la tarjeta de la campaña: hecha, abierta o cerrada. */
function missionMarks(done: Set<string>): MarkVM[] {
  return campaignMissions().map((mission, index) => {
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

  /**
   * Pasa a Inicio: se enseña y, si se puede jugar en linea y tienes partidas apuntadas, pregunta como
   * estan (sin ninguna, la tarjeta no tiene nada que contar del servidor).
   */
  open(): void {
    if (this.canPlayOnline() && readOnlineRooms().length > 0) this.host.onlineRooms.start(() => this.publish());
    this.publish();
  }

  /** Se sale de Inicio: nada queda preguntando por las partidas en linea. */
  close(): void {
    this.host.onlineRooms.stop();
  }

  publish(): void {
    ui.set({
      home: {
        focus: this.focus,
        save: this.savedGameCard(),
        quick: quickSummary(this.host.options),
        online: this.onlineCard(),
        campaign: this.campaignCard(),
        credits: ui.get().home.credits,
      },
    });
  }

  command(command: MenuCommand): void {
    if (ui.get().home.credits && (command.kind === 'back' || command.kind === 'ok')) return this.setCredits(false);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'options') return this.host.openOptions();
    if (command.kind !== 'move') return;
    this.focus = navGrid(this.rows(), this.focus, command.dx, command.dy);
    this.publish();
  }

  /** Hay servidor de partidas por la red. */
  private canPlayOnline(): boolean {
    return serverUrl() !== null;
  }

  /** Las tarjetas lado a lado, cada una en dos filas (`CardColumn`), y debajo el pie. */
  private rows(): HomeCard[][] {
    const cards: CardColumn[] = [];
    if (this.host.save) cards.push(['continue', 'continue']);
    cards.push(['quick', 'custom']);
    if (this.canPlayOnline()) cards.push(['online', 'online']);
    cards.push(['campaign', 'campaign']);
    return [cards.map(([top]) => top), cards.map(([, bottom]) => bottom), FOOTER_ROW];
  }

  private onlineCard() {
    if (!this.canPlayOnline()) return null;
    const rooms = this.host.onlineRooms;
    return onlineCardOf(readOnlineRooms(), (code) => rooms.lookOf(code));
  }

  private savedGameCard() {
    const save = this.host.save;
    if (!save) return null;
    const savedMission = save.mission;
    const mission = savedMission
      ? (campaignMissions().find((candidate) => candidate.id === savedMission.id)?.title[settings.lang] ?? null)
      : null;
    return {
      thumb: mapThumb(save, this.host.palette, { units: 'own' }),
      day: save.day,
      funds: teamState(save, playerTeam(save)).funds,
      size: mapGrid(save).width,
      mission,
      limit: save.settings.dayLimit,
    };
  }

  private campaignCard() {
    const done = completedMissions();
    const marks = missionMarks(done);
    const nextIndex = nextMissionIndex(done);
    const next = nextIndex >= 0 ? campaignMissions()[nextIndex]! : null;
    return {
      done: marks.filter((mark) => mark === 'done').length,
      total: campaignMissions().length,
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
      case 'online':
        return this.host.openOnline();
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
