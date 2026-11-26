/**
 * El teclado en la compra de una fabrica (game/BuyList.tsx), como en la pausa: abierta, las teclas son
 * suyas (es un KeyPanel, systems/input/keyInput.ts). Arriba y abajo señalan, Enter compra la señalada
 * y Esc sale sin comprar; nada llega al mapa (las flechas no mueven la camara).
 */
import type { MenuCommand, MenuContext } from '../../../controls/menu';
import type { KeyPanel } from '../input/keyInput';

/** Lo que la compra pide al turno (TurnControls). */
export interface BuyHost {
  readonly isBuying: boolean;
  /** Señalar la de encima (-1) o la de debajo (+1). */
  stepBuy(step: number): void;
  /** Comprar la señalada. */
  acceptMenu(): void;
  /** Salir sin comprar. */
  cancel(): void;
}

export class BuyKeys implements KeyPanel {
  constructor(private readonly host: BuyHost) {}

  get isOpen(): boolean {
    return this.host.isBuying;
  }

  /** Que teclas valen con la compra abierta (MENU_BINDINGS.buy). */
  context(): MenuContext {
    return 'buy';
  }

  /** La lista va de arriba abajo: los lados no hacen nada. */
  command(command: MenuCommand): void {
    if (command.kind === 'move' && command.dy) return this.host.stepBuy(command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.host.acceptMenu();
    if (command.kind === 'back') this.host.cancel();
  }
}
