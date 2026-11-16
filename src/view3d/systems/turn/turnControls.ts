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
import { availableActions, groupMoveOrder, groupMoveStep } from '../../../core/actions';
import { boxSelect, clickSelect, type ClickMods, type Selection } from '../../../controls/selection';
import { samePos } from '../../../core/geom';
import type { Building, GameAction, Pos, TeamId, TurnEndOrderKind, Unit } from '../../../core/model';
import type { GroupMode } from '../../../controls/inputCommands';
import { exactSquad, squadById, squadByKey, squadUnits, SQUAD_NAME_MAX } from '../../../core/squads';
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
import { showBanner, showToast, ui, type MenuItemVM } from '../../../hud/store';
import { barItems, buyItem } from './menuItems';
import { fmtNum, nameOf, t } from '../../../settings';
import { buyBlockedText } from '../../../ui/hudModels';
import { buildingTypeOf, unitTypeOf } from '../../../core/gameContent';
import { teamState } from '../../../core/teams';
import { endSound } from '../sound/soundCues';
import { attackPlan, type AttackPlan } from './attackPlan';
import type { EventPlayer, MovePreview, ScreenView, TileMarks } from '../../ports/turn';
import { pathFor, previewAt } from './movePreview';
import { clickIntent, type ClickIntent } from './clickIntent';
import { barAction, barOptions, groupBarOptions, ORDER_KINDS, type BarOption } from './unitBar';
import { isSelectable, pickedFrom } from './selection';

/** En la compra, la primera fila es «Cancelar». */
const CANCEL_ROW = 0;
/** Un clic sin teclas. */
const PLAIN_CLICK: ClickMods = { shift: false, ctrl: false, count: 1 };
/** Pulsar la misma tecla de grupo dos veces en este tiempo lleva la camara hasta el. */
const GROUP_KEY_TWICE_MS = 450;

type Mode =
  | { kind: 'idle' }
  /**
   * Una unidad propia elegida: `range`, a donde llega (null si ya no puede moverse); `trail`, el camino
   * trazado con el cursor; `options`, su barra de acciones y `selected`, la señalada en ella.
   */
  | { kind: 'unit'; unit: Unit; range: MoveRange | null; trail: Pos[]; options: BarOption[]; selected: number }
  /** Varias unidades propias elegidas (Mayusculas + clic, doble clic o recuadro): un clic las lleva o ataca; su barra, ordenes y escuadras. */
  | { kind: 'group'; units: Unit[]; options: BarOption[]; selected: number }
  /** Elegir la casilla de la orden `order` para estas unidades. */
  | { kind: 'order'; units: Unit[]; order: TurnEndOrderKind }
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
  /** Que casillas se ven ahora (doble clic: todas las de ese tipo que se ven). */
  screen: ScreenView;
  /** La partida o lo elegido ha cambiado: volver a pintar piezas e interfaz. */
  refresh(): void;
  /** La partida se ha acabado (tras el cartel de victoria o derrota). */
  onOver(): void;
}

export class TurnControls {
  private mode: Mode = { kind: 'idle' };
  /** Mientras se anima algo (o juega otro) no se atiende la entrada. */
  private isBusy = false;
  /** «Elegir varias» (para el dedo): cada toque en una unidad la suma o la quita, como con Mayusculas. */
  private isAdding = false;
  /** La ultima tecla de grupo que eligio uno, y cuando: dos seguidas llevan la camara. */
  private lastGroupKey: { n: number; at: number } | null = null;

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

  /** Tocar una casilla; con Mayusculas, Ctrl o doble clic, cambia lo elegido (controls/selection.ts). */
  async tap(pos: Pos, mods: ClickMods = PLAIN_CLICK): Promise<void> {
    if (!this.isMyTurn) return;
    const isAddingTap = this.isAdding && !!unitAt(this.s, pos);
    if (mods.shift || mods.ctrl || mods.count >= 2 || isAddingTap)
      return this.clickSelect(pos, { ...mods, shift: mods.shift || isAddingTap });
    const mode = this.mode;
    switch (mode.kind) {
      case 'idle':
        return this.tapIdle(pos);
      case 'unit':
        return this.tapWithUnit(mode, pos);
      case 'group':
        return this.tapWithGroup(mode.units, pos);
      case 'order':
        return this.giveOrderAt(mode.units, mode.order, pos);
      case 'unload':
        return this.tapUnload(mode.unit, mode.passenger, mode.tiles, pos);
      case 'buy':
        return void this.cancel();
    }
  }

