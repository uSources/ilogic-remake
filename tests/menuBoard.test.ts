import { describe, expect, it } from 'vitest';
import { isMatchOver } from '@core/rules';
import { mapGrid } from '@core/mapGrid';
import { MENU_BOARD_DAYS, MENU_BOARD_SIZE, menuBoardMatch } from '../src/menu/menuBoard';

/** La partida de detras del menu: ya jugada unos dias, todo a la vista y siempre la misma con la misma semilla. */

describe('el tablero de detras del menu', () => {
  const s = menuBoardMatch(2013, 'Plains');

  it('la IA la ha jugado unos dias y sigue en juego, con mas unidades que al empezar', () => {
    expect(s.day).toBe(MENU_BOARD_DAYS + 1);
    expect(isMatchOver(s)).toBe(false);
    expect(s.units.length).toBeGreaterThan(s.teams.length * 3);
  });

  it('se ve entera: sin niebla ni clima, en un mapa pequeño del tema pedido', () => {
    expect(s.settings).toMatchObject({ fog: false, weather: false });
    expect(mapGrid(s).width).toBe(MENU_BOARD_SIZE);
    expect(s.theme).toBe('Plains');
  });

  it('con la misma semilla y tema sale la misma', () => {
    const again = menuBoardMatch(2013, 'Plains');
    expect(again.units.map((unit) => [unit.type, unit.x, unit.y])).toEqual(s.units.map((unit) => [unit.type, unit.x, unit.y]));
  });
});
