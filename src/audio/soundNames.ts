/**
 * Los nombres de todos los efectos que pide el juego, haya o no WAV. `SoundId` son los que hay
 * (soundList.ts, generado desde public/assets/sfx); los demas, aqui, cada uno con el que suena mientras no
 * se elija el suyo (otro nombre, o `null`: nada). Asi el codigo puede pedir `shot_bazooka` antes de que
 * exista, y en cuanto se elige (`npm run sonidos -- elegir`) suena el suyo sin tocar nada mas.
 * Lo que se pide aqui lo genera el catalogo de tools/audio.
 */
import { SOUND_VARIANTS } from './soundList';

export type SoundId = keyof typeof SOUND_VARIANTS;

/** Cada efecto nuevo y su sustituto. Un test comprueba que toda cadena acaba en un sonido que hay o en nada. */
export const SOUND_FALLBACKS = {
  // Armas, por unidad
  shot_pistol: 'shot_rifle',
  shot_bazooka: 'shot_rifle',
  shot_mortar: 'shot_artillery',
  shot_machinegun: 'shot_rifle',
  shot_cannon_heavy: 'shot_cannon',
  shot_flak: 'shot_cannon',
  shot_missile_launch: 'shot_missile',
  shot_bomb: 'shot_missile',
  // Motores
  step_tracks: 'step_drive',
  step_jeep: 'step_drive',
  step_truck: 'step_jeep',
  step_motorbike: 'step_jeep',
  step_hover: 'step_drive',
  step_prop: 'step_fly',
  step_jet: 'step_fly',
  step_heli: 'step_fly',
  // Los vehiculos de ruedas: arrancan al echar a andar y, al elegirlos, tocan la bocina (mientras no la
  // haya, habla el conductor)
  engine_start_jeep: null,
  engine_start_truck: 'engine_start_jeep',
  horn_jeep: 'voice_ack_driver',
  horn_truck: 'horn_jeep',
  // Pasos por suelo (infanteria) y la capa de los vehiculos
  step_grass: 'step_march',
  step_sand: 'step_march',
  step_snow: 'step_march',
  step_rock: 'step_march',
  step_ice: 'step_march',
  step_wade: 'step_march',
  step_leaves: 'step_march',
  step_concrete: 'step_march',
  step_mud: null,
  step_splash: null,
  // Destruccion y combate
  unit_down_infantry: 'explosion',
  explosion_small: 'explosion',
  plane_crash: 'explosion',
  heli_crash: 'plane_crash',
  hit_infantry: 'hit',
  hit_armor: 'hit',
  hit_air: 'hit',
  shot_miss: 'hit',
  shield_block: 'hit',
  turret_turn: null,
  launcher_raise: 'turret_turn',
  shell_incoming: null,
  missile_flight: null,
  // Edificios
  spawn_infantry: 'spawn',
  spawn_vehicle: 'spawn',
  spawn_aircraft: 'spawn',
  capture_hq: 'capture_done',
  capture_dropped: null,
  income: 'capture',
  bounty: 'income',
  heal: null,
  supply: null,
  // Sucesos de la partida
  load: null,
  unload: 'load',
  heli_takeoff: 'step_heli',
  heli_land: 'heli_takeoff',
  merge: null,
  undo: 'ui_back',
  wait: null,
  ambush: null,
  rank_up: null,
  team_defeated: null,
  new_day: null,
  end_turn: null,
  enemy_turn_start: null,
  order_given: 'ui_select',
  order_done: null,
  zoc_halt: null,
  funds_capped: null,
  // Interfaz del tablero
  cursor_tick: null,
  path_tick: null,
  target_lock: null,
  card_detail: null,
  group_select: 'unit_select',
  select_add: 'unit_select',
  select_remove: 'ui_back',
  unit_deselect: null,
  attack_confirm: null,
  travel_order: 'order_given',
  order_target_mode: 'ui_select',
  order_cancel: 'ui_back',
  squad_form: 'ui_select',
  squad_leave: 'ui_back',
  unit_disband: 'ui_back',
  buy_hover: 'ui_hover',
  buy_denied: 'ui_error',
  end_turn_warn: 'ui_error',
  next_idle: 'unit_select',
  all_moved: null,
  zoom_tick: null,
  camera_limit: null,
  camera_jump: null,
  minimap_click: null,
  group_set: 'ui_select',
  group_recall: 'unit_select',
  // Interfaz de los menus
  ui_hover: null,
  ui_bump: null,
  ui_open: 'ui_select',
  ui_close: 'ui_back',
  ui_tab: 'ui_move',
  ui_error: 'ui_back',
  ui_toggle_on: 'ui_select',
  ui_toggle_off: 'ui_back',
  ui_value_step: 'ui_move',
  ui_confirm_arm: 'ui_select',
  toast_info: null,
  toast_warn: 'ui_error',
  banner_drop: null,
  save_done: 'ui_select',
  key_listen: 'ui_select',
  key_bound: 'ui_select',
  map_reroll: 'ui_move',
  game_start: 'ui_select',
  mission_select: 'ui_move',
  mission_unlocked: 'capture_done',
  end_screen_in: null,
  new_record: null,
  news_badge: null,
  // En linea: quien entra en la sala, que empieza, la conexion (net/linkSounds.ts) y el reloj del turno
  player_joined: 'ui_select',
  net_connected: 'ui_select',
  net_reconnecting: 'ui_error',
  net_lost: 'ui_error',
  match_begins: 'turn_start',
  turn_clock_tick: 'ui_move',
  // El campo: el trueno de la tormenta y lo que dicen los animalitos del tablero (sin los suyos, nada)
  thunder: null,
  animal_frog: null,
  animal_squirrel: null,
  animal_deer: null,
  animal_bird: null,
  animal_vulture: null,
  animal_penguin: null,
  animal_seal: null,
  animal_goose: null,
  animal_splash: null,
  // Voces de juguete: sin las suyas, nada (otro efecto encima de la orden sobraria)
  voice_ack_infantry: null,
  voice_ack_driver: null,
  voice_ack_pilot: null,
  voice_attack: null,
  voice_hurt: null,
  voice_down: null,
  voice_cheer: null,
} as const satisfies Record<string, string | null>;

/** Un efecto que se puede pedir: uno que hay o uno con sustituto. */
export type SoundName = SoundId | keyof typeof SOUND_FALLBACKS;

export const SOUND_NAMES = [...new Set([...Object.keys(SOUND_VARIANTS), ...Object.keys(SOUND_FALLBACKS)])] as SoundName[];

const FALLBACK_OF: Readonly<Record<string, string | null>> = SOUND_FALLBACKS;

export const hasSound = (name: string): name is SoundId => name in SOUND_VARIANTS;

/** El efecto que suena de verdad al pedir `name`: el suyo si lo hay, si no el de su sustituto (null: nada). */
export function resolveSound(name: string): SoundId | null {
  if (hasSound(name)) return name;
  const fallback = FALLBACK_OF[name];
  return fallback ? resolveSound(fallback) : null;
}
