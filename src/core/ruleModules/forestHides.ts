/**
 * [CAMBIO] El bosque esconde (ajuste `forestHides`; con niebla): el terreno que esconde
 * (terrain.json, "hides": bosque, cactus, bosque nevado) solo se ve desde una casilla vecina.
 */
import { terrainAt } from '../gameContent';
import type { RuleModule } from './hooks';

export const FOREST_HIDES: RuleModule = {
  id: 'forestHides',
  isOn: (settings) => settings.forestHides,
  hooks: { concealment: [{ id: 'forest', conceals: (s, pos) => terrainAt(s, pos).hides }] },
};
