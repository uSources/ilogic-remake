/**
 * Animaciones de los edificios, dibujadas por codigo encima de su sprite (estilo pixel, a pasos):
 *  - Fabrica: humo que sale del tejado (si no esta su sprite de humo).
 *  - Petroleo y cuartel general: solo si no tienen su animacion en fotogramas.
 * Ciudad, aeropuerto y fortaleza van sin animacion.
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

export function drawBuildingFx(g: Phaser.GameObjects.Graphics, _list: BuildingFxInfo[], _time: number, _still: boolean, _spriteSmoke = false): void {
  // Los edificios van quietos (decision de diseño): no se dibuja ningun efecto.
  g.clear();
}
