/**
 * Una partida en 3D: la raiz de composicion. Junta cada sistema (el turno, la entrada, la camara de
 * estrategia, los sucesos animados, la interfaz, la pausa) con el motor que dibuja la partida
 * (engine/matchScene.ts) y con la misma sesion, reglas e interfaz HTML de siempre. Aqui no se dibuja
 * ni se decide: solo se conecta. La pausa y el final, en systems/hud/matchMenus.ts.
 */
import { mapGrid } from '../../core/mapGrid';
import type { Pos, TeamId, Unit } from '../../core/model';
import { isOnMap, unitAt } from '../../core/rules';
import { screenEnd } from '../../core/session';
import { ui } from '../../hud/store';
import type { GameImages } from '../../atlas';
import { gameTrackOf, playMusic } from '../../audio/music';
import type { GameAudio } from '../../audio/gameAudio';
import { AmbiencePlayer } from '../systems/sound/ambiencePlayer';
import { ambienceZoomLevel, CameraListener, zoomLevel } from '../systems/sound/listener';
import { OptionsPanel } from '../../menu/optionsPanel';
import { MatchScene } from '../engine/matchScene';
import type { GlbLibrary } from '../engine/pieces/glbModels';
import { hitLookOf } from '../systems/board/boardScene';
import { EndTurnGuard } from '../systems/turn/endTurnGuard';
import { StrategyCamera } from '../systems/camera/strategyCamera';
import { boardLookupOf, incomeSpotsOf } from '../systems/events/eventSteps';
import { playEvents } from '../systems/events/timeline';
import { installHudActions, publishHud } from '../systems/hud/hudBridge';
import { MinimapBridge, toggleMinimap } from '../systems/hud/minimapBridge';
import { PauseMenu, saveGame, showEndIfOver } from '../systems/hud/matchMenus';
import { installKeys } from '../systems/input/keyInput';
import { installPointer } from '../systems/input/pointerInput';
import { TurnControls } from '../systems/turn/turnControls';
import { showDestinations } from '../systems/orders/destinationFlags';
import { anyStandingOrder, OrderIntents } from '../systems/orders/orderIntents';
import { ThreatZone } from '../systems/threat/threatZone';
import type { StartedGame } from './gameStart';
import type { GroupMode } from '../../controls/inputCommands';

/** De partida, lo bastante cerca para leer las unidades (la rueda deja alejarse para ver mas mapa). */
const START_DISTANCE = 13;
const START_YAW = Math.PI / 4;

/** La pausa sale en el centro: la casilla a la que se ancla no cuenta. */
const PAUSE_ANCHOR = { x: 0, y: 0 };

/** Del borde de una casilla del minimapa a su centro (el punto del mundo). */
const MINIMAP_TILE_HALF = 0.5;

/** Lo que se ve el cartel de victoria o derrota antes de la pantalla del final. */
const END_SCREEN_DELAY_MS = 2200;
const MS_PER_SECOND = 1000;

