/**
 * Pantalla de la campaña: el camino de misiones (hechas, la siguiente y las cerradas, que no se pueden
 * elegir), «Volver» y la ficha de la elegida. Pide a la escena lo poco que usa (`CampaignHost`).
 */
import type { TerrainPalette } from '../ui/terrainColors';
import { listStep, type MenuCommand } from '../controls/menu';
import { createMatch } from '../core/defaultGames';
import type { Mission } from '../core/missions';
import type { ObjectiveKind } from '../core/objectives';
import {
  bestDays,
  campaignMissions,
  completedMissions,
  missionUnlocked,
  nextMissionIndex,
  objectiveText,
  playerObjective,
} from '../campaign';
import { ui, type CampaignItemVM, type MarkVM, type UIActions } from '../hud/store';
import { settings, t, type TextKey } from '../settings';
import { mapThumb } from './thumb';

export interface CampaignHost {
  readonly palette: TerrainPalette;
  /** Ya se esta saliendo del menu: no empezar otra mision. */
  readonly leaving: boolean;
  toHome(): void;
  startMission(mission: Mission): void;
}

/** Nombre corto del tipo de objetivo, para la lista. */
const OBJECTIVE_KIND_LABEL: Record<ObjectiveKind, TextKey> = {
  hq: 'objHq',
  survive: 'objSurvive',
  capture: 'objCapture',
  destroy: 'objDestroy',
  escort: 'objEscort',
};

/** Tamaño de casilla (pixeles) de las miniaturas de las misiones. */
const MISSION_THUMB_PX = 6;
/** Semilla de los dados de la partida que solo se dibuja en miniatura (no se juega: da igual cual). */
const THUMB_SEED = 0;

/** Lo que se puede señalar en la lista: una mision abierta (su indice) o «Volver». */
type CampaignStop = number | 'back';

/** Lo que dice cada mision debajo de su nombre, despues de su objetivo: «hecha en 9 días», «la siguiente»... */
function statusNote(status: MarkVM, best: number | null): string {
  if (status === 'open') return t('missionNext');
  if (status === 'locked') return t('missionLocked');
  return best === null ? t('missionDone') : t('missionDoneIn').replace('{n}', String(best));
}

export class CampaignScreen {
  private selected = 0;
  /** «Volver» señalado (la ficha sigue con la ultima mision elegida). */
  private onBack = false;
  /** Miniaturas ya dibujadas, por indice de mision (se guardan mientras dure el juego). */
  private thumbs = new Map<number, string>();

  constructor(private readonly host: CampaignHost) {}

  actions(): Partial<UIActions> {
    return {
      campaignHover: (index: number) => {
        this.moveTo(index);
        this.publish();
      },
      campaignPick: (index: number) => {
        if (this.onBack || this.selected !== index) {
          this.moveTo(index);
          return this.publish();
        }
        this.startSelected();
      },
      campaignBackHover: () => {
        this.moveTo('back');
        this.publish();
      },
      campaignBack: () => this.host.toHome(),
    };
  }

  private missionThumb(index: number): string {
    const cached = this.thumbs.get(index);
    if (cached) return cached;
    const s = createMatch({ mode: 'mission', mission: campaignMissions()[index]!.id, seed: THUMB_SEED });
    const thumb = mapThumb(s, this.host.palette, { units: true, px: MISSION_THUMB_PX });
    this.thumbs.set(index, thumb);
    return thumb;
  }

  /** Al abrir, queda elegida la siguiente mision por hacer (o la primera). */
  open(): void {
    const next = nextMissionIndex();
    this.selected = next >= 0 ? next : 0;
    this.onBack = false;
    ui.set({ screen: 'campaign' });
    this.publish();
  }

  publish(): void {
    const done = completedMissions();
    const lang = settings.lang;
    const items = campaignMissions().map((mission, index): CampaignItemVM => {
      const status = done.has(mission.id) ? 'done' : missionUnlocked(index, done) ? 'open' : 'locked';
      const kind = t(OBJECTIVE_KIND_LABEL[playerObjective(mission)?.kind ?? 'hq']);
      const best = bestDays(mission.id);
      return {
        id: mission.id,
        title: mission.title[lang],
        status,
        thumb: this.missionThumb(index),
        kind,
        best,
        note: `${kind} · ${statusNote(status, best)}`,
      };
    });
    const selected = campaignMissions()[this.selected]!;
    const progress = t('campaignProgress').replace('{n}', String(done.size)).replace('{total}', String(items.length));
    ui.set({
      campaign: {
        items,
        selected: this.selected,
        backSel: this.onBack,
        progress,
        brief: selected.brief[lang],
        objective: objectiveText(selected),
      },
    });
  }

  command(command: MenuCommand): void {
    const step = listStep(command);
    if (step) {
      this.moveBy(step);
      return this.publish();
    }
    if (command.kind === 'ok' && !command.repeat) return this.onBack ? this.host.toHome() : this.startSelected();
    if (command.kind === 'back') this.host.toHome();
  }

  /** Las misiones abiertas, en orden, y «Volver» al final: lo que recorren las flechas. */
  private stops(): CampaignStop[] {
    const done = completedMissions();
    const open = campaignMissions().flatMap((_, index) => (missionUnlocked(index, done) ? [index] : []));
    return [...open, 'back'];
  }

  private moveBy(step: number): void {
    const stops = this.stops();
    const current = stops.indexOf(this.onBack ? 'back' : this.selected);
    this.moveTo(stops[(current + step + stops.length) % stops.length]!);
  }

  private moveTo(stop: CampaignStop): void {
    this.onBack = stop === 'back';
    if (stop !== 'back') this.selected = stop;
  }

  private startSelected(): void {
    if (this.host.leaving || !missionUnlocked(this.selected)) return this.publish();
    this.host.startMission(campaignMissions()[this.selected]!);
  }
}
