/**
 * Una partida en 3D: la raiz de composicion. Junta cada sistema (el turno, la entrada, la camara de
 * estrategia, los sucesos animados, la interfaz, la pausa) con el motor que dibuja la partida
 * (engine/matchScene.ts) y con la misma sesion, reglas e interfaz HTML de siempre. Aqui no se dibuja
 * ni se decide: solo se conecta. La pausa y el final, en systems/hud/matchMenus.ts. Quien lleva la
 * partida es su sesion (`localRunner`) o, por la red, la sala del servidor (`OnlinePlay`): su sesion
 * espejo cambia con cada vista, asi que los sistemas la piden siempre a `runner`. Quien mira tambien
 * puede cambiar: con varias personas en esta pantalla, la que juega (`HotSeat`), asi que se pide a `seat`.
 */
import { mapGrid } from '../../core/mapGrid';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { isOnMap, unitAt } from '../../core/rules';
import { screenEnd } from '../../core/session';
import { ui } from '../../hud/store';
import type { GameImages } from '../../atlas';
import { gameTrackOf, playMusic } from '../../audio/music';
import type { GameAudio } from '../../audio/gameAudio';
import { AmbiencePlayer } from '../systems/sound/ambiencePlayer';
import { CameraListener, zoomLevel } from '../systems/sound/listener';
import { helpPanel } from '../../menu/helpPanel';
import { OptionsPanel } from '../../menu/optionsPanel';
import { MatchScene } from '../engine/matchScene';
import type { GlbLibrary } from '../engine/pieces/glbModels';
import { hitLookOf } from '../systems/board/boardScene';
import { EndTurnGuard } from '../systems/turn/endTurnGuard';
import { StrategyCamera } from '../systems/camera/strategyCamera';
import { boardLookupOf, incomeSpotsOf, type DayLookup } from '../systems/events/eventSteps';
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
import { localRunner, type MatchRunner } from '../systems/turn/matchRunner';
import { HotSeat, type ScreenPass } from '../systems/turn/hotSeat';
import { OnlinePlay } from '../systems/net/onlinePlay';
import { TurnClock } from '../systems/net/turnClock';
import { notifyTurn } from '../systems/net/turnNotice';
import { backToMenu, type StartedGame } from './gameStart';
import type { GroupMode } from '../../controls/inputCommands';
import type { Point3 } from '../ports/camera';

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
export function playMatch(
  { session, viewer: firstViewer, room }: StartedGame,
  images: GameImages,
  glbModels: GlbLibrary,
  audio: GameAudio,
): void {
  /** La partida que se ve: el mismo objeto toda la partida (por la red, cada vista se mete en el). */
  const state = session.state;
  const scene = new MatchScene(document.getElementById('game')!, state, firstViewer, glbModels, images);
  /** Quien mira: con varias personas en esta pantalla, la que juega (al tocarle a otra, se le pasa la pantalla). */
  const seat = new HotSeat(firstViewer, (pass) => passScreen(pass));
  /** El reloj del turno por la red (si la sala lo tiene: `OnlinePlay` le dice que turno se ve). Por la red, quien mira no cambia. */
  const turnClock = new TurnClock(state, firstViewer, {
    now: () => Date.now(),
    onFrame: (listener) => scene.onFrame(listener),
    sounds: audio.sounds,
  });
  const online = room
    ? new OnlinePlay(room, session, firstViewer, {
        viewReplaced: () => controls.viewReplaced(),
        othersGoOn: () => controls.othersGoOn(),
        ownTurn: notifyTurn,
        showClock: (turn) => turnClock.follow(turn),
        quit: backToMenu,
      })
    : null;
  const runner: MatchRunner = online ?? localRunner(session, seat);
  const { board } = scene;
  const camera = startingCamera(scene, state, firstViewer);
  const anchorOf = (pos: Pos) => scene.anchorOf(pos);
  const minimap = new MinimapBridge();

  let cursor: Pos | null = null;
  /** Publica la interfaz (de las piezas, solo la barra de vida del enemigo al que se apunta). */
  function publish(): void {
    const forecast = cursor ? controls.forecastAt(cursor) : null;
    board.previewHit(hitLookOf(state, forecast));
    threat.focus(controls.busy ? null : threatFocus());
    const menu = pause.view(cursor ?? PAUSE_ANCHOR) ?? controls.menu();
    publishHud(images, state, seat.team, {
      cursor,
      busy: controls.busy,
      menu,
      forecast,
      selected: controls.selectedUnits(),
      endArmed: endGuard.isArmed,
      watching: controls.isWatchingOthers,
      anchorOf,
      overheadOf: (pos) => scene.overheadOf(pos),
    });
    minimap.publishMap(state, seat.team);
  }
  /** De quien se enseña quien podria atacarle: la unidad propia señalada o, si no, la elegida (sola). */
  function threatFocus(): Unit | null {
    const pointed = cursor ? unitAt(state, cursor) : undefined;
    if (pointed?.team === seat.team) return pointed;
    const selected = controls.selectedUnits();
    return selected.length === 1 ? selected[0]! : null;
  }
  /** «Fin del turno»: con unidades sin mover, la primera pulsacion las hace saltar y pide otra. */
  const endGuard = new EndTurnGuard({
    s: state,
    get viewer() {
      return seat.team;
    },
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
    showDestinations(state, seat.team, scene.destinationMarks);
    threat.update();
    publish();
  }

  /** Donde dejo la camara cada persona de esta pantalla, para que al volver a tocarle la encuentre alli. */
  const cameraSpots = new Map<TeamId, Point3>();
  /** La pantalla pasa a otra persona (tapada por el aviso): su camara y la partida como la ve ella. */
  function passScreen({ from, to }: ScreenPass): void {
    cameraSpots.set(from, { ...camera.pose.target });
    camera.lookAt(cameraSpots.get(to) ?? homeSpotOf(scene, state, to));
    scene.lookAs(to);
    refresh();
  }

  /** Los sucesos se ven con las piezas y los efectos del motor (systems/events dice que pasos lleva cada uno). */
  const day: DayLookup = {
    get viewer() {
      return seat.team;
    },
    incomeSpots: (team, source) => incomeSpotsOf(state, team, source),
  };
  /** El ambiente: el fondo del tema, el clima, lo que suena cerca de donde mira la camara, los truenos y los animales. */
  const ambience = startAmbience(scene, state, audio);
  /** Los sonidos del tablero suenan desde su sitio, respecto a la camara. */
  const sounds = scene.soundStage(audio);
  const stages = {
    ...scene.stages,
    sounds,
    day,
    get board() {
      return boardLookupOf(state, seat.team);
    },
  };
  /** Lo que haran las ordenes al terminar el turno (al señalar una unidad con orden, o todas con «Ver órdenes»). */
  const intents = new OrderIntents({
    get session() {
      return runner.session;
    },
    get viewer() {
      return seat.team;
    },
    marks: scene.intentMarks,
  });
  function toggleIntents(): void {
    intents.toggleAll();
    publish();
  }
  /** A donde llegan los enemigos que se ven (T o el icono de la bandeja). */
  const threat = new ThreatZone({
    get session() {
      return runner.session;
    },
    get viewer() {
      return seat.team;
    },
    marks: scene.threatMarks,
  });
  function toggleThreat(): void {
    threat.toggle();
    publish();
  }
  const controls = new TurnControls({
    runner,
    get viewer() {
      return seat.team;
    },
    marks: scene.tileMarks,
    preview: scene.movePreview,
    screen: scene,
    events: { play: (events) => playEvents(events, stages) },
    sounds,
    touch: window.matchMedia('(pointer: coarse)').matches,
    refresh,
    publish,
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
    get session() {
      return runner.session;
    },
    get viewer() {
      return seat.team;
    },
    savesHere: !online,
    endTurn: () => endGuard.press(),
    surrender: () => void surrender(),
    openOptions: () => options.open(),
    toggleThreat,
    toggleIntents,
    isThreatOn: () => threat.isShowing,
    isIntentsOn: () => intents.isShowingAll,
    hasOrders: () => anyStandingOrder(state, seat.team),
    isWatching: () => controls.isWatchingOthers,
    refresh: () => publish(),
  });

  /** Tras el cartel de victoria o derrota, la pantalla del final. */
  function showEndSoon(): void {
    window.setTimeout(showEnd, END_SCREEN_DELAY_MS);
  }

  /** La pantalla del final, si la partida se ha acabado para quien mira (por la red, ya no se sigue la sala). */
  function showEnd(): void {
    if (showEndIfOver(runner.session, seat.team, !!online)) online?.close();
  }

  /** Rendirse acaba la partida sin pasar por los turnos: su final, ya. */
  async function surrender(): Promise<void> {
    await runner.act({ kind: 'surrender' });
    showEnd();
  }

  /**
   * Esc en el mapa: deshace lo elegido; sin nada elegido, o mirando jugar a los demas (no hay nada que
   * deshacer), abre la pausa (abierta, como las opciones o la ayuda, Esc es suyo).
   */
  function escape(): void {
    if (controls.isWatchingOthers || !controls.cancel()) pause.open();
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
    menuPick: (index) => (pause.isOpen ? pause.pick(index) : controls.pickMenu(index)),
    menuHover: (index) => (pause.isOpen ? pause.hover(index) : controls.hoverMenu(index)),
    menuClose: () => (pause.isOpen ? pause.close() : void controls.cancel()),
    openGameMenu: () => pause.open(),
    nextIdle,
    renameSquad: (id, name) => void controls.renameSquad(id, name),
    renameClose: () => ui.set({ rename: null }),
    handoffReady: () => seat.ready(),
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
  const ownUnitsOnBoard = () => state.units.filter((unit) => unit.team === seat.team && isOnMap(unit));

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
    // El cambio de jugador, la pausa, las opciones y la ayuda se abren encima del mapa (el cambio de
    // jugador, encima de todo; las opciones, tambien encima de la pausa: van antes): mientras, las teclas son suyas.
    panels: [seat, helpPanel, options, pause],
    sounds: audio.sounds,
    endTurn: () => endGuard.press(),
    nextUnit: nextIdle,
    cancel: escape,
    accept: () => controls.acceptMenu(),
    group: (n, mode) => void groupKey(n, mode),
    order: (order) => controls.orderKey(order),
    orderHere: () => cursor && controls.context(cursor),
    undo: () => controls.undoLastMove(),
    intents: toggleIntents,
    threat: toggleThreat,
    minimap: toggleMinimap,
    help: () => helpPanel.open(),
    options: () => options.open(),
  });
  playEachFrame({ scene, camera, audio, ambience, minimap }, () => {
    // Los bocadillos (menu, prevision) siguen a su casilla mientras la camara se mueve.
    if (controls.menu() || (cursor && controls.forecastAt(cursor))) publish();
  });
  scene.start();
  ui.set({ screen: 'game' });
  playMusic(gameTrackOf(state.theme));
  // Se guarda al salir de la pagina (cerrar, recargar): «Continuar» la retoma. Por la red se sigue desde el servidor.
  if (!online) window.addEventListener('pagehide', () => void (screenEnd(session, seat.team) ?? saveGame(session.state)));
  online?.listen();
  void controls.runUntilInput();

  // La sesion se pide a `runner`: por la red, su sesion espejo cambia con cada vista (y `online` es la sala).
  exposeForConsole({
    get session() {
      return runner.session;
    },
    get viewer() {
      return seat.team;
    },
    seat,
    online,
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
  });
}

