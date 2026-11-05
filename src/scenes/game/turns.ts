/**
 * Fin del turno del jugador y turnos de los demas equipos: ordenes pendientes, capturas automaticas,
 * cada equipo de la IA paso a paso (por su orden en la partida), el final de la ronda (ingresos,
 * curar) y la vuelta al jugador. Tambien repetir los ultimos turnos ajenos (misma semilla) y avanzar
 * las ordenes de varios turnos al empezar el propio. En esta pantalla juega una persona (el equipo que
 * mira, `viewer`): los demas equipos tienen que ser de la IA (`controller: 'ai'`). Varias personas en
 * la misma partida (por turnos o en red) es la fase 4: hasta entonces, otro equipo 'human' es un
 * fallo y lo dice (playTeam), y startMatch no deja empezar una partida asi.
 */
import { unitTypeOf } from '../../core/gameContent';
import { saveContext } from '../../core/defaultGames';
import type Phaser from 'phaser';
import { aiTurn, assistTurn } from '../../core/ai';
import { posOf } from '../../core/geom';
import { seededRng } from '../../core/util/random';
import { canCapture, endRound, roundReport, othersAfter, unitById, type RoundReport, canMoveNow } from '../../core/rules';
import { deserialize, serialize } from '../../core/save';
import { squadById } from '../../core/squads';
import { sampleArmy } from '../../core/stats';
import { isHostile, notAiControlledReason } from '../../core/teams';
import type { GameEvent, GameState, Pos, Rng, TeamId, Unit } from '../../core/model';
import { showBanner, showReport, showToast, type ReportLineVM } from '../../hud/store';
import { fmtNum, settings, t, nameOf } from '../../settings';
import { randomSeed } from '../../setup';
import { writeSave } from '../../storage';
import { center, floatText } from '../../ui/fx';
import { weatherEffectsText } from '../../ui/hudModels';
import type { MapView } from '../../ui/mapView';
import { PAL_CSS } from '../../ui/palette';
import { CONFIRM_MS, INPUT_LOCK_MS, type ActionHost, type Phase } from './types';

/** Donde estaba mirando el jugador antes del turno enemigo. */
interface SavedCamera {
  x: number;
  y: number;
  cursor: Pos;
}

/** Lo que el turno necesita de la escena. */
export interface TurnHost extends ActionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (repetir el turno enemigo la cambia por la de antes y la vuelve a poner). */
  state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
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
  visible(pos: Pos): boolean;
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

/** Una unidad de `team` que aun puede actuar este turno (y no va dentro de un transporte). */
const isReadyUnitOf = (team: TeamId, unit: Unit): boolean => unit.team === team && canMoveNow(unit);

/** Nombre de una unidad para el resumen, con su escuadra si la tiene: "Tanque (Alfa)". */
function unitWithSquad(s: GameState, unit: Unit): string {
  const squad = squadById(s, unit.squad);
  return nameOf(unitTypeOf(s, unit)) + (squad ? ` (${squad.name})` : '');
}

/**
 * El turno de otro equipo lo juega la IA: si es de una persona, es un fallo (en esta pantalla juega
 * una sola; varias, fase 4) y se dice en vez de jugarlo por ella.
 */
export function checkPlayedByAi(s: GameState, team: TeamId): void {
  const reason = notAiControlledReason(s, team);
  if (reason) throw new Error(reason);
}

export class TurnFlow {
  /** Esta jugando (o repitiendose) el turno de otro equipo. */
  othersPlaying = false;
  /** Se estan repitiendo los ultimos turnos ajenos (no cuentan en estadisticas ni tutorial). */
  replaying = false;
  /** Estado antes de los ultimos turnos ajenos y semilla con la que se jugaron (para repetirlos). */
  private lastOthers: { before: string; seed: number } | null = null;
  private endArmedAt = NOT_ARMED;
  /** El equipo al que le toca ahora si no es el que mira (null: el turno es suyo). */
  private otherTeam: TeamId | null = null;

  constructor(private readonly host: TurnHost) {}

  /** Partida nueva. */
  reset(): void {
    this.othersPlaying = false;
    this.replaying = false;
    this.lastOthers = null;
    this.endArmedAt = NOT_ARMED;
    this.otherTeam = null;
  }

  /** El equipo que esta jugando ahora (el que hace lo que se anima). */
  get acting(): TeamId {
    return this.otherTeam ?? this.host.viewer;
  }

  /** Hay turnos ajenos que repetir (los de la ultima vuelta). */
  get canReplay(): boolean {
    return !!this.lastOthers;
  }

  /** Unidades sin usar encima de un edificio que pueden capturar: capturan solas al terminar el turno. */
  autoCapturers(): Unit[] {
    const s = this.host.state;
    return s.units.filter((unit) => isReadyUnitOf(this.host.viewer, unit) && canCapture(s, unit));
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
    void this.endOwnTurn();
  }

