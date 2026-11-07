import { describe, expect, it } from 'vitest';
import { fireOnTheWay, guardZone, HUNT, SHOOT_FROM_HERE, autopilotProfileOf, type EngagementPolicy } from '@core/autopilot';
import { playCtx } from '@core/autopilot/context';
import { tryAttack } from '@core/autopilot/tactics';
import { defaultContent } from '@core/content/default';
import { moveRange } from '@core/rules';
import { newUnit } from '@core/measure';
import { blankState, giveTurn, playPlan, unitTypeNamed } from './helpers';

const TANK = unitTypeNamed('Tank');
const SOLDIER = unitTypeNamed('Soldier');

/** Un tanque propio y un soldado enemigo a `distance` casillas: que propone el tanque con esa forma de pelear. */
function engage(distance: number, policy: EngagementPolicy) {
  const s = giveTurn(blankState({ fog: false }), 0);
  const tank = newUnit(s, TANK, 0, { x: 5, y: 10 });
  newUnit(s, SOLDIER, 1, { x: 5 + distance, y: 10 });
  const plan = tryAttack(s, playCtx(0, autopilotProfileOf(defaultContent())), tank, moveRange(s, tank), policy);
  const proposed: string[] = [];
  const used = (() => {
    for (let step = plan.next(); ;) {
      if (step.done) return step.value;
      proposed.push(step.value.kind);
      step = plan.next({ ok: true, events: [] });
    }
  })();
  return { used, proposed };
}

/** Las formas de pelear (EngagementPolicy): cada preset dice a quien mira, desde donde dispara y si persigue. */
describe('EngagementPolicy', () => {
  it('a tiro sin moverse: todas disparan (las que pueden, quiza desde una casilla mejor)', () => {
    for (const policy of [HUNT, SHOOT_FROM_HERE, fireOnTheWay('anywhere'), guardZone(() => true, 'anywhere')])
      expect(engage(1, policy).proposed.at(-1)).toBe('attack');
    expect(engage(1, SHOOT_FROM_HERE).proposed).toEqual(['attack']);
  });

  it('a tiro moviendose: HUNT se mueve y dispara; SHOOT_FROM_HERE no', () => {
    expect(engage(3, HUNT).proposed).toEqual(['move', 'attack']);
    expect(engage(3, SHOOT_FROM_HERE)).toMatchObject({ used: false, proposed: [] });
  });

  it('el filtro de casillas (la formacion) decide desde donde se puede disparar', () => {
    expect(
      engage(
        3,
        fireOnTheWay(() => false),
      ),
    ).toMatchObject({ used: false, proposed: [] });
  });

  it('sin disparo posible: guardZone persigue dentro de su zona; fireOnTheWay no se desvia', () => {
    const nowhere = () => false;
    expect(
      engage(
        3,
        guardZone(() => true, nowhere),
      ).proposed,
    ).toEqual(['move', 'wait']);
    expect(engage(3, fireOnTheWay(nowhere))).toMatchObject({ used: false, proposed: [] });
  });

  it('guardZone solo mira a los de su zona', () => {
    expect(
      engage(
        1,
        guardZone(() => false, 'anywhere'),
      ),
    ).toMatchObject({ used: false, proposed: [] });
  });

  it('lo que propone se manda como cualquier accion', () => {
    const s = giveTurn(blankState({ fog: false }), 0);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 10 });
    newUnit(s, SOLDIER, 1, { x: 8, y: 10 });
    const events = playPlan(s, 0, tryAttack(s, playCtx(0, autopilotProfileOf(defaultContent())), tank, moveRange(s, tank), HUNT));
    expect(events.map((event) => event.kind)).toEqual(['move', 'attack']);
  });
});
