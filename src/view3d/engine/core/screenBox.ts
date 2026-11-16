/**
 * El recuadro de seleccion mientras se arrastra (ports/pointer.ts, `SelectionBoxView`): un rectangulo
 * con borde encima del lienzo, que no recibe el raton.
 */
import type { ScreenBox, SelectionBoxView } from '../../ports/pointer';

const BORDER = '2px solid #ffd447';
const FILL = 'rgba(255, 212, 71, 0.12)';

export class ScreenBoxView implements SelectionBoxView {
  private readonly element = document.createElement('div');

  constructor(container: HTMLElement) {
    Object.assign(this.element.style, {
      position: 'fixed',
      border: BORDER,
      background: FILL,
      pointerEvents: 'none',
      display: 'none',
      zIndex: '5',
    });
    container.appendChild(this.element);
  }

  show(box: ScreenBox | null): void {
    this.element.style.display = box ? 'block' : 'none';
    if (!box) return;
    Object.assign(this.element.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.right - box.left}px`,
      height: `${box.bottom - box.top}px`,
    });
  }
}
