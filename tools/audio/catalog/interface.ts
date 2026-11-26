/**
 * La interfaz: lo del tablero (cursor, seleccion, ordenes, camara), los menus y la partida en linea.
 * Suenan a cosas de una caja de juguetes (madera, plastico, papel, hojalata), cortos y flojos: se oyen
 * muchas veces.
 */
import { effect, soft, type SoundSpec } from './spec';

const BOARD_INTERFACE: SoundSpec[] = [
  effect('cursor_tick', 0.1, 'constant', 'A tiny soft plastic tick, like a toy block lightly tapped'),
  effect('path_tick', 0.1, 'constant', 'A tiny soft wooden tick, like a peg pressed into a board'),
  effect('target_lock', 0.4, 'often', 'A quick metallic crosshair lock-on: two fast ascending clicks'),
  effect('card_detail', 0.3, 'often', 'A paper card flipped over with a soft snap'),
  effect('group_select', 0.4, 'often', 'Several small plastic toy figures picked up together with a light clatter'),
  effect('select_add', 0.2, 'often', 'A small plastic toy piece clicked onto a board, light and bright'),
  effect('select_remove', 0.2, 'often', 'A small plastic toy piece lifted off a board, soft and lower'),
  effect('unit_deselect', 0.2, 'often', 'A soft low plastic tap, a gentle release click'),
  effect('attack_confirm', 0.5, 'often', 'A firm metal gun bolt cocking with a solid clack'),
  effect('travel_order', 0.6, 'often', 'A small flag stuck firmly into the ground with a soft thud and a cloth flutter'),
  effect('order_target_mode', 0.3, 'often', 'A pencil picked up and tapped once on a paper map'),
  effect('order_cancel', 0.3, 'often', 'A pencil eraser rubbed quickly on paper with a soft swipe'),
  effect('squad_form', 0.6, 'often', 'Small toy figures snapping together into a row, quick rising plastic clicks'),
  effect('squad_leave', 0.5, 'often', 'Small toy figures unsnapping apart, quick falling plastic clicks'),
  effect('unit_disband', 0.6, 'rare', 'A toy figure dropped back into a wooden box with a hollow clunk'),
  effect('buy_hover', 0.1, 'constant', 'A tiny light coin tap on wood'),
  effect('buy_denied', 0.4, 'often', 'An empty coin purse shaken with a dull wooden knock'),
  effect('end_turn_warn', 0.5, 'often', 'Two quick soft wooden knocks, a polite warning'),
  effect('next_idle', 0.3, 'often', 'A quick bright finger flick on a small plastic toy figure'),
  effect('all_moved', 0.8, 'rare', 'A small brass bell ding, clear and satisfied'),
  effect('zoom_tick', 0.1, 'constant', 'A tiny ratchet click of a toy telescope'),
  effect('camera_limit', 0.3, 'often', 'A soft dull bump against a padded wall'),
  effect('camera_jump', 0.5, 'often', 'A quick airy swoosh moving fast through the air'),
  effect('minimap_click', 0.2, 'often', 'A small pin pressed into a paper map, a soft tap'),
  effect('group_set', 0.4, 'often', 'A tin toy key turned with a ratchet click and a snap'),
  effect('group_recall', 0.3, 'often', 'Two quick tin clicks, like a toy clicker'),
];

const MENU_INTERFACE: SoundSpec[] = [
  effect('ui_hover', 0.1, 'constant', 'A tiny soft paper tick, barely there'),
  effect('ui_bump', 0.2, 'often', 'A soft muted wooden bump, the end of a list'),
  effect('ui_open', 0.5, 'often', 'Paper map unfolding quickly with a soft swoosh'),
  effect('ui_close', 0.5, 'often', 'Paper map folding shut with a soft thump'),
  effect('ui_tab', 0.2, 'often', 'Light paper card flick, soft menu tab click'),
  effect('ui_error', 0.3, 'often', 'Short dull wooden knock buzz, error feedback for a game menu'),
  effect('ui_toggle_on', 0.2, 'often', 'A small toy switch flipped on, a bright plastic click'),
  effect('ui_toggle_off', 0.2, 'often', 'A small toy switch flipped off, a lower plastic click'),
  effect('ui_value_step', 0.1, 'constant', 'A tiny ratchet click of a toy dial turning one notch'),
  effect('ui_confirm_arm', 0.4, 'often', 'A safety catch flicked off with a tense metallic click'),
  effect('toast_info', 0.4, 'often', 'A small soft bell tap, a friendly notification'),
  effect('toast_warn', 0.5, 'often', 'Two quick low wooden knocks, a gentle warning'),
  effect('banner_drop', 0.8, 'often', 'A cloth banner unrolling and dropping down with a soft flap and a wooden clack'),
  effect('save_done', 0.4, 'rare', 'A metal stamp pressed firmly on paper with a satisfying thunk'),
  effect('key_listen', 0.3, 'rare', 'A typewriter carriage lifted with a soft mechanical click, ready to type'),
  effect('key_bound', 0.3, 'rare', 'A single crisp typewriter key strike'),
  effect('map_reroll', 0.8, 'often', 'Wooden dice shaken and rolled on a table'),
  effect('game_start', 1.5, 'rare', 'A big wooden toy box lid flipped open with a hollow clunk and toys rattling inside'),
  effect('mission_select', 0.4, 'often', 'A map pin pushed into a cork board with a soft pop'),
  effect('mission_unlocked', 1, 'rare', 'A small padlock clicking open and a bright sparkling chime'),
  effect('end_screen_in', 1, 'rare', 'A heavy curtain swept open with a soft whoosh and a wooden thump'),
  effect('new_record', 1.5, 'rare', 'A trophy set down on a wooden shelf with a metallic clink and a sparkling chime'),
  effect('news_badge', 0.3, 'rare', 'A tiny bright bell ding'),
];

/** La partida en linea: quien entra en la sala, que empieza, la conexion y el reloj del turno. */
const ONLINE: SoundSpec[] = [
  effect('player_joined', 0.6, 'often', 'A small door bell jingle as someone comes in'),
  effect('net_connected', 0.5, 'rare', 'A plug pushed into a socket with a firm click and a soft electric hum'),
  effect('net_reconnecting', 1, 'rare', 'An old radio dial searching through static with short squelches'),
  effect('net_lost', 0.8, 'rare', 'A radio cutting out: a crackle of static dropping to silence'),
  effect('match_begins', 1.5, 'rare', 'A drill sergeant whistle blown once, sharp and short'),
  // Un tic por segundo los ultimos del turno: flojo, y de un solo golpe (sin "single" salia un tic-tac pegado).
  soft(effect('turn_clock_tick', 0.1, 'constant', 'A single tiny soft tick of a wooden toy clock, one short click, gentle and dry')),
];

export const INTERFACE_SOUNDS: readonly SoundSpec[] = [...BOARD_INTERFACE, ...MENU_INTERFACE, ...ONLINE];
