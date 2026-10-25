import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LogoScene } from './scenes/LogoScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { EndScene } from './scenes/EndScene';
import { SCREEN_W, SCREEN_H } from './layout';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#05080c',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, LogoScene, MenuScene, GameScene, EndScene],
});

// Acceso desde la consola del navegador para depurar.
(window as unknown as { ilogic: Phaser.Game }).ilogic = game;
