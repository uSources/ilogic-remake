import type { weather as es } from '../es/weather';
import type { Translation } from '../translation';

export const weather: Translation<typeof es> = {
  weather: 'Weather',
  weatherTomorrow: 'Tomorrow',
  weatherStarts: 'The weather changes',
  weatherNoEffect: 'No effects',
  weatherVision: 'vision',
  weatherAim: 'aim',
  weatherMoveShort: 'move',
};
