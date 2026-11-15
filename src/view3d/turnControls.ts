/**
 * Lo que hace la persona en el 3D, como en 2D pero con menos fases: tocar una unidad suya la elige y
 * enseña a donde llega (azul) y a quien puede atacar (rojo); tocar una casilla azul la mueve y abre
 * su menu (el del juego: availableActions, con «Atras»); tocar un enemigo en rojo va y le ataca;
 * tocar una fabrica propia abre la compra. Las reglas las dice siempre el nucleo: aqui solo se
 * mandan acciones por la sesion (`session.act`) y se animan sus sucesos. Tambien lleva los turnos
 * de los demas (la IA), animando cada cosa que hacen.
 */
import { availableActions } from '../core/actions';
import { samePos } from '../core/geom';
import type { Building, GameAction, Pos, TeamId, Unit } from '../core/model';
import {
  attackTargets,
  buildingAt,
  buyOptions,
  canBuyAt,
  canMoveNow,
  canReach,
  canStillAct,
  lastUndoableMove,
  moveRange,
  pathTo,
  reachableTiles,
  unitAt,
  type BuyOption,
  type MoveRange,
} from '../core/rules';
import type { GameSession } from '../core/session';
import { showBanner, showToast, type MenuItemVM } from '../hud/store';
import { buyItem } from '../scenes/game/phases/buy';
import { unitMenuItems, withBack } from '../scenes/game/phases/unitMenu';
import type { ActionKey } from '../scenes/game/types';
import { fmtNum, nameOf, t } from '../settings';
import { buyBlockedText } from '../ui/hudModels';
import { buildingTypeOf, unitTypeOf } from '../core/gameContent';
import { teamState } from '../core/teams';
import { playEvents, type AnimationHost } from './animations';
import { attackPlan, type AttackPlan } from './attackPlan';
import type { Highlights } from './highlights';

/** Las opciones del menu de la unidad que el prototipo ya sabe hacer (las demas no salen). */
const SUPPORTED_OPTIONS: ReadonlySet<ActionKey> = new Set<ActionKey>(['attack', 'capture', 'supply', 'wait', 'back']);
/** En la compra, la primera fila es «Cancelar». */
const CANCEL_ROW = 0;

type Mode =
  | { kind: 'idle' }
  | { kind: 'move'; unit: Unit; range: MoveRange }
  | { kind: 'unitMenu'; unit: Unit; options: ActionKey[]; selected: number }
  | { kind: 'target'; unit: Unit; targets: Unit[] }
  | { kind: 'buy'; building: Building; options: BuyOption[]; selected: number };

/** El menu abierto, para la interfaz (el bocadillo del juego, junto a la casilla `at`). */
export interface MenuView {
  kind: 'unit' | 'buy';
  title: string;
  subtitle?: string;
  items: MenuItemVM[];
  selected: number;
  at: Pos;
}

