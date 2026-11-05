import { describe, expect, it } from 'vitest';
import { cursorFor, menuActions, smartAction, type ActionCtx } from '../src/controls/actions';
import { defaultContent } from '@core/content/default';
import { newUnit } from '@core/rules';
import { formSquad, giveStandingOrder } from '@core/squads';
import type { GameState } from '@core/model';
import { blankState } from './helpers';

const { HQ } = defaultContent().tables;

/** [CAMBIO] Registro de acciones: clic derecho inteligente, menu completo y cursor (controls/actions.ts). */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0;

function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 6, y: 6 });
  return s;
}
const ids = (context: ActionCtx) => menuActions(context).map((actionDef) => actionDef.id);

describe('acciones con un grupo', () => {
  function grp() {
    const s = world();
    const units = [newUnit(s, SOLDIER, 0, { x: 2, y: 2 }), newUnit(s, TANK, 0, { x: 3, y: 2 })];
    const context = (x: number, y: number, enemyHere = false): ActionCtx => ({ s, units, at: { x, y }, enemyHere });
    return { s, units, ctx: context };
  }

  it('clic derecho: enemigo a la vista = atacar; edificio que tomar = capturar; casilla libre = mover', () => {
    const { ctx: context } = grp();
    expect(smartAction(context(10, 10, true))?.id).toBe('attack');
    expect(smartAction(context(6, 6))?.id).toBe('capture');
    expect(smartAction(context(9, 3))?.id).toBe('move');
    expect(cursorFor(context(10, 10, true))).toBe('attack');
    expect(cursorFor(context(6, 6))).toBe('capture');
    expect(cursorFor(context(9, 3))).toBe('move');
  });

  it('sin unidades que puedan capturar, el edificio no se ofrece para capturar', () => {
    const s = world();
    const units = [newUnit(s, TANK, 0, { x: 3, y: 2 })];
    const context: ActionCtx = { s, units: [units[0]!, newUnit(s, TANK, 0, { x: 4, y: 2 })], at: { x: 6, y: 6 }, enemyHere: false };
    expect(smartAction(context)?.id).toBe('move');
    expect(ids(context)).not.toContain('orderToCapture');
  });

  it('menu completo: ordenes de la casilla, formar escuadra; con escuadra, cambiar nombre y deshacer', () => {
    const { s, units, ctx: context } = grp();
    expect(ids(context(6, 6))).toEqual(['capture', 'orderToAttack', 'orderToCapture', 'orderToDefend', 'squadForm']);
    formSquad(s, units);
    expect(ids(context(9, 3))).toEqual(['move', 'orderToAttack', 'orderToDefend', 'squadRename', 'squadDisband']);
    giveStandingOrder(s, units, 'defend', { x: 9, y: 3 });
    expect(ids(context(9, 3))).toContain('cancelOrder');
  });

  it('parte de una escuadra: sacar de la escuadra; sin casilla, solo lo que no la necesita', () => {
    const { s, units } = grp();
    formSquad(s, units);
    const context: ActionCtx = { s, units: [units[0]!], at: null, enemyHere: false };
    expect(ids(context)).toEqual(['orderToAttack', 'orderToCapture', 'orderToDefend', 'squadLeave']);
    expect(smartAction(context)).toBeNull();
    expect(cursorFor(context)).toBe('default');
  });
});

describe('acciones con una sola unidad elegida (la escena dice que pasa en la casilla)', () => {
  it('cada intencion da su accion y su cursor; fuera de alcance, ir alli; si no, prohibido', () => {
    const s = world();
    const unit = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    const ctxWith = (context: Partial<ActionCtx>): ActionCtx => ({
      s,
      units: [unit],
      at: { x: 5, y: 5 },
      enemyHere: false,
      intent: 'none',
      ...context,
    });
    expect(smartAction(ctxWith({ intent: 'attack', enemyHere: true }))?.id).toBe('attack');
    expect(smartAction(ctxWith({ intent: 'move', intentCapture: true }))?.id).toBe('capture');
    expect(smartAction(ctxWith({ intent: 'move' }))?.id).toBe('move');
    expect(smartAction(ctxWith({ intent: 'merge' }))?.id).toBe('merge');
    expect(smartAction(ctxWith({ intent: 'load' }))?.id).toBe('load');
    expect(smartAction(ctxWith({ intent: 'none', farOk: true }))?.id).toBe('go');
    expect(cursorFor(ctxWith({ intent: 'none', farOk: true }))).toBe('go');
    expect(smartAction(ctxWith({ intent: 'none' }))).toBeNull();
    expect(cursorFor(ctxWith({ intent: 'none' }))).toBe('forbidden');
    // Un enemigo fuera de alcance: no ataca ahora, pero el menu ofrece la orden.
    expect(ids(ctxWith({ intent: 'none', enemyHere: true }))).toEqual(['orderToAttack', 'orderToDefend']);
  });
});
