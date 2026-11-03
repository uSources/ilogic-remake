import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../../atlas';
import { rank, unhealable } from '../../core/rules';
import { effectiveCommand, isDetached } from '../../core/squads';
import type { GameState, Pos, Unit } from '../../core/types';
import { TILE } from '../../layout';
import { addLifeTextures, lifeKey } from '../lifeDigits';
import { PAL, PAL_MAP } from '../palette';
import { unitKey } from '../sprites';
import { frontKey } from '../terrainArt';
import { stepOf, type AnimatedLayer, type MapClock, type MapLayer } from './layer';
import { fitToTile } from './tileImage';
import { BADGE_SLOTS, drawUnitMarks, markSignature } from './unitMarks';
import type { ViewOptions } from './viewOptions';

/** Hacia donde mira una unidad. Los dibujos azules miran a la derecha y los rojos a la izquierda. */
export type Facing = 'left' | 'right';
export const baseFacing = (team: number): Facing => (team === 1 ? 'left' : 'right');
/** Hay que voltear el dibujo para que mire a `dir`. */
export const faceFlip = (team: number, dir: Facing): boolean => dir !== baseFacing(team);

/** Unidad propia sin usar: sube y baja 1 pixel cada BOB_MS (animacion de espera). */
const BOB_MS = 500;
/** Oscurecido de la unidad tapada por el primer plano: bosque (verdoso) y montaña. */
const FRONT_TINT = { forest: 0xd8e4d8, rock: 0xe8e8e8 };
/** Cuadradito de carga (sin las marcas dibujadas): lado y sitio. */
const CARGO_BOX = 8;
const CARGO_AT = 2;

/** Sprite persistente de una unidad: imagen + vida + marca de carga. */
interface UnitSprite {
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  /** Primer plano del terreno (bosque, rocas) delante de la unidad. */
  front: Phaser.GameObjects.Image;
  life: Phaser.GameObjects.Image;
  cargo: Phaser.GameObjects.Rectangle;
  /** Estrellas de veterania (arriba a la derecha) y señal de "sin cura" (abajo a la izquierda). */
  stars: Phaser.GameObjects.Graphics;
  /** [CAMBIO] Icono de la mision en automatico (ui/cmd_<tipo>); si falta, placa con letra en `stars`. */
  cmd: Phaser.GameObjects.Image;
  /** [CAMBIO] Marcas dibujadas (ui/mk_*): sin cura, carga y hasta 3 estrellas; si faltan, van en `stars`. */
  badges: Phaser.GameObjects.Image[];
  /** Firma de lo dibujado en las marcas (`markSignature`). */
  rank: number;
  key: string;
  /** Unidad propia sin usar: se mueve un poco (animacion de espera). */
  idle: boolean;
  team: 0 | 1;
}

