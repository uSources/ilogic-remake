/**
 * Una partida en 3D: la raiz de composicion. Junta cada sistema (el turno, la entrada, la camara de
 * estrategia, los sucesos animados, la interfaz, la pausa) con el motor que dibuja la partida
 * (engine/matchScene.ts) y con la misma sesion, reglas e interfaz HTML de siempre. Aqui no se dibuja
 * ni se decide: solo se conecta. La pausa y el final, en systems/hud/matchMenus.ts.
 */
import { mapGrid } from '../../core/mapGrid';
import type { Pos } from '../../core/model';
import { isOnMap } from '../../core/rules';
import { screenEnd } from '../../core/session';
import { ui } from '../../hud/store';
import type { GameImages } from '../../atlas';
import { playMusic } from '../../audio/music';
import type { SoundPort } from '../../audio/sounds';
import { OptionsPanel } from '../../menu/optionsPanel';
import { MatchScene } from '../engine/matchScene';
import type { GlbLibrary } from '../engine/pieces/glbModels';
import { StrategyCamera } from '../systems/camera/strategyCamera';
import { playEvents } from '../systems/events/timeline';
import { installHudActions, publishHud } from '../systems/hud/hudBridge';
import { PauseMenu, saveGame, showEndIfOver } from '../systems/hud/matchMenus';
import { installKeys } from '../systems/input/keyInput';
import { installPointer } from '../systems/input/pointerInput';
import { TurnControls } from '../systems/turn/turnControls';
import { OrderIntents } from '../systems/orders/orderIntents';
import type { StartedGame } from './gameStart';
import type { GroupMode } from '../../controls/inputCommands';

const START_DISTANCE = 16;
const START_YAW = Math.PI / 4;

/** La pausa sale en el centro: la casilla a la que se ancla no cuenta. */
const PAUSE_ANCHOR = { x: 0, y: 0 };

/** Lo que se ve el cartel de victoria o derrota antes de la pantalla del final. */
const END_SCREEN_DELAY_MS = 2200;

