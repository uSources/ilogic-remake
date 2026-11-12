/**
 * Lo que la sala manda a cada persona y como se lo lleva. `Outbox` junta, en orden, los mensajes que
 * salen en lo que va de mensaje atendido (a que asiento va cada uno). `Courier` lleva a cada persona
 * lo que pasa en la partida: guarda lo que sabia tras lo ultimo que se le mando (el antes del
 * siguiente paso, para la niebla de los sucesos) y junta en un solo `events` los pasos de los demas
 * equipos hasta que algo lo saca (una accion de su alianza, que se espere a alguien, el final):
 * asi no se le cuenta cuantas cosas han hecho los enemigos donde no ve (un mensaje por paso, aunque
 * fuera vacio, lo diria). Si de un lote no ve nada (ni sucesos ni cambio en su vista), no se manda.
 * Cada mensaje que se le manda lleva su numero (`step`, el del asiento): si le falta uno, pide la vista.
 */
import { savedPart } from '../gameContent';
import type { GameEvent, GameState, TeamId } from '../model';
import type { ActedStep } from '../session/gameSession';
import { areAllied } from '../teams';
import { eventsSeenBy, knowledgeOf, type Knowledge } from './eventFog';
import { viewChangeOf, type SeatId, type ServerMessage } from './protocol';
import type { PersonSeat } from './seats';

/** Un mensaje para un asiento. */
export interface Outgoing {
  seat: SeatId;
  message: ServerMessage;
}

/** Los mensajes que salen, en orden, hasta que se recogen (`flush`). */
export class Outbox {
  private messages: Outgoing[] = [];

  send(seat: SeatId, message: ServerMessage): void {
    this.messages.push({ seat, message });
  }

  /** Lo que hay, y se vacia. */
  flush(): Outgoing[] {
    const sent = this.messages;
    this.messages = [];
    return sent;
  }
}

/** Lo que una persona aun no ha recibido: los sucesos que ve de los pasos de desde lo ultimo, y como queda su vista. */
interface Batch {
  actor: TeamId;
  events: GameEvent[];
  after: Knowledge;
}

export class Courier {
  /** Lo que sabia cada persona que esta dentro tras lo ultimo que se le llevo (el antes del siguiente paso). */
  private readonly known = new Map<SeatId, Knowledge>();
  private readonly pending = new Map<SeatId, Batch>();
  /** Lo que cambia de la vista, tal como se le mando la ultima vez (para no mandar lo mismo). */
  private readonly lastSent = new Map<SeatId, string>();

  constructor(
    private readonly state: GameState,
    private readonly outbox: Outbox,
  ) {}

  /** La partida tal como la sabe esta persona (lo ultimo que se le llevo), o null si no se le lleva nada. */
  knownOf(seat: PersonSeat): GameState | null {
    return this.known.get(seat.id)?.state ?? null;
  }

  /** Su vista entera, ahora (al entrar, al volver, al pedirla): desde aqui se le lleva lo que pase. */
  sendView(seat: PersonSeat): void {
    const knowledge = knowledgeOf(this.state, seat.team);
    this.known.set(seat.id, knowledge);
    this.pending.delete(seat.id);
    const view = savedPart(knowledge.state);
    this.lastSent.set(seat.id, JSON.stringify(viewChangeOf(view)));
    this.outbox.send(seat.id, { kind: 'view', step: this.nextStep(seat), view });
  }

  /** Ya no se le lleva nada (se ha ido, o su asiento pasa a la IA). */
  forget(seat: PersonSeat): void {
    this.known.delete(seat.id);
    this.pending.delete(seat.id);
    this.lastSent.delete(seat.id);
  }

  /** A quien se espera (o quien juega ahora), con lo que tuviera pendiente antes. */
  sendTurn(seat: PersonSeat, team: TeamId, day: number): void {
    this.deliver(seat);
    this.outbox.send(seat.id, { kind: 'turn', step: this.nextStep(seat), team, day });
  }

  /**
   * Un paso de la partida: lo que ve de el cada persona a la que se le lleva (lo que devuelve, por
   * asiento) se junta a lo pendiente; lo de su propia alianza se le manda ya (su resultado llega con ello).
   */
  carry(step: ActedStep, seats: readonly PersonSeat[]): Map<SeatId, GameEvent[]> {
    const seenBy = new Map<SeatId, GameEvent[]>();
    for (const seat of seats) {
      const before = this.known.get(seat.id);
      if (!before) continue;
      const after = knowledgeOf(this.state, seat.team);
      this.known.set(seat.id, after);
      const events = eventsSeenBy(step.events, { before, after });
      seenBy.set(seat.id, events);
      const batch = this.pending.get(seat.id);
      this.pending.set(seat.id, { actor: step.team, events: [...(batch?.events ?? []), ...events], after });
      if (areAllied(this.state, seat.team, step.team)) this.deliver(seat);
    }
    return seenBy;
  }

  /** Lo pendiente de esta persona, si hay algo que ver (sucesos, o un cambio en su vista). */
  deliver(seat: PersonSeat): void {
    const batch = this.pending.get(seat.id);
    if (!batch) return;
    this.pending.delete(seat.id);
    const view = viewChangeOf(savedPart(batch.after.state));
    const json = JSON.stringify(view);
    if (batch.events.length === 0 && json === this.lastSent.get(seat.id)) return;
    this.lastSent.set(seat.id, json);
    this.outbox.send(seat.id, { kind: 'events', step: this.nextStep(seat), actor: batch.actor, events: batch.events, view });
  }

  deliverAll(seats: readonly PersonSeat[]): void {
    for (const seat of seats) this.deliver(seat);
  }

  private nextStep(seat: PersonSeat): number {
    seat.step += 1;
    return seat.step;
  }
}
