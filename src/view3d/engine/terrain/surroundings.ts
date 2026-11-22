/**
 * Lo que rodea el tablero hasta el horizonte, segun el tema del mapa: el suelo (surface.ts) y los
 * cerros que asoman en el (islets.ts). Decidido con el usuario: no todos los temas son una isla en el
 * mar (en el desierto chocaba), cada uno tiene su alrededor: el mar con islotes de su tierra; en el
 * desierto, un mar de dunas con mesetas de cañon; y en el nevado, un mar helado con icebergs. Un tema
 * sin entrada, el de la llanura.
 */
import * as THREE from 'three';
import { DUNE_SEA } from './duneSea';
import { ICE_SEA } from './iceSea';
import { buildIslets, FOREST_ISLET, GREEN_ISLET, ICEBERG, isletStyle, planIslets, SWAMP_ISLET } from './islets';
import { MESA } from './pieces';
import type { ReliefStyle } from './reliefGrid';
import { seaLook, STAGNANT_SEA, TEMPERATE_SEA } from './sea';
import { Surface, type SurfaceLook } from './surface';

/** El alrededor de un tema: como es su suelo y el relieve de sus cerros. */
export interface Surrounding {
  surface: SurfaceLook;
  hills: ReliefStyle;
}

const ISLAND_IN_THE_SEA: Surrounding = { surface: seaLook(TEMPERATE_SEA), hills: isletStyle(GREEN_ISLET) };

/** El alrededor por tema (id de themes.json). */
const SURROUNDINGS_BY_THEME: Readonly<Record<string, Surrounding>> = {
  Forest: { surface: seaLook(TEMPERATE_SEA), hills: isletStyle(FOREST_ISLET) },
  Swamp: { surface: seaLook(STAGNANT_SEA), hills: isletStyle(SWAMP_ISLET) },
  Snowy: { surface: ICE_SEA, hills: ICEBERG },
  Desert: { surface: DUNE_SEA, hills: MESA },
};

/** El alrededor del tema `theme` (id de themes.json). */
export const surroundingFor = (theme: string): Surrounding => SURROUNDINGS_BY_THEME[theme] ?? ISLAND_IN_THE_SEA;

export class Surroundings {
  readonly object = new THREE.Group();
  private readonly surface: Surface;

  /** Alrededor de un tablero de ese centro (en el suelo) y medio lado (casillas), con el tema `theme` (id de themes.json). */
  constructor(center: THREE.Vector3, half: THREE.Vector2, theme: string) {
    const surrounding = surroundingFor(theme);
    const islets = planIslets(center, half);
    this.surface = new Surface(surrounding.surface, { center, half, islets });
    this.object.add(this.surface.object, buildIslets(islets, surrounding.hills));
  }

  update(seconds: number): void {
    this.surface.update(seconds);
  }
}