/** Juega esa partida en la pagina (hasta que se sale al menu, que recarga). */
export function playMatch({ session, viewer }: StartedGame, images: GameImages, glbModels: GlbLibrary, audio: GameAudio): void {
  const state = session.state;
  const scene = new MatchScene(document.getElementById('game')!, state, viewer, glbModels, images);
  const { board } = scene;
  const grid = mapGrid(state);
  const bounds = { minX: 0, maxX: grid.width - 1, minZ: 0, maxZ: grid.height - 1 };
  /** La camara empieza mirando a la Base (o la primera unidad) de la persona. */
  const home = state.buildings.find((building) => building.owner === viewer) ?? state.units.find((unit) => unit.team === viewer);
  const startTarget = home ? scene.groundOf(home) : scene.center;
  const camera = new StrategyCamera({ target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds, scene.verticalFov);
  scene.placeCamera(camera.pose);
  const anchorOf = (pos: Pos) => scene.anchorOf(pos);
  const minimap = new MinimapBridge(viewer);

  let cursor: Pos | null = null;
  /** Publica la interfaz (de las piezas, solo la barra de vida del enemigo al que se apunta). */
  function publish(): void {
    const forecast = cursor ? controls.forecastAt(cursor) : null;
    board.previewHit(hitLookOf(state, forecast));
    threat.focus(controls.busy ? null : threatFocus());
    const menu = pause.view(cursor ?? PAUSE_ANCHOR) ?? controls.menu();
    publishHud(images, state, viewer, {
      cursor,
      busy: controls.busy,
      menu,
      forecast,
      selected: controls.selectedUnits(),
      endArmed: endGuard.isArmed,
      anchorOf,
      overheadOf: (pos) => scene.overheadOf(pos),
    });
    minimap.publishMap(state);
  }
  /** De quien se enseña quien podria atacarle: la unidad propia señalada o, si no, la elegida (sola). */
  function threatFocus(): Unit | null {
    const pointed = cursor ? unitAt(state, cursor) : undefined;
    if (pointed?.team === viewer) return pointed;
    const selected = controls.selectedUnits();
    return selected.length === 1 ? selected[0]! : null;
  }
  /** «Fin del turno»: con unidades sin mover, la primera pulsacion las hace saltar y pide otra. */
  const endGuard = new EndTurnGuard({
    s: state,
    viewer,
    pieces: scene.stages.pieces,
    endTurn: () => controls.endTurn(),
    changed: () => publish(),
    now: () => performance.now(),
    later: (ms, run) => void setTimeout(run, ms),
  });
  function refresh(): void {
    scene.sync(state.weather?.kind ?? null);
    ambience.setWeather(state.weather?.kind ?? null);
    intents.update();
    showDestinations(state, viewer, scene.destinationMarks);
    threat.update();
    publish();
  }

  /** Los sucesos se ven con las piezas y los efectos del motor (systems/events dice que pasos lleva cada uno). */
  const day = { viewer, incomeSpots: (team: TeamId) => incomeSpotsOf(state, team) };
  /** El ambiente: el fondo del tema, el clima y lo que suena cerca de donde mira la camara (y los truenos). */
  const ambience = new AmbiencePlayer({
    loops: audio.loops,
    playAt: (sound, at) => audio.playAt(sound, at),
    later: (seconds, run) => void setTimeout(run, seconds * MS_PER_SECOND),
    random: Math.random,
  });
  ambience.load(state);
  scene.weather.onLightning(() => ambience.lightning());
  /** Los sonidos del tablero suenan desde su sitio, respecto a la camara. */
  const sounds = scene.soundStage(audio);
  const stages = { ...scene.stages, sounds, day, board: boardLookupOf(state, viewer) };
  /** Lo que haran las ordenes al terminar el turno (al señalar una unidad con orden, o todas con «Ver órdenes»). */
  const intents = new OrderIntents({ session, viewer, marks: scene.intentMarks });
  function toggleIntents(): void {
    intents.toggleAll();
    publish();
  }
  /** A donde llegan los enemigos que se ven (T o el icono de la bandeja). */
  const threat = new ThreatZone({ session, viewer, marks: scene.threatMarks });
  function toggleThreat(): void {
    threat.toggle();
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
    touch: window.matchMedia('(pointer: coarse)').matches,
    refresh,
    onOver: () => showEndSoon(),
  });
  /** La siguiente unidad sin mover (Tab o el numero de «Fin del turno»): elegirla y llevar la camara. */
  function nextIdle(): void {
    const uid = controls.nextIdleUnit();
    if (uid !== null) focusUnit(uid);
  }
  const options = new OptionsPanel(
    'game',
    () => publish(),
    () => publish(),
  );
  const pause = new PauseMenu({
    session,
    viewer,
    endTurn: () => endGuard.press(),
    openOptions: () => options.open(),
    toggleThreat,
    toggleIntents,
    isThreatOn: () => threat.isShowing,
    isIntentsOn: () => intents.isShowingAll,
    hasOrders: () => anyStandingOrder(state, viewer),
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
    endTurn: () => endGuard.press(),
    menuPick: (index) => (pause.isOpen ? pickPause(index) : controls.pickMenu(index)),
    menuHover: (index) => (pause.isOpen ? pause.hover(index) : controls.hoverMenu(index)),
    menuClose: () => (pause.isOpen ? pause.close() : void controls.cancel()),
    openGameMenu: () => pause.open(),
    nextIdle,
    renameSquad: (id, name) => void controls.renameSquad(id, name),
    renameClose: () => ui.set({ rename: null }),
    pickInSelection: (uid, shift, ctrl) => controls.pickInSelection(uid, shift, ctrl),
    // El minimapa cuenta la casilla x de x a x + 1; en el mundo, su centro esta en x.
    minimapJump: (at) => camera.lookAt({ x: at.x - MINIMAP_TILE_HALF, y: camera.pose.target.y, z: at.y - MINIMAP_TILE_HALF }),
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
    endTurn: () => endGuard.press(),
    nextUnit: nextIdle,
    cancel: escape,
    accept: () => (pause.isOpen ? pickPause() : controls.acceptMenu()),
    group: (n, mode) => void groupKey(n, mode),
    order: (order) => controls.orderKey(order),
    orderHere: () => cursor && controls.context(cursor),
    undo: () => controls.undoLastMove(),
    intents: toggleIntents,
    threat: toggleThreat,
    minimap: toggleMinimap,
  });
  /** El oyente sigue a la camara: el audio solo se toca cuando ella se mueve. */
  const hearing = new CameraListener();
  scene.onFrame((seconds) => {
    camera.update(seconds);
    if (hearing.follow(camera.pose)) {
      audio.moveListener(hearing.pose);
      audio.setBoardLevel(zoomLevel(camera.pose.distance));
      ambience.setZoomLevel(ambienceZoomLevel(camera.pose.distance));
    }
    ambience.update(seconds, hearing.pose.position);
    scene.render(seconds, camera.pose);
    minimap.publishView(scene.viewedArea(camera.pose.target.y));
    // Los bocadillos (menu, prevision) siguen a su casilla mientras la camara se mueve.
    if (controls.menu() || (cursor && controls.forecastAt(cursor))) publish();
  });
  scene.start();
  ui.set({ screen: 'game' });
  playMusic(gameTrackOf(state.theme));
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
    ambience,
    recentSounds: () => audio.recent(),
    life: scene.life,
    stages,
    wrecks: scene.wrecks,
    ui,
    pause,
  };
}
