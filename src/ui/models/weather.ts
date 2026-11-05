import { tablesOf } from '../../core/gameContent';
import type { GameState } from '../../core/model';
import { forecast, weatherNow } from '../../core/weather';
import type { WeatherVM } from '../../hud/store';
import { t, weatherLabel, type TextKey } from '../../settings';

/** Clima de la barra de arriba: el de hoy, sus efectos en corto y el de mañana. */

/** Nombre de cada tipo de movimiento, en el orden de MoveType. */
const MOVE_TYPE_KEYS: readonly TextKey[] = ['mtFoot', 'mtVehicle', 'mtAir', 'mtAmphibious'];

const signed = (value: number): string => (value > 0 ? `+${value}` : `−${-value}`);

/** Efectos de un clima en corto: "Vehículos −1 mov. · Visión −1 · Puntería −10 %". */
export function weatherEffectsText(s: GameState, kind: number): string {
  const WEATHER = tablesOf(s).WEATHER;
  const parts: string[] = [];
  // Tipos de movimiento con el mismo cambio, juntos: "Infantería/Vehículos −1 mov."
  const byDelta = new Map<number, string[]>();
  WEATHER.move[kind]!.forEach((delta, mt) => {
    if (delta !== 0) byDelta.set(delta, [...(byDelta.get(delta) ?? []), t(MOVE_TYPE_KEYS[mt]!)]);
  });
  for (const [delta, names] of byDelta) parts.push(`${names.join('/')} ${signed(delta)} ${t('weatherMoveShort')}`);
  const vision = WEATHER.vision[kind]!;
  if (vision !== 0) parts.push(`${cap(t('weatherVision'))} ${signed(vision)}`);
  const aim = Math.round((WEATHER.hitChance[kind]! - 1) * 100);
  if (aim !== 0) parts.push(`${cap(t('weatherAim'))} ${signed(aim)} %`);
  return parts.length ? parts.join(' · ') : t('weatherNoEffect');
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Indicador del clima (null si la partida se juega sin clima). */
export function weatherVM(s: GameState): WeatherVM | null {
  if (!s.rules.weather) return null;
  const kind = weatherNow(s);
  const next = forecast(s);
  return {
    id: tablesOf(s).WEATHER.ids[kind]!,
    name: weatherLabel(s.content, kind),
    effects: weatherEffectsText(s, kind),
    next: next === null ? null : weatherLabel(s.content, next),
  };
}
