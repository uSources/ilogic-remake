/**
 * Lo que hace la persona en el 3D. Tocar una unidad suya la elige: enseña a donde llega (azul), a
 * quien puede atacar (rojo) y una barra con lo que puede hacer ahi (unitBar.ts). Con una elegida, un
 * clic acierta solo segun lo que hay en la casilla (clickIntent.ts): ir, atacar, subir a un
 * transporte, unirse, capturar al llegar a un edificio, o soltarla. Tocar una fabrica propia abre la
 * compra. Las reglas las dice siempre el nucleo: aqui solo se mandan acciones por la sesion
 * (`session.act`) y se animan sus sucesos. Tambien lleva los turnos de los demas (la IA), animando
 * cada cosa que hacen.
 */
import type { SoundPort } from '../../../audio/sounds';
import { availableActions } from '../../../core/actions';
import { samePos } from '../../../core/geom';
import type { Building, GameAction, Pos, TeamId, Unit } from '../../../core/model';
import {
  attackTargets,
  buildingAt,
  buyOptions,
  canBuyAt,
  canMoveNow,
  canStillAct,
  cargoUnits,
  isOnMap,
  moveRange,
  reachableTiles,
  unitAt,
  unloadTiles,
  type BuyOption,
  type MoveRange,
} from '../../../core/rules';
import type { GameSession } from '../../../core/session';
import { showBanner, showToast, type MenuItemVM } from '../../../hud/store';
import { barItems, buyItem } from './menuItems';
import { fmtNum, nameOf, t } from '../../../settings';
import { buyBlockedText } from '../../../ui/hudModels';
import { buildingTypeOf, unitTypeOf } from '../../../core/gameContent';
import { teamState } from '../../../core/teams';
import { endSound } from '../sound/soundCues';
import { attackPlan, type AttackPlan } from './attackPlan';
import type { EventPlayer, MovePreview, TileMarks } from '../../ports/turn';
import { pathFor, previewAt } from './movePreview';
import { clickIntent, type ClickIntent } from './clickIntent';
import { barOptions, SINGLE_ACTIONS, type BarOption } from './unitBar';

/** En la compra, la primera fila es «Cancelar». */
const CANCEL_ROW = 0;

type Mode =
  | { kind: 'idle' }
  /**
   * Una unidad propia elegida: `range`, a donde llega (null si ya no puede moverse); `trail`, el camino
   * trazado con el cursor; `options`, su barra de acciones y `selected`, la señalada en ella.
   */
  | { kind: 'unit'; unit: Unit; range: MoveRange | null; trail: Pos[]; options: BarOption[]; selected: number }
  /** Elegir la casilla donde bajar a `passenger` del transporte `unit`. */
  | { kind: 'unload'; unit: Unit; passenger: Unit; tiles: Pos[] }
  | { kind: 'buy'; building: Building; options: BuyOption[]; selected: number };

type UnitMode = Extract<Mode, { kind: 'unit' }>;

/** El menu abierto, para la interfaz (junto a la casilla `at`). */
export interface MenuView {
  /** La barra de la unidad, la compra o la pausa (esta, de matchMenus.ts). */
  kind: 'actions' | 'buy' | 'game';
  title: string;
  subtitle?: string;
  /** Lineas extra (el objetivo de la mision, en la pausa). */
  info?: string[];
  items: MenuItemVM[];
  selected: number;
  at: Pos;
}

export interface TurnHost {
  session: GameSession;
  viewer: TeamId;
  /** Las marcas del tablero (alcance, objetivos, lo elegido). */
  marks: TileMarks;
  /** A donde llegaria la unidad elegida: flecha del camino y fantasma. */
  preview: MovePreview;
  /** Enseña los sucesos de cada accion (las propias y las de los demas). */
  events: EventPlayer;
  /** Elegir unidad, comprar, tu turno y el final. */
  sounds: SoundPort;
  /** La partida o lo elegido ha cambiado: volver a pintar piezas e interfaz. */
  refresh(): void;
  /** La partida se ha acabado (tras el cartel de victoria o derrota). */
  onOver(): void;
}

export class TurnControls {
  private mode: Mode = { kind: 'idle' };
  /** Mientras se anima algo (o juega otro) no se atiende la entrada. */
  private isBusy = false;

  constructor(private readonly host: TurnHost) {}

  private get s() {
    return this.host.session.state;
  }

  get busy(): boolean {
    return this.isBusy;
  }

  private get isMyTurn(): boolean {
    return !this.isBusy && this.host.session.awaitingInput === this.host.viewer;
  }

  // ---- Turnos ----

