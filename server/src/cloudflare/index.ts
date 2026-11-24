/**
 * El Worker de Cloudflare: las rutas del servidor (routes.ts) con un Durable Object por sala
 * (`RoomObject`, roomObject.ts, buscado por su codigo: rooms.ts) y uno para el emparejador
 * (`MatchmakerObject`, matchmakerObject.ts).
 */
import { respond } from '../routes';
import type { Env } from './env';
import { matchmakerOf } from './matchmakerObject';
import { roomsOf } from './rooms';

export { MatchmakerObject } from './matchmakerObject';
export { RoomObject } from './roomObject';

export default {
  fetch: (request, env) => respond(request, { rooms: roomsOf(env), matchmaker: matchmakerOf(env), allowedOrigins: env.ALLOWED_ORIGINS }),
} satisfies ExportedHandler<Env>;
