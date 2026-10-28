/**
 * Animaciones de los edificios, dibujadas por codigo encima de su sprite (estilo pixel, a pasos):
 *  - Ciudad: ventanas que se encienden y apagan.
 *  - Fabrica: humo que sale del tejado.
 *  - Aeropuerto: baliza de la torre y luces de pista que corren.
 *  - Petroleo: luz de la torre que late y vapores.
 *  - Fortaleza: las mirillas brillan con el color del bando.
 *  - Cuartel general: bandera ondeando y baliza.
 * Las coordenadas son del sprite (32 px de ancho, origen arriba a la izquierda).
 */
import Phaser from 'phaser';
import { TILE } from '../layout';

export interface BuildingFxInfo {
  x: number;
  y: number;
  name: string;
  team: 0 | 1 | null;
  /** Alto del sprite en pixeles (para pasar de coordenadas del sprite a coordenadas del mapa). */
  h: number;
  /** Tiene animacion en fotogramas: no se le dibujan efectos por codigo. */
  animated?: boolean;
}

const TEAM = [0x3aa8ff, 0xff4d45];
const TEAM_DARK = [0x1f5fa8, 0xa8241f];
const LIGHT = 0xffe27a;

/** Numero fijo por casilla, para que cada edificio vaya a su ritmo. */
const seedOf = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export function drawBuildingFx(g: Phaser.GameObjects.Graphics, list: BuildingFxInfo[], time: number, still: boolean, spriteSmoke = false): void {
  g.clear();
  const f0 = still ? 0 : Math.floor(time / 125); // 8 pasos por segundo
  for (const b of list) {
    if (b.animated) continue;
    const seed = seedOf(b.x, b.y);
    const f = f0 + (seed % 97);
    const ox = b.x * TILE,
      oy = (b.y + 1) * TILE - b.h;
    const px = (sx: number, sy: number, w: number, h: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      g.fillRect(ox + sx, oy + sy, w, h);
    };
    const team = b.team === null ? null : TEAM[b.team]!;
    switch (b.name) {
      case 'City': {
        // Tres ventanas encendidas que cambian cada 1,5 s.
        const cols = [6, 11, 16, 21],
          rows = [13, 18, 23, 28];
        const step = Math.floor(f / 12);
        for (let i = 0; i < 3; i++) {
          const n = (seed + step * 7 + i * 5) % 16;
          px(cols[n % 4]!, rows[(n / 4) | 0]!, 2, 2, LIGHT, 0.9);
        }
        break;
      }
      case 'Factory': {
        // Bocanadas de humo que salen de los picos del tejado: suben, crecen y se desvanecen.
        // (Si existe la animacion de Retro Diffusion, el humo va en sprite aparte.)
        if (still || spriteSmoke) break;
        for (const [cx, ph] of [[25, 0], [13, 11]] as const)
          for (let i = 0; i < 2; i++) {
            const t = ((f + ph + i * 11) % 22) / 22;
            const r = 2 + Math.floor(t * 3);
            const sx = cx + Math.floor(t * 4) - r,
              sy = 2 - Math.floor(t * 16) - r;
            const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
            px(sx, sy, r * 2, r * 2, 0x5d666e, 0.55 * a);
            px(sx + 1, sy, r * 2 - 1, r * 2 - 1, 0xe9eef2, 0.9 * a);
          }
        break;
      }
      case 'Airport': {
        // Baliza roja en la torre (medio segundo encendida) y luz que recorre la pista.
        if (f % 8 < 4) px(10, 0, 2, 2, 0xff5a4a);
        const run = 6 + ((f * 2) % 22);
        px(run, 30, 2, 1, 0xffffff, 0.95);
        px(run - 2, 30, 2, 1, 0xffffff, 0.35);
        break;
      }
      case 'Oil': {
        // Luz de la torre que late con el color del bando y algun vapor.
        const a = 0.45 + 0.55 * Math.abs(Math.sin((f / 16) * Math.PI));
        px(15, 0, 2, 2, team ?? LIGHT, a);
        if (!still) {
          const t = (f % 32) / 32;
          if (t < 0.6) px(17 + Math.floor(t * 4), -2 - Math.floor(t * 8), 2, 2, 0xc9cfd4, 0.7 * (1 - t / 0.6));
        }
        break;
      }
      case 'Stronghold': {
        // Mirillas que brillan con el color del bando y un punto que las barre.
        const c = team ?? 0xbfc6cc;
        const a = 0.35 + 0.35 * Math.abs(Math.sin((f / 20) * Math.PI));
        px(7, 17, 4, 1, c, a);
        px(21, 17, 4, 1, c, a);
        const sweep = f % 16;
        const sx = sweep < 8 ? 7 + (sweep % 4) : 21 + (sweep % 4);
        px(sx, 17, 1, 1, 0xffffff, team === null ? 0.4 : 0.9);
        break;
      }
      case 'Base': {
        // Bandera sobre la torre baja (dentro del dibujo, sin invadir la casilla de arriba):
        // mastil y tela del bando con borde oscuro, ondeando en 4 pasos, y baliza en la torre alta.
        const c = team ?? 0xbfc6cc,
          d = b.team === null ? 0x8a9298 : TEAM_DARK[b.team]!;
        const ink = 0x1a1f24;
        px(26, 2, 1, 9, ink);
        const w = still ? 0 : Math.floor(f / 2) % 4;
        const lift = [0, 1, 0, -1][w]!;
        px(22, 2, 4, 6, ink);
        px(18, 2 + Math.max(0, lift), 4, 6 - Math.abs(lift), ink);
        px(22, 3, 4, 4, c);
        px(19, 3 + Math.max(0, lift), 3, 4 - Math.abs(lift), c);
        px(22, 6, 4, 1, d);
        if (f % 12 < 6) px(6, 1, 2, 2, LIGHT);
        break;
      }
    }
  }
}
