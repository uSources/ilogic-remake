/**
 * Fin del turno del jugador y turno de la IA: ordenes pendientes, capturas automaticas, la IA paso a
 * paso, el final de la ronda (ingresos, curar) y la vuelta al jugador. Tambien repetir el ultimo turno
 * enemigo (misma semilla) y avanzar las ordenes de varios turnos al empezar el propio.
 */
import type Phaser from 'phaser';
import { aiTurn, assistTurn } from '../../core/ai';
import { WEATHER } from '../../core/data';
import { samePos, seededRng } from '../../core/geom';
import {
  buildingAt,
  canCapture,
  capture,
  captureEvent,
  endRound,
  moveEvent,
  moveRange,
  moveUnit,
  stepToward,
  unitById,
  type RoundReport,
} from '../../core/rules';
import { deserialize, serialize } from '../../core/save';
import { pruneSquads, squadById } from '../../core/squads';
import { sampleArmy } from '../../core/stats';
import type { GameEvent, GameState, Pos, Unit } from '../../core/types';
import { showBanner, showReport, showToast, type ReportLineVM } from '../../hud/store';
import { fmtNum, settings, t, unitLabel, weatherLabel } from '../../settings';
import { randomSeed } from '../../setup';
import { writeSave } from '../../storage';
import { center, floatText } from '../../ui/fx';
import { weatherEffectsText } from '../../ui/hudModels';
import type { MapView } from '../../ui/mapView';
import { PAL_CSS } from '../../ui/palette';
import { CONFIRM_MS, INPUT_LOCK_MS, type Phase } from './types';

/** Donde estaba mirando el jugador antes del turno enemigo. */
interface SavedCamera {
  x: number;
  y: number;
  cursor: Pos;
}

/** Lo que el turno necesita de la escena. */
export interface TurnHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (repetir el turno enemigo la cambia por la de antes y la vuelve a poner). */
  state: GameState;
  phase: Phase;
  readonly match: number;
  readonly ended: boolean;
  readonly lab: boolean;
  fastForward: boolean;
  /** Ignorar Enter/clic hasta este instante. */
  inputLockUntil: number;
  play(events: GameEvent[]): Promise<void>;
  wait(ms: number): Promise<void>;
  /** La partida ha terminado (y empieza el final): true. */
  checkEnd(): boolean;
  clearUndo(): void;
  /** Deshacer lo que este a medio decidir y volver al mapa. */
  abandonSelection(): void;
  toMap(): void;
  refresh(): void;
  refreshHud(): void;
  visible(p: Pos): boolean;
  /** Unidades propias sin mover y sin orden. */
  idleUnits(): Unit[];
  /** Se ha guardado esta partida (al acabar se borra el guardado). */
  markSaved(): void;
}

export class TurnFlow {
  /** Esta jugando (o repitiendose) el turno enemigo. */
  enemyPlaying = false;
  /** Se esta repitiendo el ultimo turno enemigo (no cuenta en estadisticas ni tutorial). */
  replaying = false;
  /** Estado antes del ultimo turno enemigo y semilla con la que se jugo (para repetirlo). */
  private lastEnemy: { before: string; seed: number } | null = null;
  private endArmedAt = -1e9;

  constructor(private readonly h: TurnHost) {}

  /** Partida nueva. */
  reset(): void {
    this.enemyPlaying = false;
    this.replaying = false;
    this.lastEnemy = null;
    this.endArmedAt = -1e9;
  }

  /** Hay un turno enemigo que repetir. */
  get canReplay(): boolean {
    return !!this.lastEnemy;
  }

  /** Unidades sin usar encima de un edificio que pueden capturar: capturan solas al terminar el turno. */
  autoCapturers(): Unit[] {
    const s = this.h.state;
    return s.units.filter((u) => u.team === 0 && u.active && u.canMove && u.carrier === null && canCapture(s, u));
  }

  /** Unidades sin mover que no hacen nada solas al terminar (las que capturan solas no cuentan). */
  pendingUnits(): Unit[] {
    const auto = new Set(this.autoCapturers().map((u) => u.uid));
    return this.h.idleUnits().filter((u) => !auto.has(u.uid));
  }

  /** El boton de fin de turno espera la confirmacion (primer clic hace menos de CONFIRM_MS). */
  endArmed(): boolean {
    return this.h.scene.time.now - this.endArmedAt <= CONFIRM_MS;
  }

