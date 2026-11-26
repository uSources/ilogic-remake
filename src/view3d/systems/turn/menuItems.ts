/**
 * Los textos e iconos de lo que enseña la partida 3D: las fichas y la rueda de lo elegido (sus
 * opciones). Los de la compra, en buyItems.ts.
 */
import type { GameState, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { t } from '../../../settings';
import { captureHintText } from '../../../ui/hudModels';
import type { UnitOption } from './unitOptions';

/** Como se ve cada opcion en su ficha: un dibujo del juego o, si no hay, un simbolo. */
const OPTION_LOOKS: { readonly [Option in UnitOption]: { icon: string } | { glyph: string } } = {
  attack: { icon: 'ui/cmd_attack' },
  capture: { icon: 'ui/captura' },
  unload: { icon: 'ui/mk_cargo' },
  supply: { icon: 'ui/ab_supplies' },
  move: { glyph: '➜' },
  wait: { glyph: 'Z' },
  orderToAttack: { icon: 'ui/cmd_attack' },
  orderToCapture: { icon: 'ui/cmd_capture' },
  orderToDefend: { icon: 'ui/cmd_defend' },
  cancelOrder: { glyph: '✕' },
  squadForm: { glyph: '+' },
  squadLeave: { glyph: '−' },
  squadRename: { glyph: 'Aa' },
  squadDisband: { glyph: '÷' },
  undo: { glyph: '↶' },
  squadSelect: { glyph: '◎' },
  pickSeveral: { glyph: '⊕' },
  delete: { glyph: '✖' },
};

/** Las opciones de lo elegido (fichas o rueda), con su texto (en capturar, "20→10": puntos del edificio antes y despues). */
export function optionItems(s: GameState, unit: Unit, options: readonly UnitOption[]): MenuItemVM[] {
  return options.map((option) => {
    const look = OPTION_LOOKS[option];
    return {
      id: option,
      label: t(option),
      danger: option === 'delete',
      hint: option === 'capture' ? captureHintText(s, unit) : undefined,
      ...('icon' in look ? { icon: look.icon } : { glyph: look.glyph }),
    };
  });
}
