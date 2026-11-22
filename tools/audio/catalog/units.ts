/**
 * Lo que suena de las unidades: el arma de cada una, su motor (una vez por casilla), como caen y lo que
 * pasa en un ataque. Cada texto va con el modelo 3D de la unidad (tools/art/ashfox/models/units.mjs).
 */
import { effect, type SoundSpec } from './spec';

/**
 * Un disparo por arma. El fusil, el cañon, la artilleria y el misil los hace Ashfox; el helicoptero no
 * tiene arma.
 */
const WEAPONS: SoundSpec[] = [
  effect('shot_pistol', 0.4, 'often', 'Single small pistol shot: a sharp light pop with a tiny metallic slide click'),
  effect('shot_bazooka', 1, 'often', 'Single bazooka shot: hollow whoomp launch followed by a short rocket hiss'),
  effect('shot_mortar', 1, 'often', 'Single mortar shot: shell dropped into the tube and a hollow metallic thunk launch'),
  effect('shot_machinegun', 0.8, 'often', 'Short burst of machine gun fire, five rapid shots'),
  effect(
    'shot_cannon_heavy',
    1.2,
    'often',
    'Twin tank cannons firing together: one deep heavy boom with a doubled crack and a metallic recoil clank',
  ),
  effect('shot_flak', 1, 'often', 'Anti-aircraft gun firing three quick heavy rounds into the sky'),
  effect(
    'shot_missile_launch',
    1.5,
    'often',
    'Single large missile launching off a rail: a metallic clunk as it releases, then a loud rising rocket whoosh',
  ),
  effect(
    'shot_bomb',
    1.5,
    'often',
    'A bomb released with a mechanical clunk, then a falling whistle with descending pitch, ending right before the impact',
  ),
];

/** Motores: suenan una vez por casilla, asi que son cortos y con variantes. */
const ENGINES: SoundSpec[] = [
  effect('step_tracks', 0.4, 'constant', 'One short burst of tank tracks clanking forward over dirt with an engine rumble'),
  effect('step_wheels', 0.4, 'constant', 'One short burst of a small truck engine revving and tires rolling on gravel'),
  effect('step_motorbike', 0.4, 'constant', 'One short burst of a small dirt bike engine revving with a buzzy two-stroke putter'),
  effect(
    'step_hover',
    0.4,
    'constant',
    'One short burst of a hovercraft: a big fan propeller whirring and air rushing out under a rubber skirt',
  ),
  effect('step_prop', 0.4, 'constant', 'One short burst of a small propeller airplane engine droning past'),
  effect('step_jet', 0.4, 'constant', 'One short burst of a jet fighter engine roar passing by'),
  effect('step_heli', 0.4, 'constant', 'One short burst of helicopter rotor blades chopping overhead'),
];

/** Como cae cada una: juguetes, sin sangre. */
const DESTRUCTION: SoundSpec[] = [
  effect(
    'unit_down_infantry',
    0.8,
    'often',
    'A small plastic toy soldier figure knocked over: a light hollow plastic clatter as it tips and bounces on the ground',
  ),
  effect('explosion_small', 1, 'often', 'Small explosion: a short sharp pop and boom with a little debris rattle'),
  effect('plane_crash', 2.5, 'often', 'Small airplane spiraling down with a falling engine whine, then a crunchy crash and explosion'),
  effect('heli_crash', 2.5, 'often', 'Helicopter going down: sputtering rotor and engine whine, then a metallic crash and explosion'),
];

/** Lo que rodea a un ataque: apuntar, lo que vuela y como encaja el golpe cada blanco. */
const COMBAT: SoundSpec[] = [
  effect('turret_turn', 0.6, 'often', 'Tank turret rotating: a short mechanical servo whir with gear clicks, ending in a clunk'),
  effect('launcher_raise', 1, 'often', 'Hydraulic missile ramp rising: a piston hiss and mechanical whir ending in a locking clank'),
  effect('shell_incoming', 1, 'often', 'Artillery shell whistling down from the sky with descending pitch, ending right before the impact'),
  effect('missile_flight', 1, 'often', 'Missile flying past: a roaring rocket whoosh passing by'),
  effect('shield_block', 0.5, 'often', 'A bullet ricocheting off a metal riot shield: a sharp clang and a whizzing ricochet'),
  effect('shot_miss', 0.6, 'often', 'A shot missing: a bullet whizzing past and a small puff of dirt hitting the ground'),
  effect('hit_infantry', 0.4, 'often', 'A punchy soft thud on a small plastic toy figure with a short hollow plastic knock'),
  effect('hit_armor', 0.5, 'often', 'A shell hitting thick armor plate: a heavy metallic clang with a short ringing'),
  effect('hit_air', 0.5, 'often', 'Bullets hitting a small airplane: quick metallic rattling pings on thin sheet metal'),
];

export const UNIT_SOUNDS: readonly SoundSpec[] = [...WEAPONS, ...ENGINES, ...DESTRUCTION, ...COMBAT];
