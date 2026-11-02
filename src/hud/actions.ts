/**
 * Lo que la interfaz le pide a la escena (botones, clics, pasar el raton). Los componentes solo llaman
 * a `ui.actions.<accion>`; cada escena pone las suyas en create() y `resetActions()` las quita al
 * cerrarla. Una pantalla o panel nuevo añade aqui su grupo, con su valor por defecto en
 * `DEFAULT_ACTIONS` (store.ts).
 *
 * Convencion de nombres: `<sitio>Hover(i)` = el raton pasa por la opcion i (la elige sin pulsarla),
 * `<sitio>Pick(i)` = se pulsa, `<sitio>Set(i, k)` = boton de segmento k de la fila i.
 */
export interface UIActions {
  // --- Menu principal (Inicio, Nueva partida, Campaña, Opciones) ---
  mainMenuPick(i: number): void;
  mainMenuHover(i: number): void;
  homeHover(id: string): void;
  homePick(id: string): void;
  setupHover(id: string): void;
  setupPick(id: string): void;
  setupSet(id: string, index: number): void;
  setupCode(text: string): void;
  campaignHover(i: number): void;
  campaignPick(i: number): void;
  campaignBack(): void;
  optionsHover(i: number): void;
  optionsSet(i: number, index: number): void;
  optionsClose(): void;

  // --- Menus de la partida (emergente de unidad/compra/carga y pausa) ---
  menuPick(i: number): void;
  menuHover(i: number): void;
  menuClose(): void;
  openGameMenu(): void;
  pauseHover(i: number): void;
  pausePick(i: number): void;
  surrender(): void;

  // --- Barra de arriba y bandeja ---
  endTurn(): void;
  /** [CAMBIO] Boton "Elegir varias" de la bandeja (con unidades elegidas, abre sus ordenes). */
  multiSelect(): void;
  /** [CAMBIO] Elegir una escuadra de la bandeja (sale su menu) y cambiarle el nombre. */
  selectSquad(id: number): void;
  renameSquad(id: number, name: string): void;
  renameClose(): void;
  toggleThreat(): void;
  toggleIntents(): void;
  focusUnit(uid: number): void;
  /** [CAMBIO] Retrato del panel de lo elegido: solo esa (clic), quitarla (Mayusculas) o las de su tipo (Ctrl). */
  pickInSelection(uid: number, shift: boolean, ctrl: boolean): void;

  // --- Minimapa ---
  toggleMinimap(): void;
  minimapJump(x: number, y: number): void;

  // --- General ---
  /** Usar una habilidad del general (las de area pasan a elegir casilla). */
  useAbility(id: string): void;
  /** Dejar de apuntar una habilidad. */
  cancelAbility(): void;

  // --- Final de la partida y ayuda ---
  endContinue(): void;
  endHover(i: number): void;
  endPick(i: number): void;
  closeHelp(): void;

  // --- Laboratorio de animaciones: reproducir una accion, cambiar opciones, salir ---
  labPlay(action: 'move' | 'attack' | 'counter' | 'kill'): void;
  labSet(patch: { attacker?: number; defender?: number; slow?: boolean }): void;
  labExit(): void;
}
