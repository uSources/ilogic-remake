/**
 * Los viajeros del ambiente: lo que no se queda en su sitio, sino que nace en una casilla de su terreno
 * cerca de lo que se mira y se va (los pajaros que van de una copa a otra, los buitres que dan vueltas,
 * las bolas que ruedan por las dunas). Como las motas, pero con su modelo de Ashfox, mirando hacia donde
 * van: cada clase es un dato (`TravellerKind`, en kinds.ts: su modelo, cuantos, como van, si baten las
 * alas, si ruedan, si se inclinan al subir y bajar y si van por el suelo). Salen creciendo y se van
 * encogiendo, sin aparecer de golpe (salvo lo que sale de donde no se ve: el pez, del agua). Con
 * «reducir el movimiento» no salen.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import type { GlbLibrary } from '../pieces/glbModels';
import { instancedParts, moveCopy, terrainParts, type PlacedMesh } from '../terrain/placed';
import { Births, stepLife, type BirthPlan, type Flier } from './births';

/** El batir de las alas: cuantas veces por segundo y lo que se estrecha (de ancho, 0 a 1) con las alas arriba. */
export interface WingBeat {
  beats: number;
  narrowest: number;
}

export interface TravellerKind extends BirthPlan {
  /** Su modelo de Ashfox (tools/art/ashfox/models/terrain.mjs). */
  model: string;
  /** Lo que mide respecto a su modelo. */
  size: number;
  /**
   * Donde esta a su edad (lo escribe en `out` y lo devuelve): su viaje desde donde nacio. Si va por el
   * suelo (`onTheGround`), su altura es sobre el suelo de donde esta, no la del mundo.
   */
  flight(traveller: Flier, out: THREE.Vector3): THREE.Vector3;
  /** Si bate las alas (visto desde arriba, el pajaro se estrecha y se ensancha). */
  wings?: WingBeat;
  /** Si va por el suelo, subiendo y bajando con el (la bola rodadora por las dunas). */
  onTheGround?: boolean;
  /** Si rueda hacia delante: lo que gira por segundo (radianes) sobre su centro, el origen de su modelo. */
  rolls?: number;
  /** Si se inclina hacia donde va, tambien arriba y abajo: el pez que salta sube de morro y cae de cabeza. */
  pitches?: boolean;
  /**
   * Si sale creciendo y se va encogiendo (sin decir, si). El que nace y se va donde no se ve (el pez,
   * bajo el agua) no lo necesita: sale entero.
   */
  grows?: boolean;
}

/** Lo que los viajeros preguntan al terreno. */
export interface TravelGround {
  /** El punto del suelo de una casilla, nuevo cada vez: de ahi salen y cada uno se queda el suyo. */
  groundOf: (pos: Pos) => THREE.Vector3;
  /** Lo alto del suelo en un punto (casillas; con el relieve: las dunas, las mesetas). */
  heightAt: (x: number, z: number) => number;
}

/** Lo que tarda en crecer al nacer y en encogerse al irse (segundos). */
const GROW_SECONDS = 0.4;
/** Cuanto despues se mira donde estara, para saber hacia donde va (segundos). */
const LOOK_AHEAD = 0.05;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
/** De traves a donde mira (los modelos miran al norte, -z): sobre ese eje rueda. */
const ACROSS = new THREE.Vector3(1, 0, 0);

/** Cuanto ha crecido a su edad: de nada a entero al nacer y otra vez a nada al irse. */
const grownAt = (kind: TravellerKind, traveller: Flier): number =>
  kind.grows === false ? 1 : THREE.MathUtils.clamp(Math.min(traveller.age, traveller.life - traveller.age) / GROW_SECONDS, 0, 1);

/** Los viajeros de una clase sobre sus casillas. */
export class Travellers {
  readonly object = new THREE.Group();
  readonly placed: readonly PlacedMesh[];
  private readonly travellers: (Flier | null)[];
  private readonly births: Births;
  private readonly at = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly lookingAhead: Flier = { home: new THREE.Vector3(), age: 0, life: 0, seed: 0 };
  private readonly facing = new THREE.Quaternion();
  private readonly rolling = new THREE.Quaternion();
  private readonly tilting = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly place = new THREE.Matrix4();

  constructor(
    library: GlbLibrary,
    private readonly kind: TravellerKind,
    tiles: readonly Pos[],
    private readonly ground: TravelGround,
  ) {
    this.travellers = Array.from({ length: kind.count }, () => null);
    this.births = new Births(kind, tiles, ground.groundOf);
    // Van por el aire, de ninguna casilla: no se oscurecen con la niebla (como las motas).
    const hidden = this.travellers.map(() => HIDDEN);
    this.placed = instancedParts(terrainParts(library, kind.model), [], hidden);
    for (const { mesh } of this.placed) {
      // Cruzan el mapa: su caja de recorte, hecha donde nacieron, no valdria.
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
  }

  /** Avanza los viajeros cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number): void {
    this.object.visible = this.births.tiles.length > 0 && !reducedMotion();
    if (!this.object.visible) return;
    this.births.tick(seconds, center, radius);
    for (let index = 0; index < this.travellers.length; index++) {
      const traveller = stepLife(this.travellers[index] ?? null, seconds, this.births);
      this.travellers[index] = traveller;
      this.moveCopies(index, traveller ? this.placeOf(traveller) : HIDDEN);
    }
  }

  private moveCopies(index: number, place: THREE.Matrix4): void {
    for (const part of this.placed) moveCopy(part, index, place);
  }

  /** Donde va: en su sitio del viaje, mirando hacia donde va, de su tamaño y con las alas (o rodando) como le toque. */
  private placeOf(traveller: Flier): THREE.Matrix4 {
    const at = this.kind.flight(traveller, this.at);
    const ahead = this.kind.flight(this.soonAfter(traveller), this.ahead).sub(at);
    // Los modelos de Ashfox miran al norte (-z): se giran hacia donde van, en el suelo.
    this.facing.setFromAxisAngle(UP, Math.atan2(-ahead.x, -ahead.z));
    // Girar sobre el eje de traves hacia arriba sube el morro (el -z de los modelos).
    if (this.kind.pitches) this.facing.multiply(this.tilting.setFromAxisAngle(ACROSS, Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z))));
    if (this.kind.rolls) this.facing.multiply(this.rolling.setFromAxisAngle(ACROSS, -traveller.age * this.kind.rolls));
    if (this.kind.onTheGround) at.y += this.ground.heightAt(at.x, at.z);
    const size = this.kind.size * grownAt(this.kind, traveller);
    this.scale.set(size * this.wingsOf(traveller), size, size);
    return this.place.compose(at, this.facing, this.scale);
  }

  /** El mismo viajero un poco mas tarde (`LOOK_AHEAD`), sin crear nada: se reutiliza el de siempre. */
  private soonAfter(traveller: Flier): Flier {
    const later = this.lookingAhead;
    later.home = traveller.home;
    later.goal = traveller.goal;
    later.life = traveller.life;
    later.seed = traveller.seed;
    later.rank = traveller.rank;
    later.age = traveller.age + LOOK_AHEAD;
    return later;
  }

  /** Lo ancho que esta a su edad: con las alas abiertas, todo; arriba del todo, `narrowest`. */
  private wingsOf(traveller: Flier): number {
    const wings = this.kind.wings;
    if (!wings) return 1;
    const open = 0.5 + 0.5 * Math.cos(traveller.age * wings.beats * Math.PI * 2 + traveller.seed);
    return wings.narrowest + (1 - wings.narrowest) * open;
  }
}
