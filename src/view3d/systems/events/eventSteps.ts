/**
 * Que pasos lleva cada suceso de la partida (los `events` que devuelve una accion) al animarse en 3D.
 * Uno nuevo es una entrada mas en EVENT_STEPS; los sucesos sin entrada no se animan (la pieza salta a
 * donde diga la partida con el siguiente `sync`). Lo que la niebla tapa no se anima: no se delata.
 * Solo decide (datos, sin three.js); lo cumple timeline.ts.
 */
import type { MovementMotion } from '../../../core/content';
import { buildingTypeOf } from '../../../core/gameContent';
import type { GameEvent, GameState, Pos, TeamId } from '../../../core/model';
import { buildingIncome } from '../../../core/rules';
import { t } from '../../../settings';
import type { PieceLookup } from '../../ports/stage';
import { captureSound, shotSound, STEP_SOUNDS } from '../sound/soundCues';
import { feet, muzzle, sound, together, type AnimationStep } from './steps';

/** De lejos (mas de una casilla) el disparo va en arco. */
const ARC_FROM = 1.5;
const DAMAGE_COLOR = '#ff7a73';
/** Lo que deja cada forma de moverse al caer: la infanteria se va (queda la mancha); vehiculos y aviones, sus restos. */
const LEAVES_WRECK: Readonly<Record<MovementMotion, boolean>> = { march: false, drive: true, fly: true };
const GUN_SMOKE_PUFFS = 4;
const BLAST_PUFFS = 14;
const FALL_SMOKE_PUFFS = 8;
const HIT_SPARKS = 1;
const FALL_SPARKS = 1.6;
const CAPTURE_PARTIAL = { color: '#fff1a8', sparks: 0.7 } as const;
const CAPTURE_DONE = { color: '#ffd447', sparks: 1.3 } as const;
/** Por encima del suelo del edificio (casillas) salen las chispas y el texto de la captura. */
const CAPTURE_LIFT = 0.5;

const INCOME_COLOR = '#ffd447';
/** Por encima del suelo del edificio sale lo que cobra. */
const INCOME_LIFT = 0.7;

/**
 * Lo que hace falta saber de la partida para los sucesos del dia: quien mira (lo que cobra, solo lo
 * suyo) y lo que paga cada edificio de un equipo.
 */
export interface DayLookup {
  readonly viewer: TeamId;
  incomeSpots(team: TeamId): IncomeSpot[];
}

/** Un edificio que cobra al empezar el dia: donde esta y cuanto. */
export interface IncomeSpot {
  readonly pos: Pos;
  readonly amount: number;
}

/** Los edificios de un equipo que cobran, con lo que paga cada uno. */
export function incomeSpotsOf(s: GameState, team: TeamId): IncomeSpot[] {
  return s.buildings
    .filter((building) => building.owner === team)
    .map((building) => ({ pos: { x: building.x, y: building.y }, amount: buildingIncome(s, buildingTypeOf(s, building)) }))
    .filter((spot) => spot.amount > 0);
}

type EventOf<K extends GameEvent['kind']> = Extract<GameEvent, { kind: K }>;
type EventStepBuilders = {
  readonly [K in GameEvent['kind']]?: (event: EventOf<K>, pieces: PieceLookup, day: DayLookup | null) => AnimationStep[];
};

/** Cada casilla del camino con la siguiente. */
const stepsAlong = (path: readonly Pos[]): [Pos, Pos][] => path.slice(1).map((to, index) => [path[index]!, to]);

/** Moverse: arranca su animacion de marcha, una casilla tras otra (con su paso) y vuelve a quedarse quieta. */
function moveSteps(event: EventOf<'move'>, pieces: PieceLookup): AnimationStep[] {
  const piece = pieces.pieceOf(event.uid);
  if (!piece?.isVisible) return [];
  const walk = stepsAlong(event.path).flatMap(([from, to]): AnimationStep[] => [
    sound(STEP_SOUNDS[piece.motion]),
    { kind: 'walk', uid: event.uid, from, to },
  ]);
  return [{ kind: 'clip', uid: event.uid, clip: 'drive' }, ...walk, { kind: 'clip', uid: event.uid, clip: 'idle' }];
}

/** Un disparo: apunta, suena, sale humo de la boca y a la vez el golpe de vuelta y el proyectil. */
function shotSteps(shooter: number, motion: MovementMotion, target: number, pieces: PieceLookup): AnimationStep[] {
  const isArc = pieces.shotDistance(shooter, target) > ARC_FROM;
  return [
    { kind: 'aim', uid: shooter, target },
    sound(shotSound(motion, isArc)),
    { kind: 'puff', puff: 'gunSmoke', at: muzzle(shooter), count: GUN_SMOKE_PUFFS },
    together({ kind: 'recoil', uid: shooter }, { kind: 'projectile', from: muzzle(shooter), to: muzzle(target), isArc }),
  ];
}

