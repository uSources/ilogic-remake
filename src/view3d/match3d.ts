/**
 * Una partida en 3D: el tablero visto con three.js (terreno, piezas, clima, particulas) con la misma
 * partida, las mismas reglas, la misma sesion y la misma interfaz HTML de siempre. Aqui solo se
 * junta todo: cada pieza vive en su modulo. La pausa y el final, en matchMenus.ts.
 */ import * as THREE from 'three';
import { mapGrid } from '../core/mapGrid';
import type { Pos } from '../core/model';
import { ui, type Anchor } from '../hud/store';
import { BoardView } from './engine/pieces/boardView';
import { StrategyCamera } from './systems/camera/strategyCamera';
import { ThreeCameraView } from './engine/camera/cameraView';
import type { GameImages } from '../atlas';
import type { GlbLibrary } from './glbModels';
import { Highlights } from './highlights';
import { playEvents } from './systems/events/timeline';
import { BoardPieceStage } from './engine/fx/pieceStage';
import { FxEffectStage } from './engine/fx/effectStage';
import { installHudActions, publishHud } from './hudBridge';
import { installKeys } from './keyInput';
import { installPointer } from './pointerInput';
import { buildTerrain } from './terrain';
import { TurnControls } from './turnControls';
import { World } from './world';
import { GroundMarks } from './groundMarks';
import { ParticleSystem } from './particles';
import type { PuffKind } from './ports/stage';
import { SandDust } from './sandDust';
import { WeatherView } from './weather3d';
import { Wrecks } from './wrecks';

import type { StartedGame } from './gameStart';
import { screenEnd } from '../core/session';
import { PauseMenu, saveGame, showEndIfOver } from './matchMenus';
import { playMusic } from '../audio/music';
import type { SoundPort } from '../audio/sounds';
import { OptionsPanel } from '../menu/optionsPanel';

const START_DISTANCE = 16;
const START_YAW = Math.PI / 4;

/** La pausa sale en el centro: la casilla a la que se ancla no cuenta. */
const PAUSE_ANCHOR = { x: 0, y: 0 };

/** Lo que se ve el cartel de victoria o derrota antes de la pantalla del final. */
const END_SCREEN_DELAY_MS = 2200;

