import { useUI } from './common/useUI';
import { GameHud } from './game/GameHud';
import { Campaign } from './menus/Campaign';
import { EndScreen } from './menus/EndScreen';
import { Home } from './menus/Home';
import { NewGame } from './menus/NewGame';
import { Options } from './menus/Options';
import { Help } from './overlays/Help';
import { Banner, Loading, Report, Toast } from './overlays/Notices';
import { PatchNotes } from './overlays/PatchNotes';
import { RenameSquad } from './overlays/RenameSquad';

/**
 * Raiz de la interfaz HTML: la pantalla en curso (s.screen) y, encima, los dialogos y avisos.
 *
 * Donde va cada cosa:
 * - common/: piezas compartidas (Button/Btn, Icon, Popover, Veil, Seg, plegar, formatos, useUI).
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
      {s.screen === 'loading' && <Loading progress={s.loading} />}
      {(s.screen === 'menu' || s.screen === 'setup' || s.screen === 'campaign') && <div class="menu-veil" />}
      {s.screen === 'menu' && <Home s={s} />}
      {s.screen === 'setup' && <NewGame s={s} />}
      {s.screen === 'campaign' && <Campaign s={s} />}
      {s.screen === 'game' && <GameHud s={s} />}
      {s.screen === 'end' && s.end && <EndScreen end={s.end} />}
      {s.options && <Options options={s.options} />}
      {s.help && s.helpRules && <Help rules={s.helpRules} />}
      {s.rename && <RenameSquad rename={s.rename} />}
      {s.notes && <PatchNotes notes={s.notes} />}
      {s.toast && <Toast key={s.toast.id} toast={s.toast} />}
      {s.report && s.screen === 'game' && <Report key={s.report.id} report={s.report} />}
      {s.banner && <Banner key={s.banner.id} banner={s.banner} />}
    </>
  );
}
