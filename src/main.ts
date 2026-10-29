import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import './hud/hud.css';
import Phaser from 'phaser';
import { render, h } from 'preact';
import { deviceSize, fitCanvas, watchResize } from './display';
import { Hud } from './hud/Hud';
import { installDebug } from './debug';
import { applySettings } from './settings';
import { BootScene } from './scenes/BootScene';
import { LogoScene } from './scenes/LogoScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

const hudRoot = document.getElementById('hud')!;
render(h(Hud, {}), hudRoot);
applySettings();
// Sin menu contextual del navegador sobre la interfaz, y Tab no recorre sus botones
// (Tab es "siguiente unidad"; Enter ya lo maneja el juego).
hudRoot.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Tab') e.preventDefault();
  },
  { capture: true },
);

const size = deviceSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: size.w,
  height: size.h,
  backgroundColor: '#0b1220',
  pixelArt: true,
  scale: { mode: Phaser.Scale.NONE },
  scene: [BootScene, LogoScene, MenuScene, GameScene],
});
game.events.once(Phaser.Core.Events.READY, () => {
  fitCanvas(game);
  watchResize(game);
});

// Acceso desde la consola del navegador, los tests de navegador y los agentes de IA:
// window.ilogic (el juego de Phaser) y window.ilogicDebug (src/debug.ts, docs/AGENTES.md).
(window as unknown as { ilogic: Phaser.Game }).ilogic = game;
installDebug(game);
