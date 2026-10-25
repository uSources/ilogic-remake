import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from '../layout';
import { settings, t } from '../settings';
import { bar, C, lifeColor, panelBg, textStyle } from './theme';

// ---------------------------------------------------------------------------
// Menu emergente (acciones de unidad, menu de partida, compra, carga)
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  /** Texto a la derecha (precio, atajo...). */
  hint?: string;
  /** Imagen pequena a la izquierda (sprite de unidad). */
  icon?: string;
  disabled?: boolean;
  /** Color del texto (por ejemplo rojo para "Disolver"). */
  color?: string;
  /** Linea de detalle que se muestra al pie cuando este elemento esta seleccionado. */
  detail?: string;
}

const ROW_H = 30;
const ICON_ROW_H = 40;
const PAD = 8;

export class PopMenu {
  readonly root: Phaser.GameObjects.Container;
  private items: MenuItem[] = [];
  private rows: Phaser.Geom.Rectangle[] = [];
  private box = new Phaser.Geom.Rectangle();
  private selected = 0;
  private anchor = { x: 0, y: 0 };
  private title?: string;
  visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(40);
  }

  show(items: MenuItem[], anchor: { x: number; y: number }, selected: number, title?: string): void {
    this.items = items;
    this.anchor = anchor;
    this.selected = selected;
    this.title = title;
    this.visible = true;
    this.draw();
    // Pequena animacion de aparicion.
    this.root.setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 90 });
  }

  hide(): void {
    this.visible = false;
    this.root.removeAll(true);
  }

  select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    if (this.visible) this.draw();
  }

  /** Indice del elemento bajo un punto de la pantalla, o null. */
  hit(px: number, py: number): number | null {
    if (!this.visible) return null;
    const i = this.rows.findIndex((r) => r.contains(px, py));
    return i >= 0 ? i : null;
  }

  contains(px: number, py: number): boolean {
    return this.visible && this.box.contains(px, py);
  }

  private draw(): void {
    const s = this.scene;
    this.root.removeAll(true);
    const withIcons = this.items.some((it) => it.icon);
    const rowH = withIcons ? ICON_ROW_H : ROW_H;
    // Medir anchos.
    const probe = s.add.text(0, 0, '', textStyle(16));
    let labelW = 0,
      hintW = 0;
    for (const it of this.items) {
      probe.setText(it.label);
      labelW = Math.max(labelW, probe.width);
      if (it.hint) {
        probe.setText(it.hint);
        hintW = Math.max(hintW, probe.width);
      }
    }
    const details = this.items.map((it) => it.detail).filter((d): d is string => !!d);
    let detailW = 0;
    probe.setStyle(textStyle(13));
    for (const d of details) {
      probe.setText(d);
      detailW = Math.max(detailW, probe.width);
    }
    probe.destroy();
    const iconW = withIcons ? 40 : 0;
    const w = Math.max(150, Math.ceil(PAD * 2 + iconW + labelW + (hintW ? hintW + 18 : 0) + 12), detailW + PAD * 2 + 4);
    const titleH = this.title ? 28 : 0;
    const footerH = details.length ? 26 : 0;
    const h = PAD * 2 + titleH + rowH * this.items.length + footerH;

    // Posicion: a la derecha del ancla; si no cabe, a la izquierda. Siempre dentro de la pantalla.
    let x = this.anchor.x + 26;
    if (x + w > SCREEN_W - 8) x = this.anchor.x - 26 - w;
    x = Phaser.Math.Clamp(x, 8, SCREEN_W - 8 - w);
    let y = this.anchor.y - h / 2;
    y = Phaser.Math.Clamp(y, 56, SCREEN_H - 8 - h);
    this.box.setTo(x, y, w, h);

    const objs: Phaser.GameObjects.GameObject[] = [panelBg(s, x, y, w, h, { radius: 10 })];
    let cy = y + PAD;
    if (this.title) {
      objs.push(s.add.text(x + PAD + 4, cy + 2, this.title, textStyle(14, C.muted)));
      cy += titleH;
    }
    this.rows = [];
    this.items.forEach((it, i) => {
      const r = new Phaser.Geom.Rectangle(x + 4, cy, w - 8, rowH);
      this.rows.push(r);
      if (i === this.selected) {
        const g = s.add.graphics();
        g.fillStyle(it.disabled ? C.hover : C.selected, it.disabled ? 0.8 : 1);
        g.fillRoundedRect(r.x, r.y + 1, r.width, r.height - 2, 6);
        objs.push(g);
      }
      let tx = x + PAD + 4;
      if (it.icon) {
        const img = s.add.image(tx, cy + rowH / 2, it.icon).setOrigin(0, 0.5).setDisplaySize(32, 32);
        if (it.disabled) img.setAlpha(0.7);
        objs.push(img);
        tx += iconW;
      }
      const color = it.disabled ? C.dim : (it.color ?? C.text);
      objs.push(s.add.text(tx, cy + rowH / 2, it.label, textStyle(16, color)).setOrigin(0, 0.5));
      if (it.hint) {
        objs.push(
          s.add
            .text(x + w - PAD - 4, cy + rowH / 2, it.hint, textStyle(15, it.disabled ? C.dim : C.gold))
            .setOrigin(1, 0.5),
        );
      }
      cy += rowH;
    });
    const sel = this.items[this.selected];
    if (footerH && sel?.detail) {
      const g = s.add.graphics();
      g.lineStyle(1, C.border, 1);
      g.lineBetween(x + 8, cy + 3, x + w - 8, cy + 3);
      objs.push(g, s.add.text(x + PAD + 2, cy + 8, sel.detail, textStyle(13, C.muted)));
    }
    this.root.add(objs);
  }
}

