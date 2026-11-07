/**
 * Cumplir un plan (`ActionPlan`: lo que propone quien decide, accion a accion): mandar cada accion
 * por la via que se diga y contestarle con su resultado. Lo usan quien cumple las ordenes permanentes
 * (el paso de fin de turno, la prevision) y quien hace jugar a la IA fuera de una sesion (la partida
 * por texto, los tests); la sesion hace lo mismo con los controladores, paso a paso
 * (session/controller.ts, `proposing`).
 */
import type { ActionPlan, ActionResult, GameAction, GameEvent } from '../model';

/** Lo que ha hecho un plan cumplido: los sucesos de sus acciones (las que valian), en orden, y lo que devuelve. */
export interface CarriedOutPlan<Result> {
  events: GameEvent[];
  value: Result;
}

/** Manda cada accion que propone `plan` con `send` y le contesta con su resultado, hasta que acaba. */
export function carryOut<Result>(plan: ActionPlan<Result>, send: (action: GameAction) => ActionResult): CarriedOutPlan<Result> {
  const events: GameEvent[] = [];
  for (let step = plan.next(); ;) {
    if (step.done) return { events, value: step.value };
    const result = send(step.value);
    if (result.ok) events.push(...result.events);
    step = plan.next(result);
  }
}