/** La camara de estrategia, empezando mirando a la Base (o la primera unidad) de quien mira. */
function startingCamera(scene: MatchScene, state: GameState, viewer: TeamId): StrategyCamera {
  const grid = mapGrid(state);
  const bounds = { minX: 0, maxX: grid.width - 1, minZ: 0, maxZ: grid.height - 1 };
  const camera = new StrategyCamera(
    { target: homeSpotOf(scene, state, viewer), distance: START_DISTANCE, yaw: START_YAW },
    bounds,
    scene.verticalFov,
  );
  scene.placeCamera(camera.pose);
  return camera;
}

/** A donde mira la camara de un equipo la primera vez: su Base (su primer edificio), su primera unidad o el centro. */
function homeSpotOf(scene: MatchScene, state: GameState, team: TeamId): Point3 {
  const home = state.buildings.find((building) => building.owner === team) ?? state.units.find((unit) => unit.team === team);
  return home ? scene.groundOf(home) : scene.center;
}

/** El ambiente: el fondo del tema, el clima y lo que suena cerca de donde mira la camara (y los truenos). */
function startAmbience(scene: MatchScene, state: GameState, audio: GameAudio): AmbiencePlayer {
  const ambience = new AmbiencePlayer({
    loops: audio.loops,
    playAt: (sound, at, tone) => audio.playAt(sound, at, tone),
    later: (seconds, run) => void setTimeout(run, seconds * MS_PER_SECOND),
    random: Math.random,
  });
  ambience.load(state);
  scene.weather.onLightning(() => ambience.lightning());
  scene.life.onAnimal((moment) => ambience.animal(moment));
  return ambience;
}

