/**
 * Los textos e iconos de lo que enseña la partida 3D: las fichas y la rueda de lo elegido (sus
 * opciones), la compra (precio y datos de cada unidad) y lo que cobra un equipo cada dia (la barra de
 * arriba).
 */
import { buildingIncome, buildingsOf, upkeepOf, type BuyOption } from '../../../core/rules';
import { buildingTypeOf } from '../../../core/gameContent';
import type { UnitType } from '../../../core/content';
import type { GameState, TeamId, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { nameOf, t } from '../../../settings';
import { abilitiesVM, buyBlockedText, captureHintText, unitStatChips, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
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

/** Contra cuantas unidades se dice que es buena (las que mas acierta), y desde cuanto acierto. */
const STRONG_AGAINST_COUNT = 3;
const STRONG_FROM = 0.5;

/** Las unidades contra las que es mejor: las que mas acierta (al menos STRONG_FROM), de mas a menos. */
export function strongAgainst(s: GameState, unitType: UnitType): UnitType[] {
  const hits = unitType.attack?.hitChance ?? {};
  return s.content.units.list
    .filter((target) => (hits[target.id] ?? 0) >= STRONG_FROM)
    .sort((a, b) => (hits[b.id] ?? 0) - (hits[a.id] ?? 0))
    .slice(0, STRONG_AGAINST_COUNT);
}

/**
 * Una unidad que se puede comprar: precio y, al señalarla, sus datos (y por que no, si no se puede).
 * `funds`, el dinero de quien compra: si no llega, cuanto falta.
 */
export function buyItem(s: GameState, option: BuyOption, funds: number): MenuItemVM {
  const { unitType } = option;
  return {
    id: `buy${unitType.id}`,
    label: nameOf(unitType),
    hint: `${option.cost}`,
    icon: unitIconKey(unitType, option.affordable),
    disabled: !option.affordable,
    detail: buyDetail(s, option),
    buy: {
      stats: unitStatChips(unitType),
      strongAgainst: strongAgainst(s, unitType).map((target) => unitIconKey(target, true)),
      missing: option.blocked === 'funds' ? option.cost - funds : null,
      why: option.blocked && option.blocked !== 'funds' ? buyBlockedText(s, option.blocked) : null,
    },
  };
}

function buyDetail(s: GameState, option: BuyOption): string {
  const { unitType } = option;
  const command = s.settings.commandPoints === null ? '' : ` · ${t('commandShort')} ${unitType.command}`;
  const abilities = abilitiesVM(s, unitType)
    .map((ability) => ` · ${ability.name}`)
    .join('');
  const blocked = option.blocked ? ` · ${buyBlockedText(s, option.blocked)}` : '';
  return `${unitStatsText(unitType)} · ${t('vision')} ${unitType.vision}${command}${abilities}${blocked}`;
}

/** Lo que cobra un equipo cada dia: sus edificios menos el mantenimiento de su ejercito. */
export function teamIncome(s: GameState, team: TeamId): number {
  const owned = buildingsOf(s, team);
  return owned.reduce((sum, building) => sum + buildingIncome(s, buildingTypeOf(s, building)), 0) - upkeepOf(s, team);
}
