import Phaser from 'phaser';
import { ui } from '../hud/store';
import { settings } from '../settings';

/** Pantalla de victoria o derrota (imagenes originales), centrada. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean }): void {
    const img = this.add.image(0, 0, `${settings.lang}_${data.won ? 'victmsg' : 'deftmsg'}`).setOrigin(0.5, 0);
    // La imagen original se veia a 512x512 (recortada por abajo): mostrar esa parte.
    const shownH = img.height * (512 / 542);
    img.setCrop(0, 0, img.width, shownH);
    const layout = () => {
      const { width, height } = this.scale;
      const fit = Math.min(width / img.width, height / shownH);
      const k = fit >= 1 ? Math.floor(fit) : fit;
      img.setScale(k).setPosition(width / 2, Math.round((height - shownH * k) / 2));
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    this.cameras.main.fadeIn(500);
    ui.set({ screen: 'end', end: { won: data.won }, toast: null, banner: null });

    let gone = false;
    const back = () => {
      if (gone) return;
      gone = true;
      this.scene.start('Menu');
    };
    ui.actions.endContinue = back;
    this.time.delayedCall(400, () => {
      this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
        if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(e.code)) back();
      });
      this.input.on(Phaser.Input.Events.POINTER_UP, back);
    });
  }
}