  // ---- Elegir varias ----

  /** Las unidades elegidas ahora (para el panel de lo elegido). */
  selectedUnits(): readonly Unit[] {
    const mode = this.mode;
    if (mode.kind === 'unit') return [mode.unit];
    return mode.kind === 'group' || mode.kind === 'order' ? mode.units : [];
  }

  /** Los uids de lo elegido ahora. */
  private get selection(): Selection {
    return new Set(this.selectedUnits().map((unit) => unit.uid));
  }

  private clickSelect(pos: Pos, mods: ClickMods): void {
    const hit = unitAt(this.s, pos);
    const own = hit && isSelectable(this.host.viewer, hit) ? hit : null;
    this.choose(clickSelect(this.selection, own, mods, (unit) => this.sameTypeOnScreen(unit)));
  }

  /** Las propias que se pueden elegir del mismo tipo que se ven en pantalla (doble clic). */
  private sameTypeOnScreen(unit: Unit): Unit[] {
    const isTwin = (other: Unit) => other.type === unit.type && isSelectable(this.host.viewer, other);
    return this.s.units.filter((other) => isTwin(other) && this.host.screen.isOnScreen(other));
  }

  /** Elegir las unidades de un recuadro (`add`: se suman a lo elegido). */
  selectBox(inside: readonly Unit[], add: boolean): void {
    if (!this.isMyTurn) return;
    this.choose(boxSelect(this.selection, inside, add));
  }

  /** Deja elegidas esas: ninguna, una (con su barra) o un grupo. */
  private choose(uids: Selection): void {
    const picked = pickedFrom(this.s, this.host.viewer, uids);
    if (picked.kind === 'none') return this.setMode({ kind: 'idle' });
    if (picked.kind === 'one') return this.chooseOwnUnit(picked.unit);
    this.host.sounds.play('unit_select');
    this.setMode({ kind: 'group', units: picked.units, options: groupBarOptions(this.s, this.host.viewer, picked.units), selected: 0 });
  }

  /** «Elegir varias» con el dedo esta encendido. */
  get adding(): boolean {
    return this.isAdding;
  }

  /** «Elegir varias» con el dedo: a partir de ahora cada toque en una unidad la suma o la quita (otra vez, como antes). */
  toggleAdding(): void {
    this.isAdding = !this.isAdding;
  }

  /** Elegir las unidades de una escuadra (su boton en la bandeja). */
  selectSquad(id: number): void {
    if (this.isMyTurn) this.choose(new Set(squadUnits(this.s, id).map((unit) => unit.uid)));
  }

  /**
   * Un retrato del panel de lo elegido: solo esa; con Mayusculas, quitarla; con Ctrl, solo las de su
   * tipo de entre las elegidas.
   */
  pickInSelection(uid: number, shift: boolean, ctrl: boolean): void {
    const chosen = this.selectedUnits();
    const unit = chosen.find((candidate) => candidate.uid === uid);
    if (!unit || !this.isMyTurn) return;
    const keep = shift ? chosen.filter((other) => other !== unit) : ctrl ? chosen.filter((other) => other.type === unit.type) : [unit];
    this.choose(new Set(keep.map((other) => other.uid)));
  }

  /**
   * Teclas de grupo (1-9): Ctrl hace de lo elegido el grupo de esa tecla, Mayusculas lo añade y sola
   * elige el grupo. Devuelve la unidad a la que llevar la camara si se pulsa dos veces seguidas.
   */
  async groupKey(n: number, mode: GroupMode, now: number): Promise<Unit | null> {
    if (!this.isMyTurn) return null;
    const uids = [...this.selection];
    if (mode !== 'select') {
      if (uids.length) await this.performThenChoose({ kind: mode === 'set' ? 'setGroup' : 'addToGroup', uids, key: n }, uids);
      return null;
    }
    const isTwice = this.lastGroupKey?.n === n && now - this.lastGroupKey.at <= GROUP_KEY_TWICE_MS;
    this.lastGroupKey = { n, at: now };
    const squad = squadByKey(this.s, this.host.viewer, n);
    if (!squad) return null;
    const units = squadUnits(this.s, squad.id);
    this.choose(new Set(units.map((unit) => unit.uid)));
    return isTwice ? (units[0] ?? null) : null;
  }

