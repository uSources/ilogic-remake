/**
 * Pantalla de inicio del menu, el menu clasico de texto: la lista de lo que se juega (Continuar,
 * Campaña, Escaramuza, En línea), cada entrada con lo que hay detras en una linea; arriba, Novedades,
 * Aprender y Opciones, y abajo, Creditos y la web. Mientras se ve, pregunta como estan tus partidas en
 * linea («En línea» dice si te toca). Pide a la escena lo poco que usa (`HomeHost`).
 */
import type { MenuCommand } from '../controls/menu';
import type { GameState } from '../core/model';
import { campaignMissions, completedMissions, nextMissionIndex } from '../campaign';
import { ui, type HomeEntryVM, type UIActions } from '../hud/store';
import { WEB_URL } from '../layout';
import { openNotes } from '../patchNotes';
import { settings, t } from '../settings';
import { readOnlineRooms } from '../net/onlineRooms';
import { serverUrl } from '../net/serverUrl';
import { navGrid } from './nav';
import { onlineCardOf } from './online/roomLines';
import type { RoomWatch } from './online/roomWatch';

export interface HomeHost {
  /** La partida guardada, si la hay (la entrada Continuar). */
  readonly save: GameState | null;
  /** Ya se esta saliendo del menu: no hacer caso de mas ordenes. */
  readonly leaving: boolean;
  continueGame(): void;
  /** Escaramuza: la pantalla de partida nueva (alli se elige el mapa y las reglas y se empieza). */
  openSetup(): void;
  openCampaign(): void;
  openOnline(): void;
  /** Lo que dice el servidor de tus partidas en linea (la misma que mira «Jugar en línea»). */
  readonly onlineRooms: RoomWatch;
  openOptions(): void;
}

type HomeEntry = 'continue' | 'campaign' | 'skirmish' | 'online';
type HomeLink = 'news' | 'help' | 'options' | 'credits' | 'web';
type HomeChoice = HomeEntry | HomeLink;

/** Las pestañas de arriba (Jugar es esta pantalla) y los enlaces de abajo, en el orden en que se recorren. */
const TOP_LINKS: HomeLink[] = ['news', 'help', 'options'];
const FOOT_LINKS: HomeLink[] = ['credits', 'web'];

export class HomeScreen {
  focus: string = 'skirmish';

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

  /** Lo primero elegido al abrir el menu: seguir la partida guardada si la hay. */
  focusFirst(): void {
    this.focus = this.host.save ? 'continue' : 'campaign';
  }

  /**
   * Pasa a Inicio: se enseña y, si se puede jugar en linea y tienes partidas apuntadas, pregunta como
   * estan (sin ninguna, «En línea» no tiene nada que contar del servidor).
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
    ui.set({ home: { focus: this.focus, entries: this.entries(), credits: ui.get().home.credits } });
  }

  command(command: MenuCommand): void {
    if (ui.get().home.credits && (command.kind === 'back' || command.kind === 'ok')) return this.setCredits(false);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'options') return this.host.openOptions();
    if (command.kind !== 'move') return;
    this.focus = navGrid(this.rows(), this.focus, command.dx, command.dy);
    this.publish();
  }

  /** Arriba las pestañas, luego la lista (una entrada por fila) y abajo los enlaces. */
  private rows(): string[][] {
    return [TOP_LINKS, ...this.entries().map((entry) => [entry.id]), FOOT_LINKS];
  }

  private entries(): HomeEntryVM[] {
    const save = this.savedGameEntry();
    const online = this.onlineEntry();
    return [
      ...(save ? [save] : []),
      { id: 'campaign', title: t('campaign'), note: campaignNote(), urgent: false },
      { id: 'skirmish', title: t('skirmish'), note: t('homeSkirmishNote'), urgent: false },
      ...(online ? [online] : []),
    ];
  }

  /** Hay servidor de partidas por la red. */
  private canPlayOnline(): boolean {
    return serverUrl() !== null;
  }

  /** «En línea»: si te toca en alguna partida (y entonces pide jugar), cuantas hay en marcha o de que va. */
  private onlineEntry(): HomeEntryVM | null {
    if (!this.canPlayOnline()) return null;
    const rooms = this.host.onlineRooms;
    const card = onlineCardOf(readOnlineRooms(), (code) => rooms.lookOf(code));
    return { id: 'online', title: t('onlineCardTitle'), note: card.yourTurn ?? card.status, urgent: card.yourTurn !== null };
  }

  /** «Continuar», con lo que es la guardada: «Escaramuza · día 12» o la mision y su dia. */
  private savedGameEntry(): HomeEntryVM | null {
    const save = this.host.save;
    if (!save) return null;
    const day = t('homeDay').replace('{n}', String(save.day));
    return { id: 'continue', title: t('continueGame'), note: `${savedGameKind(save)} · ${day}`, urgent: false };
  }

  private setCredits(isShown: boolean): void {
    ui.set({ home: { ...ui.get().home, credits: isShown } });
  }

  private pick(): void {
    if (this.host.leaving) return;
    const choice = this.focus as HomeChoice;
    if (choice in this.choices) this.choices[choice]();
  }

  /** Lo que hace cada entrada y cada enlace al pulsarlo. */
  private readonly choices: Record<HomeChoice, () => void> = {
    continue: () => {
      if (this.host.save) this.host.continueGame();
    },
    campaign: () => this.host.openCampaign(),
    skirmish: () => this.host.openSetup(),
    online: () => this.host.openOnline(),
    news: () => openNotes(),
    help: () => ui.set({ help: true }),
    options: () => this.host.openOptions(),
    credits: () => this.setCredits(!ui.get().home.credits),
    web: () => void window.open(WEB_URL, '_blank', 'noopener'),
  };
}

/** De que es la partida guardada: el nombre de su mision o, si no es de la campaña, escaramuza. */
function savedGameKind(save: GameState): string {
  const savedMission = save.mission;
  if (!savedMission) return t('skirmish');
  const mission = campaignMissions().find((candidate) => candidate.id === savedMission.id);
  return mission?.title[settings.lang] ?? t('campaign');
}

/** Por donde va la campaña: «Misión 3 de 6», o que ya esta entera. */
function campaignNote(): string {
  const nextIndex = nextMissionIndex(completedMissions());
  if (nextIndex < 0) return t('allDone');
  return t('homeCampaignNote')
    .replace('{n}', String(nextIndex + 1))
    .replace('{total}', String(campaignMissions().length));
}
