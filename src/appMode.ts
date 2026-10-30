import type Phaser from 'phaser';
import { settings } from './settings';

/**
 * Que en el movil se sienta como una app (fase V5 de docs/PLAN-MOVIL.md): pantalla completa y
 * orientacion al empezar a jugar, pantalla encendida durante la partida y menos fotogramas en reposo
 * para gastar menos bateria. Nada de esto hace falta en el ordenador: solo con pantalla tactil.
 */

const coarse = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** Abierta como app instalada (PWA): ya ocupa toda la pantalla. */
const standalone = (): boolean =>
  typeof matchMedia === 'function' &&
  (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches);

/**
 * Al primer toque de una partida: pantalla completa (si esta en Opciones y no es la app instalada)
 * y la orientacion elegida. El navegador solo lo permite justo despues de un gesto del usuario.
 */
export function enterGameScreen(): void {
  if (!coarse()) return;
  const doc = document.documentElement;
  if (settings.fullscreen && !standalone() && !document.fullscreenElement && doc.requestFullscreen) {
    doc
      .requestFullscreen({ navigationUI: 'hide' })
      .then(lockOrientation)
      .catch(() => {});
    return;
  }
  lockOrientation();
}

function lockOrientation(): void {
  if (settings.orientation === 'auto') return;
  // Solo Android (y en pantalla completa o como app); en el resto no existe o falla: no pasa nada.
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o.lock?.(settings.orientation).catch(() => {});
}

// --- Pantalla encendida -------------------------------------------------------

let wanted = false;
let lock: WakeLockSentinel | null = null;

/** Mantener la pantalla encendida mientras dura la partida (se vuelve a pedir al volver a la app). */
export function keepScreenOn(on: boolean): void {
  wanted = on;
  if (on) void requestLock();
  else {
    void lock?.release().catch(() => {});
    lock = null;
  }
}

async function requestLock(): Promise<void> {
  if (!wanted || lock || !coarse() || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => (lock = null));
  } catch {
    // Sin permiso o sin bateria suficiente: el sistema decide.
  }
}

// --- Bateria: menos fotogramas en reposo -------------------------------------

/** Sin tocar nada este tiempo, el juego baja a IDLE_FPS. */
const IDLE_MS = 5000;
const IDLE_FPS = 30;
let wake: (() => void) | null = null;

/**
 * En el movil, tras unos segundos sin tocar nada el juego dibuja a 30 fps; al tocar (o cuando pasa
 * algo: ver activity) vuelve a ir fluido.
 */
export function installAppMode(game: Phaser.Game): void {
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => void requestLock());
  if (!coarse() || typeof game.loop.setFPSLimit !== 'function') return;
  let idle = false;
  let timer = 0;
  wake = () => {
    if (idle) {
      game.loop.setFPSLimit(0);
      idle = false;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      game.loop.setFPSLimit(IDLE_FPS);
      idle = true;
    }, IDLE_MS);
  };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(ev, wake, { passive: true, capture: true });
  wake();
}

/** Pasa algo en pantalla sin que el jugador toque (turno enemigo, animaciones): fluido otra vez. */
export function activity(): void {
  wake?.();
}
