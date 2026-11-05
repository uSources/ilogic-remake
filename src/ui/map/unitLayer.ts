import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../../atlas';
import { rank, unhealable } from '../../core/rules';
import { effectiveStandingOrder, isDetached } from '../../core/squads';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { TILE } from '../../layout';
import { addLifeTextures, lifeKey } from '../lifeDigits';
import { PAL, PAL_MAP } from '../palette';
import { sideOf, type Side } from '../sides';
import { unitKey } from '../sprites';
import { frontKey } from '../terrainArt';
import { stepOf, type AnimatedLayer, type MapClock, type MapLayer } from './layer';
import { fitToTile } from './tileImage';
import { BADGE_SLOTS, drawUnitMarks, markSignature } from './unitMarks';
import type { ViewOptions } from './viewOptions';

/** Hacia donde mira una unidad. Los dibujos azules miran a la derecha y los rojos a la izquierda. */
export type Facing = 'left' | 'right';
export const baseFacing = (side: Side): Facing => (side === 'enemy' ? 'left' : 'right');
/** Hay que voltear el dibujo para que mire a `dir`. */
export const faceFlip = (side: Side, facing: Facing): boolean => facing !== baseFacing(side);

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
  order: Phaser.GameObjects.Image;
  /** [CAMBIO] Marcas dibujadas (ui/mk_*): sin cura, carga y hasta 3 estrellas; si faltan, van en `stars`. */
  badges: Phaser.GameObjects.Image[];
  /** Firma de lo dibujado en las marcas (`markSignature`). */
  marksDrawn: number;
  key: string;
  /** Unidad propia sin usar: se mueve un poco (animacion de espera). */
  idle: boolean;
  side: Side;
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
    const order = add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false);
    const badges = Array.from({ length: BADGE_SLOTS }, () => add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false));
    const root = add.container(0, 0, [img, front, life, cargo, stars, order, ...badges]);
    this.object.add(root);
    return { root, img, front, life, cargo, stars, order, badges, marksDrawn: 0, key, idle: false, side: 'own' };
  }

  sync(s: GameState, options: ViewOptions, newArt: boolean): void {
    const seen = new Set<number>();
    for (const unit of s.units) {
      if (unit.carrier !== null || options.hidden.has(unit.uid) || !options.vis.at(unit)) continue;
      const key = unitKey(this.scene.textures, s, unit, options.viewer);
      if (!key) continue;
      seen.add(unit.uid);
      this.update(this.spriteFor(unit.uid, key), unit, s, newArt, options.viewer);
    }
    for (const [uid, sprite] of this.units) {
      if (seen.has(uid)) continue;
      sprite.root.destroy();
      this.units.delete(uid);
    }
    // Las de mas abajo se dibujan encima (los sprites altos tapan la casilla de arriba).
    this.object.sort('y');
  }

  /** El sprite de una unidad con el dibujo `key`: lo crea la primera vez y le cambia el dibujo si hace falta. */
  private spriteFor(uid: number, key: string): UnitSprite {
    const existing = this.units.get(uid);
    if (!existing) {
      const created = this.newSprite(key);
      this.units.set(uid, created);
      return created;
    }
    if (existing.key !== key) {
      fitToTile(existing.img.setTexture(ATLAS, key));
      existing.key = key;
    }
    return existing;
  }

  private update(sprite: UnitSprite, unit: Unit, s: GameState, newArt: boolean, viewer: TeamId): void {
    sprite.root.setPosition(unit.x * TILE, unit.y * TILE);
    sprite.side = sideOf(s, viewer, unit.team);
    sprite.img.setFlipX(faceFlip(sprite.side, this.facingOf(unit.uid, sprite.side)));
    this.updateTerrainFront(sprite, newArt ? frontKey(s, unit) : null);
    updateLifeDigit(sprite, unit.life);
    this.updateMarks(sprite, unit, s);
    sprite.idle = sprite.side === 'own' && unit.active;
    sprite.img.y = TILE - (sprite.idle ? this.bobPhase : 0);
  }

  /** Integrar la unidad en el terreno (dibujo nuevo): bosque y montaña le tapan los pies y la oscurecen un poco. */
  private updateTerrainFront(sprite: UnitSprite, front: string | null): void {
    if (front && hasImage(this.scene.textures, front)) {
      sprite.front.setTexture(ATLAS, front).setVisible(true);
      const isWoods = front.includes('forest') || front.includes('tree');
      sprite.img.setTint(isWoods ? FRONT_TINT.forest : FRONT_TINT.rock);
      return;
    }
    sprite.front.setVisible(false);
    sprite.img.clearTint();
  }

  /** Estrellas, carga, sin cura y orden; solo se redibujan si han cambiado (ver markSignature). */
  private updateMarks(sprite: UnitSprite, unit: Unit, s: GameState): void {
    const textures = this.scene.textures;
    // Con las marcas dibujadas, la carga va abajo a la izquierda (junto a la de sin cura) y el
    // cuadradito turquesa de antes se esconde.
    const markArt = hasImage(textures, 'ui/mk_star');
    const hasCargo = unit.cargo.some((carried) => carried !== null);
    sprite.cargo.setVisible(!markArt && hasCargo);
    const marks = {
      rank: rank(unit),
      // [CAMBIO] Ha recibido un ataque hoy y no se curara esta noche (regla noHealUnderFire).
      noHeal: unit.life < 100 && unhealable(s, unit),
      cargo: hasCargo,
      // [CAMBIO] Ayudante: la orden que cumple (la suya o la de su escuadra) y si va destacada con otra.
      order: effectiveStandingOrder(s, unit)?.kind ?? null,
      detached: isDetached(s, unit),
    };
    const signature = markSignature(marks);
    if (signature === sprite.marksDrawn) return;
    sprite.marksDrawn = signature;
    drawUnitMarks(textures, sprite, marks, markArt);
  }

  /** Unidades propias sin usar: suben y bajan a saltos de 1 pixel. */
  tick(clock: MapClock): void {
    const phase = stepOf(clock, BOB_MS, 2);
    if (phase === this.bobPhase) return;
    this.bobPhase = phase;
    for (const sprite of this.units.values()) sprite.img.y = TILE - (sprite.idle ? phase : 0);
  }

  /** Gira una unidad hacia un lado (y la deja asi). */
  face(uid: number, facing: Facing): void {
    this.facing.set(uid, facing);
    const sprite = this.units.get(uid);
    if (sprite) sprite.img.setFlipX(faceFlip(sprite.side, facing));
  }

  facingOf(uid: number, side: Side): Facing {
    return this.facing.get(uid) ?? baseFacing(side);
  }

  /** Sprite (contenedor) de una unidad tal como esta dibujada ahora, si se ve. */
  sprite(uid: number): Phaser.GameObjects.Container | null {
    return this.units.get(uid)?.root ?? null;
  }

  /** Imagen de la unidad dibujada en una casilla (antes de volver a pintar), para efectos. */
  keyAt(pos: Pos): string | null {
    for (const { root, key } of this.units.values()) if (root.x === pos.x * TILE && root.y === pos.y * TILE && root.visible) return key;
    return null;
  }
}

/** Cifra de vida (decenas, 1-9) en la esquina; no se enseña con la vida llena. */
function updateLifeDigit(sprite: UnitSprite, life: number): void {
  const tens = Math.ceil(life / 10);
  const isShown = life < 100 && tens >= 1 && tens <= 9;
  sprite.life.setVisible(isShown);
  if (isShown) sprite.life.setTexture(lifeKey(tens));
}
