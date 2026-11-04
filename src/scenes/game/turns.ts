/**
 * Fin del turno del jugador y turno de la IA: ordenes pendientes, capturas automaticas, la IA paso a
 * paso, el final de la ronda (ingresos, curar) y la vuelta al jugador. Tambien repetir el ultimo turno
 * enemigo (misma semilla) y avanzar las ordenes de varios turnos al empezar el propio.
 */
import { saveContext } from '../../core/defaultGames';
import type Phaser from 'phaser';
import { aiTurn, assistTurn } from '../../core/ai';
import { defaultContent } from '../../core/content/default';
import { contentOf } from '../../core/gameContent';
import { samePos, seededRng } from '../../core/geom';
import {
  buildingAt,
  canCapture,
  canReach,
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
import type { GameEvent, GameState, Pos, Unit } from '../../core/model';
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

/** Instante de "sin armar" del boton de fin de turno (muy atras: nunca cuenta como reciente). */
const NOT_ARMED = -1e9;
/** Aviso de "Turno enemigo" antes de que la IA empiece a mover (mas corto si va instantanea). */
const ENEMY_BANNER_MS = 900;
const ENEMY_BANNER_FAST_MS = 300;
/** Lo que tarda en volver la camara a donde miraba el jugador. */
const CAMERA_BACK_MS = 300;
/** Casillas de margen al llevar la camara a una unidad que llega a su destino. */
const ARRIVED_MARGIN = 3;
/** "+vida" de las unidades curadas: empieza cuando ya se ha leido el resumen, uno detras de otro. */
const HEAL_TEXT_DELAY_MS = 1100;
const HEAL_TEXT_STAGGER_MS = 90;

/** Una unidad propia que aun puede actuar este turno (y no va dentro de un transporte). */
const isReadyOwnUnit = (unit: Unit): boolean => unit.team === 0 && unit.active && unit.canMove && unit.carrier === null;

/** Nombre de una unidad para el resumen, con su escuadra si la tiene: "Tanque (Alfa)". */
function unitWithSquad(s: GameState, unit: Unit): string {
  const squad = squadById(s, unit.squad);
  return unitLabel(unit.type) + (squad ? ` (${squad.name})` : '');
}

export class TurnFlow {
  /** Esta jugando (o repitiendose) el turno enemigo. */
  enemyPlaying = false;
  /** Se esta repitiendo el ultimo turno enemigo (no cuenta en estadisticas ni tutorial). */
  replaying = false;
  /** Estado antes del ultimo turno enemigo y semilla con la que se jugo (para repetirlo). */
  private lastEnemy: { before: string; seed: number } | null = null;
  private endArmedAt = NOT_ARMED;

  constructor(private readonly host: TurnHost) {}

  /** Partida nueva. */
  reset(): void {
    this.enemyPlaying = false;
    this.replaying = false;
    this.lastEnemy = null;
    this.endArmedAt = NOT_ARMED;
  }

  /** Hay un turno enemigo que repetir. */
  get canReplay(): boolean {
    return !!this.lastEnemy;
  }

  /** Unidades sin usar encima de un edificio que pueden capturar: capturan solas al terminar el turno. */
  autoCapturers(): Unit[] {
    const s = this.host.state;
    return s.units.filter((unit) => isReadyOwnUnit(unit) && canCapture(s, unit));
  }

  /** Unidades sin mover que no hacen nada solas al terminar (las que capturan solas no cuentan). */
  pendingUnits(): Unit[] {
    const capturers = new Set(this.autoCapturers().map((unit) => unit.uid));
    return this.host.idleUnits().filter((unit) => !capturers.has(unit.uid));
  }

  /** El boton de fin de turno espera la confirmacion (primer clic hace menos de CONFIRM_MS). */
  endArmed(): boolean {
    return this.host.scene.time.now - this.endArmedAt <= CONFIRM_MS;
  }

  /**
   * [CAMBIO] Fin de turno (boton o tecla E). Con unidades sin mover y la opcion "Avisar de unidades
   * sin mover", el primer clic no termina: el propio boton pasa a "¿Terminar?" y hay que pulsar otra
   * vez antes de CONFIRM_MS. Sin la opcion, termina directamente.
   */
  requestEndTurn(): void {
    const host = this.host;
    if (host.lab) return;
    if (settings.warnIdle && this.pendingUnits().length > 0 && !this.endArmed()) {
      this.endArmedAt = host.scene.time.now;
      host.refreshHud();
      // Al caducar, el boton vuelve a su texto normal.
      host.scene.time.delayedCall(CONFIRM_MS + 50, () => host.refreshHud());
      return;
    }
    this.endArmedAt = NOT_ARMED;
    void this.enemyTurn();
  }

  /**
   * Fin del turno propio y turno de la IA: ordenes y capturas pendientes, la IA, el final de la ronda
   * y la vuelta al jugador. Despues de cada animacion se para si la partida ha cambiado o terminado.
   */
  async enemyTurn(): Promise<void> {
    const host = this.host;
    if (host.phase === 'busy' || host.ended) return;
    const match = host.match;
    host.clearUndo();
    host.abandonSelection();
    const saved = this.saveCamera();
    host.phase = 'busy';
    const ordersDone = await this.playStandingOrders(match);
    if (!ordersDone) return;
    pruneSquads(host.state);
    if (!(await this.playAutoCaptures(match))) return;
    if (!(await this.playAiTurn(match))) return;
    const report = this.closeRound();
    if (host.checkEnd()) return;
    this.backToPlayer(saved);
    showBanner(`${t('day')} ${host.state.day}`, t('yourTurn'), 'blue');
    this.showReport(report, ordersDone);
    await this.runOrders();
  }

  /** La partida sigue: no se ha cambiado por otra ni acaba de terminar (si termina, empieza el final). */
  private continues(match: number): boolean {
    return match === this.host.match && !this.host.checkEnd();
  }

  /**
   * [CAMBIO] Ordenes con destino: las unidades con orden que siguen sin usar la cumplen. Devuelve
   * las que la han terminado (para el resumen), o null si la partida ha cambiado o terminado.
   */
  private async playStandingOrders(match: number): Promise<string[] | null> {
    const host = this.host;
    const orders = assistTurn(host.state, Math.random);
    let step = orders.next();
    while (!step.done) {
      await host.play([step.value]);
      if (!this.continues(match)) return null;
      step = orders.next();
    }
    const s = host.state;
    return step.value
      .map((uid) => unitById(s, uid))
      .filter((unit): unit is Unit => !!unit)
      .map((unit) => unitWithSquad(s, unit));
  }

  /** [CAMBIO] Las unidades que se han quedado sin usar encima de un edificio capturable siguen capturando. */
  private async playAutoCaptures(match: number): Promise<boolean> {
    const host = this.host;
    for (const unit of this.autoCapturers()) {
      const building = buildingAt(host.state, unit)!;
      const result = capture(host.state, unit);
      if (result) await host.play([captureEvent(unit, building, result)]);
      if (!this.continues(match)) return false;
    }
    return true;
  }

  /** El turno de la IA, con una semilla propia para poder repetirlo igual (menu > Repetir turno enemigo). */
  private async playAiTurn(match: number): Promise<boolean> {
    const host = this.host;
    this.enemyPlaying = true;
    // Velocidad "instantanea" del enemigo: como si se pulsara Enter para acelerar desde el principio.
    host.fastForward = settings.speedEnemy === 'instant';
    host.refresh();
    showBanner(`${t('day')} ${host.state.day}`, t('enemyTurn'), 'red');
    await host.wait(host.fastForward ? ENEMY_BANNER_FAST_MS : ENEMY_BANNER_MS);
    if (match !== host.match) return false;
    const before = serialize(host.state);
    const seed = randomSeed();
    for (const event of aiTurn(host.state, seededRng(seed))) {
      await host.play([event]);
      if (!this.continues(match)) return false;
    }
    this.lastEnemy = { before, seed };
    return true;
  }

  /** Final de la ronda: ingresos, curar, estadisticas y guardado automatico. */
  private closeRound(): RoundReport {
    const host = this.host;
    const report = endRound(host.state);
    sampleArmy(host.state);
    if (settings.autosave && writeSave(serialize(host.state))) host.markSaved();
    this.enemyPlaying = false;
    return report;
  }

  /**
   * Volver a ver el ultimo turno enemigo: se restaura el estado de antes y se vuelve a jugar con
   * la misma semilla (la IA y los combates son deterministas con ella); al acabar se deja todo
   * exactamente como estaba.
   */
  async replayEnemyTurn(): Promise<void> {
    const host = this.host;
    const last = this.lastEnemy;
    if (!last || host.phase === 'busy' || host.ended) return;
    host.toMap();
    const saved = this.saveCamera();
    const after = serialize(host.state);
    const before = deserialize(last.before, saveContext(contentOf(host.state)));
    if (!before) return;
    host.state = before;
    this.replaying = true;
    host.phase = 'busy';
    this.enemyPlaying = true;
    host.fastForward = false;
    host.refresh();
    showBanner(`${t('day')} ${host.state.day}`, t('replayBanner'), 'red');
    const match = host.match;
    await host.wait(ENEMY_BANNER_MS);
    // Al repetir no se comprueba el final (ya se sabe como acabo): solo si se cambia de partida.
    for (const event of aiTurn(host.state, seededRng(last.seed))) {
      if (match !== host.match) return;
      await host.play([event]);
      if (match !== host.match || host.ended) return;
    }
    host.state = deserialize(after, saveContext(contentOf(host.state)))!;
    this.replaying = false;
    this.enemyPlaying = false;
    this.backToPlayer(saved);
  }

  /** Al empezar el turno: las unidades con orden avanzan solas (y pueden seguir actuando despues). */
  async runOrders(): Promise<void> {
    const host = this.host;
    const movers = host.state.units.filter((unit) => isReadyOwnUnit(unit) && unit.travelTo);
    const arrived: Unit[] = [];
    const match = host.match;
    for (const unit of movers) {
      if (match !== host.match) return;
      if (await this.followOrder(unit)) arrived.push(unit);
    }
    const firstArrived = arrived[0];
    if (firstArrived) {
      host.view.cursor = { x: firstArrived.x, y: firstArrived.y };
      host.view.ensureVisible(firstArrived, ARRIVED_MARGIN);
      showToast(t('orderArrives'));
    }
    if (movers.length) host.refresh();
  }

  /**
   * Un turno de camino hacia el destino de la orden, que se cumple al llegar o si le tienden una
   * emboscada. Devuelve true si ya llega este turno: entonces no se mueve, para no gastar el turno
   * en las ultimas casillas; la mueve el jugador (y puede seguir, atacar o capturar).
   */
  private async followOrder(unit: Unit): Promise<boolean> {
    const host = this.host;
    const goal = unit.travelTo!;
    if (samePos(unit, goal)) {
      delete unit.travelTo;
      return false;
    }
    const range = moveRange(host.state, unit);
    if (canReach(range, goal)) {
      delete unit.travelTo;
      return true;
    }
    const destination = stepToward(host.state, unit, goal, range);
    if (!destination) return false;
    const path = moveUnit(host.state, unit, destination, range);
    if (!path) return false;
    await host.play([moveEvent(unit.uid, path)]);
    if (samePos(unit, goal) || path.ambush) delete unit.travelTo;
    return false;
  }

  /** Donde estaba mirando el jugador antes del turno enemigo. */
  private saveCamera(): SavedCamera {
    const camera = this.host.scene.cameras.main;
    return { x: camera.midPoint.x, y: camera.midPoint.y, cursor: { ...this.host.view.cursor } };
  }

  /** Vuelve el control al jugador tras el turno enemigo: camara donde estaba y entrada bloqueada un momento. */
  private backToPlayer(saved: SavedCamera): void {
    const host = this.host;
    host.fastForward = false;
    host.view.cursor = saved.cursor;
    host.scene.cameras.main.pan(saved.x, saved.y, CAMERA_BACK_MS, 'Sine.easeInOut', true);
    host.phase = 'map';
    // Que el Enter o el clic con el que se aceleraba la IA no actue ya en el turno propio.
    host.inputLockUntil = host.scene.time.now + INPUT_LOCK_MS;
    host.refresh();
  }

  /** Resumen de la ronda (ingresos, reparaciones...) y "+vida" sobre las unidades curadas que se ven. */
  private showReport(report: RoundReport, ordersDone: string[] = []): void {
    const host = this.host;
    showReport(`${t('day')} ${host.state.day}`, roundReportLines(report, ordersDone));
    if (host.fastForward) return;
    ownHealed(report).forEach((healed, i) => {
      const unit = unitById(host.state, healed.uid);
      if (!unit || unit.carrier !== null || !host.visible(unit)) return;
      const c = center(unit);
      const delay = HEAL_TEXT_DELAY_MS + i * HEAL_TEXT_STAGGER_MS;
      void floatText(host.scene, host.view, { x: c.x, y: c.y - 6 }, `+${healed.amount}`, PAL_CSS.green, delay);
    });
  }
}

const ownHealed = (report: RoundReport) => report.healed.filter((healed) => healed.team === 0);

/** Las lineas del resumen de la ronda. `ordersDone`: unidades que cumplieron su orden. */
function roundReportLines(report: RoundReport, ordersDone: string[]): ReportLineVM[] {
  const { control, income, upkeep, weather } = report;
  const healed = ownHealed(report);
  const lines: ReportLineVM[] = [{ icon: 'ui/dinero', text: `+${fmtNum(income[0])} ${t('reportIncome')}`, tone: 'gold' }];
  // [CAMBIO] Parte de los ingresos que viene de los puntos de control.
  if (control && control.held[0] > 0) {
    lines.push({ icon: 'ui/dinero', text: `+${fmtNum(control.income[0])} ${t('reportControl')} (${control.held[0]})`, tone: 'gold' });
  }
  if (control && control.contested > 0) lines.push({ icon: '', text: `${t('reportContested')}: ${control.contested}`, tone: 'plain' });
  if (upkeep[0] > 0) lines.push({ icon: 'ui/dinero', text: `−${fmtNum(upkeep[0])} ${t('reportUpkeep')}`, tone: 'red' });
  // [CAMBIO] Unidades que cumplieron su orden al terminar el turno anterior (ahora esperan otra).
  if (ordersDone.length) lines.push({ icon: '', text: `${t('orderDone')}: ${ordersDone.join(', ')}`, tone: 'plain' });
  if (healed.length) {
    const label = t(healed.length === 1 ? 'reportHealed1' : 'reportHealed');
    lines.push({ icon: 'ui/vida', text: `${healed.length} ${label}`, tone: 'green' });
  }
  if (weather) {
    const to = weather.to;
    lines.push({
      icon: '',
      weather: defaultContent().tables.WEATHER.ids[to]!,
      text: `${weatherLabel(to)}: ${weatherEffectsText(to)}`,
      tone: 'plain',
    });
  }
  return lines;
}
