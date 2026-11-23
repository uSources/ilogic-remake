/**
 * Que pasos lleva cada suceso de la partida (los `events` que devuelve una accion) al animarse en 3D.
 * Uno nuevo es una entrada mas en EVENT_STEPS; los sucesos sin entrada no se animan (la pieza salta a
 * donde diga la partida con el siguiente `sync`). Lo que la niebla tapa no se anima ni suena: no se
 * delata. Cada sonido sale de su sitio (la pieza, la casilla). Solo decide (datos, sin three.js); lo
 * cumple timeline.ts.
 */
import type { SoundName } from '../../../audio/sounds';
import type { MovementMotion } from '../../../core/content';
import { buildingTypeOf, unitTypeOf } from '../../../core/gameContent';
import { posOf } from '../../../core/geom';
import type { GameEvent, GameState, IncomeSource, Pos, TeamId } from '../../../core/model';
import { buildingIncome, isContested, visibility } from '../../../core/rules';
import { t } from '../../../settings';
import type { PieceLookup, ShownPiece, Spot } from '../../ports/stage';
import { captureSound, hitSound, shotSound, spawnSound, stepSounds, surfaceOf, unitSounds, type Surface } from '../sound/soundCues';
import { feet, muzzle, sound, together, type AnimationStep } from './steps';

/** De lejos (mas de una casilla) el disparo va en arco. */
const ARC_FROM = 1.5;
const DAMAGE_COLOR = '#ff7a73';
/** Lo que deja cada forma de moverse al caer: la infanteria se va (queda la mancha); vehiculos y aviones, sus restos. */
const LEAVES_WRECK: Readonly<Record<MovementMotion, boolean>> = { march: false, drive: true, fly: true };
const GUN_SMOKE_PUFFS = 4;
/** Lo grande que es la explosion de cada forma de moverse (1, la de un vehiculo). */
const EXPLOSION_SIZE: Readonly<Record<MovementMotion, number>> = { march: 0.65, drive: 1, fly: 1 };
const FALL_SMOKE_PUFFS = 10;
const HIT_SPARKS = 1;
const FALL_SPARKS = 1.6;
const CAPTURE_PARTIAL = { color: '#fff1a8', sparks: 0.7 } as const;
const CAPTURE_DONE = { color: '#ffd447', sparks: 1.3 } as const;
/** Por encima del suelo del edificio (casillas) salen las chispas y el texto de la captura. */
const CAPTURE_LIFT = 0.5;

const INCOME_COLOR = '#ffd447';
/** Por encima del suelo del edificio sale lo que cobra. */
const INCOME_LIFT = 0.7;
/** Lo que suena en una casilla sale algo por encima de su suelo. */
const TILE_SOUND_LIFT = 0.3;
/** Sin tablero que diga el suelo (tests), se pisa hierba. */
const DEFAULT_SURFACE: Surface = 'grass';

/**
 * Lo que hace falta saber de la partida para los sucesos del dia: quien mira (lo que cobra, solo lo
 * suyo) y lo que paga cada sitio de un equipo por cada fuente de ingresos (edificios, puntos de control).
 */
export interface DayLookup {
  readonly viewer: TeamId;
  incomeSpots(team: TeamId, source: IncomeSource): IncomeSpot[];
}

/** Lo que hace falta saber del tablero: el suelo de cada casilla (sus pasos), si quien mira la ve y como se mueve cada clase de unidad. */
export interface BoardLookup {
  surfaceAt(pos: Pos): Surface;
  isSeen(pos: Pos): boolean;
  motionOf(unitType: string): MovementMotion;
}

/** Un sitio que cobra al empezar el dia (un edificio, un punto de control): donde esta y cuanto. */
export interface IncomeSpot {
  readonly pos: Pos;
  readonly amount: number;
}

/** Los edificios de un equipo que cobran, con lo que paga cada uno. */
function buildingSpots(s: GameState, team: TeamId): IncomeSpot[] {
  return s.buildings
    .filter((building) => building.owner === team)
    .map((building) => ({ pos: posOf(building), amount: buildingIncome(s, buildingTypeOf(s, building)) }))
    .filter((spot) => spot.amount > 0);
}

/** [CAMBIO] (en 2013 no habia puntos de control) Los que le han pagado: los suyos sin disputar (se mira tras el fin de ronda). */
function controlPointSpots(s: GameState, team: TeamId): IncomeSpot[] {
  return (s.controlPoints ?? [])
    .filter((point) => point.owner === team && !isContested(s, point))
    .map((point) => ({ pos: posOf(point), amount: s.settings.controlIncome }));
}

