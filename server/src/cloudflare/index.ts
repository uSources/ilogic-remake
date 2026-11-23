/**
 * El Worker de Cloudflare: las rutas del servidor (routes.ts) con un Durable Object por sala
 * (`RoomObject`, roomObject.ts), buscado por su codigo.
 */
import { respond, type RoomDirectory } from '../routes';
import type { Env, RoomObject } from './roomObject';

export { RoomObject } from './roomObject';

const roomOf = (env: Env, code: string): DurableObjectStub<RoomObject> => env.ROOMS.get(env.ROOMS.idFromName(code));

/** Las salas de la cuenta: cada codigo es un objeto (que existe en cuanto se le llama; si no tiene sala, lo dice). */
const roomsOf = (env: Env): RoomDirectory => ({
  create: (code, request) => roomOf(env, code).create(request),
  info: (code) => roomOf(env, code).info(),
  claimSeat: (code) => roomOf(env, code).claimSeat(),
  handToAi: (code, token, seat) => roomOf(env, code).handToAi(token, seat),
  connect: (code, request) => roomOf(env, code).fetch(request),
});

export default {
  fetch: (request, env) => respond(request, { rooms: roomsOf(env), allowedOrigins: env.ALLOWED_ORIGINS }),
} satisfies ExportedHandler<Env>;
