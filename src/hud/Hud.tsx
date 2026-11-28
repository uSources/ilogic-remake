import { useUI } from './common/useUI';
import { GameHud } from './game/GameHud';
import { Campaign } from './menus/Campaign';
import { EndScreen } from './menus/EndScreen';
import { Home } from './menus/Home';
import { isPageOpen } from './menus/MenuPage';
import { NewGame } from './menus/NewGame';
import { Online } from './menus/Online';
import { Options } from './menus/Options';
import { Help } from './overlays/Help';
import { Banner, Loading, Toast } from './overlays/Notices';
import { PatchNotes } from './overlays/PatchNotes';
import { RenameSquad } from './overlays/RenameSquad';
import { Handoff } from './overlays/Handoff';
import { MatchIntro } from './overlays/MatchIntro';
import type { UIState } from './state';

/** La forma del velo sobre el tablero de Inicio en cada pantalla del menu (sin forma: oscurece todo por igual). */
const MENU_VEIL: Partial<Record<UIState['screen'], string>> = { menu: 'side', setup: 'screen', campaign: 'screen' };

/**
 * Raiz de la interfaz HTML: la pantalla en curso (s.screen) y, encima, los dialogos y avisos.
 *
 * Donde va cada cosa:
 * - common/: piezas compartidas (Button/Btn, Icon, Callout, Veil, Seg, plegar, formatos, useUI).
 * - game/: paneles de la partida (GameHud los coloca).
 * - menus/: pantallas del menu principal, pausa y final.
 * - overlays/: dialogos (ayuda, novedades, nombre de escuadra) y avisos (carga, aviso, resumen, cartel).
 * - vm/: tipos de lo que enseña cada panel; state.ts el estado entero; actions.ts lo que piden los botones.
 * - styles/: la hoja de estilos por partes (hud.css las junta en orden).
 */
export function Hud() {
  const s = useUI();
  return (
    <>
      {s.screen === 'loading' && (s.intro ? <MatchIntro intro={s.intro} progress={s.loading} /> : <Loading progress={s.loading} />)}
      {(s.screen === 'menu' || s.screen === 'setup' || s.screen === 'campaign' || s.screen === 'online') && (
        // En Inicio el tablero 3D de detras se ve a la derecha: el velo solo oscurece el lado del menu.
        // En Escaramuza y Campaña, igual pero mas lejos, hasta su ficha de la derecha.
        <div class={`menu-veil ${MENU_VEIL[s.screen] ?? ''}`} />
      )}
      {/* Debajo de una pagina, las pestañas de Inicio se verian dos veces. */}
      {s.screen === 'menu' && !isPageOpen(s) && <Home s={s} />}
      {s.screen === 'setup' && <NewGame s={s} />}
      {s.screen === 'campaign' && <Campaign s={s} />}
      {s.screen === 'online' && <Online s={s} />}
      {s.screen === 'game' && <GameHud s={s} />}
      {s.screen === 'end' && s.end && <EndScreen end={s.end} />}
      {s.options && <Options options={s.options} />}
      {s.help && s.helpRules && <Help rules={s.helpRules} topic={s.helpTopic} />}
      {s.rename && <RenameSquad rename={s.rename} />}
      {s.handoff && s.screen === 'game' && <Handoff handoff={s.handoff} />}
      {s.notes && <PatchNotes notes={s.notes} />}
      {s.toast && <Toast key={s.toast.id} toast={s.toast} />}
      {s.banner && <Banner key={s.banner.id} banner={s.banner} />}
    </>
  );
}