// ---------------------------------------------------------------------------
// Barra superior
// ---------------------------------------------------------------------------

export type TopBarHit = 'endTurn' | 'menu' | null;

export class TopBar {
  readonly root: Phaser.GameObjects.Container;
  private endBtn = new Phaser.Geom.Rectangle();
  private menuBtn = new Phaser.Geom.Rectangle();
  private hover: TopBarHit = null;
  private last = { funds: -1, day: -1, playerTurn: true, hover: null as TopBarHit };

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(30);
  }

  hit(px: number, py: number): TopBarHit {
    if (this.endBtn.contains(px, py)) return 'endTurn';
    if (this.menuBtn.contains(px, py)) return 'menu';
    return null;
  }

  setHover(h: TopBarHit): void {
    if (h === this.hover) return;
    this.hover = h;
    this.draw(this.last.funds, this.last.day, this.last.playerTurn, true);
  }

  draw(funds: number, day: number, playerTurn: boolean, force = false): void {
    const l = this.last;
    if (!force && l.funds === funds && l.day === day && l.playerTurn === playerTurn) return;
    this.last = { funds, day, playerTurn, hover: this.hover };
    const s = this.scene;
    this.root.removeAll(true);
    const objs: Phaser.GameObjects.GameObject[] = [];

    // Izquierda: fondos y dia.
    const fundsText = s.add.text(0, 0, funds.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US'), textStyle(20, C.gold, true));
    const dayText = s.add.text(0, 0, `${t('day')} ${day}`, textStyle(16, C.muted));
    const leftW = 12 + 28 + 8 + fundsText.width + 18 + dayText.width + 14;
    objs.push(panelBg(s, 10, 10, leftW, 40, { radius: 10 }));
    objs.push(s.add.image(22, 30, 'currency').setOrigin(0, 0.5).setDisplaySize(28, 28));
    fundsText.setPosition(22 + 28 + 8, 30).setOrigin(0, 0.5);
    const sep = s.add.graphics().lineStyle(1, C.border, 1).lineBetween(fundsText.x + fundsText.width + 9, 18, fundsText.x + fundsText.width + 9, 42);
    dayText.setPosition(fundsText.x + fundsText.width + 18, 30).setOrigin(0, 0.5);
    objs.push(fundsText, sep, dayText);

    // Derecha: boton de menu, boton de fin de turno (o indicador de turno enemigo).
    const menuW = 40;
    this.menuBtn.setTo(SCREEN_W - 10 - menuW, 10, menuW, 40);
    objs.push(panelBg(s, this.menuBtn.x, 10, menuW, 40, { radius: 10, fill: this.hover === 'menu' ? C.hover : C.panel }));
    const mg = s.add.graphics().fillStyle(0xe8edf2, 1);
    for (let i = 0; i < 3; i++) mg.fillRoundedRect(this.menuBtn.x + 12, 21 + i * 7, 16, 3, 1.5);
    objs.push(mg);

    if (playerTurn) {
      const label = s.add.text(0, 30, t('endTurn'), textStyle(17, '#ffffff', true)).setOrigin(0, 0.5);
      const bw = label.width + 30;
      this.endBtn.setTo(this.menuBtn.x - 8 - bw, 10, bw, 40);
      objs.push(panelBg(s, this.endBtn.x, 10, bw, 40, { radius: 10, fill: this.hover === 'endTurn' ? 0x4bb0ff : C.blue, alpha: 1, border: 0x9fd2ff }));
      label.setX(this.endBtn.x + 15);
      objs.push(label);
    } else {
      const label = s.add.text(0, 30, t('enemyTurn'), textStyle(16, '#ffffff', true)).setOrigin(0, 0.5);
      const bw = label.width + 30;
      this.endBtn.setTo(0, 0, 0, 0);
      const bx = this.menuBtn.x - 8 - bw;
      objs.push(panelBg(s, bx, 10, bw, 40, { radius: 10, fill: C.red, alpha: 1, border: 0xffb0b2 }));
      label.setX(bx + 15);
      objs.push(label);
    }
    this.root.add(objs);
  }
}

