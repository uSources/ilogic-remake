/**
 * Ilogic en 3D (index.html): la interfaz HTML, las imagenes de la interfaz y los modelos 3D, y despues
 * el menu principal o la partida que toque en esta carga de la pagina (gameStart.ts).
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '../hud/hud.css';
import { render, h } from 'preact';
import { asset } from '../assets';
import { loadGameImages } from '../atlas';
import { defaultContent } from '../core/content/default';
import { installTabGuard } from '../controls/browserKeys';
import { Hud } from '../hud/Hud';
import { ui } from '../hud/store';
import { registerServiceWorker } from '../pwa';
import { applySettings } from '../settings';
import { installSounds, webAudioSounds } from '../audio/sfx';
import { pendingStart, sessionFor } from './gameStart';
import { GlbLibrary } from './glbModels';
import { playMatch } from './match3d';
import { MenuFlow } from './menuFlow';
import { TERRAIN_MODEL_FILES } from './terrain';

const hudRoot = document.getElementById('hud')!;
render(h(Hud, {}), hudRoot);
applySettings();
// Sin menu contextual del navegador sobre la interfaz, y Tab no recorre sus botones (es «siguiente unidad»).
hudRoot.addEventListener('contextmenu', (event) => event.preventDefault());
installTabGuard(window);
installSounds();
ui.set({ screen: 'loading' });

/** Los tipos de unidad y de edificio del juego: de cada uno se busca su modelo de Ashfox. */
const content = defaultContent();
const MODEL_TYPES = {
  units: content.units.list.map((unitType) => unitType.id),
  buildings: content.buildings.list.map((buildingType) => buildingType.id),
};

const start = pendingStart();
const started = start ? sessionFor(start) : null;
const images = await loadGameImages(asset);
if (started) playMatch(started, images, await GlbLibrary.load(MODEL_TYPES, TERRAIN_MODEL_FILES), webAudioSounds);
else new MenuFlow(images, webAudioSounds).open();

// Instalar como app y jugar sin conexion (solo en la web publicada).
registerServiceWorker();
