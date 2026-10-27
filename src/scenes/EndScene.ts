import Phaser from 'phaser';
import type { GameStats } from '../core/stats';
import { ui } from '../hud/store';
import { settings } from '../settings';

/** Pantalla de victoria o derrota (imagenes originales), centrada. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean; day?: number; stats?: GameStats; reason?: 'hq' | 'wipeout' | 'days' | 'objective' | 'surrender' | null; score?: [number, number]; mission?: string | null }): void {
    const img = this.add.image(0, 0, `${settings.lang}_${data.won ? 'victmsg' : 'deftmsg'}`).setOrigin(0.5, 0);
    // La imagen original se veia a 512x512 (recortada por abajo): mostrar esa parte.
    const shownH = img.height * (512 / 542);
    img.setCrop(0, 0, img.width, shownH);
    const layout = () => {
      const { width, height } = this.scale;
      // Dejar sitio abajo para el resumen de la partida (HTML).
      const room = Math.max(height * 0.5, height - 230 * (window.devicePixelRatio || 1));
      const fit = Math.min(width / img.width, room / shownH);
      const k = fit >= 1 ? Math.floor(fit) : fit;
      img.setScale(k).setPosition(width / 2, Math.round((room - shownH * k) / 2));
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    this.cameras.main.fadeIn(500);
    ui.set({ screen: 'end', end: { won: data.won, day: data.day ?? 1, stats: data.stats ?? null, reason: data.reason ?? null, score: data.score ?? null, mission: data.mission ?? null }, toast: null, banner: null, report: null, help: false });

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
