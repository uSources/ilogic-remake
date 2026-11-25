/**
 * Lo que suena en el tablero sin ser de una unidad concreta: los pasos segun el suelo, los edificios y
 * los sucesos de la partida (`GameEvent`, src/core/model/events.ts).
 */
import { effect, type SoundSpec } from './spec';

/** Los pasos de la infanteria cambian con el suelo de la casilla; suenan una vez por casilla. */
const INFANTRY_STEPS: SoundSpec[] = [
  effect('step_grass', 0.4, 'constant', 'Two quick small boot footsteps on soft grass'),
  effect('step_sand', 0.4, 'constant', 'Two quick small boot footsteps crunching on dry sand'),
  effect('step_snow', 0.4, 'constant', 'Two quick small boot footsteps crunching in fresh snow'),
  effect('step_rock', 0.4, 'constant', 'Two quick small boot footsteps on hard rock with a little gravel scrape'),
  effect('step_ice', 0.4, 'constant', 'Two quick small boot footsteps on slippery ice: a hard tap and a tiny slide'),
  effect('step_wade', 0.4, 'constant', 'Two quick steps wading through shallow water with small splashes'),
  effect('step_leaves', 0.4, 'constant', 'Two quick small boot footsteps on dry fallen leaves and twigs, a crunchy rustle'),
  effect('step_concrete', 0.4, 'constant', 'Two quick small boot footsteps on a concrete floor, crisp and hard'),
];

/** Lo que se suma al motor de un vehiculo en un suelo blando o mojado. */
const VEHICLE_GROUND: SoundSpec[] = [
  effect('step_mud', 0.4, 'constant', 'One short burst of vehicle wheels squelching and slipping through thick wet mud'),
  effect('step_splash', 0.4, 'constant', 'One short splash of a vehicle pushing through shallow water'),
];

const BUILDINGS: SoundSpec[] = [
  effect('spawn_infantry', 1, 'often', 'A barracks door creaks open and quick small boots stomp out onto the ground'),
  effect(
    'spawn_vehicle',
    1.2,
    'often',
    'A garage door rolls up with a metallic rattle and a vehicle engine starts with a cough and a rumble',
  ),
  effect('spawn_aircraft', 1.5, 'often', 'A hangar door rolls open and a small airplane engine sputters to life'),
  effect(
    'capture_hq',
    2,
    'rare',
    'A large flag hoisted up a tall pole: fast rope pulley squeaks, the cloth snapping open in the wind and a heavy bell clang',
  ),
  effect('capture_dropped', 1, 'often', 'A flag pole tipping over and cloth flapping down with a short wooden clatter'),
  effect('income', 1, 'often', 'A handful of coins clinking into a metal cash box'),
  effect('heal', 1, 'often', 'Gentle uplifting chime with a soft bandage rustle, small and friendly'),
  effect('supply', 1.5, 'often', 'Quick field repair of a vehicle: wrench ratchet clicks, a metal clank and a short fuel glug'),
  effect('bounty', 1, 'often', 'A cash register drawer ringing open with a bell ding and coins dropping in'),
];

const EVENTS: SoundSpec[] = [
  // Subir y bajar del transporte, sea el camion o el helicoptero: sin motor ni rotor, que ya suenan al moverse.
  effect('load', 1, 'often', 'A small soldier climbs aboard: two quick boot steps on a hollow metal floor, then a door latch clunks shut'),
  effect('unload', 1, 'often', 'A metal door latch clanks open and a small soldier jumps down, boots landing on dirt with a soft thud'),
  effect('heli_takeoff', 2, 'often', 'Helicopter taking off: rotor spinning up from slow to fast with a rising engine whine'),
  effect(
    'heli_land',
    2,
    'often',
    'Helicopter landing: rotor slowing down with a falling engine whine and the skids touching down with a soft thump',
  ),
  effect('merge', 1, 'often', 'Two squads regroup: quick rustle of backpacks and gear, then a firm metallic buckle snap'),
  effect('undo', 0.5, 'often', 'Short reverse whoosh, like a tape rewinding quickly'),
  effect('wait', 0.3, 'often', 'A wooden game piece set down on a board, single soft click'),
  effect('ambush', 1, 'often', 'A sudden rustle bursting out of bushes followed by a startled metal clank'),
  effect('rank_up', 1, 'often', 'A small metal medal pinned on with a click and a bright sparkling chime'),
  effect('team_defeated', 2.5, 'rare', 'Distant heavy explosion rumbling away into silence'),
  effect('new_day', 2, 'often', 'Distant rooster crowing at dawn over quiet countryside'),
  effect('end_turn', 0.6, 'often', 'A firm rubber stamp pressed on paper with a soft thump'),
  effect('enemy_turn_start', 1, 'often', 'Two low distant drum hits with a soft metallic rattle, tense'),
  effect('order_given', 0.4, 'often', 'A short crisp radio click and squelch, like pressing a walkie-talkie button'),
  effect('order_done', 0.6, 'often', 'A small flag pulled out of the ground with a soft pop and a cloth flutter'),
  effect('zoc_halt', 0.5, 'often', 'A sudden halt: a short brake squeak and a gravel skid'),
  effect('funds_capped', 0.6, 'rare', 'A full metal cash box lid slammed shut with coins rattling inside'),
];

export const BOARD_SOUNDS: readonly SoundSpec[] = [...INFANTRY_STEPS, ...VEHICLE_GROUND, ...BUILDINGS, ...EVENTS];
