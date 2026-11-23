/**
 * Que suena con cada cosa de la vista: el disparo, el motor y la caida de cada unidad, los pasos segun el
 * suelo, las capturas, los menus y el final. Solo decide (tablas, sin Web Audio ni three.js); lo hace
 * sonar el puerto que reciba quien lo use. Se piden por nombre aunque aun no haya WAV: mientras, suena
 * su sustituto (src/audio/soundNames.ts).
 */
import type { SoundName } from '../../../audio/sounds';
import type { MovementMotion } from '../../../core/content';
import { terrainAt } from '../../../core/gameContent';
import type { GameState, Pos } from '../../../core/model';
import { buildingAt } from '../../../core/rules';
import type { MenuCommand } from '../../../controls/menu';

/** Lo que suena de una clase de unidad. */
export interface UnitSounds {
  /** Su disparo (null: no ataca). */
  readonly shot: SoundName | null;
  /** Por cada casilla que avanza: su motor o, a pie (`'feet'`), el paso de cada suelo. */
  readonly step: SoundName | 'feet';
  /** Al caer. */
  readonly down: SoundName;
  /** Al apuntar: la torreta que gira, el rail del misil que sube. */
  readonly aim?: SoundName;
  /** Al echar a andar, antes de la primera casilla: el motor que arranca. */
  readonly start?: SoundName;
  /** Al elegirla, en vez de la voz de su forma de moverse: la bocina del jeep. */
  readonly select?: SoundName;
}

/** Los vehiculos de ruedas: el jeep, ligero, y los camiones, graves; arrancan y tocan la bocina. */
const JEEP = { step: 'step_jeep', start: 'engine_start_jeep', select: 'horn_jeep' } as const satisfies Partial<UnitSounds>;
const TRUCK = { step: 'step_truck', start: 'engine_start_truck', select: 'horn_truck' } as const satisfies Partial<UnitSounds>;

/** Cada unidad (id de units.json), segun su modelo: el arma que lleva y como se mueve. */
const UNIT_SOUNDS: Readonly<Record<string, UnitSounds>> = {
  Soldier: { shot: 'shot_rifle', step: 'feet', down: 'unit_down_infantry' },
  BSoldier: { shot: 'shot_bazooka', step: 'feet', down: 'unit_down_infantry' },
  SSoldier: { shot: 'shot_pistol', step: 'feet', down: 'unit_down_infantry' },
  MSoldier: { shot: 'shot_mortar', step: 'feet', down: 'unit_down_infantry' },
  FSoldier: { shot: 'shot_machinegun', step: 'step_motorbike', down: 'explosion_small' },
  Tank: { shot: 'shot_cannon_heavy', step: 'step_tracks', down: 'explosion', aim: 'turret_turn' },
  LTank: { shot: 'shot_cannon', step: 'step_tracks', down: 'explosion', aim: 'turret_turn' },
  Artillery: { shot: 'shot_artillery', step: 'step_tracks', down: 'explosion', aim: 'turret_turn' },
  Antiair: { shot: 'shot_flak', step: 'step_tracks', down: 'explosion', aim: 'turret_turn' },
  Blocker: { shot: null, step: 'step_tracks', down: 'explosion' },
  WTank: { shot: 'shot_cannon', step: 'step_hover', down: 'explosion', aim: 'turret_turn' },
  Car: { ...JEEP, shot: 'shot_machinegun', down: 'explosion' },
  Transport: { ...TRUCK, shot: null, down: 'explosion' },
  Supplier: { ...TRUCK, shot: null, down: 'explosion' },
  Missile_truck: { ...TRUCK, shot: 'shot_missile_launch', down: 'explosion', aim: 'launcher_raise' },
  LFighter: { shot: 'shot_machinegun', step: 'step_prop', down: 'plane_crash' },
  Fighter: { shot: 'shot_missile', step: 'step_jet', down: 'plane_crash' },
  Bomber: { shot: 'shot_bomb', step: 'step_prop', down: 'plane_crash' },
  THelicopter: { shot: null, step: 'step_heli', down: 'heli_crash' },
};

/** Una clase de unidad que no esta en la tabla suena como las de su forma de moverse. */
const MOTION_SOUNDS: Readonly<Record<MovementMotion, UnitSounds>> = {
  march: { shot: 'shot_rifle', step: 'feet', down: 'unit_down_infantry' },
  drive: { shot: 'shot_cannon', step: 'step_drive', down: 'explosion' },
  fly: { shot: 'shot_missile', step: 'step_fly', down: 'plane_crash' },
};

export const UNIT_SOUND_TYPES = Object.keys(UNIT_SOUNDS);

export const unitSounds = (unitType: string, motion: MovementMotion): UnitSounds => UNIT_SOUNDS[unitType] ?? MOTION_SOUNDS[motion];

/** El disparo de una unidad; si su tabla no tiene (no deberia disparar), el de su forma de moverse. */
export const shotSound = (unitType: string, motion: MovementMotion): SoundName =>
  unitSounds(unitType, motion).shot ?? MOTION_SOUNDS[motion].shot!;

