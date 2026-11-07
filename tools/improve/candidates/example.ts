/**
 * Ejemplo de candidato para la arena (`npm run arena -- --candidate tools/improve/candidates/example.ts`):
 * la IA del juego sin moverse al azar cuando no tiene nada que hacer. Un cambio de codigo de la IA se
 * prueba asi antes de ponerlo en src/core: un perfil con sus comportamientos, sus razones de ataque o
 * su turno (`turn`) cambiados, hechos con las piezas que da '@core/ai'. Lo comprueba tsc y lo juega
 * tests/arenaSnapshot.test.ts.
 */
import { defaultAiProfile, UNIT_BEHAVIOURS, type AiProfile } from '@core/ai';
import type { GameContent } from '@core/content';

export const profile = (content: GameContent): AiProfile => ({
  ...defaultAiProfile(content),
  behaviours: UNIT_BEHAVIOURS.filter((behaviour) => behaviour.id !== 'randomMove'),
});
