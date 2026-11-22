/**
 * Lo que la interfaz le pide al juego (botones, clics, pasar el raton). Los componentes solo llaman
 * a `ui.actions.<accion>`; el menu y la partida ponen las suyas al empezar (cada partida va en su
 * carga de pagina, asi que no hay que quitarlas al cerrarla). Una pantalla o panel nuevo añade aqui su
 * grupo, con su valor por defecto en `DEFAULT_ACTIONS` (store.ts).
 *
 * Convencion de nombres: `<sitio>Hover(i)` = el raton pasa por la opcion i (la elige sin pulsarla),
 * `<sitio>Pick(i)` = se pulsa, `<sitio>Set(i, k)` = boton de segmento k de la fila i.
 */
import type { Pos } from '../core/model';

export interface UIActions {
  // --- Menu principal (Inicio, Nueva partida, Campaña, Opciones) ---
  homeHover(id: string): void;
  homePick(id: string): void;
  setupHover(id: string): void;
  setupPick(id: string): void;
  setupSet(id: string, index: number): void;
  setupCode(text: string): void;
  campaignHover(index: number): void;
  campaignPick(index: number): void;
  campaignBack(): void;
  /** Jugar en línea: pasar o pulsar un boton, cambiar una opcion de crear sala, escribir el enlace. */
  onlineHover(id: string): void;
  onlinePick(id: string): void;
  onlineSet(id: string, index: number): void;
  onlineText(text: string): void;
  optionsHover(index: number): void;
  optionsSet(row: number, index: number): void;
  /** Pulsar el boton de una fila de tecla («Cambiar»), de accion («Por defecto») o de volumen (callarlo). */
  optionsPick(row: number): void;
  /** Llevar el deslizador de volumen de la fila `row` a `level` (mientras se arrastra). */
  optionsSlide(row: number, level: number): void;
  /** Soltar el deslizador de la fila `row`: suena una muestra, para oir como queda. */
  optionsSlideEnd(row: number): void;
  /** Abrir la pestaña `tab` de las opciones. */
  optionsTab(tab: number): void;
  optionsClose(): void;

  // --- Menus de la partida (emergente de unidad/compra/carga y pausa) ---
  menuPick(index: number): void;
  menuHover(index: number): void;
  menuClose(): void;
  openGameMenu(): void;

  // --- Barra de arriba, escuadras y lo elegido ---
  endTurn(): void;
  /** [CAMBIO] Cambiarle el nombre a una escuadra. */
  renameSquad(id: number, name: string): void;
  renameClose(): void;
  /** La siguiente persona esta lista para su turno (cambio de jugador en la misma pantalla). */
  handoffReady(): void;
  /** La siguiente unidad sin mover (el numero de «Fin del turno»). */
  nextIdle(): void;
  /** [CAMBIO] Retrato del panel de lo elegido: solo esa (clic), quitarla (Mayusculas) o las de su tipo (Ctrl). */
  pickInSelection(uid: number, shift: boolean, ctrl: boolean): void;

  // --- Minimapa ---
  /** Centrar la camara en un punto del mapa, en casillas (con decimales: donde se pulso dentro de la casilla). */
  minimapJump(at: Pos): void;

  // --- Final de la partida y ayuda ---
  endHover(index: number): void;
  endPick(index: number): void;
  closeHelp(): void;
}
