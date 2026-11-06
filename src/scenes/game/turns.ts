/**
 * Los turnos en la pantalla: el fin del turno propio, los turnos de los demas equipos (los juega la
 * sesion: `GameSession`, con el controlador de cada equipo) animados paso a paso, el resumen de la
 * ronda, el autoguardado y la vuelta al jugador. Tambien repetir los ultimos turnos ajenos (con el
 * registro de acciones de la sesion). Lo que pasa solo al acabar y empezar cada turno (ordenes
 * permanentes, capturas que siguen, viajes) lo hace la partida: aqui solo se anima y se cuenta.
 */
import { cloneState, unitTypeOf } from '../../core/gameContent';
import type Phaser from 'phaser';
import { posOf } from '../../core/geom';
import { autoCapturers, roundReport, unitById, type RoundReport } from '../../core/rules';
import { serialize } from '../../core/save';
import { GameSession, playMatch, replayControllers, type ActedStep, type SessionStep } from '../../core/session';
import { squadById } from '../../core/squads';
import { isHostile } from '../../core/teams';
import type { GameEvent, GameState, Pos, TeamId, Unit } from '../../core/model';
import { showBanner, showReport, showToast, type ReportLineVM } from '../../hud/store';
import { fmtNum, settings, t, nameOf } from '../../settings';
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
  /** La partida en juego. */
  readonly session: GameSession;
  /** La partida que se ve (la de la sesion; al repetir los turnos ajenos, la copia de antes). */
  state: GameState;
  /**
   * El equipo que juega la persona en esta pantalla (el que mira). Con varias personas por turnos,
   * cambia al empezar el turno de cada una (despues de `handOver`).
   */
  viewer: TeamId;
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
  /** Tapa la partida hasta que la persona de `team` dice que esta lista (cambio de jugador en esta pantalla). */
  handOver(team: TeamId): Promise<void>;
  /** Camara y cursor sobre la Base del equipo que mira (la primera vez que mira). */
  centerOnHq(): void;
}

/** Lo que se cuenta al volver el turno al jugador: lo que ha pasado mientras jugaban los demas. */
interface TurnSummary {
  /** El fin de ronda (si ha acabado una por medio). */
  report: RoundReport | null;
  /** Unidades propias que han cumplido su orden al acabar el turno (ahora esperan otra). */
  ordersDone: number[];
  /** Unidades propias de viaje que ya llegan este turno (el ultimo trozo lo hace el jugador). */
  arrived: number[];
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

/** Lo que es de un equipo en lo que pasa mientras juegan los demas (para el resumen al volver). */
function addToSummary(summary: TurnSummary, s: GameState, team: TeamId, step: ActedStep): void {
  if (step.events.some((event) => event.kind === 'newDay')) summary.report = roundReport(s, step.events);
  for (const event of step.events) {
    if (event.actor !== team) continue;
    if (event.kind === 'standingOrderDone') summary.ordersDone.push(event.uid);
    if (event.kind === 'travel' && event.to === null && event.end === 'withinReach') summary.arrived.push(event.uid);
  }
}

/** Nombre de una unidad para el resumen, con su escuadra si la tiene: "Tanque (Alfa)". */
function unitWithSquad(s: GameState, unit: Unit): string {
  const squad = squadById(s, unit.squad);
  return nameOf(unitTypeOf(s, unit)) + (squad ? ` (${squad.name})` : '');
}

export class TurnFlow {
  /** Esta jugando (o repitiendose) el turno de otro equipo. */
  othersPlaying = false;
  /** Se estan repitiendo los ultimos turnos ajenos (no cuentan en el tutorial). */
  replaying = false;
  /**
   * De cada persona: una copia de la partida al acabar su ultimo turno y desde donde va en el registro
   * (para repetirle lo de despues). Con varias en esta pantalla, cada una ve lo suyo.
   */
  private replays = new Map<TeamId, { before: GameState; from: number }>();
  /** Donde miraba cada persona al acabar su turno (con varias en esta pantalla, cada una vuelve a lo suyo). */
  private cameras = new Map<TeamId, SavedCamera>();
  private endArmedAt = NOT_ARMED;
  /** El equipo al que le toca ahora si no es el que mira (null: el turno es suyo). */
  private otherTeam: TeamId | null = null;

  constructor(private readonly host: TurnHost) {}

  /** Partida nueva. */
  reset(): void {
    this.othersPlaying = false;
    this.replaying = false;
    this.replays = new Map();
    this.cameras = new Map();
    this.endArmedAt = NOT_ARMED;
    this.otherTeam = null;
  }

  /** El equipo que esta jugando ahora (el que hace lo que se anima). */
  get acting(): TeamId {
    return this.otherTeam ?? this.host.viewer;
  }

  /** Hay turnos ajenos que repetir (los de la ultima vuelta). */
  get canReplay(): boolean {
    return this.replays.has(this.host.viewer);
  }

