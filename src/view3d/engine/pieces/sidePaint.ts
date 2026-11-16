/**
 * Los colores de cada lado en las piezas 3D (los mismos tonos que el juego en 2D y la interfaz: azul lo
 * propio y aliado, rojo lo enemigo, gris lo de nadie).
 */
import type { OwnerSide } from '../../../ui/sides';
import type { TeamPaint } from '../../blocks';

/** La pintura de equipo de los modelos de bloques de cada lado. */
export const SIDE_PAINT: Readonly<Record<OwnerSide, TeamPaint>> = {
  own: { team: 0x3aa8ff, teamDark: 0x2477c4 },
  ally: { team: 0x3aa8ff, teamDark: 0x2477c4 },
  enemy: { team: 0xff4d45, teamDark: 0xc22f2a },
  neutral: { team: 0xc9d2e3, teamDark: 0x8d97ab },
};

/** El color de la barra de captura de cada lado (los de la interfaz). */
export const CAPTURE_COLOR: Readonly<Record<OwnerSide, string>> = { own: '#3aa8ff', ally: '#3aa8ff', enemy: '#ff4d45', neutral: '#c9d2e3' };
