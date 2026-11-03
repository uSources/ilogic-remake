import { RULES, WEATHER } from '../../core/data';
import type { GameState } from '../../core/types';
import { forecast, weatherNow } from '../../core/weather';
import type { WeatherVM } from '../../hud/store';
import { t, weatherLabel, type TextKey } from '../../settings';

/** Clima de la barra de arriba: el de hoy, sus efectos en corto y el de mañana. */

/** Nombre de cada tipo de movimiento, en el orden de MoveType. */
const MOVE_TYPE_KEYS: readonly TextKey[] = ['mtFoot', 'mtVehicle', 'mtAir', 'mtAmphibious'];

const signed = (n: number): string => (n > 0 ? `+${n}` : `−${-n}`);

/** Efectos de un clima en corto: "Vehículos −1 mov. · Visión −1 · Puntería −10 %". */
export function weatherEffectsText(kind: number): string {
  const parts: string[] = [];
  // Tipos de movimiento con el mismo cambio, juntos: "Infantería/Vehículos −1 mov."
  const byDelta = new Map<number, string[]>();
  WEATHER.move[kind]!.forEach((d, mt) => {
    if (d !== 0) byDelta.set(d, [...(byDelta.get(d) ?? []), t(MOVE_TYPE_KEYS[mt]!)]);
  });
  for (const [d, names] of byDelta) parts.push(`${names.join('/')} ${signed(d)} ${t('weatherMoveShort')}`);
  const vision = WEATHER.vision[kind]!;
  if (vision !== 0) parts.push(`${cap(t('weatherVision'))} ${signed(vision)}`);
  const aim = Math.round((WEATHER.hitChance[kind]! - 1) * 100);
  if (aim !== 0) parts.push(`${cap(t('weatherAim'))} ${signed(aim)} %`);
  return parts.length ? parts.join(' · ') : t('weatherNoEffect');
}

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/** Indicador del clima (null si la partida se juega sin clima). */
export function weatherVM(s: GameState): WeatherVM | null {
  if (!RULES.weather) return null;
  const kind = weatherNow(s);
  const next = forecast(s);
  return {
    id: WEATHER.ids[kind]!,
    name: weatherLabel(kind),
    effects: weatherEffectsText(kind),
    next: next === null ? null : weatherLabel(next),
  };
}