  /** Lleva la partida (los turnos de los demas, animados) hasta que le toca a la persona o se acaba. */
  async runUntilInput(): Promise<void> {
    this.isBusy = true;
    this.host.refresh();
    for (;;) {
      const step = this.host.session.step();
      if (step.kind === 'over') return this.finish(step.result.winners.some((team) => team === this.host.viewer));
      if (step.kind !== 'acted') break;
      await this.host.events.play(step.events);
      this.host.refresh();
    }
    this.isBusy = false;
    showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
    this.host.sounds.play('turn_start');
    this.host.refresh();
  }

  endTurn(): void {
    if (!this.isMyTurn) return;
    this.setMode({ kind: 'idle' });
    this.host.session.finishInput(this.host.viewer);
    void this.runUntilInput();
  }

  private finish(won: boolean): void {
    this.isBusy = true;
    showBanner(`${t('day')} ${this.s.day}`, t(won ? 'victory' : 'defeat'), won ? 'blue' : 'red');
    this.host.sounds.play(endSound(won));
    this.host.refresh();
    this.host.onOver();
  }

  // ---- Tocar el tablero ----

  async tap(pos: Pos): Promise<void> {
    if (!this.isMyTurn) return;
    const mode = this.mode;
    switch (mode.kind) {
      case 'idle':
        return this.tapIdle(pos);
      case 'unit':
        return this.tapWithUnit(mode, pos);
      case 'unload':
        return this.tapUnload(mode.unit, mode.passenger, mode.tiles, pos);
      case 'buy':
        return void this.cancel();
    }
  }

  private tapIdle(pos: Pos): void {
    const unit = unitAt(this.s, pos);
    if (unit?.team === this.host.viewer) return this.chooseOwnUnit(unit);
    const building = buildingAt(this.s, pos);
    if (building?.owner === this.host.viewer && canBuyAt(this.s, building)) return this.openBuy(building);
    this.setMode({ kind: 'idle' });
  }

  private chooseOwnUnit(unit: Unit): void {
    this.host.sounds.play('unit_select');
    this.select(unit);
  }

  /**
   * Elige la unidad (con su alcance, si aun se mueve, y su barra). Si ya no esta en el tablero (ha
   * subido a un transporte, se ha unido a otra, ha caido) o no puede hacer nada mas, nada elegido.
   */
  private select(unit: Unit): void {
    const isStillHere = this.s.units.includes(unit) && isOnMap(unit);
    if (!isStillHere || !canStillAct(unit)) return this.setMode({ kind: 'idle' });
    const range = canMoveNow(unit) ? moveRange(this.s, unit) : null;
    const options = barOptions(this.s, this.host.viewer, unit);
    // Encima de un edificio que se puede capturar, lo normal es capturar (Intro lo hace).
    const selected = Math.max(0, options.indexOf('capture'));
    this.setMode({ kind: 'unit', unit, range, trail: [{ x: unit.x, y: unit.y }], options, selected });
  }

  private async tapWithUnit(mode: UnitMode, pos: Pos): Promise<void> {
    const intent = clickIntent(this.s, this.host.viewer, mode, pos, this.planAt(mode.unit, mode.range, pos));
    await this.carryOut(mode, intent, pos);
  }

  /** Cumple lo que dice el clic (clickIntent.ts). */
  private async carryOut(mode: UnitMode, intent: ClickIntent, pos: Pos): Promise<void> {
    const { unit } = mode;
    switch (intent.kind) {
      case 'deselect':
        return this.setMode({ kind: 'idle' });
      case 'attack':
        return this.moveAndAttack(intent.plan, mode);
      case 'load':
        return this.actThenSelect(unit, { kind: 'load', uid: unit.uid, into: intent.into.uid });
      case 'merge':
        return this.actThenSelect(unit, { kind: 'merge', uid: unit.uid, into: intent.into.uid });
      case 'move':
        return this.moveTo(mode, intent.to, intent.thenCapture);
      case 'elsewhere':
        this.setMode({ kind: 'idle' });
        return this.tapIdle(pos);
      default:
        return intent satisfies never;
    }
  }

  private async tapUnload(transport: Unit, passenger: Unit, tiles: readonly Pos[], pos: Pos): Promise<void> {
    const to = tiles.find((tile) => samePos(tile, pos));
    if (!to) return this.select(transport);
    await this.actThenSelect(transport, { kind: 'unload', uid: transport.uid, passenger: passenger.uid, to });
  }

  /** El plan de ataque a un enemigo visible en `pos` (null si no hay o no se le puede atacar). */
  private planAt(unit: Unit, range: MoveRange | null, pos: Pos): AttackPlan | null {
    const target = attackTargets(this.s, unit).find((candidate) => samePos(candidate, pos));
    const reachable = attackTargetsFromRange(this.s, unit, range).find((candidate) => samePos(candidate, pos));
    const enemy = target ?? reachable;
    return enemy ? attackPlan(this.s, unit, range, enemy) : null;
  }

