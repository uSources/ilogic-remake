/**
 * Lo que rodea el tablero hasta el horizonte, segun el tema del mapa: el suelo (surface.ts) y los
 * cerros que asoman en el (islets.ts), elegidos en un solo sitio. Por ahora todos son el mar con
 * islotes de su tierra. Un tema sin entrada, el de la llanura.
 */
import * as THREE from 'three';
import { buildIslets, DESERT_ISLET, FOREST_ISLET, GREEN_ISLET, isletStyle, planIslets, SNOWY_ISLET, SWAMP_ISLET } from './islets';
import type { ReliefStyle } from './reliefGrid';
import { COLD_SEA, seaLook, STAGNANT_SEA, TEMPERATE_SEA, TROPICAL_SEA } from './sea';
import { Surface, type SurfaceLook } from './surface';

/** El alrededor de un tema: como es su suelo y el relieve de sus cerros. */
interface Surrounding {
  surface: SurfaceLook;
  hills: ReliefStyle;
}

const ISLAND_IN_THE_SEA: Surrounding = { surface: seaLook(TEMPERATE_SEA), hills: isletStyle(GREEN_ISLET) };

/** El alrededor por tema (id de themes.json). */
const SURROUNDINGS_BY_THEME: Readonly<Record<string, Surrounding>> = {
  Forest: { surface: seaLook(TEMPERATE_SEA), hills: isletStyle(FOREST_ISLET) },
  Swamp: { surface: seaLook(STAGNANT_SEA), hills: isletStyle(SWAMP_ISLET) },
  Snowy: { surface: seaLook(COLD_SEA), hills: isletStyle(SNOWY_ISLET) },
  Desert: { surface: seaLook(TROPICAL_SEA), hills: isletStyle(DESERT_ISLET) },
};

export class Surroundings {
  readonly object = new THREE.Group();
  private readonly surface: Surface;

  /** Alrededor de un tablero de ese centro (en el suelo) y medio lado (casillas), con el tema `theme` (id de themes.json). */
  constructor(center: THREE.Vector3, half: THREE.Vector2, theme: string) {
    const surrounding = SURROUNDINGS_BY_THEME[theme] ?? ISLAND_IN_THE_SEA;
    const islets = planIslets(center, half);
    this.surface = new Surface(surrounding.surface, { center, half, islets });
    this.object.add(this.surface.object, buildIslets(islets, surrounding.hills));
  }

  update(seconds: number): void {
    this.surface.update(seconds);
  }
}