// ---------------------------------------------------------------------------
// Ficha de informacion de la casilla
// ---------------------------------------------------------------------------

export interface InfoSpec {
  terrain: { name: string; defense: number };
  building?: { name: string; owner: string; ownerColor: string; income: number; icon: string | null };
  unit?: {
    icon: string | null;
    name: string;
    teamColor: string;
    teamLabel: string;
    life: number;
    fuel?: { now: number; max: number };
    ammo?: { now: number; max: number };
    stats: string;
    cargo?: string;
  };
}

export class InfoCard {
  readonly root: Phaser.GameObjects.Container;
  private lastKey = '';
  private side: 'left' | 'right' = 'left';

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(30);
  }

  /** Se coloca abajo a la izquierda, o a la derecha si el cursor esta en esa esquina. */
  show(spec: InfoSpec | null, cursorScreen: { x: number; y: number }): void {
    const side = cursorScreen.x < 300 && cursorScreen.y > SCREEN_H - 220 ? 'right' : 'left';
    const k = JSON.stringify(spec) + side;
    if (k === this.lastKey) return;
    this.lastKey = k;
    this.side = side;
    this.root.removeAll(true);
    if (!spec) return;
    const s = this.scene;
    const W = 236;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const lines: ((x: number, y: number) => number)[] = [];

    if (spec.unit) {
      const u = spec.unit;
      lines.push((x, y) => {
        const strip = s.add.graphics().fillStyle(Phaser.Display.Color.HexStringToColor(u.teamColor).color, 1);
        strip.fillRoundedRect(x, y, 4, 44, 2);
        objs.push(strip);
        if (u.icon) objs.push(s.add.image(x + 12, y + 22, u.icon).setOrigin(0, 0.5).setDisplaySize(40, 40));
        objs.push(s.add.text(x + 60, y + 2, u.name, textStyle(17, C.text, true)));
        objs.push(s.add.text(x + 60, y + 24, u.teamLabel, textStyle(13, u.teamColor)));
        return 50;
      });
      lines.push((x, y) => this.meter(objs, x, y, t('hp'), u.life, 100, lifeColor(u.life / 100), `${u.life}`));
      if (u.fuel) lines.push((x, y) => this.meter(objs, x, y, t('fuel'), u.fuel!.now, u.fuel!.max, 0xf5a623, `${u.fuel!.now}`));
      if (u.ammo) lines.push((x, y) => this.meter(objs, x, y, t('ammo'), u.ammo!.now, u.ammo!.max, 0xc9d1dc, `${u.ammo!.now}`));
      lines.push((x, y) => {
        objs.push(s.add.text(x, y + 2, u.stats, textStyle(13, C.muted)));
        return 20;
      });
      if (u.cargo)
        lines.push((x, y) => {
          objs.push(s.add.text(x, y + 2, u.cargo!, textStyle(13, '#7ee8de')));
          return 20;
        });
      lines.push(() => 6);
    }
    if (spec.building) {
      const b = spec.building;
      lines.push((x, y) => {
        if (b.icon) objs.push(s.add.image(x, y + 14, b.icon).setOrigin(0, 0.5).setDisplaySize(28, 28));
        objs.push(s.add.text(x + 36, y + 1, b.name, textStyle(15, C.text, true)));
        objs.push(s.add.text(x + 36, y + 18, `${b.owner} · ${t('income')} +${b.income}`, textStyle(13, b.ownerColor)));
        return 38;
      });
    }
    lines.push((x, y) => {
      const name = s.add.text(x, y + 1, spec.terrain.name, textStyle(14, C.text));
      const stars = Math.round(spec.terrain.defense / 10);
      const starText = `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 4 - stars))}`;
      const def = s.add.text(x + W - 24, y + 1, `${t('defense')} ${starText}`, textStyle(13, C.muted)).setOrigin(1, 0);
      // Si no cabe con la etiqueta, solo las estrellas.
      if (name.width + def.width + 10 > W - 24) def.setText(starText);
      objs.push(name, def);
      return 20;
    });

    // Pintar el contenido desde y=0, medir el alto y bajarlo a su sitio.
    const pad = 12;
    const x0 = this.side === 'left' ? 10 : SCREEN_W - 10 - W;
    let y = 0;
    for (const draw of lines) y += draw(x0 + pad, y + pad);
    const h = y + pad * 2 - 6;
    const y0 = SCREEN_H - 10 - h;
    for (const o of objs) (o as unknown as { y: number }).y += y0;
    this.root.add([panelBg(s, x0, y0, W, h, { radius: 10 }), ...objs]);
  }

  private meter(
    objs: Phaser.GameObjects.GameObject[],
    x: number,
    y: number,
    label: string,
    now: number,
    max: number,
    color: number,
    value: string,
  ): number {
    const s = this.scene;
    objs.push(s.add.text(x, y + 1, label, textStyle(13, C.muted)));
    objs.push(bar(s, x + 52, y + 6, 130, 8, max ? now / max : 0, color));
    objs.push(s.add.text(x + 212, y + 1, value, textStyle(13, C.text)).setOrigin(1, 0));
    return 20;
  }
}