  /**
   * Fin del turno propio y turnos de los demas: ordenes y capturas pendientes, la IA de cada equipo,
   * el final de la ronda y la vuelta al jugador. Despues de cada animacion se para si la partida ha
   * cambiado o terminado.
   */
  async endOwnTurn(): Promise<void> {
    const host = this.host;
    if (host.phase === 'busy' || host.ended) return;
    const match = host.match;
    host.clearUndo();
    host.abandonSelection();
    const saved = this.saveCamera();
    host.phase = 'busy';
    const ordersDone = await this.playStandingOrders(match);
    if (!ordersDone) return;
    if (!(await this.playAutoCaptures(match))) return;
    const report = await this.playOtherTeams(match);
    if (!report || host.checkEnd()) return;
    this.backToPlayer(saved);
    showBanner(`${t('day')} ${host.state.day}`, t('yourTurn'), 'blue');
    this.showReport(report, ordersDone);
    await this.runTravels();
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
    const orders = assistTurn(host.state, host.viewer);
    let step = orders.next();
    while (!step.done) {
      host.record([step.value]);
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
      await host.perform({ kind: 'capture', uid: unit.uid });
      if (!this.continues(match)) return false;
    }
    return true;
  }

  /**
   * Los turnos de los demas equipos y el final de la ronda, con una semilla propia para poder
   * repetirlos igual (menu > Repetir turno enemigo). Devuelve el informe de la ronda, o null si la
   * partida ha cambiado o terminado.
   */
  private async playOtherTeams(match: number): Promise<RoundReport | null> {
    const host = this.host;
    const before = serialize(host.state);
    const seed = randomSeed();
    const rng = seededRng(seed);
    this.othersPlaying = true;
    const report = await this.playRoundOfOthers(
      (team) => this.playTeam(team, rng, match),
      () => this.closeRound(),
    );
    if (!report) return null;
    this.otherTeam = null;
    this.othersPlaying = false;
    this.lastOthers = { before, seed };
    return report;
  }

  /**
   * Los turnos de los demas equipos, por su orden en la partida, con el fin de ronda entre el ultimo
   * y el primero (`othersAfter`, del nucleo: un equipo ya derrotado no juega). Devuelve el informe
   * de la ronda, o null si `playTeam` dice que hay que parar.
   */
  private async playRoundOfOthers(
    playTeam: (team: TeamId) => Promise<boolean>,
    closeRound: () => RoundReport,
  ): Promise<RoundReport | null> {
    let report: RoundReport | null = null;
    for (const step of othersAfter(this.host.state, this.host.viewer)) {
      if (step.kind === 'roundEnd') report = closeRound();
      else if (!(await playTeam(step.team))) return null;
    }
    return report;
  }

  /**
   * El turno de otro equipo, con su aviso (rojo si es enemigo, azul si es aliado). En esta pantalla
   * solo juega una persona: los demas equipos tienen que ser de la IA (partidas de varias personas,
   * fase 4; startMatch ya no las deja empezar).
   */
  private async playTeam(team: TeamId, rng: Rng, match: number): Promise<boolean> {
    const host = this.host;
    if (!this.continues(match)) return false;
    checkPlayedByAi(host.state, team);
    this.otherTeam = team;
    // Velocidad "instantanea" del enemigo: como si se pulsara Enter para acelerar desde el principio.
    host.fastForward = settings.speedEnemy === 'instant';
    host.refresh();
    const hostile = isHostile(host.state, host.viewer, team);
    showBanner(`${t('day')} ${host.state.day}`, t(hostile ? 'enemyTurn' : 'allyTurn'), hostile ? 'red' : 'blue');
    await host.wait(host.fastForward ? ENEMY_BANNER_FAST_MS : ENEMY_BANNER_MS);
    if (match !== host.match) return false;
    for (const event of aiTurn(host.state, rng, team)) {
      host.record([event]);
      await host.play([event]);
      if (!this.continues(match)) return false;
    }
    return true;
  }

  /** Final de la ronda: ingresos, curar, estadisticas y guardado automatico. */
  private closeRound(): RoundReport {
    const host = this.host;
    const report = roundReport(host.state, endRound(host.state));
    sampleArmy(host.state);
    if (settings.autosave && writeSave(serialize(host.state))) host.markSaved();
    return report;
  }

