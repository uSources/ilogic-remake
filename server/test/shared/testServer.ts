/**
 * Un servidor de partidas para los tests, sea de donde sea: el Worker y sus Durable Objects dentro de
 * workerd (test/workers) o el servidor de Node en un puerto (node/test). Las pruebas de
 * serverSuite.ts corren igual contra los dos: es lo que dice que los dos sitios hacen lo mismo.
 */
import type { StoredRoom } from '../../src/roomHost';

export interface TestServer {
  /** Una peticion a una ruta del servidor ('/rooms', '/rooms/ABCDEF'...). */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** La conexion de una sala, abierta desde una pagina de ese origen (el saludo va aparte). */
  openSocket(code: string, origin: string): Promise<WebSocket>;
  /** Lo que la sala tiene guardado, o null si nada. */
  stored(code: string): Promise<StoredRoom | null>;
}

/** El origen de la web del juego (GitHub Pages): el que se usa si no se prueba otro. */
export const GAME_ORIGIN = 'https://usources.github.io';
