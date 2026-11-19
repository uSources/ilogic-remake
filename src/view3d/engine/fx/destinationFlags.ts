/**
 * Las banderas de destino (ports/orders.ts, `DestinationMarks`): una banderita de bloques, del color
 * propio, clavada en una esquina de la casilla a la que va cada unidad con orden, con la tela ondeando.
 * En la esquina, para no tapar lo que haya en la casilla (una unidad, un edificio). Solo dibuja donde
 * se le dice (lo decide systems/orders/destinationFlags.ts).
 */
import * as THREE from 'three';
import { posKey } from '../../../core/geom';
import type { Pos } from '../../../core/model';
import type { DestinationMarks } from '../../ports/orders';
import { buildModel, type BlockModel } from '../pieces/blocks';
import { SIDE_PAINT } from '../pieces/sidePaint';

/** La parte de la bandera que ondea (gira sobre el mastil). */
const CLOTH = 'cloth';

/** Un mastil de madera en su peana, con la tela del equipo (y una franja oscura) y un pomo claro arriba. */
const FLAG_MODEL: BlockModel = {
  blocks: [
    { size: [0.18, 0.05, 0.18], at: [0, 0, 0], paint: 'stone' },
    { size: [0.06, 0.8, 0.06], at: [0, 0.05, 0], paint: 'wood' },
    { size: [0.1, 0.1, 0.1], at: [0, 0.85, 0], paint: 'light' },
    { size: [0.42, 0.26, 0.04], at: [0.24, 0.57, 0], paint: 'team', part: CLOTH },
    { size: [0.42, 0.06, 0.046], at: [0.24, 0.57, 0], paint: 'teamDark', part: CLOTH },
  ],
};

/** Hacia que esquina de la casilla va (casillas desde el centro): la de atras a la izquierda, segun se mira. */
const CORNER = new THREE.Vector3(-0.32, 0, -0.32);
/** Cuanto gira la tela al ondear (radianes) y lo rapido (vueltas por segundo). */
const SWAY_ANGLE = 0.35;
const SWAY_SPEED = 0.6;
/** Desfase de cada bandera segun su casilla: que no ondeen todas a la vez. */
const PHASE_PER_TILE = 1.7;

/** Una bandera puesta: su objeto y lo que se mueve. */
interface PlacedFlag {
  readonly model: THREE.Group;
  readonly cloth: THREE.Object3D | undefined;
  readonly phase: number;
}

export class DestinationFlagsView implements DestinationMarks {
  readonly object = new THREE.Group();
  /** Por casilla (`posKey`): las que siguen igual no se rehacen tras cada accion. */
  private readonly flags = new Map<string, PlacedFlag>();
  private seconds = 0;

  constructor(private readonly groundOf: (pos: Pos) => THREE.Vector3) {}

  showFlags(tiles: readonly Pos[]): void {
    const wanted = new Map(tiles.map((pos) => [posKey(pos), pos]));
    for (const [key, flag] of this.flags) if (!wanted.has(key)) this.remove(key, flag);
    for (const [key, pos] of wanted) if (!this.flags.has(key)) this.add(key, pos);
    this.update(0);
  }

  /** Cada fotograma: la tela va y viene sobre el mastil. */
  update(deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    for (const flag of this.flags.values()) {
      if (!flag.cloth) continue;
      flag.cloth.rotation.y = Math.sin((this.seconds * SWAY_SPEED + flag.phase) * Math.PI * 2) * SWAY_ANGLE;
    }
  }

  private add(key: string, pos: Pos): void {
    const model = buildModel(FLAG_MODEL, SIDE_PAINT.own);
    model.position.copy(this.groundOf(pos)).add(CORNER);
    this.flags.set(key, { model, cloth: model.getObjectByName(CLOTH), phase: (pos.x + pos.y) * PHASE_PER_TILE });
    this.object.add(model);
  }

  /** Sus bloques son de geometria propia (los materiales se comparten: esos no). */
  private remove(key: string, flag: PlacedFlag): void {
    this.object.remove(flag.model);
    flag.model.traverse((part) => {
      if (isMesh(part)) part.geometry.dispose();
    });
    this.flags.delete(key);
  }
}

const isMesh = (part: THREE.Object3D): part is THREE.Mesh => part instanceof THREE.Mesh;
