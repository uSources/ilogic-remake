/**
 * Los topes y los tiempos del servidor, en un sitio: cuanto puede pesar lo que llega, cuanto se
 * aguanta a quien insiste con mensajes que la sala rechaza, cuanto vive una sala sin que nadie la
 * toque y entre que limites puede pedir el creador un reloj de turno o de espera. Los topes de la
 * forma de cada mensaje (listas, textos) los pone el protocolo (`isValidMessage`); estos son los de
 * antes de leerlo (bytes) y los del tiempo.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Lo que puede pesar un mensaje por el WebSocket o el cuerpo de una peticion, antes de leerlo como JSON. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** Cuantos mensajes rechazados se le aguantan a un asiento en una ventana antes de cortarle la conexion. */
export const MAX_REJECTIONS_PER_WINDOW = 30;
export const REJECTION_WINDOW_MS = MINUTE;

/** Una sala sin actividad (sin mensajes ni entradas) se borra pasado esto. */
export const ROOM_EXPIRY_MS = 30 * DAY;

/** El reloj de cada turno, si el creador lo pide: entre medio minuto y una semana (partidas asincronas). */
export const MIN_TURN_SECONDS = 30;
export const MAX_TURN_SECONDS = (7 * DAY) / SECOND;

/** Cuanto se espera a los que faltan antes de darles a la IA, si el creador lo pide. */
export const MIN_WAITING_SECONDS = 30;
export const MAX_WAITING_SECONDS = (7 * DAY) / SECOND;

/** Las salas de la red son de 2 a 4 equipos (como en la pantalla de escaramuza). */
export const MAX_ROOM_TEAMS = 4;

/** Cuantos codigos de sala se prueban si el elegido ya esta ocupado (con casi 900 millones de codigos, uno basta casi siempre). */
export const MAX_CODE_TRIES = 5;

/**
 * Cuantas busquedas de rival se atienden de una misma direccion en una ventana: una persona busca
 * unas pocas veces; quien pide sin parar se quedaria los asientos de los que esperan (y llenaria
 * el servidor de salas). Pasado el tope, 'tooManySearches' hasta que pase la ventana.
 */
export const MAX_SEARCHES_PER_WINDOW = 20;
export const SEARCH_WINDOW_MS = 10 * MINUTE;
/** Direcciones que se recuerdan como mucho para ese tope (si se llenan, se olvidan las que ya no cuentan). */
export const MAX_WATCHED_CLIENTS = 1000;

/** Salas esperando rival que guarda la cola de cada ritmo (pasado esto, la mas vieja sale de la cola). */
export const MAX_WAITING_ROOMS = 100;
/** Cuantas salas de la cola se miran como mucho en una busqueda (cada una es una pregunta a su sala). */
export const MAX_SEARCH_CANDIDATES = 20;
/**
 * En vivo solo se empareja con quien esta en su sala. Si no esta, su sala sigue en la cola este rato
 * (desde que se ve que no esta: puede estar recargando la pagina) y despues sale.
 */
export const LIVE_ABSENCE_GRACE_MS = 5 * MINUTE;
