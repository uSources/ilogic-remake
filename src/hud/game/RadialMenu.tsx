import { scaled } from '../common/Popover';
import { ui } from '../store';
import type { MenuVM } from '../vm/menus';
import { itemLabel, OptionChip } from './ActionChips';

/** Distancia (px) del centro de la casilla a cada ficha de la rueda. */
const RADIUS = 78;
/** La primera ficha, arriba; las demas siguen en el sentido de las agujas del reloj. */
const START_ANGLE = -Math.PI / 2;

/** Donde va la ficha `index` de `count` alrededor del centro (desplazamiento en px). */
export function radialOffset(index: number, count: number): { dx: number; dy: number } {
  const angle = START_ANGLE + (2 * Math.PI * index) / Math.max(1, count);
  return { dx: Math.round(Math.cos(angle) * RADIUS), dy: Math.round(Math.sin(angle) * RADIUS) };
}

/**
 * La rueda de lo elegido (clic derecho o mantener pulsado): lo poco frecuente (ordenes, escuadras,
 * esperar alli, deshacer, disolver) en fichas alrededor de su casilla, y debajo el nombre de la
 * señalada. Tocar fuera o Esc la cierra.
 */
export function RadialMenu({ menu }: { menu: MenuVM }) {
  const anchor = scaled(menu.anchor);
  const center = { left: anchor.x + anchor.w / 2, top: anchor.y + anchor.h / 2 };
  const selected = menu.items[menu.selected];
  return (
    <div class="radial" role="menu" aria-label={menu.title} style={center}>
      {menu.items.map((item, index) => {
        const { dx, dy } = radialOffset(index, menu.items.length);
        return (
          <div
            key={item.id}
            class="radial-slot"
            style={{ transform: `translate(${dx}px, ${dy}px)` }}
            onMouseEnter={() => ui.actions.menuHover(index)}
          >
            <OptionChip item={item} index={index} isSelected={index === menu.selected} />
          </div>
        );
      })}
      {selected && <div class="radial-caption">{itemLabel(selected)}</div>}
    </div>
  );
}