  /**
   * [CAMBIO] Fin de turno (boton o tecla E). Con unidades sin mover y la opcion "Avisar de unidades
   * sin mover", el primer clic no termina: el propio boton pasa a "¿Terminar?" y hay que pulsar otra
   * vez antes de CONFIRM_MS. Sin la opcion, termina directamente.
   */
  requestEndTurn(): void {
    const h = this.h;
    if (h.lab) return;
    if (settings.warnIdle && this.pendingUnits().length > 0 && !this.endArmed()) {
      this.endArmedAt = h.scene.time.now;
      h.refreshHud();
      // Al caducar, el boton vuelve a su texto normal.
      h.scene.time.delayedCall(CONFIRM_MS + 50, () => h.refreshHud());
      return;
    }
    this.endArmedAt = -1e9;
    void this.enemyTurn();
  }

  async enemyTurn(): Promise<void> {
    const h = this.h;
    if (h.phase === 'busy' || h.ended) return;
    const m = h.match;
    h.clearUndo();
    h.abandonSelection();
    const saved = this.saveCamera();
    h.phase = 'busy';
    // [CAMBIO] Ordenes con destino: las unidades con orden que siguen sin usar la cumplen.
    const orders = assistTurn(h.state, Math.random);
    let step = orders.next();
    while (!step.done) {
      await h.play([step.value]);
      if (m !== h.match || h.checkEnd()) return;
      step = orders.next();
    }
    const s = h.state;
    const done = step.value
      .map((uid) => unitById(s, uid))
      .filter((u): u is Unit => !!u)
      .map((u) => unitLabel(u.type) + (squadById(s, u.squad) ? ` (${squadById(s, u.squad)!.name})` : ''));
    pruneSquads(h.state);
    // [CAMBIO] Las unidades que se han quedado sin usar encima de un edificio capturable siguen capturando.
    for (const u of this.autoCapturers()) {
      const b = buildingAt(h.state, u.x, u.y)!;
      const r = capture(h.state, u);
      if (r) await h.play([captureEvent(u, b, r)]);
      if (m !== h.match || h.checkEnd()) return;
    }
    this.enemyPlaying = true;
    // Velocidad "instantanea" del enemigo: como si se pulsara Enter para acelerar desde el principio.
    h.fastForward = settings.speedEnemy === 'instant';
    h.refresh();
    showBanner(`${t('day')} ${h.state.day}`, t('enemyTurn'), 'red');
    await h.wait(h.fastForward ? 300 : 900);
    if (m !== h.match) return;
    // Semilla propia para este turno: asi se puede repetir exactamente (menu > Repetir turno enemigo).
    const before = serialize(h.state);
    const seed = randomSeed();
    for (const ev of aiTurn(h.state, seededRng(seed))) {
      await h.play([ev]);
      if (m !== h.match || h.checkEnd()) return;
    }
    this.lastEnemy = { before, seed };
    const report = endRound(h.state);
    sampleArmy(h.state);
    if (settings.autosave && writeSave(serialize(h.state))) h.markSaved();
    this.enemyPlaying = false;
    if (h.checkEnd()) return;
    this.backToPlayer(saved);
    showBanner(`${t('day')} ${h.state.day}`, t('yourTurn'), 'blue');
    this.showReport(report, done);
    await this.runOrders();
  }

  /**
   * Volver a ver el ultimo turno enemigo: se restaura el estado de antes y se vuelve a jugar con
   * la misma semilla (la IA y los combates son deterministas con ella); al acabar se deja todo
   * exactamente como estaba.
   */
  async replayEnemyTurn(): Promise<void> {
    const h = this.h;
    const last = this.lastEnemy;
    if (!last || h.phase === 'busy' || h.ended) return;
    h.toMap();
    const saved = this.saveCamera();
    const after = serialize(h.state);
    const before = deserialize(last.before);
    if (!before) return;
    h.state = before;
    this.replaying = true;
    h.phase = 'busy';
    this.enemyPlaying = true;
    h.fastForward = false;
    h.refresh();
    showBanner(`${t('day')} ${h.state.day}`, t('replayBanner'), 'red');
    const m = h.match;
    await h.wait(900);
    for (const ev of aiTurn(h.state, seededRng(last.seed))) {
      if (m !== h.match) return;
      await h.play([ev]);
      if (m !== h.match || h.ended) return;
    }
    h.state = deserialize(after)!;
    this.replaying = false;
    this.enemyPlaying = false;
    this.backToPlayer(saved);
  }

