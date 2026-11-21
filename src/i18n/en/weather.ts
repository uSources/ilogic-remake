import type { weather as es } from '../es/weather';
import type { Translation } from '../translation';

export const weather: Translation<typeof es> = {
  weather: 'Weather',
  weatherTomorrow: 'Tomorrow',
  weatherNoEffect: 'No effects',
  weatherVision: 'vision',
  weatherAim: 'aim',
  weatherMoveShort: 'move',
};