/** De donde sale lo que cobra un equipo, por cada fuente de ingresos del fin de ronda. */
const INCOME_SPOTS: Readonly<Record<IncomeSource, (s: GameState, team: TeamId) => IncomeSpot[]>> = {
  buildings: buildingSpots,
  controlPoints: controlPointSpots,
};

/** Los sitios de un equipo que cobran por esa fuente, con lo que paga cada uno. */
export const incomeSpotsOf = (s: GameState, team: TeamId, source: IncomeSource): IncomeSpot[] => INCOME_SPOTS[source](s, team);

/** El tablero de la partida tal como lo ve `viewer`. */
export function boardLookupOf(s: GameState, viewer: TeamId): BoardLookup {
  return {
    surfaceAt: (pos) => surfaceOf(s, pos),
    isSeen: (pos) => visibility(s, viewer).at(pos),
    motionOf: (unitType) => unitTypeOf(s, { type: unitType }).motion,
  };
}

/** Lo que se sabe al decidir los pasos de un suceso: las piezas, lo del dia y el tablero (sin ellos, lo que se pueda). */
interface StepContext {
  readonly pieces: PieceLookup;
  readonly day: DayLookup | null;
  readonly board: BoardLookup | null;
}

type EventOf<K extends GameEvent['kind']> = Extract<GameEvent, { kind: K }>;
type EventStepBuilders = {
  readonly [K in GameEvent['kind']]?: (event: EventOf<K>, context: StepContext) => AnimationStep[];
};

const tileSpot = (pos: Pos, lift = TILE_SOUND_LIFT): Spot => ({ kind: 'tile', pos, lift });

/** Cada casilla del camino con la siguiente. */
const stepsAlong = (path: readonly Pos[]): [Pos, Pos][] => path.slice(1).map((to, index) => [path[index]!, to]);

const soundsOfPiece = (piece: ShownPiece) => unitSounds(piece.unitType, piece.motion);

/**
 * Moverse: arranca su animacion de marcha (y su motor, si arranca), una casilla tras otra (con su paso,
 * segun el suelo) y vuelve a quedarse quieta.
 */
function moveSteps(event: EventOf<'move'>, { pieces, board }: StepContext): AnimationStep[] {
  const piece = pieces.pieceOf(event.uid);
  if (!piece?.isVisible) return [];
  const sounds = soundsOfPiece(piece);
  const engineStart = sounds.start ? [sound(sounds.start, feet(event.uid))] : [];
  const walk = stepsAlong(event.path).flatMap(([from, to]): AnimationStep[] => [
    ...stepSounds(sounds, piece.motion, board?.surfaceAt(to) ?? DEFAULT_SURFACE).map((step) => sound(step, feet(event.uid))),
    { kind: 'walk', uid: event.uid, from, to },
  ]);
  const ambush = event.interruption?.kind === 'ambush' ? [sound('ambush', feet(event.uid))] : [];
  return [
    { kind: 'clip', uid: event.uid, clip: 'drive' },
    ...engineStart,
    ...walk,
    ...ambush,
    { kind: 'clip', uid: event.uid, clip: 'idle' },
  ];
}

/** Un disparo: apunta (con el giro de su torreta), suena, sale humo de la boca y a la vez el golpe de vuelta y el proyectil. */
function shotSteps(shooter: number, piece: ShownPiece, target: number, pieces: PieceLookup): AnimationStep[] {
  const isArc = pieces.shotDistance(shooter, target) > ARC_FROM;
  const { aim } = soundsOfPiece(piece);
  const incoming = isArc ? [sound('shell_incoming', muzzle(target))] : [];
  return [
    ...(aim ? [sound(aim, muzzle(shooter))] : []),
    { kind: 'aim', uid: shooter, target },
    sound(shotSound(piece.unitType, piece.motion), muzzle(shooter)),
    { kind: 'puff', puff: 'gunSmoke', at: muzzle(shooter), count: GUN_SMOKE_PUFFS },
    ...incoming,
    together({ kind: 'recoil', uid: shooter }, { kind: 'projectile', from: muzzle(shooter), to: muzzle(target), isArc }),
  ];
}

/** Lo que pasa al que recibe: chispas, una sacudida y el daño que sube. */
const hitSteps = (uid: number, piece: ShownPiece, hit: Hit): AnimationStep[] => [
  sound(hitSound(piece.motion, hit.damage), muzzle(uid)),
  together(
    { kind: 'sparks', at: muzzle(uid), power: HIT_SPARKS },
    { kind: 'shake', uid },
    { kind: 'lifeLoss', uid, from: hit.lifeBefore, to: Math.max(0, hit.lifeBefore - hit.damage) },
    { kind: 'text', at: muzzle(uid), text: `−${hit.damage}`, color: DAMAGE_COLOR },
  ),
];

