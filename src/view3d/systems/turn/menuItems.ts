/**
 * Los textos e iconos de lo que enseña la partida 3D: las fichas y la rueda de lo elegido (sus
 * opciones). Los de la compra, en buyItems.ts.
 */
import type { CaptureBlock } from '../../../core/rules';
import type { GameState, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { fmtNum, t, type TextKey } from '../../../settings';
import { captureHintText } from '../../../ui/hudModels';
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
