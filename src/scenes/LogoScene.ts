import Phaser from 'phaser';
import { ATLAS } from '../atlas';
import { ui } from '../hud/store';
import type { GameStartData } from './game/types';

const FADE_IN_MS = 400;
/** Tiempo con el logo a la vista antes de fundir a negro (con el fundido, unos 2 segundos). */
const SHOW_MS = 1800;
const FADE_OUT_MS = 300;

/** Logo de Fingerprint Games durante 2 segundos (fase 0 del original), con fundido. */
export class LogoScene extends Phaser.Scene {
  constructor() {
    super('Logo');
  }

  create(): void {
    ui.set({ screen: 'logo' });
    const logo = this.add.image(0, 0, ATLAS, 'logoFP');
    const layout = () => this.fitLogo(logo);
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    this.cameras.main.fadeIn(FADE_IN_MS);
    let hasLeft = false;
    const next = () => {
      if (hasLeft) return;
      hasLeft = true;
      this.leave();
    };
    this.time.delayedCall(SHOW_MS, () => {
      this.cameras.main.fadeOut(FADE_OUT_MS);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
    });
    // Saltar con cualquier tecla o clic.
    this.input.keyboard!.once('keydown', next);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, next);
  }

  /** Centrado, con escala entera si se puede (pixel art nitido), y que quepa entero. */
  private fitLogo(logo: Phaser.GameObjects.Image): void {
    const { width, height } = this.scale;
    logo.setPosition(width / 2, height / 2);
    const fit = Math.min(width / logo.width, height / logo.height);
    logo.setScale(fit >= 1 ? Math.floor(fit) : fit);
  }

  private leave(): void {
    // #lab en la direccion: directo al laboratorio de animaciones (src/lab.ts).
    if (window.location.hash === '#lab') this.scene.start('Game', { start: 'lab' } satisfies GameStartData);
    else this.scene.start('Menu');
  }
}
