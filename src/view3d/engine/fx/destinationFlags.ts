/**
 * Las banderas de destino (ports/orders.ts, `DestinationMarks`): una banderita de bloques, del color
 * propio, clavada en una esquina de la casilla a la que va cada unidad con orden, con la tela ondeando.
 * En la esquina, para no tapar lo que haya en la casilla (una unidad, un edificio). En la tela, el
 * dibujo de cada uno que va, sin fondo: la imagen de la unidad (con un reborde blanco, que no se pierda
 * en la tela del mismo color), la tecla de la escuadra o cuantos mas van (si no caben, la tela se alarga). Es un dibujo
 * plano que mira a la camara, como las chapas de las unidades (pieces/badges.ts): pintado en la tela,
 * desde arriba se veria achatado. Pero, como la bandera, lo tapa lo que tenga delante (un edificio, una
 * montaña). La tela gira sobre el mastil hacia la camara, como si el viento la llevara, para que el
 * dibujo quede siempre encima. Solo dibuja donde y lo que se le dice (lo decide
 * systems/orders/destinationFlags.ts).
 */
import * as THREE from 'three';
import type { GameImages } from '../../../atlas';
import { posKey } from '../../../core/geom';
import type { Pos } from '../../../core/model';
import type { DestinationFlag, DestinationMarks, FlagEmblem } from '../../ports/orders';
import { buildModel, type BlockModel } from '../pieces/blocks';
import { SIDE_PAINT } from '../pieces/sidePaint';

/** La parte de la bandera que ondea (gira sobre el mastil). */
const CLOTH = 'cloth';

/**
 * La tela: su alto, su grosor, la altura de su base, donde empieza (pegada al mastil) y lo menos que
 * mide de ancho. Alta para que el dibujo quepa: desde arriba, una tela de pie se ve achatada.
 */
const CLOTH_HEIGHT = 0.36;
const CLOTH_DEPTH = 0.04;
const CLOTH_BASE = 0.47;
const CLOTH_START = 0.03;
const CLOTH_MIN_WIDTH = 0.42;
/** La franja oscura de abajo de la tela (un poco mas gruesa, para que asome). */
const HEM_HEIGHT = 0.06;
const HEM_DEPTH = 0.046;

/** Un mastil de madera en su peana, con la tela del equipo (y una franja oscura) de ese ancho y un pomo claro arriba. */
function flagModel(clothWidth: number): BlockModel {
  const clothX = CLOTH_START + clothWidth / 2;
  return {
    blocks: [
      { size: [0.18, 0.05, 0.18], at: [0, 0, 0], paint: 'stone' },
      { size: [0.06, 0.8, 0.06], at: [0, 0.05, 0], paint: 'wood' },
      { size: [0.1, 0.1, 0.1], at: [0, 0.85, 0], paint: 'light' },
      { size: [clothWidth, CLOTH_HEIGHT, CLOTH_DEPTH], at: [clothX, CLOTH_BASE, 0], paint: 'team', part: CLOTH },
      { size: [clothWidth, HEM_HEIGHT, HEM_DEPTH], at: [clothX, CLOTH_BASE, 0], paint: 'teamDark', part: CLOTH },
    ],
  };
}

/** Los dibujos de la tela (casillas): su lado, lo que los separa y el borde de tela que les queda. */
const PATCH_SIZE = 0.24;
const PATCH_GAP = 0.03;
const PATCH_MARGIN = 0.03;
/** Su altura, en medio de la tela. */
const PATCH_MIDDLE = CLOTH_BASE + CLOTH_HEIGHT / 2;
/**
 * Lo que se adelanta cada dibujo hacia la camara (casillas): mira a la camara y la tela esta de pie, asi
 * que sin esto la tela le cortaria la mitad. En la pantalla sigue en el mismo sitio.
 */
const PATCH_LIFT = 0.22;
/** Lo que es transparente en el dibujo no tapa lo de detras (de 0 a 1). */
const PATCH_ALPHA_TEST = 0.5;