  /**
   * Volver a ver los ultimos turnos ajenos: se restaura el estado de antes y se vuelven a jugar con
   * la misma semilla y en el mismo orden (la IA y los combates son deterministas con ella); al acabar
   * se deja todo exactamente como estaba.
   */
  async replayOthers(): Promise<void> {
    const host = this.host;
    const last = this.lastOthers;
    if (!last || host.phase === 'busy' || host.ended) return;
    host.toMap();
    const saved = this.saveCamera();
    const after = serialize(host.state);
    const before = deserialize(last.before, saveContext(host.state.content));
    if (!before) return;
    host.state = before;
    this.replaying = true;
    host.phase = 'busy';
    this.othersPlaying = true;
    host.fastForward = false;
    host.refresh();
    showBanner(`${t('day')} ${host.state.day}`, t('replayBanner'), 'red');
    const match = host.match;
    await host.wait(ENEMY_BANNER_MS);
    const rng = seededRng(last.seed);
    const replayed = await this.playRoundOfOthers(
      (team) => this.replayTeam(team, rng, match),
      () => roundReport(host.state, endRound(host.state)),
    );
    if (!replayed) return;
    host.state = deserialize(after, saveContext(host.state.content))!;
    this.otherTeam = null;
    this.replaying = false;
    this.othersPlaying = false;
    this.backToPlayer(saved);
  }

  /** Un turno ajeno repetido: sin aviso y sin comprobar el final (ya se sabe como acabo), solo si se cambia de partida. */
  private async replayTeam(team: TeamId, rng: Rng, match: number): Promise<boolean> {
    const host = this.host;
    this.otherTeam = team;
    for (const event of aiTurn(host.state, rng, team)) {
      if (match !== host.match) return false;
      host.record([event]);
      await host.play([event]);
      if (match !== host.match || host.ended) return false;
    }
    return true;
  }

  /** Al empezar el turno: las unidades de viaje (travelTo) avanzan solas (y pueden seguir actuando despues). */
  async runTravels(): Promise<void> {
    const host = this.host;
    const movers = host.state.units.filter((unit) => isReadyUnitOf(host.viewer, unit) && unit.travelTo);
    const arrived: Unit[] = [];
    const match = host.match;
    for (const unit of movers) {
      if (match !== host.match) return;
      if (await this.advanceTravel(unit)) arrived.push(unit);
    }
    const firstArrived = arrived[0];
    if (firstArrived) {
      host.view.cursor = posOf(firstArrived);
      host.view.ensureVisible(firstArrived, ARRIVED_MARGIN);
      showToast(t('travelArrives'));
    }
    if (movers.length) host.refresh();
  }

  /**
   * El paso de este turno del viaje (la accion 'travelStep': el nucleo decide hasta donde y cuando
   * acaba). Devuelve true si ya llega este turno: entonces no se mueve, para no gastar el turno en las
   * ultimas casillas; la mueve el jugador (y puede seguir, atacar o capturar).
   */
  private async advanceTravel(unit: Unit): Promise<boolean> {
    const host = this.host;
    const events = host.act({ kind: 'travelStep', uid: unit.uid });
    if (!events) return false;
    await host.play(events);
    return events.some((event) => event.kind === 'travel' && event.to === null && event.end === 'withinReach');
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
    showReport(`${t('day')} ${host.state.day}`, roundReportLines(report, host.viewer, ordersDone));
    if (host.fastForward) return;
    healedOf(report, host.viewer).forEach((healed, i) => {
      const unit = unitById(host.state, healed.uid);
      if (!unit || unit.carrier !== null || !host.visible(unit)) return;
      const centerPoint = center(unit);
      const delay = HEAL_TEXT_DELAY_MS + i * HEAL_TEXT_STAGGER_MS;
      void floatText(host.scene, host.view, { x: centerPoint.x, y: centerPoint.y - 6 }, `+${healed.amount}`, PAL_CSS.green, delay);
    });
  }
}

const healedOf = (report: RoundReport, team: TeamId) => report.healed.filter((healed) => healed.team === team);

/** Las lineas del resumen de la ronda para el equipo `team`. `ordersDone`: unidades que cumplieron su orden. */
function roundReportLines(report: RoundReport, team: TeamId, ordersDone: string[]): ReportLineVM[] {
  const { control, weather } = report;
  const income = report.income[team] ?? 0;
  const upkeep = report.upkeep[team] ?? 0;
  const held = control?.held[team] ?? 0;
  const healed = healedOf(report, team);
  const lines: ReportLineVM[] = [{ icon: 'ui/dinero', text: `+${fmtNum(income)} ${t('reportIncome')}`, tone: 'gold' }];
  // [CAMBIO] Parte de los ingresos que viene de los puntos de control.
  if (control && held > 0) {
    lines.push({ icon: 'ui/dinero', text: `+${fmtNum(control.income[team] ?? 0)} ${t('reportControl')} (${held})`, tone: 'gold' });
  }
  if (control && control.contested > 0) lines.push({ icon: '', text: `${t('reportContested')}: ${control.contested}`, tone: 'plain' });
  if (upkeep > 0) lines.push({ icon: 'ui/dinero', text: `−${fmtNum(upkeep)} ${t('reportUpkeep')}`, tone: 'red' });
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
      weather: to.id,
      text: `${nameOf(to)}: ${weatherEffectsText(to)}`,
      tone: 'plain',
    });
  }
  return lines;
}