/**
 * Una unidad destruida estalla: deja una mancha quemada, desaparece dentro de la explosion (con sus
 * restos o sin nada; `sync` quita su pieza) y queda una columna de humo negro.
 */
const fallSteps = (uid: number, piece: ShownPiece): AnimationStep[] => [
  sound(soundsOfPiece(piece).down, muzzle(uid)),
  { kind: 'scorch', at: feet(uid) },
  together(
    { kind: 'explosion', at: muzzle(uid), ground: feet(uid), size: EXPLOSION_SIZE[piece.motion] },
    { kind: 'sparks', at: muzzle(uid), power: FALL_SPARKS },
    { kind: 'fall', uid, leavesWreck: LEAVES_WRECK[piece.motion] },
  ),
  { kind: 'puff', puff: 'darkSmoke', at: muzzle(uid), count: FALL_SMOKE_PUFFS },
];

interface Hit {
  /** La vida del que recibe antes del golpe. */
  lifeBefore: number;
  damage: number;
  killed: boolean;
}

/** Un golpe de un lado al otro (si se ve alguno de los dos) y, si cae el que lo recibe, su caida. */
function exchangeSteps(shooter: number | null, target: number | null, hit: Hit, pieces: PieceLookup): AnimationStep[] {
  const targetPiece = target === null ? null : pieces.pieceOf(target);
  if (target === null || !targetPiece) return [];
  const shooterPiece = shooter === null ? null : pieces.pieceOf(shooter);
  const shot = shooter !== null && shooterPiece?.isVisible ? shotSteps(shooter, shooterPiece, target, pieces) : [];
  if (!targetPiece.isVisible) return shot;
  const fall = hit.killed ? fallSteps(target, targetPiece) : [];
  return [...shot, ...hitSteps(target, targetPiece, hit), ...fall];
}

/** Atacar: el golpe y, si el blanco sigue en pie y responde, el contraataque. */
function attackSteps(event: EventOf<'attack'>, { pieces, day }: StepContext): AnimationStep[] {
  const { attackerLife, defenderLife } = event.combat;
  const hit = { lifeBefore: defenderLife, damage: event.damage, killed: event.killed };
  const warCry = event.attacker !== null && day?.viewer === event.actor ? atVisiblePiece('voice_attack', event.attacker, pieces) : [];
  const attack = [...lifeBeforeSteps(event, pieces), ...warCry, ...exchangeSteps(event.attacker, event.target, hit, pieces)];
  if (event.counter <= 0 || event.killed) return attack;
  const counterHit = { lifeBefore: attackerLife, damage: event.counter, killed: event.attackerKilled };
  return [...attack, ...exchangeSteps(event.target, event.attacker, counterHit, pieces)];
}

/** Las dos chapas vuelven a la vida de antes del combate, para que cada una baje cuando le llega su golpe. */
function lifeBeforeSteps(event: EventOf<'attack'>, pieces: PieceLookup): AnimationStep[] {
  const lives = [
    { uid: event.target, life: event.combat.defenderLife },
    { uid: event.attacker, life: event.combat.attackerLife },
  ];
  return lives.flatMap(({ uid, life }) => (uid !== null && pieces.pieceOf(uid) ? [{ kind: 'lifeShown' as const, uid, life }] : []));
}

/**
 * Capturar: la unidad da dos saltitos y del edificio salen chispas doradas con lo que le queda (o, si
 * ya es suyo, «¡CAPTURADO!»; el edificio con sus colores nuevos lo pone `sync`, creciendo).
 */
function captureSteps(event: EventOf<'capture'>, { pieces, day }: StepContext): AnimationStep[] {
  if (!pieces.pieceOf(event.uid)?.isVisible) return [];
  const isDone = event.left <= 0;
  const label = isDone ? t(event.owner === null ? 'fxNeutral' : 'fxCaptured') : `${event.left}/${event.total}`;
  const look = isDone ? CAPTURE_DONE : CAPTURE_PARTIAL;
  const at = { kind: 'tile', pos: event.at, lift: CAPTURE_LIFT } as const;
  const cheer = isDone && day?.viewer === event.actor ? [sound('voice_cheer', feet(event.uid))] : [];
  return [
    sound(captureSound(isDone), at),
    ...cheer,
    together(
      { kind: 'hop', uid: event.uid },
      { kind: 'sparks', at, power: look.sparks },
      { kind: 'text', at, text: label, color: look.color },
    ),
  ];
}

