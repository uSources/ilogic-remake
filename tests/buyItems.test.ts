import { describe, expect, it } from 'vitest';
import { buyOptions } from '@core/rules';
import type { Building, GameState } from '@core/model';
import { newUnit } from '@core/measure';
import { teamState } from '@core/teams';
import type { MenuItemVM } from '../src/hud/store';
import { t } from '../src/settings';
import { unitIconKey } from '../src/ui/sprites';
import { aboutUnit, buyItem, strongAgainst, weakAgainst } from '../src/view3d/systems/turn/buyItems';
import { blankState, PLAYER, unitTypeNamed } from './helpers';

/** La compra en una fabrica (systems/turn/buyItems.ts): que sale en la lista, que sale apagado, con cuanto te quedas y de que va cada una. */

/** La lista de una fabrica propia, con `funds` de dinero. */
function factoryList(s: GameState, funds: number): MenuItemVM[] {
  const factory: Building = { type: 'Factory', owner: PLAYER, x: 3, y: 3, capture: null };
  s.buildings.push(factory);
  teamState(s, PLAYER).funds = funds;
  return buyOptions(s, factory).map((option) => buyItem(s, option, funds));
}

/** La entrada de un tipo de unidad (falla claro si no esta). */
function entryOf(items: readonly MenuItemVM[], unitTypeId: string): MenuItemVM {
  const item = items.find((candidate) => candidate.id === `buy${unitTypeId}`);
  if (!item) throw new Error(`${unitTypeId} no sale en la lista`);
  return item;
}

describe('la lista de la compra', () => {
  it('sale lo que fabrica el edificio, en el orden de units.json, con su nombre, su precio y su retrato', () => {
    const s = blankState();
    const items = factoryList(s, 5000);
    const built = s.content.units.list.filter((unitType) => unitType.builtAt.includes('Factory'));
    expect(items.map((item) => item.id)).toEqual(built.map((unitType) => `buy${unitType.id}`));
    expect(entryOf(items, 'Car')).toMatchObject({ label: 'Jeep', hint: '4000', icon: unitIconKey(unitTypeNamed('Car'), true) });
    expect(entryOf(items, 'Tank').hint).toBe('12.000');
  });

  it('lo que no te llega sale apagado, con el retrato gris y lo que falta debajo y al pie', () => {
    const tank = entryOf(factoryList(blankState(), 5000), 'Tank');
    expect(tank.disabled).toBe(true);
    expect(tank.icon).toBe(unitIconKey(unitTypeNamed('Tank'), false));
    expect(tank.buy).toMatchObject({ note: 'faltan 7000', balance: 'Te faltan 7000' });
  });

  it('lo que te llega dice con cuanto te quedas; si te deja a 0, lo avisa debajo del nombre', () => {
    const items = factoryList(blankState(), 5000);
    expect(entryOf(items, 'Car').disabled).toBe(false);
    expect(entryOf(items, 'Car').buy).toMatchObject({ note: null, balance: 'Te quedan 1000' });
    expect(entryOf(items, 'Blocker').buy).toMatchObject({ note: 'te quedarías a 0', balance: 'Te quedan 0' });
  });

  it('sin sitio en el ejercito sale apagada con el porque, aunque llegue el dinero', () => {
    const s = blankState({ maxUnits: 1 });
    newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 6, y: 6 });
    const jeep = entryOf(factoryList(s, 50000), 'Car');
    const why = t('unitLimit').replace('{n}', '1');
    expect(jeep.disabled).toBe(true);
    expect(jeep.buy).toMatchObject({ note: why, balance: why });
  });
});

describe('de que va cada unidad', () => {
  it('primero mueve, alcance y vision; luego contra que es fuerte y contra que es debil', () => {
    const s = blankState();
    const [stats, strong, weak] = aboutUnit(s, unitTypeNamed('Car'));
    expect(stats).toMatch(/^Mov 7 · Alcance 1–1 · Visión 7/);
    expect(strong).toMatch(/^Fuerte contra /);
    expect(weak).toMatch(/^Débil contra /);
  });

  it('no se cuenta a si misma y como mucho dice tres', () => {
    const s = blankState();
    const tank = unitTypeNamed('Tank');
    expect(strongAgainst(s, tank)).not.toContain(tank);
    expect(weakAgainst(s, tank)).not.toContain(tank);
    expect(strongAgainst(s, unitTypeNamed('Soldier')).length).toBeLessThanOrEqual(3);
  });

  it('lo que no ataca no dice contra que es fuerte', () => {
    const lines = aboutUnit(blankState(), unitTypeNamed('Transport'));
    expect(lines.some((line) => line.startsWith('Fuerte contra'))).toBe(false);
  });
});
