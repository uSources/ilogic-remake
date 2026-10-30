/**
 * Registra el service worker (public/sw.js) para poder instalar el juego como app y jugar sin
 * conexion. Solo en la web publicada: ni en "npm run dev" (Vite sirve los ficheros sin hash y la
 * cache estorbaria) ni en dist-single/ilogic.html por file:// (alli no hay service workers).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('Service worker sin registrar:', err));
  });
}
