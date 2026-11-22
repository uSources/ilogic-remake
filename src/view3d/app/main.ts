/**
 * Ilogic en 3D (index.html): la interfaz HTML, las imagenes de la interfaz y los modelos 3D, y despues
 * el menu principal o la partida que toque en esta carga de la pagina (gameStart.ts).
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '../../hud/hud.css';
import { render, h } from 'preact';
import { asset } from '../../assets';
import { loadGameImages } from '../../atlas';
import { defaultContent } from '../../core/content/default';
import { installTabGuard } from '../../controls/browserKeys';
import { Hud } from '../../hud/Hud';
import { showToast, ui } from '../../hud/store';
import { registerServiceWorker } from '../../pwa';
import { applySettings } from '../../settings';
import { installSounds, webAudioSounds } from '../../audio/sfx';
import { followPageVisibility } from '../../audio/volumeControl';
import { webAudio } from '../../audio/gameAudio';
import { openGame, pendingStart } from './gameStart';
import { GlbLibrary } from '../engine/pieces/glbModels';
import { playMatch } from './match3d';
import { MenuFlow } from './menuFlow';
import { TERRAIN_MODEL_FILES } from '../engine/terrain/terrain';

const hudRoot = document.getElementById('hud')!;
render(h(Hud, {}), hudRoot);
applySettings();
// Sin menu contextual del navegador sobre la interfaz, y Tab no recorre sus botones (es «siguiente unidad»).
hudRoot.addEventListener('contextmenu', (event) => event.preventDefault());
installTabGuard(window);
installSounds();
followPageVisibility();
ui.set({ screen: 'loading' });

/** Los tipos de unidad y de edificio del juego: de cada uno se busca su modelo de Ashfox. */
const content = defaultContent();
const MODEL_TYPES = {
  units: content.units.list.map((unitType) => unitType.id),
  buildings: content.buildings.list.map((buildingType) => buildingType.id),
};

const start = pendingStart();
// Una partida por la red tarda lo que tarde la sala en mandarla: mientras, se cargan las imagenes.
const [opened, images] = await Promise.all([start ? openGame(start) : null, loadGameImages(asset)]);
if (opened?.ok) playMatch(opened.game, images, await GlbLibrary.load(MODEL_TYPES, TERRAIN_MODEL_FILES), webAudio);
else openMenu(opened?.notice ?? null);

/** El menu principal, con el aviso de por que no ha empezado la partida apuntada (si lo hay). */
function openMenu(notice: string | null): void {
  new MenuFlow(webAudioSounds).open();
  if (notice) showToast(notice);
}

// Instalar como app y jugar sin conexion (solo en la web publicada).
registerServiceWorker();