/** Lo que se mueve con cada fotograma: la camara, el oido que la sigue, el ambiente, la escena y el minimapa. */
interface FrameParts {
  scene: MatchScene;
  camera: StrategyCamera;
  audio: GameAudio;
  ambience: AmbiencePlayer;
  minimap: MinimapBridge;
}

/** Cada fotograma mueve la camara y dibuja; el audio solo se toca cuando la camara se mueve. `afterRender`, lo de la interfaz. */
function playEachFrame({ scene, camera, audio, ambience, minimap }: FrameParts, afterRender: () => void): void {
  const hearing = new CameraListener();
  scene.onFrame((seconds) => {
    camera.update(seconds);
    if (hearing.follow(camera.pose)) {
      audio.moveListener(hearing.pose);
      audio.setBoardLevel(zoomLevel(camera.pose.distance));
      ambience.setCameraDistance(camera.pose.distance);
    }
    ambience.update(seconds, hearing.pose.position);
    scene.render(seconds, camera.pose);
    minimap.publishView(scene.viewedArea(camera.pose.target.y));
    afterRender();
  });
}

/** Para mirar y probar desde la consola (y los agentes, docs/AGENTES.md): `window.ilogic3d`. */
function exposeForConsole(pieces: object): void {
  (window as unknown as { ilogic3d: object }).ilogic3d = pieces;
}