/** El suelo de una casilla, como suena al pisarlo. */
export type Surface = 'grass' | 'sand' | 'snow' | 'rock' | 'ice' | 'shallow' | 'water' | 'leaves' | 'concrete' | 'mud';

/** El suelo de cada terreno (id de terrain.json). */
const TERRAIN_SURFACES: Readonly<Record<string, Surface>> = {
  Grass: 'grass',
  Flowers: 'grass',
  Woods: 'leaves',
  Sand: 'sand',
  Cactus: 'sand',
  GrassMountain: 'rock',
  SandMountain: 'rock',
  SnowMountain: 'rock',
  Snow: 'snow',
  Frosty: 'snow',
  SnowWood: 'snow',
  Ice: 'ice',
  SWater: 'shallow',
  Water: 'water',
  DWater: 'water',
};
/** Con lluvia (id de weather.json) la hierba y el bosque son barro (weather.json: el barro frena a los vehiculos). */
const WET_WEATHER: ReadonlySet<string> = new Set(['Rain', 'Storm']);
const MUDDY: ReadonlySet<Surface> = new Set(['grass', 'leaves']);

/** Como suena el suelo de `pos` hoy: el de su terreno, el pavimento de un edificio o el barro con lluvia. */
export function surfaceOf(s: GameState, pos: Pos): Surface {
  if (buildingAt(s, pos)) return 'concrete';
  const surface = TERRAIN_SURFACES[terrainAt(s, pos).id] ?? 'grass';
  const isWet = WET_WEATHER.has(s.weather?.kind ?? '');
  return isWet && MUDDY.has(surface) ? 'mud' : surface;
}

/** El paso de la infanteria en cada suelo (en el barro, el de la hierba mojada). */
const FOOTSTEPS: Readonly<Record<Surface, SoundName>> = {
  grass: 'step_grass',
  sand: 'step_sand',
  snow: 'step_snow',
  rock: 'step_rock',
  ice: 'step_ice',
  shallow: 'step_wade',
  water: 'step_wade',
  leaves: 'step_leaves',
  concrete: 'step_concrete',
  mud: 'step_grass',
};
/** Lo que añade el suelo al motor de ruedas y orugas: el chapoteo, el barro. */
const GROUND_LAYERS: Readonly<Partial<Record<Surface, SoundName>>> = { mud: 'step_mud', water: 'step_splash', shallow: 'step_splash' };

/** Lo que suena al avanzar una casilla sobre `surface`: el paso, o el motor y lo que añada el suelo (los aviones, solo el motor). */
export function stepSounds(sounds: UnitSounds, motion: MovementMotion, surface: Surface): SoundName[] {
  if (sounds.step === 'feet') return [FOOTSTEPS[surface]];
  const layer = motion === 'fly' ? undefined : GROUND_LAYERS[surface];
  return layer ? [sounds.step, layer] : [sounds.step];
}

/** El golpe segun a quien le da; si no le hace nada, el disparo que falla. */
const HIT_SOUNDS: Readonly<Record<MovementMotion, SoundName>> = { march: 'hit_infantry', drive: 'hit_armor', fly: 'hit_air' };

export const hitSound = (targetMotion: MovementMotion, damage: number): SoundName => (damage > 0 ? HIT_SOUNDS[targetMotion] : 'shot_miss');

/** Lo que suena al aparecer una unidad comprada, segun donde se hace (ciudad, fabrica, aeropuerto). */
const SPAWN_SOUNDS: Readonly<Record<MovementMotion, SoundName>> = {
  march: 'spawn_infantry',
  drive: 'spawn_vehicle',
  fly: 'spawn_aircraft',
};

export const spawnSound = (motion: MovementMotion): SoundName => SPAWN_SOUNDS[motion];

/** El «¡sí!» de juguete al elegir una unidad propia: soldado, conductor o piloto (por radio). */
const ACK_VOICES: Readonly<Record<MovementMotion, SoundName>> = {
  march: 'voice_ack_infantry',
  drive: 'voice_ack_driver',
  fly: 'voice_ack_pilot',
};

/** Lo que dice una unidad propia al elegirla: lo suyo (la bocina) o la voz de su forma de moverse. */
export const selectSound = (unitType: string, motion: MovementMotion): SoundName =>
  unitSounds(unitType, motion).select ?? ACK_VOICES[motion];

export const captureSound = (isDone: boolean): SoundName => (isDone ? 'capture_done' : 'capture');

export const endSound = (won: boolean): SoundName => (won ? 'victory' : 'defeat');

/** Lo que suena con cada orden de menu (moverse, aceptar, volver); las demas, nada. */
const MENU_SOUNDS: Partial<Record<MenuCommand['kind'], SoundName>> = { move: 'ui_move', ok: 'ui_select', back: 'ui_back' };

export const menuSound = (command: MenuCommand): SoundName | undefined => MENU_SOUNDS[command.kind];
