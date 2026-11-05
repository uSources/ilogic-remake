import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../../atlas';
import { TILE } from '../../layout';
import { sideLetter } from '../sides';
import type { MapLayer } from './layer';
import type { ViewOptions } from './viewOptions';

/** Pie del mastil del banderin de un punto de control: por encima del borde de abajo de la casilla. */
const CONTROL_FLAG_LIFT = 4;
/** Banderin de una orden: el mastil un poco por debajo del centro de la casilla. */
const ORDER_FLAG_DROP = 4;

/** Imagenes que se reutilizan: crece cuando hacen falta mas y esconde las que sobran. */
class ImagePool {
  private readonly imgs: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly frame: string,
    private readonly originX: number,
  ) {}

  sync<T>(items: readonly T[], place: (img: Phaser.GameObjects.Image, item: T) => void): void {
    while (this.imgs.length < items.length) {
      const img = this.scene.add.image(0, 0, ATLAS, this.frame).setOrigin(this.originX, 1);
      this.parent.add(img);
      this.imgs.push(img);
    }
    this.imgs.forEach((img, i) => {
      const item = items[i];
      img.setVisible(!!item);
      if (item) place(img, item);
    });
  }
}

/**
 * [CAMBIO] Banderines dibujados (ui/flag_*): el de cada punto de control, del color de su dueño, y
 * el del destino de cada orden de varios turnos. Encima de la zona y debajo de las unidades. Si
 * faltan en el atlas, la capa de resaltados los dibuja con pixeles (ver map/zones.ts y map/orders.ts).
 */
export class FlagLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  private readonly control: ImagePool;
  private readonly orders: ImagePool;

  constructor(private readonly scene: Phaser.Scene) {
    this.object = scene.add.container(0, 0);
    this.control = new ImagePool(scene, this.object, 'ui/flag_i', 0.5);
    this.orders = new ImagePool(scene, this.object, 'ui/flag_cmd_go', 0.25);
  }

  sync(opts: ViewOptions): void {
    const tex = this.scene.textures;
    // Un banderin por punto de control, del color de su dueño (gris si no es de nadie), en la casilla central.
    this.control.sync(hasImage(tex, 'ui/flag_b') ? (opts.controlPoints ?? []) : [], (img, c) => {
      img.setTexture(ATLAS, `ui/flag_${sideLetter(c.owner)}`);
      img.setPosition(c.x * TILE + TILE / 2, (c.y + 1) * TILE - CONTROL_FLAG_LIFT);
    });
    // Banderin del color de la orden en el destino (dorado si solo es "ir alli"); el mastil en el centro.
    this.orders.sync(hasImage(tex, 'ui/flag_cmd_go') ? (opts.orders ?? []) : [], (img, o) => {
      img.setTexture(ATLAS, `ui/flag_cmd_${o.kind ?? 'go'}`);
      img.setPosition(o.to.x * TILE + TILE / 2, o.to.y * TILE + TILE / 2 + ORDER_FLAG_DROP);
    });
  }
}