/** Unidades: un sprite persistente por unidad que se ve, que se actualiza en cada `render`. */
export class UnitLayer implements MapLayer, AnimatedLayer {
  readonly object: Phaser.GameObjects.Container;
  private readonly units = new Map<number, UnitSprite>();
  /** Ultimo lado al que ha mirado cada unidad (al moverse o disparar). Solo para dibujar. */
  private readonly facing = new Map<number, Facing>();
  private bobPhase = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.object = scene.add.container(0, 0);
  }

  private newSprite(key: string): UnitSprite {
    const add = this.scene.add;
    // Origen abajo en el centro: las unidades nuevas pueden ser algo mas anchas que la casilla.
    const img = fitToTile(add.image(TILE / 2, TILE, ATLAS, key).setOrigin(0.5, 1));
    // Cifra de vida en la esquina de abajo a la derecha (letra Ilogic, ver lifeDigits.ts).
    addLifeTextures(this.scene.textures);
    const life = add.image(TILE, TILE, lifeKey(9)).setOrigin(1, 1);
    const cargo = add.rectangle(CARGO_AT, CARGO_AT, CARGO_BOX, CARGO_BOX, PAL_MAP.teal).setOrigin(0).setStrokeStyle(2, PAL.ink);
    const stars = add.graphics();
    // Primer plano (copas de arbol o rocas) que tapa los pies de la unidad en bosques y montañas.
    const front = add.image(0, TILE, '__DEFAULT').setOrigin(0, 1).setVisible(false);
    const cmd = add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false);
    const badges = Array.from({ length: BADGE_SLOTS }, () => add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false));
    const root = add.container(0, 0, [img, front, life, cargo, stars, cmd, ...badges]);
    this.object.add(root);
    return { root, img, front, life, cargo, stars, cmd, badges, rank: 0, key, idle: false, team: 0 };
  }

  sync(s: GameState, opts: ViewOptions, newArt: boolean): void {
    const tex = this.scene.textures;
    const seen = new Set<number>();
    for (const u of s.units) {
      if (u.carrier !== null || opts.hidden.has(u.uid) || !opts.vis[u.x]![u.y]) continue;
      const key = unitKey(tex, s, u);
      if (!key) continue;
      seen.add(u.uid);
      let sp = this.units.get(u.uid);
      if (!sp) {
        sp = this.newSprite(key);
        this.units.set(u.uid, sp);
      } else if (sp.key !== key) {
        fitToTile(sp.img.setTexture(ATLAS, key));
        sp.key = key;
      }
      this.update(sp, u, s, newArt);
    }
    for (const [uid, sp] of this.units) {
      if (!seen.has(uid)) {
        sp.root.destroy();
        this.units.delete(uid);
      }
    }
    // Las de mas abajo se dibujan encima (los sprites altos tapan la casilla de arriba).
    this.object.sort('y');
  }

  private update(sp: UnitSprite, u: Unit, s: GameState, newArt: boolean): void {
    const tex = this.scene.textures;
    sp.root.setPosition(u.x * TILE, u.y * TILE);
    sp.team = u.team;
    sp.img.setFlipX(faceFlip(u.team, this.facingOf(u.uid, u.team)));
    // Integrar la unidad en el terreno (dibujo nuevo): bosque y montaña le tapan los pies y la oscurecen un poco.
    const front = newArt ? frontKey(s, u.x, u.y) : null;
    if (front && hasImage(tex, front)) {
      sp.front.setTexture(ATLAS, front).setVisible(true);
      sp.img.setTint(front.includes('forest') || front.includes('tree') ? FRONT_TINT.forest : FRONT_TINT.rock);
    } else {
      sp.front.setVisible(false);
      sp.img.clearTint();
    }
    const n = Math.ceil(u.life / 10);
    const showLife = u.life < 100 && n >= 1 && n <= 9;
    sp.life.setVisible(showLife);
    if (showLife) sp.life.setTexture(lifeKey(n));
    // Con las marcas dibujadas, la carga va abajo a la izquierda (junto a la de sin cura) y el
    // cuadradito turquesa de antes se esconde.
    const markArt = hasImage(tex, 'ui/mk_star');
    const cargo = u.cargo.some((c) => c !== null);
    sp.cargo.setVisible(!markArt && cargo);
    const marks = {
      rank: rank(u),
      // [CAMBIO] Ha recibido un ataque hoy y no se curara esta noche (regla noHealUnderFire).
      noHeal: u.life < 100 && unhealable(s, u),
      // [CAMBIO] Ayudante: unidad en automatico (al lado de la marca de carga si la lleva).
      cargo,
      // [CAMBIO] La orden que cumple (la suya o la de su escuadra) y si va destacada con otra.
      cmd: effectiveCommand(s, u)?.kind ?? null,
      detached: isDetached(s, u),
    };
    const sig = markSignature(marks);
    if (sig !== sp.rank) {
      sp.rank = sig;
      drawUnitMarks(tex, sp, marks, markArt);
    }
    sp.idle = u.team === 0 && u.active;
    sp.img.y = TILE - (sp.idle ? this.bobPhase : 0);
  }

  /** Unidades propias sin usar: suben y bajan a saltos de 1 pixel. */
  tick(clock: MapClock): void {
    const phase = stepOf(clock, BOB_MS, 2);
    if (phase === this.bobPhase) return;
    this.bobPhase = phase;
    for (const sp of this.units.values()) sp.img.y = TILE - (sp.idle ? phase : 0);
  }

  /** Gira una unidad hacia un lado (y la deja asi). */
  face(uid: number, dir: Facing): void {
    this.facing.set(uid, dir);
    const sp = this.units.get(uid);
    if (sp) sp.img.setFlipX(faceFlip(sp.team, dir));
  }

  facingOf(uid: number, team: 0 | 1): Facing {
    return this.facing.get(uid) ?? baseFacing(team);
  }

  /** Sprite (contenedor) de una unidad tal como esta dibujada ahora, si se ve. */
  sprite(uid: number): Phaser.GameObjects.Container | null {
    return this.units.get(uid)?.root ?? null;
  }

  /** Imagen de la unidad dibujada en una casilla (antes de volver a pintar), para efectos. */
  keyAt(p: Pos): string | null {
    for (const sp of this.units.values()) if (sp.root.x === p.x * TILE && sp.root.y === p.y * TILE && sp.root.visible) return sp.key;
    return null;
  }
}