/** Lo que ocupan esos dibujos en fila. */
const rowWidth = (count: number): number => count * PATCH_SIZE + Math.max(0, count - 1) * PATCH_GAP;

/** El ancho de la tela: el de siempre, o mas si no caben los dibujos. */
const clothWidthFor = (count: number): number => Math.max(CLOTH_MIN_WIDTH, rowWidth(count) + PATCH_MARGIN * 2);

/** La imagen de la unidad (pixeles: los retratos, a su tamaño) y su reborde blanco; el lienzo, con sitio para el reborde. */
const PICTURE_PIXELS = 64;
const OUTLINE_PIXELS = 3;
const OUTLINE_COLOR = '#ffffff';
const PATCH_PIXELS = PICTURE_PIXELS + OUTLINE_PIXELS * 2;
/** La tecla de la escuadra y cuantos mas van (dos letras, mas pequeñas): en blanco con tinta, como las chapas (pieces/badges.ts). */
const LABEL_FONT = "bold 52px 'Silkscreen', monospace";
const MORE_FONT = "bold 36px 'Silkscreen', monospace";
const LABEL_TEXT = '#ffffff';
const LABEL_INK = '#2b2240';
const LABEL_INK_WIDTH = 8;

/** Hacia donde se corre la silueta para hacer el reborde: un circulo de radio OUTLINE_PIXELS. */
const OUTLINE_STEPS = Array.from({ length: OUTLINE_PIXELS * 2 + 1 }, (_, index) => index - OUTLINE_PIXELS);
const OUTLINE_OFFSETS = OUTLINE_STEPS.flatMap((x) =>
  OUTLINE_STEPS.filter((y) => x * x + y * y <= OUTLINE_PIXELS * OUTLINE_PIXELS).map((y) => ({ x, y })),
);

/** Hacia que esquina de la casilla va (casillas desde el centro): la de atras a la izquierda, segun se mira. */
const CORNER = new THREE.Vector3(-0.32, 0, -0.32);
/** Cuanto gira la tela al ondear (radianes) y lo rapido (vueltas por segundo). */
const SWAY_ANGLE = 0.35;
const SWAY_SPEED = 0.6;
/** Desfase de cada bandera segun su casilla: que no ondeen todas a la vez. */
const PHASE_PER_TILE = 1.7;
const UP = new THREE.Vector3(0, 1, 0);

/** Lo que se escribe en un dibujo y con que letra. */
interface Label {
  readonly text: string;
  readonly font: string;
}

/** Un dibujo que es texto: la tecla de una escuadra o cuantos mas van. */
type TextEmblem = Exclude<FlagEmblem, { kind: 'unit' }>;

const labelOf = (emblem: TextEmblem): Label =>
  emblem.kind === 'squad' ? { text: emblem.label, font: LABEL_FONT } : { text: `+${emblem.count}`, font: MORE_FONT };

/**
 * Como se ve un dibujo: los que se ven igual comparten material. No dice quien va (dos escuadras sin
 * tecla con la misma inicial se ven igual): eso lo decide el sistema.
 */
const emblemLook = (emblem: FlagEmblem): string => (emblem.kind === 'unit' ? emblem.image : `${emblem.kind}:${labelOf(emblem).text}`);

/** Como se ve una bandera: si cambia, se rehace. */
const lookOf = (flag: DestinationFlag | undefined): string | undefined => flag?.emblems.map(emblemLook).join('|');

/** Un dibujo de la tela y su sitio en ella (antes de adelantarlo hacia la camara). */
interface Patch {
  readonly sprite: THREE.Sprite;
  readonly anchor: THREE.Vector3;
}

/** Una bandera puesta: su objeto, lo que se mueve y quien va. */
interface PlacedFlag {
  readonly model: THREE.Group;
  readonly cloth: THREE.Object3D | undefined;
  readonly patches: readonly Patch[];
  readonly phase: number;
  readonly look: string;
}

