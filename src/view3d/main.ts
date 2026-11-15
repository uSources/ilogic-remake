/**
 * Prototipo 3D (3d.html): la misma partida, las mismas reglas, la misma sesion y la misma interfaz
 * HTML que el juego, con el mapa visto con three.js en bloques y luz cartoon. Aqui solo se junta
 * todo: cada pieza vive en su modulo.
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '../hud/hud.css';
import * as THREE from 'three';
import { render, h } from 'preact';
import { mapGrid } from '../core/mapGrid';
import type { Pos } from '../core/model';
import { Hud } from '../hud/Hud';
import { applySettings } from '../settings';
import { BoardView } from './board';
import { CameraRig } from './cameraRig';
import { loadGameAtlas } from './gameAtlas';
import { Highlights } from './highlights';
import { installHudActions, publishHud } from './hudBridge';
import { installKeys } from './keyInput';
import { installPointer } from './pointerInput';
import { PrototypeControls } from './prototypeControls';
import { startPrototype } from './prototypeMatch';
import { buildTerrain } from './terrain';
import { World } from './world';

const START_DISTANCE = 14;
const START_YAW = Math.PI / 4;

render(h(Hud, {}), document.getElementById('hud')!);
applySettings();
const textures = await loadGameAtlas();

const { session, viewer } = startPrototype();
const state = session.state;
const world = new World(document.getElementById('game')!);
const terrain = buildTerrain(state);
const board = new BoardView(state, viewer, terrain);
const highlights = new Highlights((pos) => board.groundOf(pos));
world.scene.add(terrain.object, board.object, highlights.object);

const grid = mapGrid(state);
const center = new THREE.Vector3((grid.width - 1) / 2, 0, (grid.height - 1) / 2);
world.lightArea(center, Math.max(grid.width, grid.height) * 0.75);
const bounds = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(grid.width - 1, grid.height - 1));
/** La camara empieza mirando a la primera unidad de la persona (o al centro si no tiene). */
const firstUnit = state.units.find((unit) => unit.team === viewer);
const startTarget = firstUnit ? board.groundOf(firstUnit) : center.clone();
const rig = new CameraRig(world.camera, { target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds);

let cursor: Pos | null = null;
const refresh = () => {
  board.sync();
  publishHud(textures, state, viewer, { cursor, busy: controls.busy });
};
const animations = { board, animate: (seconds: number, step: (progress: number) => void) => world.animate(seconds, step) };
const controls = new PrototypeControls(session, viewer, highlights, animations, refresh);
installHudActions({ endTurn: () => controls.endTurn(), focusUnit: (uid) => focusUnit(uid) });

/** Elige la unidad y lleva la camara hasta ella. */
function focusUnit(uid: number): void {
  const unit = state.units.find((candidate) => candidate.uid === uid);
  if (!unit) return;
  controls.focusUnit(uid);
  rig.lookAt(board.groundOf(unit));
}

/** La casilla bajo un punto de la pantalla: la de la unidad si se toca una, si no la del terreno. */
function tileAt(clientX: number, clientY: number): Pos | null {
  const canvas = world.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((clientX - canvas.left) / canvas.width) * 2 - 1, -((clientY - canvas.top) / canvas.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, world.camera);
  const [hit] = raycaster.intersectObjects([board.object, terrain.tiles], true);
  if (!hit) return null;
  const uid = board.unitHit(hit.object);
  if (uid !== null) return state.units.find((unit) => unit.uid === uid) ?? null;
  if (hit.object === terrain.tiles && hit.instanceId !== undefined) return terrain.tileOfInstance[hit.instanceId] ?? null;
  return { x: Math.round(hit.point.x), y: Math.round(hit.point.z) };
}

/** La casilla señalada: el cuadro amarillo y la ficha de la interfaz. */
function hover(pos: Pos | null): void {
  const isSame = pos && cursor ? pos.x === cursor.x && pos.y === cursor.y : pos === cursor;
  if (isSame) return;
  cursor = pos;
  highlights.hover(pos);
  refresh();
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
});
world.onFrame((seconds) => {
  rig.update(seconds);
  highlights.update(seconds);
});
controls.runUntilInput();
world.start();

// Para mirar y probar desde la consola (y los agentes): la sesion y las piezas.
(window as unknown as { ilogic3d: object }).ilogic3d = { session, board, controls, rig };
