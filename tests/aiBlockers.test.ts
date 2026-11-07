import { describe, expect, it } from 'vitest';
import { blockersFor, playCtx } from '@core/autopilot/context';
import { autopilotProfileOf } from '@core/autopilot/defaultProfile';
import { defaultContent } from '@core/content/default';
import { dispatch } from '@core/actions';
import { newUnit } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';

const TANK = unitTypeNamed('Tank');
const SOLDIER = unitTypeNamed('Soldier');

/** Una partida con niebla, un tanque propio que mide, un aliado, un enemigo a la vista y uno escondido. */
function scene(settings: { passAllies: boolean; ambush: boolean }) {
  const s = blankState({ fog: true, forestHides: true, ...settings });
  const mover = newUnit(s, TANK, 0, { x: 5, y: 10 });
  const units = [newUnit(s, TANK, 0, { x: 6, y: 10 }), newUnit(s, SOLDIER, 1, { x: 5, y: 11 }), newUnit(s, SOLDIER, 1, { x: 18, y: 18 })];
  /** Si cortan el paso: [aliado, enemigo a la vista, enemigo escondido]. */
  const blocked = (group: boolean) => {
    const play = Object.assign(playCtx(0, autopilotProfileOf(defaultContent()), dispatch), { group });
    const blocks = blockersFor(s, play, mover);
    return units.map((unit) => blocks(unit));
  };
  return { blocked };
}

describe('lo que corta el paso a la IA al medir (blockersFor)', () => {
  it('sola, o si no puede atravesar a los suyos: todas las unidades', () => {
    expect(scene({ passAllies: true, ambush: true }).blocked(false)).toEqual([true, true, true]);
    expect(scene({ passAllies: false, ambush: false }).blocked(true)).toEqual([true, true, true]);
  });

  it('en grupo, si atraviesa a los suyos: las reglas de paso y solo lo que ve (PLANS_WITH_WHAT_IT_SEES), haya emboscadas o no', () => {
    expect(scene({ passAllies: true, ambush: true }).blocked(true)).toEqual([false, true, false]);
    expect(scene({ passAllies: true, ambush: false }).blocked(true)).toEqual([false, true, false]);
  });
});
