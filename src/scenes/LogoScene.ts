import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from '../layout';

/** Logo de Fingerprint Games durante 2 segundos (fase 0 del original), con fundido. */
export class LogoScene extends Phaser.Scene {
  constructor() {
    super('Logo');
  }

  create(): void {
    const logo = this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'logoFP');
    logo.setScale(SCREEN_H / logo.height);
    this.cameras.main.fadeIn(400);
    const next = () => this.scene.start('Menu');
    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(300);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
    });
    // Saltar con cualquier tecla o clic.
    this.input.keyboard!.once('keydown', next);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, next);
  }
}
