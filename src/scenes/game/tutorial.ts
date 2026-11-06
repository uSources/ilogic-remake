/**
 * Panel de la mision y pasos del tutorial. Sin Phaser: la escena le cuenta los eventos del jugador
 * (`record`) y le pide el panel en cada refresco (`panel`).
 */
import { missionById } from '../../core/missions';
import type { GameEvent, GameState } from '../../core/model';
import { objectiveStatus, objectiveText, ownedBuildingCount, TUTORIAL } from '../../campaign';
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
  record(event: GameEvent): void {
    this.events.push(event);
  }

  /** Titulo, objetivo y, en el tutorial, el consejo del paso actual (null si no es una mision). */
  panel(s: GameState, phase: Phase): UIState['mission'] {
    const id = s.mission?.id;
    const mission = id ? missionById(id) : undefined;
    if (!mission) return null;
    let tip: string | null = null;
    let step: string | null = null;
    if (mission.tutorial) {
      this.advance(s, phase);
      const tutorialStep = TUTORIAL[this.step];
      if (tutorialStep) {
        tip = tutorialStep.text[settings.lang];
        step = `${this.step + 1}/${TUTORIAL.length}`;
      }
    }
    return { title: mission.title[settings.lang], objective: objectiveText(mission, s), status: objectiveStatus(s), tip, step };
  }

  /** Pasa al siguiente consejo cuando se ha hecho lo que pedia el actual (puede saltar varios). */
  private advance(s: GameState, phase: Phase): void {
    const team = s.mission?.objective.owner;
    if (team === undefined) return;
    if (this.step === 0 && this.events.length === 0) this.ownedAtStart = ownedBuildingCount(s, team);
    for (let guard = 0; guard < TUTORIAL.length; guard++) {
      const tutorialStep = TUTORIAL[this.step];
      if (!tutorialStep || !tutorialStep.done({ s, team, phase, events: this.events, ownedAtStart: this.ownedAtStart })) return;
      this.step++;
      this.events = [];
    }
  }
}