  /** Lo que la interfaz enseña como prevision de combate al pasar por `pos` (null si no hay combate ahi). */
  forecastAt(pos: Pos): AttackPlan | null {
    const mode = this.mode;
    return mode.kind === 'unit' ? this.planAt(mode.unit, mode.range, pos) : null;
  }

  // ---- Acciones ----

  /** Manda la accion y anima lo que ha pasado. false si el nucleo no la acepta (y dice por que). */
  private async perform(action: GameAction): Promise<boolean> {
    const result = this.host.session.act(this.host.viewer, action);
    if (!result.ok) {
      showToast(result.reason);
      return false;
    }
    this.isBusy = true;
    this.host.refresh();
    await this.host.events.play(result.events);
    this.isBusy = false;
    this.host.refresh();
    if (this.host.session.result.status !== 'playing') void this.runUntilInput();
    return true;
  }

  /** Hace la accion con la unidad y, si aun puede hacer algo, la deja elegida (con su barra al dia). */
  private async actThenSelect(unit: Unit, action: GameAction): Promise<void> {
    this.setMode({ kind: 'idle' });
    if (await this.perform(action)) this.select(unit);
  }

  /** Va a `to` por el camino trazado; si es un edificio ajeno y al llegar puede capturarlo, empieza. */
  private async moveTo({ unit, range, trail }: UnitMode, to: Pos, thenCapture: boolean): Promise<void> {
    if (!range) return;
    this.setMode({ kind: 'idle' });
    if (!(await this.perform({ kind: 'move', uid: unit.uid, to, path: pathFor(range, trail, to) }))) return;
    const canCapture = thenCapture && availableActions(this.s, this.host.viewer, unit).includes('capture');
    if (canCapture) return this.actThenSelect(unit, { kind: 'capture', uid: unit.uid });
    this.select(unit);
  }

  private async moveAndAttack(plan: AttackPlan, { range, trail }: UnitMode): Promise<void> {
    const { attacker, from, target } = plan;
    this.setMode({ kind: 'idle' });
    const mustMove = !samePos(from, attacker) && range;
    if (mustMove && !(await this.perform({ kind: 'move', uid: attacker.uid, to: from, path: pathFor(range, trail, from) }))) return;
    await this.actThenSelect(attacker, { kind: 'attack', uid: attacker.uid, target: target.uid });
  }

  // ---- Barra de acciones y compra ----

  private openBuy(building: Building): void {
    const options = buyOptions(this.s, building);
    const firstAffordable = options.findIndex((option) => option.affordable);
    this.setMode({ kind: 'buy', building, options, selected: firstAffordable >= 0 ? firstAffordable + 1 : CANCEL_ROW });
  }

  /** El menu abierto, si hay uno: la barra de la unidad elegida, la de bajar a un pasajero o la compra. */
  menu(): MenuView | null {
    const mode = this.mode;
    switch (mode.kind) {
      case 'unit':
        return this.unitBar(mode);
      case 'unload': {
        const title = t('unloadPick').replace('{name}', nameOf(unitTypeOf(this.s, mode.passenger)));
        return { kind: 'actions', title, items: [{ id: 'back', label: t('back') }], selected: 0, at: mode.unit };
      }
      case 'buy':
        return this.buyMenu(mode.building, mode.options, mode.selected);
      case 'idle':
        return null;
      default:
        return mode satisfies never;
    }
  }

  private unitBar({ unit, options, selected }: UnitMode): MenuView | null {
    if (!options.length) return null;
    const items = barItems(this.s, unit, options);
    return { kind: 'actions', title: nameOf(unitTypeOf(this.s, unit)), items, selected, at: unit };
  }

  private buyMenu(building: Building, options: readonly BuyOption[], selected: number): MenuView {
    const items = [{ id: 'cancel', label: t('cancel'), icon: null }, ...options.map((option) => buyItem(this.s, option))];
    const title = nameOf(buildingTypeOf(this.s, building));
    const subtitle = `${t('funds')}: ${fmtNum(teamState(this.s, this.host.viewer).funds)}`;
    return { kind: 'buy', title, subtitle, items, selected, at: building };
  }

  hoverMenu(index: number): void {
    const mode = this.mode;
    if (mode.kind !== 'unit' && mode.kind !== 'buy') return;
    this.setMode({ ...mode, selected: index });
  }

  pickMenu(index: number): void {
    if (this.isBusy) return;
    const mode = this.mode;
    if (mode.kind === 'unit') void this.pickBarOption(mode.unit, mode.options[index]);
    if (mode.kind === 'unload') this.select(mode.unit);
    if (mode.kind === 'buy') void this.pickBuy(mode.building, mode.options[index - 1]);
  }

