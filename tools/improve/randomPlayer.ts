/**
 * Un "jugador" que hace jugadas legales al azar (mover, atacar, capturar, unir, subir, bajar,
 * abastecer, comprar). No juega bien: sirve para recorrer combinaciones raras que la IA nunca prueba.
 * Es un controlador como cualquiera (`Controller`, core/session): decide con la vista de su equipo
 * (`PlayerView`, al dia tras cada accion) y propone sus acciones, que manda la sesion. No sabe las
 * reglas: elige entre las acciones que el juego daria por buenas ahora (`isValidAction`), como las
 * que ofrecen los menus (`UNIT_MENU`).
 */
import { isValidAction, UNIT_MENU, type UnitMenuOption } from '@core/actions';
import { moveRange, reachableTiles, teamUnits, unitById } from '@core/rules';
import { posOf } from '@core/geom';
import { proposing, type Controller } from '@core/session';
import { seeing, type PlayerView } from '@core/playerView';
import { pick } from '@core/util/random';
import type { ActionPlan, Building, GameAction, Rng, Unit } from '@core/model';

/** Cuantas veces de cada 1 hace cada cosa (si puede). */
const CHANCE = {
  /** Unirse a otra igual o subir a un transporte, en vez de moverse. */
  join: 0.16,
  /** Moverse antes de hacer lo demas. */
  move: 0.85,
  /** Despues de moverse: bajar a un pasajero, atacar, capturar, reparar. */
  unload: 0.5,
  attack: 0.8,
  capture: 0.9,
  supply: 0.3,
  /** Comprar en cada edificio libre. */
  buy: 0.6,
} as const;

/** Lo que hace en el menu de la unidad despues de moverse, en orden (si sale el azar y vale). */
const AFTER_MOVE: readonly (UnitMenuOption & keyof typeof CHANCE)[] = ['unload', 'attack', 'capture', 'supply'];

/** Juega al azar, con `rng`. */
export const randomController = (rng: Rng): Controller => ({
  name: 'random',
  playTurn: (view) => proposing(seeing(view, randomTurn(view, rng))),
});

/** El turno al azar: cada unidad que puede actuar hace algo, y despues compra en algunos edificios. */
function* randomTurn(view: PlayerView, rng: Rng): ActionPlan {
  for (const uid of teamUnits(view.state, view.team).map((unit) => unit.uid)) yield* actRandomly(view, rng, uid);
  for (const building of view.state.buildings) yield* buyRandomly(view, rng, building);
}

/** Las que valen ahora para el equipo que mira, de estas. */
const validOnes = (view: PlayerView, actions: readonly GameAction[]): GameAction[] =>
  actions.filter((action) => isValidAction(view.state, view.team, action));

/** Propone una al azar de las que valen (si sale `chance` y hay alguna). Devuelve si se ha hecho. */
function* tryOne(view: PlayerView, rng: Rng, chance: number, actions: readonly GameAction[]): ActionPlan<boolean> {
  if (rng() >= chance) return false;
  const action = pick(validOnes(view, actions), rng);
  return action ? (yield action).ok : false;
}

/** Lo que pediria la opcion `option` del menu de la unidad (lo que valga lo dice tryOne). */
const menuActions = (view: PlayerView, unit: Unit, option: UnitMenuOption): GameAction[] =>
  UNIT_MENU.filter((entry) => entry.id === option).flatMap((entry) => entry.candidates(view.state, unit));

/** Unirse a otra o subir a un transporte: con cada unidad propia que haya. */
const joinActions = (view: PlayerView, unit: Unit): GameAction[] =>
  view.state.units.flatMap((other): GameAction[] => [
    { kind: 'merge', uid: unit.uid, into: other.uid },
    { kind: 'load', uid: unit.uid, into: other.uid },
  ]);

/** Moverse a una casilla de su alcance. */
const moveActions = (view: PlayerView, unit: Unit): GameAction[] =>
  reachableTiles(moveRange(view.state, unit)).map((to) => ({ kind: 'move', uid: unit.uid, to }));

/** Algo al azar con la unidad (si aun esta): unirse o subir, o moverse y hacer algo desde alli; y si le queda turno, esperar. */
function* actRandomly(view: PlayerView, rng: Rng, uid: number): ActionPlan {
  const current = () => unitById(view.state, uid);
  const unit = current();
  if (!unit) return;
  if (yield* tryOne(view, rng, CHANCE.join, joinActions(view, unit))) return;
  yield* tryOne(view, rng, CHANCE.move, moveActions(view, unit));
  for (const option of AFTER_MOVE) {
    const now = current();
    if (now && (yield* tryOne(view, rng, CHANCE[option], menuActions(view, now, option)))) break;
  }
  const after = current();
  if (after) yield* tryOne(view, rng, 1, menuActions(view, after, 'wait'));
}

/** Comprar algo al azar (de lo que valga) en el edificio, si sale el azar. */
function* buyRandomly(view: PlayerView, rng: Rng, building: Building): ActionPlan {
  const at = posOf(building);
  const purchases = view.state.content.units.list.map((unitType): GameAction => ({ kind: 'buy', at, unitType: unitType.id }));
  yield* tryOne(view, rng, CHANCE.buy, purchases);
}
