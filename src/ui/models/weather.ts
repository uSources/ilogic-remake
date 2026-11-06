import { MOVEMENTS, type MoveType, type WeatherType } from '../../core/content';
import type { GameState } from '../../core/model';
import { isRuleOn } from '../../core/rules';
import { forecast, weatherNow } from '../../core/weather';
import type { WeatherVM } from '../../hud/store';
import { t, nameOf, type TextKey } from '../../settings';

/** Clima de la barra de arriba: el de hoy, sus efectos en corto y el de mañana. */

/** Nombre de cada tipo de movimiento, en el orden de MOVEMENTS. */
const MOVE_TYPE_KEYS: Readonly<Record<MoveType, TextKey>> = {
  foot: 'mtFoot',
  vehicle: 'mtVehicle',
  air: 'mtAir',
  amphibious: 'mtAmphibious',
};

const signed = (value: number): string => (value > 0 ? `+${value}` : `−${-value}`);

/** Efectos de un clima en corto: "Vehículos −1 mov. · Visión −1 · Puntería −10 %". */
export function weatherEffectsText(weather: WeatherType): string {
  const parts: string[] = [];
  // Tipos de movimiento con el mismo cambio, juntos: "Infantería/Vehículos −1 mov."
  const byDelta = new Map<number, string[]>();
  for (const moveType of MOVEMENTS) {
    const delta = weather.move[moveType];
    if (delta !== 0) byDelta.set(delta, [...(byDelta.get(delta) ?? []), t(MOVE_TYPE_KEYS[moveType])]);
  }
  for (const [delta, names] of byDelta) parts.push(`${names.join('/')} ${signed(delta)} ${t('weatherMoveShort')}`);
  const vision = weather.vision;
  if (vision !== 0) parts.push(`${cap(t('weatherVision'))} ${signed(vision)}`);
  const aim = Math.round((weather.hitChance - 1) * 100);
  if (aim !== 0) parts.push(`${cap(t('weatherAim'))} ${signed(aim)} %`);
  return parts.length ? parts.join(' · ') : t('weatherNoEffect');
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Indicador del clima (null si la partida se juega sin clima). */
export function weatherVM(s: GameState): WeatherVM | null {
  if (!isRuleOn(s, 'weather')) return null;
  const weather = weatherNow(s);
  const next = forecast(s);
  return {
    id: weather.id,
    name: nameOf(weather),
    effects: weatherEffectsText(weather),
    next: next === null ? null : nameOf(next),
  };
}
