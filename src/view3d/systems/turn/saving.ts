/**
 * Guardar la partida de esta pantalla: a mano (la pausa, `saveGame`) y sola (`keepSaved`): al salir de
 * la pagina y, con el autoguardado de Opciones, al empezar cada turno de una persona. Solo si su modo
 * se guarda; por la red nunca, porque la partida se sigue desde el servidor.
 */
import { gameModeOf } from '../../../core/modes';
import type { GameState } from '../../../core/model';
import { serialize } from '../../../core/save';
import { isAutosaveMoment, screenEnd, type GameSession } from '../../../core/session';
import { settings } from '../../../settings';
import { writeSave } from '../../../storage';
import type { Onlooker } from './matchRunner';

/** Guarda la partida (si su modo se guarda); false si no se ha podido. */
export function saveGame(s: GameState): boolean {
  return gameModeOf(s).saves && writeSave(serialize(s));
}

/**
 * Guarda sola una partida de esta pantalla. Al salir de la pagina (cerrar, recargar: «Continuar» la
 * retoma), si no se ha acabado para quien mira entonces (con varias personas en esta pantalla, la que
 * juega: se pregunta a `onlooker` en ese momento). Y, si quien juega tiene el autoguardado, al empezar
 * cada turno de una persona: por si el navegador la cierra sin avisar, como pasa en el movil. La
 * opcion se mira en cada turno, asi que cambiarla en plena partida vale desde el siguiente.
 */
export function keepSaved(session: GameSession, onlooker: Pick<Onlooker, 'team'>): void {
  window.addEventListener('pagehide', () => void (screenEnd(session, onlooker.team) ?? saveGame(session.state)));
  session.subscribe((step) => {
    if (settings.autosave && isAutosaveMoment(session, step)) saveGame(session.state);
  });
}