  /** Elegir la opcion señalada (Intro). */
  acceptMenu(): void {
    const mode = this.mode;
    if (mode.kind === 'unit' || mode.kind === 'buy') this.pickMenu(mode.selected);
  }

  private async pickBarOption(unit: Unit, option: BarOption | undefined): Promise<void> {
    if (!option) return;
    if (option === 'unload') return this.startUnloading(unit);
    const action = SINGLE_ACTIONS[option];
    if (action) await this.actThenSelect(unit, action(unit));
  }

  /** Desembarcar: el primer pasajero que puede bajar, y en que casillas. */
  private startUnloading(transport: Unit): void {
    const passenger = cargoUnits(this.s, transport).find((cargo) => unloadTiles(this.s, transport, cargo).length > 0);
    if (!passenger) return;
    this.setMode({ kind: 'unload', unit: transport, passenger, tiles: unloadTiles(this.s, transport, passenger) });
  }

  private async pickBuy(building: Building, option: BuyOption | undefined): Promise<void> {
    if (!option) return this.setMode({ kind: 'idle' });
    if (option.blocked) return showToast(buyBlockedText(this.s, option.blocked));
    this.setMode({ kind: 'idle' });
    const bought = await this.perform({ kind: 'buy', at: { x: building.x, y: building.y }, unitType: option.unitType.id });
    if (bought) this.host.sounds.play('spawn');
  }

  /**
   * Esc: un paso atras. Con una unidad elegida que se acaba de mover, deshace el movimiento; si no, la
   * suelta. false si no habia nada elegido (Esc abre entonces la pausa).
   */
  cancel(): boolean {
    if (this.isBusy) return true;
    const mode = this.mode;
    if (mode.kind === 'idle') return false;
    if (mode.kind === 'unit' && mode.options.includes('undo')) void this.actThenSelect(mode.unit, { kind: 'undoMove', uid: mode.unit.uid });
    else if (mode.kind === 'unload') this.select(mode.unit);
    else this.setMode({ kind: 'idle' });
    return true;
  }

  // ---- Elegir desde la interfaz ----

  /** Elegir una unidad por su uid (la bandeja, Tab). */
  focusUnit(uid: number): void {
    const unit = this.s.units.find((candidate) => candidate.uid === uid);
    if (unit && this.isMyTurn) this.chooseOwnUnit(unit);
  }

  /** La siguiente unidad propia que aun puede moverse, despues de la elegida (null si no queda ninguna). */
  nextIdleUnit(): number | null {
    const idle = this.s.units.filter((unit) => unit.team === this.host.viewer && canMoveNow(unit));
    const chosen = 'unit' in this.mode ? this.mode.unit.uid : null;
    const current = idle.findIndex((unit) => unit.uid === chosen);
    return idle[(current + 1) % idle.length]?.uid ?? null;
  }

  // ---- Señalar ----

  /** La casilla señalada (raton encima): con una unidad elegida que aun se mueve, por donde iria y a donde llegaria. */
  hover(pos: Pos | null): void {
    const mode = this.mode;
    if (mode.kind !== 'unit' || !mode.range || !pos || this.isBusy) return this.host.preview.show(null);
    const attackFrom = this.planAt(mode.unit, mode.range, pos)?.from ?? null;
    const { trail, look } = previewAt(mode.unit.uid, mode.range, mode.trail, pos, attackFrom);
    this.mode = { ...mode, trail };
    this.host.preview.show(look);
  }

  // ---- Marcas ----

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.showMarks();
    this.host.refresh();
  }

  private showMarks(): void {
    const mode = this.mode;
    const { marks } = this.host;
    this.host.preview.show(null);
    marks.showReach(this.reachTiles());
    marks.showTargets(this.targetTiles());
    marks.select('unit' in mode ? mode.unit : 'building' in mode ? mode.building : null);
  }

  /** En azul: a donde llega la elegida, o donde se puede bajar al pasajero. */
  private reachTiles(): Pos[] {
    const mode = this.mode;
    if (mode.kind === 'unload') return mode.tiles;
    return mode.kind === 'unit' && mode.range ? reachableTiles(mode.range) : [];
  }

  private targetTiles(): Pos[] {
    const mode = this.mode;
    if (mode.kind !== 'unit') return [];
    return attackTargetsFromRange(this.s, mode.unit, mode.range);
  }
}

/** Los enemigos visibles a los que podria llegar a atacar este turno (moviendose o no). */
function attackTargetsFromRange(s: Parameters<typeof attackTargets>[0], unit: Unit, range: MoveRange | null): Unit[] {
  const enemies = s.units.filter((other) => other.team !== unit.team);
  return enemies.filter((enemy) => attackPlan(s, unit, range, enemy) !== null);
}
