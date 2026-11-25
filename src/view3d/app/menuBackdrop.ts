/**
 * Detras del menu, el juego en 3D: una partida de muestra (menu/menuBoard.ts) en la que la camara,
 * de cerca, rodea despacio la Base de un equipo, una vuelta tras otra (systems/camera/orbitCamera.ts),
 * con la Base donde no la tapa el menu. Sin entrada ni sonido: solo se dibuja. Con
 * «Menos movimiento», quieta.
 */
import type { GameImages } from '../../atlas';
import { isHq } from '../../core/gameContent';
import type { GameState, TeamId } from '../../core/model';
import { duelTeams } from '../../core/teams';
import { menuBoardMatch } from '../../menu/menuBoard';
import { randomSeed } from '../../setup';
import { reducedMotion } from '../../ui/motion';
import { MatchScene } from '../engine/matchScene';
import type { GlbLibrary } from '../engine/pieces/glbModels';
import type { Point3 } from '../ports/camera';
import { orbitPose, type OrbitPath, type ScreenSpot } from '../systems/camera/orbitCamera';

const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

/** Una vuelta cada dos minutos y medio: se nota que gira, sin marear detras del texto. */
const LAP_SECONDS = 150;
/** Un poco mas baja que la de partida: se ve el relieve de los edificios y los montes. */
const PITCH = degreesToRadians(44);
/** Casi a la de partida (match3d.ts): de cerca se leen los modelos, y la Base y lo que tiene alrededor llenan la pantalla. */
const DISTANCE = 16;
/**
 * Donde sale la Base: en una pantalla ancha, a la derecha del menu; en una alta (el movil), debajo
 * (home.css oscurece ese lado con el velo: misma forma de pantalla).
 */
const WIDE_SPOT: ScreenSpot = { right: 0.45, down: 0 };
const TALL_SPOT: ScreenSpot = { right: 0, down: 0.4 };
const WIDE_ASPECT = 1.2;

/** Empieza a dibujar el fondo en `stage` (hasta que se sale del menu, que recarga la pagina). */
export function showMenuBoard(stage: HTMLElement, models: GlbLibrary, images: GameImages): void {
  const state = menuBoardMatch(randomSeed(), null);
  const [viewer] = duelTeams(state);
  const scene = new MatchScene(stage, state, viewer, models, images);
  scene.sync(null);
  const path: Omit<OrbitPath, 'spot'> = {
    center: orbitCenter(scene, state, viewer),
    distance: DISTANCE,
    pitch: PITCH,
    lapSeconds: LAP_SECONDS,
    startYaw: Math.random() * 2 * Math.PI,
  };
  let elapsed = 0;
  scene.onFrame((seconds) => {
    if (!reducedMotion()) elapsed += seconds;
    const screen = { verticalFov: scene.verticalFov, aspect: scene.canvas.clientWidth / Math.max(scene.canvas.clientHeight, 1) };
    const spot = screen.aspect >= WIDE_ASPECT ? WIDE_SPOT : TALL_SPOT;
    scene.render(seconds, orbitPose({ ...path, spot }, elapsed, screen));
  });
  scene.start();
}

/** Alrededor de que gira: la Base de ese equipo (con sus edificios y sus unidades al lado) o, sin Base, el centro del mapa. */
function orbitCenter(scene: MatchScene, state: GameState, team: TeamId): Point3 {
  const base = state.buildings.find((building) => building.owner === team && isHq(state, building));
  return base ? scene.groundOf(base) : scene.center;
}