  /** Unidades sin mover que no hacen nada solas al terminar (las que capturan solas no cuentan). */
  pendingUnits(): Unit[] {
    const capturers = new Set(autoCapturers(this.host.state, this.host.viewer).map((unit) => unit.uid));
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
   * Al empezar la partida: la sesion juega hasta que le toca a la persona (empezar su turno, con sus
   * viajes; o antes los turnos de otros, si les toca primero).
   */
  async begin(): Promise<void> {
    const host = this.host;
    const match = host.match;
    host.phase = 'busy';
    const summary = await this.playUntilInput(match);
    if (!summary) return;
    host.phase = 'map';
    if (!host.lab) showBanner(`${t('day')} ${host.state.day}`, t('yourTurn'), 'blue');
    this.showArrivals(summary);
    host.refresh();
  }

  /**
   * Fin del turno propio y turnos de los demas: la sesion acaba el turno (ordenes y capturas que
   * siguen solas), juega los de los demas equipos con el fin de ronda en su sitio y empieza el
   * siguiente propio; aqui se anima cada paso. Se para si la partida cambia o termina.
   */
  async endOwnTurn(): Promise<void> {
    const host = this.host;
    if (host.phase === 'busy' || host.ended) return;
    const match = host.match;
    host.abandonSelection();
    this.cameras.set(host.viewer, this.saveCamera());
    host.phase = 'busy';
    this.replays.set(host.viewer, { before: cloneState(host.session.state), from: host.session.log.length });
    host.session.finishInput(host.viewer);
    const summary = await this.playUntilInput(match);
    if (!summary) return;
    this.backToPlayer(this.cameras.get(host.viewer));
    showBanner(`${t('day')} ${host.state.day}`, t('yourTurn'), 'blue');
    this.showReport(summary);
    this.showArrivals(summary);
  }

  /** La partida sigue: no se ha cambiado por otra ni acaba de terminar (si termina, empieza el final). */
  private continues(match: number): boolean {
    return match === this.host.match && !this.host.checkEnd();
  }

  /**
   * La sesion juega (animando cada paso) hasta que le toca a la persona. Devuelve lo que contar al
   * volver, o null si la partida ha cambiado o ha terminado.
   */
  private async playUntilInput(match: number): Promise<TurnSummary | null> {
    const host = this.host;
    const summary: TurnSummary = { report: null, ordersDone: [], arrived: [] };
    const last: SessionStep = await playMatch(host.session, async (step) => {
      if (this.startsTurnOfAnotherPerson(step)) await this.switchPerson(step.team, summary);
      if (match !== host.match) return false;
      addToSummary(summary, host.session.state, host.viewer, step);
      this.autosave(step);
      await this.show(step);
      return this.continues(match);
    });
    this.otherTeam = null;
    this.othersPlaying = false;
    if (last.kind === 'over') host.checkEnd();
    return last.kind === 'awaitingInput' && match === host.match ? summary : null;
  }

  /** Empieza el turno de una persona que no es la que mira (varias personas en esta pantalla, por turnos). */
  private startsTurnOfAnotherPerson(step: ActedStep): boolean {
    const host = this.host;
    return step.action.kind === 'startTurn' && step.team !== host.viewer && host.session.isPerson(step.team);
  }

  /**
   * Cambio de persona: se tapa la partida hasta que la siguiente esta lista, y desde ahi mira ella (lo
   * que se iba a contar a la anterior ya no se cuenta).
   */
  private async switchPerson(team: TeamId, summary: TurnSummary): Promise<void> {
    const host = this.host;
    await host.handOver(team);
    host.viewer = team;
    summary.ordersDone = [];
    summary.arrived = [];
    this.lookFromOwnPlace(team);
    host.refresh();
  }

  /** La camara de una persona que empieza a mirar: donde lo dejo, o la primera vez, su Base. */
  private lookFromOwnPlace(team: TeamId): void {
    const host = this.host;
    const saved = this.cameras.get(team);
    if (!saved) return host.centerOnHq();
    host.view.cursor = { ...saved.cursor };
    host.scene.cameras.main.centerOn(saved.x, saved.y);
  }

  /** Anima un paso de la sesion: al empezar el turno de otro equipo, su aviso; despues, sus sucesos. */
  private async show(step: ActedStep): Promise<void> {
    const host = this.host;
    if (step.action.kind === 'startTurn') await this.turnStarts(step.team);
    await host.play(step.events);
  }

  /** Empieza el turno de un equipo: el propio (ya no juegan otros) o el de otro, con su aviso. */
  private async turnStarts(team: TeamId): Promise<void> {
    if (team !== this.host.viewer) return this.announceTurnOf(team);
    this.otherTeam = null;
    this.othersPlaying = false;
  }

  /** El turno de otro equipo empieza: su aviso (rojo si es enemigo, azul si es aliado). */
  private async announceTurnOf(team: TeamId): Promise<void> {
    const host = this.host;
    this.otherTeam = team;
    this.othersPlaying = true;
    // Velocidad "instantanea" del enemigo: como si se pulsara Enter para acelerar desde el principio.
    host.fastForward = settings.speedEnemy === 'instant';
    host.refresh();
    const hostile = isHostile(host.state, host.viewer, team);
    showBanner(`${t('day')} ${host.state.day}`, t(hostile ? 'enemyTurn' : 'allyTurn'), hostile ? 'red' : 'blue');
    await host.wait(host.fastForward ? ENEMY_BANNER_FAST_MS : ENEMY_BANNER_MS);
  }

  /** Guardado automatico: al empezar el turno de una persona (ya con sus viajes dados), si el modo lo hace. */
  private autosave(step: ActedStep): void {
    const s = this.host.session.state;
    if (settings.autosave && this.host.session.isAutosaveMoment(step) && writeSave(serialize(s))) this.host.markSaved();
  }

  /**
   * Volver a ver los ultimos turnos ajenos: con la partida de antes se repiten las acciones apuntadas
   * en la sesion (los dados van en la partida: sale lo mismo), hasta que vuelve el turno propio. La
   * partida de verdad no se toca.
   */
  async replayOthers(): Promise<void> {
    const host = this.host;
    const last = this.replays.get(host.viewer);
    if (!last || host.phase === 'busy' || host.ended) return;
    // Otra copia cada vez: se puede repetir mas de una vez.
    const before = cloneState(last.before);
    host.toMap();
    const saved = this.saveCamera();
    const replay = new GameSession(before, replayControllers(before, host.session.log.slice(last.from)));
    host.state = before;
    this.replaying = true;
    host.phase = 'busy';
    host.fastForward = false;
    host.refresh();
    showBanner(`${t('day')} ${host.state.day}`, t('replayBanner'), 'red');
    const match = host.match;
    await host.wait(ENEMY_BANNER_MS);
    await playMatch(replay, (step) => this.replayStep(step, match));
    if (match !== host.match) return;
    host.state = host.session.state;
    this.otherTeam = null;
    this.replaying = false;
    this.othersPlaying = false;
    this.backToPlayer(saved);
  }

  /** Un paso repetido: sin avisos ni final (ya se sabe como acabo); se para al volver el turno propio. */
  private async replayStep(step: ActedStep, match: number): Promise<boolean> {
    const host = this.host;
    if (step.action.kind === 'startTurn' && step.team === host.viewer) return false;
    this.otherTeam = step.team === host.viewer ? null : step.team;
    this.othersPlaying = this.otherTeam !== null;
    await host.play(step.events);
    return match === host.match && !host.ended;
  }

  /** Las unidades de viaje que ya llegan este turno: la camara va a la primera y se avisa. */
  private showArrivals(summary: TurnSummary): void {
    const host = this.host;
    const firstArrived = summary.arrived.map((uid) => unitById(host.state, uid)).find((unit): unit is Unit => !!unit);
    if (!firstArrived) return;
    host.view.cursor = posOf(firstArrived);
    host.view.ensureVisible(firstArrived, ARRIVED_MARGIN);
    showToast(t('travelArrives'));
  }

  /** Donde estaba mirando el jugador antes del turno enemigo. */
  private saveCamera(): SavedCamera {
    const camera = this.host.scene.cameras.main;
    return { x: camera.midPoint.x, y: camera.midPoint.y, cursor: { ...this.host.view.cursor } };
  }

  /**
   * Vuelve el control al jugador tras el turno enemigo: camara donde estaba (si es la primera vez que
   * mira, en su Base) y entrada bloqueada un momento.
   */
  private backToPlayer(saved: SavedCamera | undefined): void {
    const host = this.host;
    host.fastForward = false;
    if (saved) {
      host.view.cursor = { ...saved.cursor };
      host.scene.cameras.main.pan(saved.x, saved.y, CAMERA_BACK_MS, 'Sine.easeInOut', true);
    } else host.centerOnHq();
    host.phase = 'map';
    // Que el Enter o el clic con el que se aceleraba la IA no actue ya en el turno propio.
    host.inputLockUntil = host.scene.time.now + INPUT_LOCK_MS;
    host.refresh();
  }

  /** Resumen de la ronda (ingresos, reparaciones...) y "+vida" sobre las unidades curadas que se ven. */
  private showReport(summary: TurnSummary): void {
    const host = this.host;
    const report = summary.report;
    if (!report) return;
    const ordersDone = summary.ordersDone
      .map((uid) => unitById(host.state, uid))
      .filter((unit): unit is Unit => !!unit)
      .map((unit) => unitWithSquad(host.state, unit));
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
