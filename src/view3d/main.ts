/**
 * Prototipo 3D (3d.html): una escaramuza contra la IA con la misma partida, las mismas reglas, la
 * misma sesion y la misma interfaz HTML que el juego, con el mapa visto con three.js en bloques y luz
 * cartoon. Aqui solo se junta todo: cada pieza vive en su modulo.
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '../hud/hud.css';
import * as THREE from 'three';
import { render, h } from 'preact';
import { mapGrid } from '../core/mapGrid';
import type { MovementMotion } from '../core/content';
import type { Pos } from '../core/model';
import { Hud } from '../hud/Hud';
import type { Anchor } from '../hud/store';
import { applySettings } from '../settings';
import { BoardView } from './board';
import { CameraRig } from './cameraRig';
import { loadGameAtlas } from './gameAtlas';
import { GlbLibrary } from './glbModels';
import { Highlights } from './highlights';
import { installHudActions, publishHud } from './hudBridge';
import { installKeys } from './keyInput';
import { installPointer } from './pointerInput';
import { startPrototype } from './prototypeMatch';
import { buildTerrain, TERRAIN_MODEL_FILES } from './terrain';
import { TurnControls } from './turnControls';
import { World } from './world';
import { GroundMarks } from './groundMarks';
import { ParticleSystem, type PuffKind } from './particles';
import { SandDust } from './sandDust';
import { WeatherView } from './weather3d';

const START_DISTANCE = 16;
const START_YAW = Math.PI / 4;

render(h(Hud, {}), document.getElementById('hud')!);
applySettings();
const { session, viewer } = startPrototype();
/** Los tipos de unidad y de edificio de la partida: de cada uno se busca su modelo de Ashfox. */
const MODEL_TYPES = {
  units: session.state.content.units.list.map((unitType) => unitType.id),
  buildings: session.state.content.buildings.list.map((buildingType) => buildingType.id),
};
const [textures, glbModels] = await Promise.all([loadGameAtlas(), GlbLibrary.load(MODEL_TYPES, TERRAIN_MODEL_FILES)]);

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
const bounds = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(grid.width - 1, grid.height - 1));
/** La camara empieza mirando a la Base (o la primera unidad) de la persona. */
const home = state.buildings.find((building) => building.owner === viewer) ?? state.units.find((unit) => unit.team === viewer);
const startTarget = home ? board.groundOf(home) : center.clone();
const rig = new CameraRig(world.camera, { target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds);

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
  publishHud(textures, state, viewer, { cursor, busy: controls.busy, menu: controls.menu(), forecast, anchorOf });
}
function refresh(): void {
  board.sync();
  weather.set(state.weather?.kind ?? null);
  publish();
}

/** Cuanto alrededor de lo que se mira hay clima y polvo: un poco mas que lo que se ve. */
const WEATHER_REACH = 0.9;

const particles = new ParticleSystem();
const marks = new GroundMarks();
world.scene.add(particles.object, marks.mesh);
const animations = {
  board,
  layer: effects,
  animate: (seconds: number, step: (progress: number) => void) => world.animate(seconds, step),
  puff: (kind: PuffKind, at: THREE.Vector3, count?: number) => particles.emit(kind, at, count),
  mark: (at: THREE.Vector3, heading: number, motion: MovementMotion) => marks.leave(at, heading, motion),
};
const controls = new TurnControls({ session, viewer, highlights, animations, refresh });

/** Elige la unidad y lleva la camara hasta ella. */
function focusUnit(uid: number): void {
  const unit = state.units.find((candidate) => candidate.uid === uid);
  if (!unit) return;
  controls.focusUnit(uid);
  rig.lookAt(board.groundOf(unit));
}

installHudActions({
  endTurn: () => controls.endTurn(),
  focusUnit,
  menuPick: (index) => controls.pickMenu(index),
  menuHover: (index) => controls.hoverMenu(index),
  menuClose: () => controls.cancel(),
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

installPointer(world.renderer.domElement, { rig, tileAt, hover, tap: (pos) => void controls.tap(pos) });
installKeys({
  rig,
  onFrame: (listener) => world.onFrame(listener),
  endTurn: () => controls.endTurn(),
  nextUnit: () => {
    const uid = controls.nextIdleUnit();
    if (uid !== null) focusUnit(uid);
  },
  cancel: () => controls.cancel(),
  accept: () => controls.acceptMenu(),
});
world.onFrame((seconds) => {
  rig.update(seconds);
  highlights.update(seconds);
  board.update(seconds);
  terrain.update(seconds);
  const { target, distance } = rig.focus;
  const viewportHeight = world.renderer.domElement.clientHeight;
  weather.update(seconds, target, distance * WEATHER_REACH, world.camera, viewportHeight);
  sandDust.update(seconds, target, distance * WEATHER_REACH, world.camera, viewportHeight);
  particles.keepEmitting(board.smokeSources(), seconds);
  particles.update(seconds, world.camera, viewportHeight);
  marks.update(seconds);
  // Los bocadillos (menu, prevision) siguen a su casilla mientras la camara se mueve.
  if (controls.menu() || (cursor && controls.forecastAt(cursor))) publish();
});
world.start();
void controls.runUntilInput();

// Para mirar y probar desde la consola (y los agentes): la sesion y las piezas.
(window as unknown as { ilogic3d: object }).ilogic3d = { session, board, controls, rig, world, weather, sandDust };