  /** Teclas de orden: atacar, capturar o defender alli (luego la casilla) o quitar la orden de lo elegido. */
  orderKey(order: TurnEndOrderKind | 'cancel'): void {
    const units = [...this.selectedUnits()];
    if (!units.length || !this.isMyTurn) return;
    if (order !== 'cancel') return this.setMode({ kind: 'order', units, order });
    void this.performThenChoose(
      { kind: 'cancelStandingOrder', uids: units.map((unit) => unit.uid) },
      units.map((unit) => unit.uid),
    );
  }

  /** La orden en la casilla tocada; despues siguen elegidas. */
  private async giveOrderAt(units: readonly Unit[], order: TurnEndOrderKind, at: Pos): Promise<void> {
    const uids = units.map((unit) => unit.uid);
    await this.performThenChoose({ kind: 'giveStandingOrder', uids, order: { kind: order, at: { x: at.x, y: at.y } } }, uids);
  }

  /** Hace la accion y deja elegidas esas unidades (las que aun se puedan elegir). */
  private async performThenChoose(action: GameAction, uids: readonly number[]): Promise<void> {
    this.setMode({ kind: 'idle' });
    await this.perform(action);
    this.choose(new Set(uids));
  }

  /** Cambiar el nombre de la escuadra (la ventana de la interfaz lo pide). */
  async renameSquad(id: number, name: string): Promise<void> {
    ui.set({ rename: null });
    const uids = squadUnits(this.s, id).map((unit) => unit.uid);
    if (this.isMyTurn) await this.performThenChoose({ kind: 'renameSquad', squad: id, name }, uids);
  }

  private openRename(units: readonly Unit[]): void {
    const squad = exactSquad(this.s, units);
    if (squad) ui.set({ rename: { id: squad.id, name: squadById(this.s, squad.id)?.name ?? squad.name, max: SQUAD_NAME_MAX } });
  }

  /**
   * Con un grupo elegido: tocar un enemigo hace que le ataquen las que pueden (moviendose si hace
   * falta, una tras otra); una unidad propia (del grupo o no) elige solo esa; cualquier otra casilla las lleva hacia alli,
   * lo mas cerca que llegue cada una (primero las mas cercanas). Despues sigue elegido lo que quede.
   */
  private async tapWithGroup(units: readonly Unit[], pos: Pos): Promise<void> {
    const own = unitAt(this.s, pos);
    if (own?.team === this.host.viewer) return this.chooseOwnUnit(own);
    const attackers = units.filter((unit) => this.planAt(unit, this.rangeOf(unit), pos));
    this.setMode({ kind: 'idle' });
    if (attackers.length) await this.attackTogether(attackers, pos);
    else await this.moveTogether(units, pos);
    this.choose(new Set(units.map((unit) => unit.uid)));
  }

  private async attackTogether(attackers: readonly Unit[], pos: Pos): Promise<void> {
    for (const attacker of attackers) {
      const plan = this.planAt(attacker, this.rangeOf(attacker), pos);
      if (plan) await this.moveAndAttack(plan, this.rangeOf(attacker), []);
    }
  }

  private async moveTogether(units: readonly Unit[], goal: Pos): Promise<void> {
    for (const unit of groupMoveOrder(units, goal)) {
      const step = groupMoveStep(this.s, unit, goal);
      if (step) await this.perform(step);
    }
  }

  /** A donde llega ahora (null si ya no puede moverse este turno). */
  private rangeOf(unit: Unit): MoveRange | null {
    return canMoveNow(unit) ? moveRange(this.s, unit) : null;
  }

  // ---- Una unidad ----

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
    const range = this.rangeOf(unit);
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
        this.setMode({ kind: 'idle' });
        if (await this.moveAndAttack(intent.plan, mode.range, mode.trail)) this.select(unit);
        return;
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

