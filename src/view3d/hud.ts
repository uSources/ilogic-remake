/**
 * La barra del prototipo 3D: el dia, de quien es el turno, «Fin de turno» y la ayuda de los mandos.
 * HTML sencillo (sin Preact): es un prototipo; si sigue adelante, se usa la interfaz del juego.
 */
import type { GameState } from '../core/model';

export interface HudCallbacks {
  onEndTurn(): void;
}

export interface PrototypeHud {
  update(s: GameState): void;
}

const HELP = 'Toca tu tanque y una casilla azul · Arrastrar o WASD: mover · Rueda: acercar · Q/E: girar · Enter: fin de turno';

export function installHud(root: HTMLElement, callbacks: HudCallbacks): PrototypeHud {
  root.innerHTML = `
    <div class="bar">
      <strong>Ilogic 3D</strong><span class="tag">prototipo</span>
      <span data-day></span>
      <button type="button" data-end-turn>Fin de turno</button>
    </div>
    <div class="help">${HELP}</div>`;
  const day = root.querySelector<HTMLElement>('[data-day]')!;
  root.querySelector('[data-end-turn]')!.addEventListener('click', () => callbacks.onEndTurn());
  return {
    update(s) {
      day.textContent = `Día ${s.day}`;
    },
  };
}