export class DestinationFlagsView implements DestinationMarks {
  readonly object = new THREE.Group();
  /** Por casilla (`posKey`): las que siguen igual no se rehacen tras cada accion. */
  private readonly flags = new Map<string, PlacedFlag>();
  /** Un material por dibujo distinto (hay pocos: los tipos de unidad y las escuadras). */
  private readonly patchMaterials = new Map<string, THREE.SpriteMaterial>();
  private seconds = 0;
  /** Donde esta la camara: hacia alli se vuelve la tela. */
  private readonly cameraAt = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();

  constructor(
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
    private readonly images: GameImages,
  ) {}

  showFlags(flags: readonly DestinationFlag[]): void {
    const wanted = new Map(flags.map((flag) => [posKey(flag.at), flag]));
    for (const [key, placed] of this.flags) if (placed.look !== lookOf(wanted.get(key))) this.remove(key, placed);
    for (const [key, flag] of wanted) if (!this.flags.has(key)) this.add(key, flag);
    this.update(0, this.cameraAt);
  }

  /** Cada fotograma, con la camara donde este: las telas ondean vueltas hacia ella. */
  update(deltaSeconds: number, cameraAt: THREE.Vector3): void {
    this.seconds += deltaSeconds;
    this.cameraAt.copy(cameraAt);
    for (const flag of this.flags.values()) this.wave(flag);
  }

  /** La tela, vuelta hacia la camara, va y viene sobre el mastil; sus dibujos, adelantados hacia la camara. */
  private wave(flag: PlacedFlag): void {
    if (!flag.cloth) return;
    const sway = Math.sin((this.seconds * SWAY_SPEED + flag.phase) * Math.PI * 2) * SWAY_ANGLE;
    const toCamera = this.toCamera.subVectors(this.cameraAt, flag.model.position);
    toCamera.y -= PATCH_MIDDLE;
    const turn = Math.atan2(toCamera.x, toCamera.z) + sway;
    flag.cloth.rotation.y = turn;
    // Hacia la camara, visto desde la tela (que esta girada).
    toCamera.normalize().applyAxisAngle(UP, -turn);
    for (const { sprite, anchor } of flag.patches) sprite.position.copy(anchor).addScaledVector(toCamera, PATCH_LIFT);
  }

  private add(key: string, flag: DestinationFlag): void {
    const clothWidth = clothWidthFor(flag.emblems.length);
    const model = buildModel(flagModel(clothWidth), SIDE_PAINT.own);
    const cloth = model.getObjectByName(CLOTH);
    const patches = this.patchesFor(flag.emblems, clothWidth);
    for (const { sprite } of patches) cloth?.add(sprite);
    model.position.copy(this.groundOf(flag.at)).add(CORNER);
    this.flags.set(key, { model, cloth, patches, phase: (flag.at.x + flag.at.y) * PHASE_PER_TILE, look: lookOf(flag) ?? '' });
    this.object.add(model);
  }

  /** Un dibujo por cada uno que va, en fila en el centro de la tela. */
  private patchesFor(emblems: readonly FlagEmblem[], clothWidth: number): Patch[] {
    const firstX = CLOTH_START + clothWidth / 2 - rowWidth(emblems.length) / 2 + PATCH_SIZE / 2;
    return emblems.map((emblem, index) => {
      const sprite = new THREE.Sprite(this.patchMaterial(emblem));
      sprite.scale.set(PATCH_SIZE, PATCH_SIZE, 1);
      return { sprite, anchor: new THREE.Vector3(firstX + index * (PATCH_SIZE + PATCH_GAP), PATCH_MIDDLE, 0) };
    });
  }

  private patchMaterial(emblem: FlagEmblem): THREE.SpriteMaterial {
    const look = emblemLook(emblem);
    let material = this.patchMaterials.get(look);
    if (!material) {
      material = this.newPatchMaterial(emblem);
      this.patchMaterials.set(look, material);
    }
    return material;
  }