// ---------------------------------------------------------------------------
// Bocadillo (vista previa de ataque), cartel de turno y avisos
// ---------------------------------------------------------------------------

export class Tooltip {
  readonly root: Phaser.GameObjects.Container;
  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(45);
  }
  show(lines: { text: string; color?: string; size?: number }[], at: { x: number; y: number }): void {
    this.root.removeAll(true);
    const s = this.scene;
    const texts = lines.map((l) => s.add.text(0, 0, l.text, textStyle(l.size ?? 14, l.color ?? C.text)));
    const w = Math.max(...texts.map((tx) => tx.width)) + 20;
    const h = texts.reduce((a, tx) => a + tx.height, 0) + 14;
    let x = at.x - w / 2;
    let y = at.y - 30 - h;
    if (y < 56) y = at.y + 30;
    x = Phaser.Math.Clamp(x, 8, SCREEN_W - 8 - w);
    let cy = y + 7;
    for (const tx of texts) {
      tx.setPosition(x + 10, cy);
      cy += tx.height;
    }
    this.root.add([panelBg(s, x, y, w, h, { radius: 8 }), ...texts]);
  }
  hide(): void {
    this.root.removeAll(true);
  }
}

export class Banner {
  readonly root: Phaser.GameObjects.Container;
  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(50).setVisible(false);
  }
  show(small: string, big: string, color: number): void {
    const s = this.scene;
    this.root.removeAll(true);
    const cy = SCREEN_H / 2;
    const band = s.add.graphics();
    band.fillStyle(0x05080c, 0.78);
    band.fillRect(0, cy - 46, SCREEN_W, 92);
    band.fillStyle(color, 1);
    band.fillRect(0, cy - 46, SCREEN_W, 3);
    band.fillRect(0, cy + 43, SCREEN_W, 3);
    const a = s.add.text(SCREEN_W / 2, cy - 18, small, textStyle(18, C.muted)).setOrigin(0.5);
    const b = s.add.text(SCREEN_W / 2, cy + 12, big, textStyle(36, '#ffffff', true)).setOrigin(0.5);
    this.root.add([band, a, b]).setVisible(true).setAlpha(0);
    this.scene.tweens.killTweensOf(this.root);
    b.setX(SCREEN_W / 2 - 40);
    s.tweens.add({ targets: b, x: SCREEN_W / 2, duration: 260, ease: 'Cubic.easeOut' });
    s.tweens.chain({
      targets: this.root,
      tweens: [
        { alpha: 1, duration: 160 },
        { alpha: 0, delay: 850, duration: 260, onComplete: () => this.root.setVisible(false) },
      ],
    });
  }
}

export class Toast {
  readonly root: Phaser.GameObjects.Container;
  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(55);
  }
  show(msg: string, ms = 1800): void {
    const s = this.scene;
    this.root.removeAll(true);
    const tx = s.add.text(SCREEN_W / 2, 74, msg, textStyle(16)).setOrigin(0.5);
    const w = tx.width + 28;
    this.root.add([panelBg(s, SCREEN_W / 2 - w / 2, 74 - 17, w, 34, { radius: 17 }), tx]).setAlpha(1);
    s.tweens.killTweensOf(this.root);
    s.tweens.add({ targets: this.root, alpha: 0, delay: ms, duration: 300 });
  }
}

/** Linea de ayuda tenue, abajo en el centro. */
export class HintLine {
  readonly root: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene) {
    this.root = scene.add.text(SCREEN_W / 2, SCREEN_H - 14, '', textStyle(12, C.muted)).setOrigin(0.5, 1).setDepth(25).setAlpha(0.85);
    this.root.setShadow(1, 1, '#000000', 2, false, true);
  }
  set(text: string): void {
    if (this.root.text !== text) this.root.setText(text);
  }
}
