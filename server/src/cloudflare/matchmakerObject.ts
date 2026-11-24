/**
 * El emparejador en Cloudflare: un solo Durable Object para toda la cuenta (`MATCHMAKER_NAME`) con el
 * `Matchmaker` (matchmaker.ts) y su cola en el almacen del objeto. Las busquedas le llegan por RPC
 * desde el Worker; las salas, las de siempre (`roomsOf`).
 */
import { DurableObject } from 'cloudflare:workers';
import { Matchmaker, type MatchQueueStore, type RivalSearch, type SearchRequest, type SearchResult } from '../matchmaker';
import type { Env } from './env';
import { roomsOf } from './rooms';

/** El nombre del unico emparejador (de el sale su id: `idFromName`). */
const MATCHMAKER_NAME = 'emparejador';

const QUEUE_KEY = 'queue';

/** El emparejador de la cuenta, para el Worker. */
export const matchmakerOf = (env: Env): RivalSearch => env.MATCHMAKER.get(env.MATCHMAKER.idFromName(MATCHMAKER_NAME));

export class MatchmakerObject extends DurableObject<Env> {
  private readonly store: MatchQueueStore = {
    load: () => this.ctx.storage.get<unknown>(QUEUE_KEY),
    save: (queue) => this.ctx.storage.put(QUEUE_KEY, queue),
  };

  private readonly matchmaker = new Matchmaker(roomsOf(this.env), this.store);

  search(client: string, request: SearchRequest): Promise<SearchResult> {
    return this.matchmaker.search(client, request);
  }
}