export interface TurnHost {
  session: GameSession;
  viewer: TeamId;
  highlights: Highlights;
  animations: AnimationHost;
  /** La partida o lo elegido ha cambiado: volver a pintar piezas e interfaz. */
  refresh(): void;
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
      await playEvents(step.events, this.host.animations);
      this.host.refresh();
    }
    this.isBusy = false;
    showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
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
    this.host.refresh();
  }

  // ---- Tocar el tablero ----

  async tap(pos: Pos): Promise<void> {
    if (!this.isMyTurn) return;
    const mode = this.mode;
    switch (mode.kind) {
      case 'idle':
        return this.tapIdle(pos);
      case 'move':
        return this.tapMoving(mode.unit, mode.range, pos);
      case 'target':
        return this.tapTarget(mode.unit, mode.targets, pos);
      case 'unitMenu':
      case 'buy':
        return this.cancel();
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
    if (canMoveNow(unit)) return this.setMode({ kind: 'move', unit, range: moveRange(this.s, unit) });
    if (canStillAct(unit)) return this.openUnitMenu(unit);
    this.setMode({ kind: 'idle' });
  }

  private async tapMoving(unit: Unit, range: MoveRange, pos: Pos): Promise<void> {
    if (samePos(pos, unit)) return this.openUnitMenu(unit);
    const plan = this.planAt(unit, range, pos);
    if (plan) return this.moveAndAttack(plan, range);
    if (canReach(range, pos)) return this.moveTo(unit, range, pos);
    this.setMode({ kind: 'idle' });
    this.tapIdle(pos);
  }

  private async tapTarget(unit: Unit, targets: readonly Unit[], pos: Pos): Promise<void> {
    const target = targets.find((candidate) => samePos(candidate, pos));
    if (!target) return this.openUnitMenu(unit);
    this.setMode({ kind: 'idle' });
    await this.perform({ kind: 'attack', uid: unit.uid, target: target.uid });
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
    if (mode.kind === 'move') return this.planAt(mode.unit, mode.range, pos);
    if (mode.kind !== 'target') return null;
    const target = mode.targets.find((candidate) => samePos(candidate, pos));
    return target ? { attacker: mode.unit, from: { x: mode.unit.x, y: mode.unit.y }, target } : null;
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
    await playEvents(result.events, this.host.animations);
    this.isBusy = false;
    this.host.refresh();
    if (this.host.session.result.status !== 'playing') void this.runUntilInput();
    return true;
  }

  private async moveTo(unit: Unit, range: MoveRange, to: Pos): Promise<void> {
    this.setMode({ kind: 'idle' });
    if (!(await this.perform({ kind: 'move', uid: unit.uid, to, path: pathTo(range, to) }))) return;
    if (canStillAct(unit)) this.openUnitMenu(unit);
  }

  private async moveAndAttack(plan: AttackPlan, range: MoveRange): Promise<void> {
    const { attacker, from, target } = plan;
    this.setMode({ kind: 'idle' });
    const mustMove = !samePos(from, attacker);
    if (mustMove && !(await this.perform({ kind: 'move', uid: attacker.uid, to: from, path: pathTo(range, from) }))) return;
    await this.perform({ kind: 'attack', uid: attacker.uid, target: target.uid });
  }

  // ---- Menus ----

  private openUnitMenu(unit: Unit): void {
    const options = withBack(availableActions(this.s, this.host.viewer, unit)).filter((option) => SUPPORTED_OPTIONS.has(option));
    // Encima de un edificio que se puede capturar, lo normal es capturar (como en 2D).
    this.setMode({ kind: 'unitMenu', unit, options, selected: Math.max(0, options.indexOf('capture')) });
  }

  private openBuy(building: Building): void {
    const options = buyOptions(this.s, building);
    const firstAffordable = options.findIndex((option) => option.affordable);
    this.setMode({ kind: 'buy', building, options, selected: firstAffordable >= 0 ? firstAffordable + 1 : CANCEL_ROW });
  }

  /** El menu abierto, si hay uno. */
  menu(): MenuView | null {
    const mode = this.mode;
    if (mode.kind === 'unitMenu') {
      const title = nameOf(unitTypeOf(this.s, mode.unit));
      return { kind: 'unit', title, items: unitMenuItems(this.s, mode.unit, mode.options), selected: mode.selected, at: mode.unit };
    }
    if (mode.kind !== 'buy') return null;
    const items = [{ id: 'cancel', label: t('cancel'), icon: null }, ...mode.options.map((option) => buyItem(this.s, option))];
    const title = nameOf(buildingTypeOf(this.s, mode.building));
    const subtitle = `${t('funds')}: ${fmtNum(teamState(this.s, this.host.viewer).funds)}`;
    return { kind: 'buy', title, subtitle, items, selected: mode.selected, at: mode.building };
  }

  hoverMenu(index: number): void {
    const mode = this.mode;
    if (mode.kind !== 'unitMenu' && mode.kind !== 'buy') return;
    this.setMode({ ...mode, selected: index });
  }

  pickMenu(index: number): void {
    if (this.isBusy) return;
    const mode = this.mode;
    if (mode.kind === 'unitMenu') void this.pickUnitOption(mode.unit, mode.options[index]);
    if (mode.kind === 'buy') void this.pickBuy(mode.building, mode.options[index - 1]);
  }

  /** Elegir la opcion señalada (Intro). */
  acceptMenu(): void {
    const mode = this.mode;
    if (mode.kind === 'unitMenu' || mode.kind === 'buy') this.pickMenu(mode.selected);
  }

  private async pickUnitOption(unit: Unit, option: ActionKey | undefined): Promise<void> {
    if (option === 'attack') return this.setMode({ kind: 'target', unit, targets: attackTargets(this.s, unit) });
    if (option === 'back') return this.back(unit);
    const action = UNIT_ACTIONS[option as keyof typeof UNIT_ACTIONS] as ((unit: Unit) => GameAction) | undefined;
    if (!action) return;
    this.setMode({ kind: 'idle' });
    await this.perform(action(unit));
  }

  private async pickBuy(building: Building, option: BuyOption | undefined): Promise<void> {
    if (!option) return this.setMode({ kind: 'idle' });
    if (option.blocked) return showToast(buyBlockedText(this.s, option.blocked));
    this.setMode({ kind: 'idle' });
    await this.perform({ kind: 'buy', at: { x: building.x, y: building.y }, unitType: option.unitType.id });
  }

  /** «Atras»: deshace el movimiento (la accion 'undoMove' del nucleo) y vuelve a elegir a donde ir. */
  private async back(unit: Unit): Promise<void> {
    const canUndo = lastUndoableMove(this.s)?.uid === unit.uid;
    if (canUndo && !(await this.perform({ kind: 'undoMove', uid: unit.uid }))) return;
    if (canMoveNow(unit)) return this.setMode({ kind: 'move', unit, range: moveRange(this.s, unit) });
    this.setMode({ kind: 'idle' });
  }

  /** Esc o tocar fuera: un paso atras en lo que se estaba haciendo. */
  cancel(): void {
    if (this.isBusy) return;
    const mode = this.mode;
    if (mode.kind === 'unitMenu') return void this.back(mode.unit);
    if (mode.kind === 'target') return this.openUnitMenu(mode.unit);
    this.setMode({ kind: 'idle' });
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

  // ---- Marcas ----

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.showMarks();
    this.host.refresh();
  }

  private showMarks(): void {
    const mode = this.mode;
    const { highlights } = this.host;
    highlights.showReach(mode.kind === 'move' ? reachableTiles(mode.range) : []);
    highlights.showTargets(this.targetTiles());
    highlights.select('unit' in mode ? mode.unit : 'building' in mode ? mode.building : null);
  }

  private targetTiles(): Pos[] {
    const mode = this.mode;
    if (mode.kind === 'target') return mode.targets;
    if (mode.kind !== 'move') return [];
    return attackTargetsFromRange(this.s, mode.unit, mode.range).filter((target) => attackPlan(this.s, mode.unit, mode.range, target));
  }
}

/** Lo que manda cada opcion del menu que se cumple con una sola accion. */
const UNIT_ACTIONS = {
  capture: (unit: Unit): GameAction => ({ kind: 'capture', uid: unit.uid }),
  supply: (unit: Unit): GameAction => ({ kind: 'supply', uid: unit.uid }),
  wait: (unit: Unit): GameAction => ({ kind: 'wait', uid: unit.uid }),
} as const;

/** Los enemigos visibles a los que podria llegar a atacar este turno (moviendose o no). */
function attackTargetsFromRange(s: Parameters<typeof attackTargets>[0], unit: Unit, range: MoveRange | null): Unit[] {
  const enemies = s.units.filter((other) => other.team !== unit.team);
  return enemies.filter((enemy) => attackPlan(s, unit, range, enemy) !== null);
}
