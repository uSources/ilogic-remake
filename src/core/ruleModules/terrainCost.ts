/** Coste del terreno (ajuste `terrainCost`): entrar en cada casilla cuesta lo que diga terrain.json; sin el, todo cuesta 1. */
import { terrainAt } from '../gameContent';
import { terrainMoveCost } from '../rules/queries';
import type { RuleModule } from './hooks';

export const TERRAIN_COST: RuleModule = {
  id: 'terrainCost',
  isOn: (settings) => settings.terrainCost,
  hooks: { enterCosts: [{ id: 'terrain', cost: (s, movement, pos) => terrainMoveCost(movement, terrainAt(s, pos)) }] },
};
