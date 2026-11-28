/**
 * La compra en una fabrica propia (lienzo «Todo en estilo C», tablero 10): lo que dice la lista de cada
 * unidad que fabrica. Su retrato, su nombre y su precio; si no te llega, apagada y con lo que falta; y,
 * la señalada, de que va y con cuanto dinero te quedas.
 */
import { usesCommandPoints, type BuyOption } from '../../../core/rules';
import type { UnitType } from '../../../core/content';
import type { GameState } from '../../../core/model';
import type { BuyFactsVM, MenuItemVM } from '../../../hud/store';
import { fmtList, fmtNum, nameOf, t } from '../../../settings';
import { abilitiesVM, buyBlockedText, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';

/** Contra cuantas unidades se dice que es fuerte o debil, y desde que acierto cuenta. */
const MATCHUPS_SHOWN = 3;
const GOOD_HIT = 0.5;

/** Lo que acierta `attacker` a `target` (0 si no le puede atacar). */
const hitOn = (attacker: UnitType, target: UnitType): number => attacker.attack?.hitChance[target.id] ?? 0;

/** Las otras unidades con mas `hit` (al menos GOOD_HIT), de mas a menos. */
function mostHit(s: GameState, unitType: UnitType, hit: (other: UnitType) => number): UnitType[] {
  return s.content.units.list
    .filter((other) => other !== unitType && hit(other) >= GOOD_HIT)
    .sort((a, b) => hit(b) - hit(a))
    .slice(0, MATCHUPS_SHOWN);
}

/** Contra que unidades es fuerte: las que mas acierta. */
export const strongAgainst = (s: GameState, unitType: UnitType): UnitType[] => mostHit(s, unitType, (target) => hitOn(unitType, target));

/** Contra que unidades es debil: las que mas la aciertan a ella. */
export const weakAgainst = (s: GameState, unitType: UnitType): UnitType[] => mostHit(s, unitType, (attacker) => hitOn(attacker, unitType));

/** «Fuerte contra Soldado, Jeep y Bazuca» (o nada, si no hay ninguna). */
function matchupLine(key: 'buyStrong' | 'buyWeak', units: readonly UnitType[]): string[] {
  return units.length ? [t(key).replace('{list}', fmtList(units.map(nameOf)))] : [];
}

/** De que va, una linea por cosa: mueve, alcance y vision (y mando y habilidades); contra que es fuerte; contra que es debil. */
export function aboutUnit(s: GameState, unitType: UnitType): string[] {
  const command = usesCommandPoints(s) ? [`${t('commandShort')} ${unitType.command}`] : [];
  const abilities = abilitiesVM(s, unitType).map((ability) => ability.name);
  const stats = [unitStatsText(unitType), `${t('vision')} ${unitType.vision}`, ...command, ...abilities].join(' · ');
  return [stats, ...matchupLine('buyStrong', strongAgainst(s, unitType)), ...matchupLine('buyWeak', weakAgainst(s, unitType))];
}

/**
 * Lo que se dice de ella con el dinero `funds`: debajo de su nombre, lo que falta, por que no cabe en el
 * ejercito o que te deja a 0; y, señalada, con cuanto te quedas (o lo que falta, o por que no).
 */
function buyFacts(s: GameState, option: BuyOption, funds: number): BuyFactsVM {
  const left = funds - option.cost;
  const about = aboutUnit(s, option.unitType);
  if (option.blocked === 'funds') {
    const missing = fmtNum(-left);
    return { note: t('buyMissing').replace('{n}', missing), about, balance: t('buyShort').replace('{n}', missing) };
  }
  if (option.blocked) {
    const why = buyBlockedText(s, option.blocked);
    return { note: why, about, balance: why };
  }
  return { note: left === 0 ? t('buyEmpties') : null, about, balance: t('buyLeft').replace('{n}', fmtNum(left)) };
}

/** Una unidad de la lista: su retrato (gris si no se puede), su nombre, su precio y lo que se dice de ella. `funds`, el dinero de quien compra. */
export function buyItem(s: GameState, option: BuyOption, funds: number): MenuItemVM {
  const { unitType } = option;
  return {
    id: `buy${unitType.id}`,
    label: nameOf(unitType),
    hint: fmtNum(option.cost),
    icon: unitIconKey(unitType, option.affordable),
    disabled: !option.affordable,
    buy: buyFacts(s, option, funds),
  };
}