/** Juega esa partida en la pagina (hasta que se sale al menu, que recarga). */
export function playMatch({ session, viewer }: StartedGame, images: GameImages, glbModels: GlbLibrary, sounds: SoundPort): void {
  const state = session.state;
  const world = new World(document.getElementById('game')!);
  const terrain = buildTerrain(state, glbModels);
  const board = new BoardView(state, viewer, terrain, glbModels);
  const highlights = new Highlights((pos) => board.groundOf(pos));
  const effects = new THREE.Group();
  const weather = new WeatherView(document.getElementById('game')!);
  const sandDust = new SandDust(terrain.sandTiles, (pos) => board.groundOf(pos));
  world.scene.add(terrain.object, board.object, highlights.object, effects, weather.object, sandDust.object);

  const grid = mapGrid(state);
  const center = new THREE.Vector3((grid.width - 1) / 2, 0, (grid.height - 1) / 2);
  world.lightArea(center, Math.max(grid.width, grid.height) * 0.75);
  const bounds = { minX: 0, maxX: grid.width - 1, minZ: 0, maxZ: grid.height - 1 };
  /** La camara empieza mirando a la Base (o la primera unidad) de la persona. */
  const home = state.buildings.find((building) => building.owner === viewer) ?? state.units.find((unit) => unit.team === viewer);
  const startTarget = home ? board.groundOf(home) : center.clone();
  const cameraView = new ThreeCameraView(world.camera);
  const camera = new StrategyCamera({ target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds, cameraView.verticalFov);
  cameraView.place(camera.pose);

  /** El rectangulo de una casilla en la pantalla (pixeles CSS de la ventana): sus cuatro esquinas de arriba proyectadas. */
  function anchorOf(pos: Pos): Anchor {
    const canvas = world.renderer.domElement.getBoundingClientRect();
    const ground = board.groundOf(pos);
    const corners = [-0.5, 0.5].flatMap((dx) =>
      [-0.5, 0.5].map((dz) =>
        ground
          .clone()
          .add(new THREE.Vector3(dx, 0, dz))
          .project(world.camera),
      ),
    );
    const xs = corners.map((corner) => canvas.left + ((corner.x + 1) / 2) * canvas.width);
    const ys = corners.map((corner) => canvas.top + ((1 - corner.y) / 2) * canvas.height);
    const [left, top] = [Math.min(...xs), Math.min(...ys)];
    return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
  }

  let cursor: Pos | null = null;
  /** Publica la interfaz (sin tocar las piezas). */
  function publish(): void {
    const forecast = cursor ? controls.forecastAt(cursor) : null;
    const menu = pause.view(cursor ?? PAUSE_ANCHOR) ?? controls.menu();
    publishHud(images, state, viewer, { cursor, busy: controls.busy, menu, forecast, anchorOf });
  }
  function refresh(): void {
    board.sync();
    weather.set(state.weather?.kind ?? null);
    world.setWeather(state.weather?.kind ?? null);
    publish();
  }

  /** Cuanto alrededor de lo que se mira hay clima y polvo: un poco mas que lo que se ve. */
  const WEATHER_REACH = 0.9;

  const particles = new ParticleSystem();
  const marks = new GroundMarks();
  const wrecks = new Wrecks();
  world.scene.add(particles.object, marks.mesh, wrecks.object);
  const animate = (seconds: number, step: (progress: number) => void) => world.animate(seconds, step);
  const puff = (kind: PuffKind, at: THREE.Vector3, count: number) => particles.emit(kind, at, count);
  const pieceStage = new BoardPieceStage({
    board,
    animate,
    puff,
    mark: (at, heading, motion) => marks.leave(at, heading, motion),
    wreck: (model) => wrecks.leave(model),
  });
  const effectStage = new FxEffectStage({ board, layer: effects, animate, puff, scorch: (at) => marks.scorch(at) });
  /** Los sucesos se ven con las piezas y los efectos del motor (systems/events dice que pasos lleva cada uno). */
  const stages = { lookup: pieceStage, pieces: pieceStage, effects: effectStage, sounds };
  const controls = new TurnControls({
    session,
    viewer,
    marks: highlights,
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
    camera.lookAt(board.groundOf(unit));
  }

  installHudActions({
    endTurn: () => controls.endTurn(),
    focusUnit,
    menuPick: (index) => (pause.isOpen ? pickPause(index) : controls.pickMenu(index)),
    menuHover: (index) => (pause.isOpen ? pause.hover(index) : controls.hoverMenu(index)),
    menuClose: () => (pause.isOpen ? pause.close() : void controls.cancel()),
    openGameMenu: () => pause.open(),
  });

  /** La casilla bajo un punto de la pantalla: la de la unidad si se toca una, si no la del terreno. */
  function tileAt(clientX: number, clientY: number): Pos | null {
    const canvas = world.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - canvas.left) / canvas.width) * 2 - 1, -((clientY - canvas.top) / canvas.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, world.camera);
    const [hit] = raycaster.intersectObjects([board.object, ...terrain.pickables], true);
    if (!hit) return null;
    const uid = board.unitHit(hit.object);
    if (uid !== null) return state.units.find((unit) => unit.uid === uid) ?? null;
    return terrain.tileOfHit(hit) ?? { x: Math.round(hit.point.x), y: Math.round(hit.point.z) };
  }

  /** La casilla señalada: el cuadro amarillo, la ficha y la prevision de combate. */
  function hover(pos: Pos | null): void {
    const isSame = pos && cursor ? pos.x === cursor.x && pos.y === cursor.y : pos === cursor;
    if (isSame) return;
    cursor = pos;
    highlights.hover(pos);
    publish();
  }

  installPointer(world.renderer.domElement, { camera, tileAt, hover, tap: (pos) => void controls.tap(pos) });
  installKeys({
    camera,
    onFrame: (listener) => world.onFrame(listener),
    endTurn: () => controls.endTurn(),
    nextUnit: () => {
      const uid = controls.nextIdleUnit();
      if (uid !== null) focusUnit(uid);
    },
    cancel: escape,
    accept: () => (pause.isOpen ? pickPause() : controls.acceptMenu()),
  });
  world.onFrame((seconds) => {
    camera.update(seconds);
    cameraView.place(camera.pose);
    highlights.update(seconds);
    board.update(seconds);
    terrain.update(seconds);
    const { target } = cameraView;
    const { distance } = camera.pose;
    const viewportHeight = world.renderer.domElement.clientHeight;
    weather.update(seconds, target, distance * WEATHER_REACH, world.camera, viewportHeight);
    sandDust.update(seconds, target, distance * WEATHER_REACH, world.camera, viewportHeight);
    wrecks.update(seconds);
    particles.keepEmitting([...board.smokeSources(), ...wrecks.smokeSources()], seconds);
    particles.update(seconds, world.camera, viewportHeight);
    marks.update(seconds);
    // Los bocadillos (menu, prevision) siguen a su casilla mientras la camara se mueve.
    if (controls.menu() || (cursor && controls.forecastAt(cursor))) publish();
  });
  world.start();
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
    world,
    weather,
    sandDust,
    stages,
    wrecks,
    ui,
    pause,
  };
}
