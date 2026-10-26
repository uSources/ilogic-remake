import Phaser from 'phaser';
import { ui } from '../hud/store';

/** Logo de Fingerprint Games durante 2 segundos (fase 0 del original), con fundido. */
export class LogoScene extends Phaser.Scene {
  constructor() {
    super('Logo');
  }

  create(): void {
    ui.set({ screen: 'logo' });
    const logo = this.add.image(0, 0, 'logoFP');
    const layout = () => {
      const { width, height } = this.scale;
      logo.setPosition(width / 2, height / 2);
      // Escala entera si se puede (pixel art nitido), y que quepa entero.
      const fit = Math.min(width / logo.width, height / logo.height);
      logo.setScale(fit >= 1 ? Math.floor(fit) : fit);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    this.cameras.main.fadeIn(400);
    let gone = false;
    const next = () => {
      if (gone) return;
      gone = true;
      this.scene.start('Menu');
    };
    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(300);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
    });
    // Saltar con cualquier tecla o clic.
    this.input.keyboard!.once('keydown', next);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, next);
  }
}