  /** Al empezar el turno: las unidades con orden avanzan solas (y pueden seguir actuando despues). */
  async runOrders(): Promise<void> {
    const h = this.h;
    const movers = h.state.units.filter((u) => u.team === 0 && u.order && u.active && u.canMove && u.carrier === null);
    const arrived: Unit[] = [];
    const m = h.match;
    for (const u of movers) {
      if (m !== h.match) return;
      const goal = u.order!;
      if (samePos(u, goal)) {
        delete u.order;
        continue;
      }
      const r = moveRange(h.state, u);
      // Si ya llega este turno, no gastar el turno en las ultimas casillas: la mueve el jugador
      // (y puede seguir hasta donde quiera, atacar o capturar).
      if ((r.steps[goal.x]?.[goal.y] ?? 0) > 0) {
        delete u.order;
        arrived.push(u);
        continue;
      }
      const dest = stepToward(h.state, u, goal, r);
      if (!dest) continue;
      const path = moveUnit(h.state, u, dest, r);
      if (!path) continue;
      await h.play([moveEvent(u.uid, path)]);
      if (samePos(u, goal) || path.ambush) delete u.order;
    }
    if (arrived.length) {
      h.view.cursor = { x: arrived[0]!.x, y: arrived[0]!.y };
      h.view.ensureVisible(arrived[0]!, 3);
      showToast(t('orderArrives'));
    }
    if (movers.length) h.refresh();
  }

  /** Donde estaba mirando el jugador antes del turno enemigo. */
  private saveCamera(): SavedCamera {
    const cam = this.h.scene.cameras.main;
    return { x: cam.midPoint.x, y: cam.midPoint.y, cursor: { ...this.h.view.cursor } };
  }

  /** Vuelve el control al jugador tras el turno enemigo: camara donde estaba y entrada bloqueada un momento. */
  private backToPlayer(saved: SavedCamera): void {
    const h = this.h;
    h.fastForward = false;
    h.view.cursor = saved.cursor;
    h.scene.cameras.main.pan(saved.x, saved.y, 300, 'Sine.easeInOut', true);
    h.phase = 'map';
    // Que el Enter o el clic con el que se aceleraba la IA no actue ya en el turno propio.
    h.inputLockUntil = h.scene.time.now + INPUT_LOCK_MS;
    h.refresh();
  }

  /** Resumen de la ronda (ingresos, reparaciones...) y "+vida" sobre las unidades curadas que se ven. */
  private showReport(r: RoundReport, done: string[] = []): void {
    const h = this.h;
    const mine = r.healed.filter((x) => x.team === 0);
    const lines: ReportLineVM[] = [{ icon: 'ui/dinero', text: `+${fmtNum(r.income[0])} ${t('reportIncome')}`, tone: 'gold' }];
    // [CAMBIO] Parte de los ingresos que viene de los puntos de control.
    if (r.control && r.control.held[0] > 0)
      lines.push({ icon: 'ui/dinero', text: `+${fmtNum(r.control.income[0])} ${t('reportControl')} (${r.control.held[0]})`, tone: 'gold' });
    if (r.control && r.control.contested > 0)
      lines.push({ icon: '', text: `${t('reportContested')}: ${r.control.contested}`, tone: 'plain' });
    if (r.upkeep[0] > 0) lines.push({ icon: 'ui/dinero', text: `−${fmtNum(r.upkeep[0])} ${t('reportUpkeep')}`, tone: 'red' });
    // [CAMBIO] Unidades que cumplieron su orden al terminar el turno anterior (ahora esperan otra).
    if (done.length) lines.push({ icon: '', text: `${t('orderDone')}: ${done.join(', ')}`, tone: 'plain' });
    if (mine.length)
      lines.push({ icon: 'ui/vida', text: `${mine.length} ${t(mine.length === 1 ? 'reportHealed1' : 'reportHealed')}`, tone: 'green' });
    if (r.weather) {
      const to = r.weather.to;
      lines.push({ icon: '', weather: WEATHER.ids[to]!, text: `${weatherLabel(to)}: ${weatherEffectsText(to)}`, tone: 'plain' });
    }
    showReport(`${t('day')} ${h.state.day}`, lines);
    if (h.fastForward) return;
    mine.forEach((x, i) => {
      const u = unitById(h.state, x.uid);
      if (!u || u.carrier !== null || !h.visible(u)) return;
      const c = center(u);
      void floatText(h.scene, h.view, { x: c.x, y: c.y - 6 }, `+${x.amount}`, PAL_CSS.green, 1100 + i * 90);
    });
  }
}