/** Lo que pasa al que recibe: chispas, una sacudida y el daño que sube. */
const hitSteps = (uid: number, damage: number): AnimationStep[] => [
  sound('hit'),
  together(
    { kind: 'sparks', at: muzzle(uid), power: HIT_SPARKS },
    { kind: 'shake', uid },
    { kind: 'text', at: muzzle(uid), text: `−${damage}`, color: DAMAGE_COLOR },
  ),
];

/** Una unidad destruida estalla y deja una mancha quemada; despues, sus restos o nada (`sync` quita su pieza). */
const fallSteps = (uid: number, motion: MovementMotion): AnimationStep[] => [
  sound('explosion'),
  { kind: 'puff', puff: 'blast', at: muzzle(uid), count: BLAST_PUFFS },
  { kind: 'puff', puff: 'darkSmoke', at: muzzle(uid), count: FALL_SMOKE_PUFFS },
  { kind: 'scorch', at: feet(uid) },
  together({ kind: 'sparks', at: muzzle(uid), power: FALL_SPARKS }, { kind: 'fall', uid, leavesWreck: LEAVES_WRECK[motion] }),
];

interface Hit {
  damage: number;
  killed: boolean;
}

/** Un golpe de un lado al otro (si se ve alguno de los dos) y, si cae el que lo recibe, su caida. */
function exchangeSteps(shooter: number | null, target: number | null, hit: Hit, pieces: PieceLookup): AnimationStep[] {
  const targetPiece = target === null ? null : pieces.pieceOf(target);
  if (target === null || !targetPiece) return [];
  const shooterPiece = shooter === null ? null : pieces.pieceOf(shooter);
  const shot = shooter !== null && shooterPiece?.isVisible ? shotSteps(shooter, shooterPiece.motion, target, pieces) : [];
  if (!targetPiece.isVisible) return shot;
  const fall = hit.killed ? fallSteps(target, targetPiece.motion) : [];
  return [...shot, ...hitSteps(target, hit.damage), ...fall];
}

/** Atacar: el golpe y, si el blanco sigue en pie y responde, el contraataque. */
function attackSteps(event: EventOf<'attack'>, pieces: PieceLookup): AnimationStep[] {
  const attack = exchangeSteps(event.attacker, event.target, { damage: event.damage, killed: event.killed }, pieces);
  if (event.counter <= 0 || event.killed) return attack;
  const counter = exchangeSteps(event.target, event.attacker, { damage: event.counter, killed: event.attackerKilled }, pieces);
  return [...attack, ...counter];
}

/**
 * Capturar: la unidad da dos saltitos y del edificio salen chispas doradas con lo que le queda (o, si
 * ya es suyo, «¡CAPTURADO!»; el edificio con sus colores nuevos lo pone `sync`, creciendo).
 */
function captureSteps(event: EventOf<'capture'>, pieces: PieceLookup): AnimationStep[] {
  if (!pieces.pieceOf(event.uid)?.isVisible) return [];
  const isDone = event.left <= 0;
  const label = isDone ? t(event.owner === null ? 'fxNeutral' : 'fxCaptured') : `${event.left}/${event.total}`;
  const look = isDone ? CAPTURE_DONE : CAPTURE_PARTIAL;
  const at = { kind: 'tile', pos: event.at, lift: CAPTURE_LIFT } as const;
  return [
    sound(captureSound(isDone)),
    together(
      { kind: 'hop', uid: event.uid },
      { kind: 'sparks', at, power: look.sparks },
      { kind: 'text', at, text: label, color: look.color },
    ),
  ];
}

/** Al empezar el dia, lo tuyo: sobre cada edificio que cobra, a la vez, una chapa dorada con lo que paga («+1000»). */
function incomeSteps(event: EventOf<'income'>, _pieces: PieceLookup, day: DayLookup | null): AnimationStep[] {
  if (!day || event.team !== day.viewer || event.source !== 'buildings') return [];
  const chips = day.incomeSpots(event.team).map(({ pos, amount }): AnimationStep => ({
    kind: 'text',
    at: { kind: 'tile', pos, lift: INCOME_LIFT },
    text: `+${amount}`,
    color: INCOME_COLOR,
  }));
  return chips.length ? [sound('capture'), together(...chips)] : [];
}

const EVENT_STEPS: EventStepBuilders = { move: moveSteps, attack: attackSteps, capture: captureSteps, income: incomeSteps };

type AnyEventSteps = (event: GameEvent, pieces: PieceLookup, day: DayLookup | null) => AnimationStep[];

/** Los pasos de ese suceso, con las piezas como estan ahora (vacio si no se anima); `day`, para los del dia. */
export function stepsOf(event: GameEvent, pieces: PieceLookup, day: DayLookup | null = null): AnimationStep[] {
  // TypeScript no sabe que la entrada de cada clase recibe un suceso de esa misma clase.
  const build = EVENT_STEPS[event.kind] as AnyEventSteps | undefined;
  return build?.(event, pieces, day) ?? [];
}
