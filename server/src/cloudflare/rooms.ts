/**
 * Las salas de la cuenta de Cloudflare como `RoomDirectory`: cada codigo es un Durable Object
 * (`RoomObject`, buscado por su codigo), que existe en cuanto se le llama; si no tiene sala, lo dice.
 * Lo usan el Worker (index.ts) y el emparejador (matchmakerObject.ts).
 */
import type { RoomDirectory } from '../roomDirectory';
import type { Env } from './env';
import type { RoomObject } from './roomObject';

const roomOf = (env: Env, code: string): DurableObjectStub<RoomObject> => env.ROOMS.get(env.ROOMS.idFromName(code));

export const roomsOf = (env: Env): RoomDirectory => ({
  create: (code, request) => roomOf(env, code).create(request),
  info: (code) => roomOf(env, code).info(),
  claimSeat: (code) => roomOf(env, code).claimSeat(),
  handToAi: (code, token, seat) => roomOf(env, code).handToAi(token, seat),
  close: (code, token) => roomOf(env, code).close(token),
  connect: (code, request) => roomOf(env, code).fetch(request),
});
