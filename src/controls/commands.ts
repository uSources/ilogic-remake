/**
 * Ordenes del jugador en el mapa, sin importar de donde vienen. Cada mando (teclado, y mas adelante
 * raton, dedo o un gamepad) es un adaptador que traduce lo suyo a estas ordenes, y GameScene solo
 * sabe cumplirlas (GameScene.command). Asi un mando nuevo es un fichero nuevo en src/controls, sin
 * tocar la escena.
 */
export type GameCommand =
  /** Mover el cursor una casilla (o elegir en un menu, con dy). */
  | { kind: 'cursor'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  /** Aceptar. `wait`: al mover, mover y esperar sin abrir el menu. */
  | { kind: 'accept'; wait: boolean }
  /** Un paso atras: al trazar un camino, quita su ultima casilla; si no, atras. */
  | { kind: 'stepBack' }
  /** Cancelar: suelta la unidad cogida, deshace la eleccion de grupo o va atras. */
  | { kind: 'cancel' }
  /** Deshacer el ultimo movimiento. */
  | { kind: 'undo' }
  | { kind: 'endTurn' }
  /** Ver u ocultar la zona de amenaza enemiga. */
  | { kind: 'threat' }
  | { kind: 'minimap' }
  /** Siguiente unidad sin mover. */
  | { kind: 'nextUnit' }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'help' }
  | { kind: 'options' };

export type CommandKind = GameCommand['kind'];

/** Ordenes que cierran la ayuda si esta abierta (cualquier otra se ignora mientras tanto). */
export const CLOSES_HELP: readonly CommandKind[] = ['cancel', 'stepBack', 'help', 'accept'];