  /** Va a donde dice el plan (por el camino trazado, si lo hay) y ataca. false si algo no vale. */
  private async moveAndAttack(plan: AttackPlan, range: MoveRange | null, trail: readonly Pos[]): Promise<boolean> {
    const { attacker, from, target } = plan;
    const mustMove = !samePos(from, attacker) && range;
    if (mustMove && !(await this.perform({ kind: 'move', uid: attacker.uid, to: from, path: pathFor(range, trail, from) }))) return false;
    return this.perform({ kind: 'attack', uid: attacker.uid, target: target.uid });
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
      case 'group':
        return this.groupBar(mode.units, mode.options, mode.selected);
      case 'order':
        return { kind: 'actions', title: t('orderPick'), items: [{ id: 'back', label: t('back') }], selected: 0, at: mode.units[0]! };
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

  private groupBar(units: readonly Unit[], options: readonly BarOption[], selected: number): MenuView | null {
    const [first] = units;
    if (!options.length || !first) return null;
    const title = `${t('pickedTitle')} · ${units.length}`;
    return { kind: 'actions', title, items: barItems(this.s, first, options), selected, at: first };
  }

  private buyMenu(building: Building, options: readonly BuyOption[], selected: number): MenuView {
    const items = [{ id: 'cancel', label: t('cancel'), icon: null }, ...options.map((option) => buyItem(this.s, option))];
    const title = nameOf(buildingTypeOf(this.s, building));
    const subtitle = `${t('funds')}: ${fmtNum(teamState(this.s, this.host.viewer).funds)}`;
    return { kind: 'buy', title, subtitle, items, selected, at: building };
  }

  hoverMenu(index: number): void {
    const mode = this.mode;
    if (mode.kind !== 'unit' && mode.kind !== 'group' && mode.kind !== 'buy') return;
    this.setMode({ ...mode, selected: index });
  }

  pickMenu(index: number): void {
    if (this.isBusy) return;
    const mode = this.mode;
    if (mode.kind === 'unit') void this.pickBarOption([mode.unit], mode.options[index]);
    if (mode.kind === 'group') void this.pickBarOption(mode.units, mode.options[index]);
    if (mode.kind === 'unload') this.select(mode.unit);
    if (mode.kind === 'order') this.choose(this.selection);
    if (mode.kind === 'buy') void this.pickBuy(mode.building, mode.options[index - 1]);
  }

  /** Elegir la opcion señalada (Intro). */
  acceptMenu(): void {
    const mode = this.mode;
    if (mode.kind === 'unit' || mode.kind === 'group' || mode.kind === 'buy') this.pickMenu(mode.selected);
  }

  /** Una opcion de la barra con estas unidades (una o un grupo). */
  private async pickBarOption(units: readonly Unit[], option: BarOption | undefined): Promise<void> {
    const [first] = units;
    if (!option || !first) return;
    if (option === 'unload') return this.startUnloading(first);
    if (option === 'squadRename') return this.openRename(units);
    const order = ORDER_KINDS[option];
    if (order) return this.setMode({ kind: 'order', units: [...units], order });
    const action = barAction(this.s, this.host.viewer, units, option);
    if (!action) return;
    if (units.length === 1) return this.actThenSelect(first, action);
    await this.performThenChoose(
      action,
      units.map((unit) => unit.uid),
    );
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
    else if (mode.kind === 'order') this.choose(this.selection);
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
    if (mode.kind === 'idle') this.isAdding = false;
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
    marks.showGroup(mode.kind === 'group' || mode.kind === 'order' ? mode.units : []);
  }

  /** En azul: a donde llega la elegida, o donde se puede bajar al pasajero. */
  private reachTiles(): Pos[] {
    const mode = this.mode;
    if (mode.kind === 'unload') return mode.tiles;
    return mode.kind === 'unit' && mode.range ? reachableTiles(mode.range) : [];
  }

  /** En rojo: a quien puede atacar la elegida (o alguna del grupo) este turno. */
  private targetTiles(): Pos[] {
    const mode = this.mode;
    if (mode.kind === 'unit') return attackTargetsFromRange(this.s, mode.unit, mode.range);
    if (mode.kind !== 'group') return [];
    const targets = mode.units.flatMap((unit) => attackTargetsFromRange(this.s, unit, this.rangeOf(unit)));
    return [...new Set(targets)];
  }
}

/** Los enemigos visibles a los que podria llegar a atacar este turno (moviendose o no). */
function attackTargetsFromRange(s: Parameters<typeof attackTargets>[0], unit: Unit, range: MoveRange | null): Unit[] {
  const enemies = s.units.filter((other) => other.team !== unit.team);
  return enemies.filter((enemy) => attackPlan(s, unit, range, enemy) !== null);
}