  /**
   * El material de un dibujo. Si es texto y su letra aun no ha cargado, se pinta con la de reserva y se
   * vuelve a pintar cuando cargue (si no, se quedaria con la de reserva toda la partida).
   */
  private newPatchMaterial(emblem: FlagEmblem): THREE.SpriteMaterial {
    const { canvas, draw } = newCanvas(PATCH_PIXELS);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    const paint = (): void => {
      this.paintPatch(draw, emblem);
      texture.needsUpdate = true;
    };
    paint();
    if (emblem.kind !== 'unit') whenFontLoads(labelOf(emblem).font, paint);
    return new THREE.SpriteMaterial({ map: texture, alphaTest: PATCH_ALPHA_TEST });
  }

  /** El dibujo, sin fondo (borra lo que hubiera): la imagen de la unidad o su texto. */
  private paintPatch(draw: CanvasRenderingContext2D, emblem: FlagEmblem): void {
    draw.clearRect(0, 0, PATCH_PIXELS, PATCH_PIXELS);
    if (emblem.kind === 'unit') drawOutlined(draw, this.pictureOf(emblem.image));
    else drawLabel(draw, labelOf(emblem));
  }

  /** La imagen de la unidad sin suavizar (pixel art: la de 32 sale al doble). */
  private pictureOf(image: string): HTMLCanvasElement {
    const { canvas, draw } = newCanvas(PICTURE_PIXELS);
    draw.imageSmoothingEnabled = false;
    this.images.draw(draw, image, 0, 0, PICTURE_PIXELS, PICTURE_PIXELS);
    return canvas;
  }

  /** Sus bloques son de geometria propia (los materiales y los dibujos, chapas de three.js, se comparten: esos no). */
  private remove(key: string, flag: PlacedFlag): void {
    this.object.remove(flag.model);
    flag.model.traverse((part) => {
      if (isMesh(part)) part.geometry.dispose();
    });
    this.flags.delete(key);
  }
}

/** Un lienzo cuadrado y su pincel. */
function newCanvas(pixels: number): { canvas: HTMLCanvasElement; draw: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('Sin lienzo 2D para los dibujos de las banderas (¿demasiados lienzos abiertos?)');
  return { canvas, draw };
}

/** Llama a `repaint` cuando cargue esa letra, si aun no ha cargado (un lienzo pinta con la de reserva mientras tanto). */
function whenFontLoads(font: string, repaint: () => void): void {
  if (document.fonts.check(font)) return;
  document.fonts
    .load(font)
    .then(repaint)
    .catch((error: unknown) => console.warn('No ha cargado la letra', font, error));
}

/** La imagen con su reborde: la silueta en blanco corrida alrededor y, encima, la imagen. */
function drawOutlined(draw: CanvasRenderingContext2D, picture: HTMLCanvasElement): void {
  const silhouette = silhouetteOf(picture, OUTLINE_COLOR);
  for (const { x, y } of OUTLINE_OFFSETS) draw.drawImage(silhouette, OUTLINE_PIXELS + x, OUTLINE_PIXELS + y);
  draw.drawImage(picture, OUTLINE_PIXELS, OUTLINE_PIXELS);
}

/** La silueta de un dibujo, toda de un color (lo que no es transparente). */
function silhouetteOf(picture: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const { canvas, draw } = newCanvas(picture.width);
  draw.drawImage(picture, 0, 0);
  draw.globalCompositeOperation = 'source-in';
  draw.fillStyle = color;
  draw.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** El texto, en blanco con tinta alrededor (se lee sobre la tela). */
function drawLabel(draw: CanvasRenderingContext2D, { text, font }: Label): void {
  const middle = PATCH_PIXELS / 2;
  draw.font = font;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.lineJoin = 'round';
  draw.lineWidth = LABEL_INK_WIDTH;
  draw.strokeStyle = LABEL_INK;
  draw.strokeText(text, middle, middle + 2);
  draw.fillStyle = LABEL_TEXT;
  draw.fillText(text, middle, middle + 2);
}

const isMesh = (part: THREE.Object3D): part is THREE.Mesh => part instanceof THREE.Mesh;
