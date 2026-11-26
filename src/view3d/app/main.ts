/**
 * Ilogic en 3D (index.html): la interfaz HTML, las imagenes de la interfaz y los modelos 3D, y despues
 * el menu principal o la partida que toque en esta carga de la pagina (gameStart.ts).
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '../../hud/hud.css';
import { render, h } from 'preact';
import { asset } from '../../assets';
import { loadGameImages, type GameImages } from '../../atlas';
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
import { takeIntro, takeMatchBegun } from '../../net/matchIntro';
import { GlbLibrary } from '../engine/pieces/glbModels';
import { playMatch } from './match3d';
import { MenuFlow } from './menuFlow';
import { showMenuBoard } from './menuBackdrop';
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

/** Lo minimo que se ve «¡Rival encontrado!», para que se lea aunque la partida cargue enseguida. */
const INTRO_MIN_MS = 1500;

const start = pendingStart();
// Recien emparejada con «Buscar rival»: la carga enseña a los dos rivales (src/net/matchIntro.ts).
// Sale en cuanto estan las imagenes (lleva los soldados y tanques del atlas) y se ve un minimo.
const intro = start?.start === 'online' ? takeIntro() : null;
// Recien empezada mientras se esperaba en el vestibulo: suena aqui, que alli la recarga lo cortaria.
if (start?.start === 'online' && takeMatchBegun()) webAudioSounds.play('match_begins');
const imagesLoaded = loadGameImages(asset);
const introShown = intro
  ? imagesLoaded.then(() => {
      ui.set({ intro });
      return new Promise((done) => setTimeout(done, INTRO_MIN_MS));
    })
  : null;
// Una partida por la red tarda lo que tarde la sala en mandarla: mientras, se cargan las imagenes.
const [opened, images] = await Promise.all([start ? openGame(start) : null, imagesLoaded, introShown]);
if (opened?.ok) playMatch(opened.game, images, await loadModels(), webAudio);
else openMenu(opened?.notice ?? null, images);

/** Los modelos 3D de las unidades, los edificios y el terreno. */
function loadModels(): Promise<GlbLibrary> {
  return GlbLibrary.load(MODEL_TYPES, TERRAIN_MODEL_FILES);
}

/**
 * El menu principal, con el aviso de por que no ha empezado la partida apuntada (si lo hay). Sale ya;
 * el tablero 3D de detras, en cuanto estan los modelos (sin el, si el navegador no puede, queda el fondo oscuro).
 */
function openMenu(notice: string | null, images: GameImages): void {
  ui.set({ intro: null });
  new MenuFlow(webAudioSounds).open();
  if (notice) showToast(notice);
  loadModels()
    .then((models) => showMenuBoard(document.getElementById('game')!, models, images))
    .catch((error: unknown) => console.warn('El menu se queda sin el tablero 3D de fondo:', error));
}

// Instalar como app y jugar sin conexion (solo en la web publicada).
registerServiceWorker();
