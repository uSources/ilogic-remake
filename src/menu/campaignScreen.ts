/**
 * Pantalla de la campaña: la lista de misiones con su miniatura, estado y mejor marca, y el resumen
 * de la elegida. Pide a la escena lo poco que usa (`CampaignHost`).
 */
import { listStep, type MenuCommand } from '../controls/menu';
import { buildMission, MISSIONS, type MissionDef } from '../core/missions';
import type { ObjectiveKind } from '../core/objectives';
import { bestDays, completedMissions, missionUnlocked, nextMissionIndex, objectiveText } from '../campaign';
import { ui, type CampaignItemVM, type UIActions } from '../hud/store';
import { settings, t, type TextKey } from '../settings';
import { keepMapSize, mapThumb } from './thumb';

export interface CampaignHost {
  readonly palette: number[];
  /** Ya se esta saliendo del menu: no empezar otra mision. */
  readonly leaving: boolean;
  toHome(): void;
  startMission(mission: MissionDef): void;
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

export class CampaignScreen {
  private selected = 0;
  /** Miniaturas ya dibujadas, por indice de mision (se guardan mientras dure el juego). */
  private thumbs = new Map<number, string>();

  constructor(private readonly host: CampaignHost) {}

  actions(): Partial<UIActions> {
    return {
      campaignHover: (index: number) => {
        this.selected = index;
        this.publish();
      },
      campaignPick: (index: number) => {
        if (this.selected !== index) {
          this.selected = index;
          return this.publish();
        }
        this.startSelected();
      },
      campaignBack: () => this.host.toHome(),
    };
  }

  missionThumb(index: number): string {
    const cached = this.thumbs.get(index);
    if (cached) return cached;
    const s = keepMapSize(() => buildMission(MISSIONS[index]!));
    const thumb = mapThumb(s, this.host.palette, { units: true, px: MISSION_THUMB_PX });
    this.thumbs.set(index, thumb);
    return thumb;
  }

  /** Al abrir, queda elegida la siguiente mision por hacer (o la primera). */
  open(): void {
    const next = nextMissionIndex();
    this.selected = next >= 0 ? next : 0;
    ui.set({ screen: 'campaign' });
    this.publish();
  }

  publish(): void {
    const done = completedMissions();
    const lang = settings.lang;
    const items: CampaignItemVM[] = MISSIONS.map((mission, index) => ({
      id: mission.id,
      title: mission.title[lang],
      status: done.has(mission.id) ? 'done' : missionUnlocked(index, done) ? 'open' : 'locked',
      thumb: this.missionThumb(index),
      kind: t(OBJECTIVE_KIND_LABEL[mission.objective.kind]),
      best: bestDays(mission.id),
    }));
    const selected = MISSIONS[this.selected]!;
    ui.set({ campaign: { items, selected: this.selected, brief: selected.brief[lang], objective: objectiveText(selected) } });
  }

  command(cmd: MenuCommand): void {
    const step = listStep(cmd);
    if (step) {
      this.selected = (this.selected + step + MISSIONS.length) % MISSIONS.length;
      return this.publish();
    }
    if (cmd.kind === 'ok' && !cmd.repeat) return this.startSelected();
    if (cmd.kind === 'back') this.host.toHome();
  }

  private startSelected(): void {
    if (this.host.leaving || !missionUnlocked(this.selected)) return this.publish();
    this.host.startMission(MISSIONS[this.selected]!);
  }
}
