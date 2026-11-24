/** Lo que Cloudflare da al Worker y a sus Durable Objects (wrangler.toml): las salas, el emparejador y las webs que pueden hablar con el servidor. */
import type { MatchmakerObject } from './matchmakerObject';
import type { RoomObject } from './roomObject';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  ALLOWED_ORIGINS: string;
}
