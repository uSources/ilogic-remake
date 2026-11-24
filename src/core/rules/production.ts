/**
 * Como saca unidades un edificio en esta partida (el puerto de produccion): lo que cuesta una unidad,
 * por que no se puede sacar ahora por lo que cuesta y lo que se gasta al sacarla. Lo comun a cualquier
 * produccion (de quien es el edificio, que fabrica, que su casilla este libre y que quepa en el
 * ejercito) esta en rules/economy.ts. Cada modo elige la suya (`GameMode.production`; la de la
 * partida, `productionOf`); sin ninguna se compra con dinero (`PURCHASE`), como siempre. Aqui no se
 * lee el modo: modes.ts importa estos tipos. Asi otra forma de producir (sacar refuerzos de una
 * reserva) es otra produccion, sin tocar la compra ni preguntar por el modo en las reglas.
 */
import type { UnitType } from '../content';
import type { GameState, TeamId } from '../model';
import { teamState } from '../teams';
import { pay } from './funds';

/** Por que la produccion no deja sacar ahora una unidad por lo que cuesta: comprando, que no llega el dinero. */
export type ProductionShortage = 'funds';

export interface Production {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /** Lo que cuesta sacar una unidad de ese tipo (lo que enseña el menu y mira la IA). */
  price(s: GameState, team: TeamId, unitType: UnitType): number;
  /** Por que `team` no puede sacarla ahora por lo que cuesta (undefined = puede). */
  shortage(s: GameState, team: TeamId, unitType: UnitType): ProductionShortage | undefined;
  /** Lo que se gasta al sacarla, ya comprobado que se puede. */
  spend(s: GameState, team: TeamId, unitType: UnitType): void;
}

/** Comprar con dinero: cuesta su precio (units.json, "cost") y se paga al fabricarla. */
export const PURCHASE: Production = {
  id: 'purchase',
  price: (_s, _team, unitType) => unitType.cost,
  shortage: (s, team, unitType) => (unitType.cost > teamState(s, team).funds ? 'funds' : undefined),
  spend: (s, team, unitType) => {
    pay(s, team, unitType.cost);
  },
};