/**
 * Al empezar el dia, lo tuyo: sobre cada sitio que cobra, a la vez, una chapa dorada con lo que paga
 * («+1000»); primero los edificios y despues los puntos de control (un suceso por fuente).
 */
function incomeSteps(event: EventOf<'income'>, { day }: StepContext): AnimationStep[] {
  if (!day || event.team !== day.viewer) return [];
  const chips = day.incomeSpots(event.team, event.source).map(({ pos, amount }): AnimationStep => ({
    kind: 'text',
    at: { kind: 'tile', pos, lift: INCOME_LIFT },
    text: `+${amount}`,
    color: INCOME_COLOR,
  }));
  return chips.length ? [sound('income'), together(...chips)] : [];
}

/** Un sonido en la pieza `uid`, si se ve. */
function atVisiblePiece(name: SoundName, uid: number, pieces: PieceLookup): AnimationStep[] {
  return pieces.pieceOf(uid)?.isVisible ? [sound(name, feet(uid))] : [];
}

/** Un sonido en la casilla `pos`, si quien mira la ve (sin tablero, se supone que si). */
function atSeenTile(name: SoundName, pos: Pos, board: BoardLookup | null): AnimationStep[] {
  return board && !board.isSeen(pos) ? [] : [sound(name, tileSpot(pos))];
}

/** Un sonido sin sitio, solo si el suceso es de quien mira (lo de los demas no se oye: sus esperas, su dinero). */
const forViewer = (name: SoundName, team: TeamId, day: DayLookup | null): AnimationStep[] => (day?.viewer === team ? [sound(name)] : []);

/** Aparece una unidad comprada (la de cualquiera, si se ve su casilla): el sonido de lo que la hace. */
function spawnSteps(event: EventOf<'spawn'>, { board }: StepContext): AnimationStep[] {
  const motion = board?.motionOf(event.unitType) ?? 'march';
  return atSeenTile(spawnSound(motion), event.at, board);
}

/** Lo que solo suena (sin animacion): cada suceso con su sonido y su sitio. */
const SOUND_ONLY_STEPS: EventStepBuilders = {
  spawn: spawnSteps,
  load: (event, { pieces }) => atVisiblePiece('load', event.into, pieces),
  unload: (event, { board }) => atSeenTile('unload', event.to, board),
  merge: (event, { pieces }) => atVisiblePiece('merge', event.into, pieces),
  supply: (event, { pieces }) => atVisiblePiece('supply', event.uid, pieces),
  heal: (event, { pieces, day }) => (day?.viewer === event.team ? atVisiblePiece('heal', event.uid, pieces) : []),
  wait: (event, { pieces, day }) => (day?.viewer === event.actor ? atVisiblePiece('wait', event.uid, pieces) : []),
  undoMove: (event, { pieces }) => atVisiblePiece('undo', event.uid, pieces),
  remove: (event, { pieces }) => atVisiblePiece('unit_disband', event.uid, pieces),
  captureDropped: (event, { board }) => atSeenTile('capture_dropped', event.at, board),
  standingOrderDone: (event, { pieces, day }) => (day?.viewer === event.actor ? atVisiblePiece('order_done', event.uid, pieces) : []),
  fundsCapped: (event, { day }) => forViewer('funds_capped', event.team, day),
  turnEnd: (event, { day }) => forViewer('end_turn', event.actor, day),
  teamDefeated: () => [sound('team_defeated')],
  newDay: () => [sound('new_day')],
};

const EVENT_STEPS: EventStepBuilders = {
  ...SOUND_ONLY_STEPS,
  move: moveSteps,
  attack: attackSteps,
  capture: captureSteps,
  income: incomeSteps,
};

type AnyEventSteps = (event: GameEvent, context: StepContext) => AnimationStep[];

/** Los pasos de ese suceso, con las piezas como estan ahora (vacio si no se anima); `day`, para los del dia; `board`, el suelo y la niebla. */
export function stepsOf(
  event: GameEvent,
  pieces: PieceLookup,
  day: DayLookup | null = null,
  board: BoardLookup | null = null,
): AnimationStep[] {
  // TypeScript no sabe que la entrada de cada clase recibe un suceso de esa misma clase.
  const build = EVENT_STEPS[event.kind] as AnyEventSteps | undefined;
  return build?.(event, { pieces, day, board }) ?? [];
}
