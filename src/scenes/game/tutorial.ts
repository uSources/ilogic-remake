/**
 * Panel de la mision y pasos del tutorial. Sin Phaser: la escena le cuenta los eventos del jugador
 * (`record`) y le pide el panel en cada refresco (`panel`).
 */
import { missionById } from '../../core/missions';
import type { GameEvent, GameState } from '../../core/model';
import { objectiveStatus, objectiveText, TUTORIAL } from '../../campaign';
import type { UIState } from '../../hud/store';
import { settings } from '../../settings';
import type { Phase } from './types';

export class TutorialTracker {
  private step = 0;
  /** Acciones del jugador desde que empezo el paso actual del tutorial. */
  private events: GameEvent[] = [];
  private ownedAtStart = 0;

  /** Partida nueva. */
  reset(): void {
    this.step = 0;
    this.events = [];
    this.ownedAtStart = 0;
  }

  /** Un evento del jugador (no del enemigo ni de una repeticion). */
  record(ev: GameEvent): void {
    this.events.push(ev);
  }

  /** Titulo, objetivo y, en el tutorial, el consejo del paso actual (null si no es una mision). */
  panel(s: GameState, phase: Phase): UIState['mission'] {
    const id = s.mission?.id;
    const m = id ? missionById(id) : undefined;
    if (!m) return null;
    let tip: string | null = null;
    let step: string | null = null;
    if (m.tutorial) {
      this.advance(s, phase);
      const st = TUTORIAL[this.step];
      if (st) {
        tip = st.text[settings.lang];
        step = `${this.step + 1}/${TUTORIAL.length}`;
      }
    }
    return { title: m.title[settings.lang], objective: objectiveText(m, s), status: objectiveStatus(s), tip, step };
  }

  /** Pasa al siguiente consejo cuando se ha hecho lo que pedia el actual (puede saltar varios). */
  private advance(s: GameState, phase: Phase): void {
    if (this.step === 0 && this.events.length === 0) this.ownedAtStart = s.buildings.filter((building) => building.owner === 0).length;
    for (let guard = 0; guard < TUTORIAL.length; guard++) {
      const st = TUTORIAL[this.step];
      if (!st || !st.done({ s, phase, events: this.events, ownedAtStart: this.ownedAtStart })) return;
      this.step++;
      this.events = [];
    }
  }
}
