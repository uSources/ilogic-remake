import type { UnitType } from '../../core/content';
import type { UnitCardVM } from '../../hud/store';
import { fmtNum, nameOf } from '../../settings';
import { unitIconKey } from '../sprites';
import { unitStatChips } from './tile';

/** Aprender: las unidades que se pueden comprar, en el orden del contenido, con su retrato, precio y datos. */
export function unitCatalog(units: readonly UnitType[]): UnitCardVM[] {
  return units
    .filter((unitType) => unitType.builtAt.length > 0)
    .map((unitType) => ({
      id: unitType.id,
      icon: unitIconKey(unitType, true),
      name: nameOf(unitType),
      cost: fmtNum(unitType.cost),
      stats: unitStatChips(unitType),
    }));
}
