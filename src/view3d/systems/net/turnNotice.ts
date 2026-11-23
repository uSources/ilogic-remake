/**
 * Avisar de que vuelve a tocar a la persona cuando no esta mirando la pestaña (una partida por la
 * red: los demas tardan lo que tardan): el titulo cambia hasta que vuelve. El sonido de «tu turno» ya
 * lo pone el turno (y, con la pestaña escondida, el juego se calla si asi lo quiere la persona).
 */
import { t } from '../../../settings';

let originalTitle: string | null = null;

/** Le toca a la persona: si no mira la pestaña, el titulo lo dice hasta que vuelve a ella. */
export function notifyTurn(): void {
  if (!document.hidden || originalTitle !== null) return;
  originalTitle = document.title;
  document.title = t('onlineYourTurnTitle');
  document.addEventListener('visibilitychange', restoreTitle);
}

function restoreTitle(): void {
  if (document.hidden || originalTitle === null) return;
  document.title = originalTitle;
  originalTitle = null;
  document.removeEventListener('visibilitychange', restoreTitle);
}
