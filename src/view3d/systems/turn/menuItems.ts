/**
 * Los textos e iconos de lo que enseña la partida 3D: las fichas y la rueda de lo elegido (sus
 * opciones), la compra (precio y datos de cada unidad) y lo que cobra un equipo cada dia (la barra de
 * arriba).
 */
import { usesCommandPoints, type BuyOption, type CaptureBlock } from '../../../core/rules';
import type { UnitType } from '../../../core/content';
import type { GameState, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { fmtNum, nameOf, t, type TextKey } from '../../../settings';
import { abilitiesVM, buyBlockedText, captureHintText, unitStatChips, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import { keyNameOf } from '../../../hud/keyLabels';
import type { TargetEntry } from './targetPick';
import type { UnitChoice, UnitOption } from './unitOptions';

/** El dibujo de las opciones que lo tienen, delante de su nombre (las demas, solo el texto). */
const OPTION_ICONS: Partial<Record<UnitOption, string>> = {
  attack: 'ui/cmd_attack',
  capture: 'ui/captura',
  unload: 'ui/mk_cargo',
  supply: 'ui/ab_supplies',
  orderToAttack: 'ui/cmd_attack',
  orderToCapture: 'ui/cmd_capture',
  orderToDefend: 'ui/cmd_defend',
};

/** Por que no puede capturar, como se dice debajo de «Capturar» apagado. */
const CAPTURE_BLOCK_TEXT: { readonly [Block in CaptureBlock]: TextKey } = {
  notCapturer: 'captureNotCapturer',
  noBuilding: 'captureNoBuilding',
  allied: 'captureAllied',
};

/** Las opciones de lo elegido (su bocadillo o su rueda), con su texto y la linea de debajo (optionNote). */
export function optionItems(s: GameState, unit: Unit, choices: readonly UnitChoice[]): MenuItemVM[] {
  return choices.map((choice) => ({
    id: choice.option,
    label: t(choice.option),
    danger: choice.option === 'delete',
    disabled: !!choice.blocked,
    hint: optionNote(s, unit, choice),
    icon: OPTION_ICONS[choice.option],
  }));
}

/**
 * La linea de debajo: por que no se puede, si sale apagada; en atacar, cuantos hay a tiro («2 al
 * alcance»); en capturar, «20→10» (los puntos del edificio antes y despues).
 */
function optionNote(s: GameState, unit: Unit, { option, blocked, targets }: UnitChoice): string | undefined {
  if (blocked) return t(CAPTURE_BLOCK_TEXT[blocked]);
  if (targets) return t('attackTargets').replace('{n}', fmtNum(targets));
  return option === 'capture' ? captureHintText(s, unit) : undefined;
}

/** Cada entrada del bocadillo de elegir a quien atacar: su texto y su tecla (Intro, ← →, Esc; como el tablero 9). */
const TARGET_LOOKS: { readonly [Entry in TargetEntry]: { label: TextKey; keys: readonly string[] } } = {
  attack: { label: 'attack', keys: ['Enter'] },
  nextTarget: { label: 'otherTarget', keys: ['ArrowLeft', 'ArrowRight'] },
  back: { label: 'back', keys: ['Escape'] },
};

/** Las entradas del bocadillo de elegir a quien atacar. */
export function targetItems(entries: readonly TargetEntry[]): MenuItemVM[] {
  return entries.map((entry) => {
    const look = TARGET_LOOKS[entry];
    return { id: entry, label: t(look.label), key: look.keys.map(keyNameOf).join(' ') };
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
  const command = !usesCommandPoints(s) ? '' : ` · ${t('commandShort')} ${unitType.command}`;
  const abilities = abilitiesVM(s, unitType)
    .map((ability) => ` · ${ability.name}`)
    .join('');
  const blocked = option.blocked ? ` · ${buyBlockedText(s, option.blocked)}` : '';
  return `${unitStatsText(unitType)} · ${t('vision')} ${unitType.vision}${command}${abilities}${blocked}`;
}
