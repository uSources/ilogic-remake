import { afterEach, describe, expect, it } from 'vitest';
import { GameSession, humanController, passiveController } from '@core/session';
import { ui } from '../src/hud/store';
import { t } from '../src/settings';
import { MatchEnd } from '../src/view3d/systems/hud/matchEnd';
import { act, blankState, PLAYER } from './helpers';

/** La pantalla del final sin navegador: cuando sale, que dice y que botones lleva. */

const endOf = (s: ReturnType<typeof blankState>, isOnline = false) =>
  new MatchEnd({ session: new GameSession(s, [humanController(), passiveController()]), viewer: PLAYER, isOnline });

/** Una partida de prueba en la que quien mira se ha rendido. */
function surrendered() {
  const s = blankState();
  act(s, PLAYER, { kind: 'surrender' });
  return s;
}

const shownEnd = () => ui.get().end!;
const buttonIds = () => shownEnd().buttons.map((button) => button.id);

describe('El final de la partida', () => {
  afterEach(() => ui.set({ end: null, screen: 'game' }));

  it('mientras la partida sigue no sale', () => {
    const end = endOf(blankState());
    expect(end.showIfOver()).toBe(false);
    expect(end.isOpen).toBe(false);
  });

  it('al rendirse: derrota, por que, lo jugado encima y las cifras', () => {
    const s = surrendered();
    expect(endOf(s).showIfOver()).toBe(true);
    expect(ui.get().screen).toBe('end');
    expect(shownEnd().outcome).toBe('lost');
    expect(shownEnd().reasonText).toBe('endSurrender');
    expect(shownEnd().kicker).toContain(t('skirmish'));
    expect(shownEnd().buildings).toEqual({ own: 1, total: s.buildings.length });
    // Sin limite de dias no se gana por puntos: no salen.
    expect(shownEnd().score).toBeNull();
  });

  it('una escaramuza sin mapa que repetir (la de prueba no tiene semilla): mirar el tablero y volver al menu', () => {
    endOf(surrendered()).showIfOver();
    expect(buttonIds()).toEqual(['board', 'menu']);
  });

  it('con limite de dias salen los puntos, que deciden quien gana', () => {
    const s = blankState({ dayLimit: 20 });
    act(s, PLAYER, { kind: 'surrender' });
    endOf(s).showIfOver();
    expect(shownEnd().score).not.toBeNull();
  });

  it('por la red solo mirar el tablero y volver al menu', () => {
    endOf(surrendered(), true).showIfOver();
    expect(buttonIds()).toEqual(['board', 'menu']);
  });

  it('enseñarlo dos veces no lo vuelve a empezar: sigue en el boton elegido', () => {
    const end = endOf(surrendered());
    end.showIfOver();
    end.hover(1);
    end.showIfOver();
    expect(shownEnd().selected).toBe(1);
  });
});
