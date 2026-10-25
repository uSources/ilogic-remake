import Phaser from 'phaser';
import { settings } from './settings';

/**
 * Una sola pista sonando a la vez (como el Clip unico del original):
 * "menu" en el menu principal y "game" durante la partida.
 */
let current: Phaser.Sound.BaseSound | null = null;
let wanted: 'menu' | 'game' | null = null;

export function playMusic(scene: Phaser.Scene, track: 'menu' | 'game', restart = false): void {
  wanted = track;
  if (!settings.music) {
    stopMusic();
    return;
  }
  if (current && current.key === track && current.isPlaying && !restart) return;
  stopMusic();
  const sound = scene.sound.add(track, { loop: true, volume: 0.6 });
  current = sound;
  const start = () => {
    if (current === sound && wanted === track) sound.play();
  };
  // Los navegadores no dejan sonar audio hasta la primera tecla o clic.
  if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
  else start();
}

export function stopMusic(): void {
  if (current) {
    current.stop();
    current.destroy();
    current = null;
  }
}