/** Juega esa partida en la pagina (hasta que se sale al menu, que recarga). */
export function playMatch({ session, viewer }: StartedGame, images: GameImages, glbModels: GlbLibrary, sounds: SoundPort): void {
  const state = session.state;
  const scene = new MatchScene(document.getElementById('game')!, state, viewer, glbModels);
  const { board } = scene;
  const grid = mapGrid(state);
  const bounds = { minX: 0, maxX: grid.width - 1, minZ: 0, maxZ: grid.height - 1 };
  /** La camara empieza mirando a la Base (o la primera unidad) de la persona. */
  const home = state.buildings.find((building) => building.owner === viewer) ?? state.units.find((unit) => unit.team === viewer);
  const startTarget = home ? scene.groundOf(home) : scene.center;
  const camera = new StrategyCamera({ target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds, scene.verticalFov);
  scene.placeCamera(camera.pose);
  const anchorOf = (pos: Pos) => scene.anchorOf(pos);

  let cursor: Pos | null = null;
  /** Publica la interfaz (sin tocar las piezas). */
  function publish(): void {
    const forecast = cursor ? controls.forecastAt(cursor) : null;
    const menu = pause.view(cursor ?? PAUSE_ANCHOR) ?? controls.menu();
    publishHud(images, state, viewer, {
      cursor,
      busy: controls.busy,
      menu,
      forecast,
      selected: controls.selectedUnits(),
      adding: controls.adding,
      intents: intents.isShowingAll,
      anchorOf,
    });
  }
  function refresh(): void {
    scene.sync(state.weather?.kind ?? null);
    intents.update();
    publish();
  }

  /** Los sucesos se ven con las piezas y los efectos del motor (systems/events dice que pasos lleva cada uno). */
  const stages = { ...scene.stages, sounds };
  /** Lo que haran las ordenes al terminar el turno (al señalar una unidad con orden, o todas con «Ver órdenes»). */
  const intents = new OrderIntents({ session, viewer, marks: scene.intentMarks });
  function toggleIntents(): void {
    intents.toggleAll();
    publish();
  }
  const controls = new TurnControls({
    session,
    viewer,
    marks: scene.tileMarks,
    preview: scene.movePreview,
    screen: scene,
    events: { play: (events) => playEvents(events, stages) },
    sounds,
    refresh,
    onOver: () => showEndSoon(),
  });
  const options = new OptionsPanel(
    'game',
    () => publish(),
    () => publish(),
  );
  const pause = new PauseMenu({
    session,
    viewer,
    endTurn: () => controls.endTurn(),
    openOptions: () => options.open(),
    refresh: () => publish(),
  });

  /** Una opcion de la pausa; rendirse acaba la partida sin pasar por los turnos: si se ha acabado, su final. */
  function pickPause(index?: number): void {
    pause.pick(index);
    showEndIfOver(session, viewer);
  }

  /** Tras el cartel de victoria o derrota, la pantalla del final. */
  function showEndSoon(): void {
    window.setTimeout(() => showEndIfOver(session, viewer), END_SCREEN_DELAY_MS);
  }

  /** Esc: deshace lo elegido; sin nada elegido, abre o cierra la pausa (y cierra las opciones). */
  function escape(): void {
    if (options.isOpen) return options.close();
    if (pause.isOpen) return pause.close();
    if (!controls.cancel()) pause.open();
  }

  /** Elige la unidad y lleva la camara hasta ella. */
  function focusUnit(uid: number): void {
    const unit = state.units.find((candidate) => candidate.uid === uid);
    if (!unit) return;
    controls.focusUnit(uid);
    camera.lookAt(scene.groundOf(unit));
  }

  installHudActions({
    endTurn: () => controls.endTurn(),
    focusUnit,
    menuPick: (index) => (pause.isOpen ? pickPause(index) : controls.pickMenu(index)),
    menuHover: (index) => (pause.isOpen ? pause.hover(index) : controls.hoverMenu(index)),
    menuClose: () => (pause.isOpen ? pause.close() : void controls.cancel()),
    openGameMenu: () => pause.open(),
    multiSelect: () => {
      controls.toggleAdding();
      publish();
    },
    toggleIntents,
    selectSquad: (id) => controls.selectSquad(id),
    renameSquad: (id, name) => void controls.renameSquad(id, name),
    renameClose: () => ui.set({ rename: null }),
    pickInSelection: (uid, shift, ctrl) => controls.pickInSelection(uid, shift, ctrl),
  });

  /** Una tecla de grupo; pulsada dos veces seguidas, la camara va hasta el. */
  async function groupKey(n: number, mode: GroupMode): Promise<void> {
    const lookAt = await controls.groupKey(n, mode, performance.now());
    if (lookAt) camera.lookAt(scene.groundOf(lookAt));
  }

  /** Las unidades de quien mira que estan en el tablero (para el recuadro). */
  const ownUnitsOnBoard = () => state.units.filter((unit) => unit.team === viewer && isOnMap(unit));

  /** La casilla señalada: el cuadro amarillo, la ficha y la prevision de combate. */
  function hover(pos: Pos | null): void {
    const isSame = pos && cursor ? pos.x === cursor.x && pos.y === cursor.y : pos === cursor;
    if (isSame) return;
    cursor = pos;
    scene.hover(pos);
    controls.hover(pos);
    intents.hover(pos);
    publish();
  }

  installPointer(scene.canvas, {
    camera,
    box: scene.box,
    tileAt: (x, y) => scene.tileAt(x, y),
    hover,
    tap: (pos, mods) => void controls.tap(pos, mods),
    context: (pos) => controls.context(pos),
    boxSelect: (box, add) => controls.selectBox(scene.tilesInBox(ownUnitsOnBoard(), box), add),
    onFrame: (listener) => scene.onFrame(listener),
  });
  installKeys({
    camera,
    onFrame: (listener) => scene.onFrame(listener),
    endTurn: () => controls.endTurn(),
    nextUnit: () => {
      const uid = controls.nextIdleUnit();
      if (uid !== null) focusUnit(uid);
    },
    cancel: escape,
    accept: () => (pause.isOpen ? pickPause() : controls.acceptMenu()),
    group: (n, mode) => void groupKey(n, mode),
    order: (order) => controls.orderKey(order),
    orderHere: () => cursor && controls.context(cursor),
    undo: () => controls.undoLastMove(),
    intents: toggleIntents,
  });
  scene.onFrame((seconds) => {
    camera.update(seconds);
    scene.render(seconds, camera.pose);
    // Los bocadillos (menu, prevision) siguen a su casilla mientras la camara se mueve.
    if (controls.menu() || (cursor && controls.forecastAt(cursor))) publish();
  });
  scene.start();
  ui.set({ screen: 'game' });
  playMusic('game');
  // Se guarda al salir de la pagina (cerrar, recargar): «Continuar» la retoma.
  window.addEventListener('pagehide', () => void (screenEnd(session, viewer) ?? saveGame(session.state)));
  void controls.runUntilInput();

  // Para mirar y probar desde la consola (y los agentes): la sesion y las piezas.
  (window as unknown as { ilogic3d: object }).ilogic3d = {
    session,
    board,
    controls,
    camera,
    world: scene.world,
    weather: scene.weather,
    sandDust: scene.sandDust,
    stages,
    wrecks: scene.wrecks,
    ui,
    pause,
  };
}
