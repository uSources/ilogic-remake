import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from '../layout';
import { settings, t } from '../settings';
import { C, textStyle } from '../ui/theme';

/** Pantalla de victoria o derrota (imagenes originales), centrada. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean }): void {
    const img = this.add.image(SCREEN_W / 2, SCREEN_H / 2, `${settings.lang}_${data.won ? 'victmsg' : 'deftmsg'}`);
    // La imagen original se veia a 512x512 (recortada por abajo): mostrar esa parte a pantalla completa de alto.
    img.setCrop(0, 0, img.width, img.height * (512 / 542));
    img.setScale(SCREEN_H / (img.height * (512 / 542)));
    img.setY(SCREEN_H / 2 + (img.displayHeight - SCREEN_H) / 2);
    this.cameras.main.fadeIn(500);
    const hint = this.add.text(SCREEN_W / 2, SCREEN_H - 18, t('pressKey'), textStyle(14, C.muted)).setOrigin(0.5, 1).setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 1, delay: 1200, duration: 400 });

    const back = () => this.scene.start('Menu');
    this.time.delayedCall(400, () => {
      this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
        if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(e.code)) back();
      });
      this.input.on(Phaser.Input.Events.POINTER_UP, back);
    });
  }
}
