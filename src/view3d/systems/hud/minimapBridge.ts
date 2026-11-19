/**
 * El minimapa del 3D: el panel de la interfaz (hud/game/Minimap.tsx, con `minimapVM` de ui/hudModels)
 * con lo que ve quien mira y el recuadro de la parte del mapa que esta en pantalla. Solo publica cuando
 * cambia algo que se ve en el: la interfaz se publica muchas veces (al mover el raton, con un menu
 * abierto en cada fotograma) y el minimapa se redibuja entero.
 */
import type { GameState, TeamId } from '../../../core/model';
import { visibility } from '../../../core/rules';
import { ui, type UIState } from '../../../hud/store';
import { minimapVM } from '../../../ui/hudModels';
import { terrainPalette } from '../../../ui/terrainColors';

const NOTHING_HIDDEN: ReadonlySet<number> = new Set();
/** El recuadro se publica con este paso (en casillas): moverlo menos no se ve en el minimapa. */
const VIEW_STEP = 0.25;

/** La parte del mapa que se ve, en casillas del minimapa (la casilla x ocupa de x a x + 1). */
export type MinimapView = UIState['minimapView'];

export class MinimapBridge {
  /** Lo ultimo publicado, para no volver a publicar lo mismo. */
  private shownMap = '';
  private shownView = '';

  /** El color de cada terreno (terrain.json, "mapColor"). */
  private readonly palette = terrainPalette();

  constructor(private readonly viewer: TeamId) {}

  /** El minimapa de la partida tal como esta para quien mira (si ha cambiado algo). */
  publishMap(s: GameState): void {
    const view = { viewer: this.viewer, vis: visibility(s, this.viewer), hidden: NOTHING_HIDDEN };
    const minimap = minimapVM(this.palette, s, view);
    const key = JSON.stringify([minimap.units, minimap.buildings, minimap.fog, minimap.points]);
    if (key === this.shownMap) return;
    this.shownMap = key;
    ui.set({ minimap });
  }

  /** El recuadro de lo que se ve (si se ha movido lo bastante para notarse). */
  publishView(area: MinimapView): void {
    const shown = { x: snap(area.x), y: snap(area.y), w: snap(area.w), h: snap(area.h) };
    const key = `${shown.x},${shown.y},${shown.w},${shown.h}`;
    if (key === this.shownView) return;
    this.shownView = key;
    ui.set({ minimapView: shown });
  }
}

const snap = (value: number): number => Math.round(value / VIEW_STEP) * VIEW_STEP;

/** Abrir o cerrar el minimapa (tecla M). */
export function toggleMinimap(): void {
  ui.set({ minimapOn: !ui.get().minimapOn });
}
