/**
 * Animar lo que ya ha pasado: las reglas cambian el estado y devuelven eventos (GameEvent) y aqui
 * solo se cuentan (moverse, combatir, capturar, comprar, habilidades del general). Lo usan el turno
 * del jugador, el de la IA, su repeticion y el laboratorio.
 */
import type Phaser from 'phaser';
import { MoveType, Movement, UNIT_ART, MAP_H, MAP_W } from '../../core/data';
import { abilityArea, areaTiles, generalOf } from '../../core/generals';
import { unitAt, unitById } from '../../core/rules';
import type { GameEvent, GameState, Pos } from '../../core/types';
import { showToast, ui } from '../../hud/store';
import { TILE } from '../../layout';
import { fmtNum, settings, t } from '../../settings';
import {
  debris,
  facingToward,
  hitFlash,
  impact,
  muzzleFlash,
  popNumber,
  projectile,
  recoil,
  shotKind,
  tag,
  type ShotKind,
} from '../../ui/combatFx';
import { blink, burst, center, COLORS, floatText, lifeBar, playAnim, targetMark, tileFlash } from '../../ui/fx';
import { baseFacing, faceFlip, type MapView } from '../../ui/mapView';
import { combatVM } from '../../ui/hudModels';
import { PAL, PAL_CSS } from '../../ui/palette';
import { unitKey } from '../../ui/sprites';
import { STEP_MS, type Phase } from './types';

/** Lo que el reproductor necesita de la escena. */
export interface PlaybackHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (cambia al deshacer o al repetir el turno enemigo: se lee cada vez). */
  readonly state: GameState;
  phase: Phase;
  /** Saltarse las animaciones (Enter durante el turno enemigo, velocidad instantanea). */
  fastForward: boolean;
  readonly enemyPlaying: boolean;
  readonly replaying: boolean;
  /** Unidades que no se dibujan (las que se estan animando aparte). */
  readonly hidden: Set<number>;
  /** El jugador ve esa casilla. */
  visible(p: Pos): boolean;
  refresh(): void;
  refreshHud(): void;
  /** Cada evento, antes de animarlo (deshacer, estadisticas, tutorial, ultima jugada). */
  noteEvent(ev: GameEvent): void;
}

export class EventPlayer {
  constructor(private readonly h: PlaybackHost) {}

  private get sc(): Phaser.Scene {
    return this.h.scene;
  }
  private get s(): GameState {
    return this.h.state;
  }
  private get view(): MapView {
    return this.h.view;
  }
  private get fastForward(): boolean {
    return this.h.fastForward;
  }
  private set fastForward(v: boolean) {
    this.h.fastForward = v;
  }
  private visibleToPlayer(p: Pos): boolean {
    return this.h.visible(p);
  }

  /** Milisegundos por casilla al mover, segun la velocidad elegida (tuyas o del enemigo). */
  stepMs(): number {
    const sp = this.h.enemyPlaying ? settings.speedEnemy : settings.speedOwn;
    return sp === 'instant' ? 1 : sp === 'fast' ? Math.round(STEP_MS / 2) : STEP_MS;
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.sc.time.delayedCall(ms, resolve));
  }

  /** Lleva la camara a una casilla si no se ve bien, y espera a que llegue. */
  async lookAt(p: Pos): Promise<void> {
    if (!this.visibleToPlayer(p) || this.view.isOnScreen(p, 2)) return;
    this.view.ensureVisible(p, 4);
    await this.wait(this.fastForward ? 0 : 180);
  }

  /** Anima eventos (movimiento, ataque...) y vuelve a dibujar al terminar. */
  async play(events: GameEvent[], ghostKey?: string | null): Promise<void> {
    const h = this.h;
    const prevPhase = h.phase;
    if (!h.enemyPlaying && !h.replaying && settings.speedOwn === 'instant') this.fastForward = true;
    h.phase = 'busy';
    this.view.placeCursor(false);
    h.refreshHud();
    for (const ev of events) {
      h.noteEvent(ev);
      switch (ev.kind) {
        case 'move':
        case 'merge':
        case 'load': {
          const seen = ev.path.some((p) => this.visibleToPlayer(p));
          if (!seen || this.fastForward) break;
          const u = unitById(this.s, ev.uid);
          const fallback = 'r_' + UNIT_ART[unitById(this.s, (ev as { into?: number }).into ?? -1)?.type ?? 0];
          const tex =
            ghostKey ?? (u ? unitKey(this.sc.textures, this.s, { ...u, x: ev.path[0]!.x, y: ev.path[0]!.y, active: true }) : fallback);
          if (!tex) break;
          // La IA solo se ve donde hay vision (no se delatan sus unidades en la niebla).
          const mover = unitById(this.s, ev.uid) ?? unitById(this.s, (ev as { into?: number }).into ?? -1);
          const showAll = mover?.team === 0;
          await this.animatePath(ev.uid, tex, ev.path, showAll);
          if (ev.kind === 'move' && ev.ambush && !this.fastForward) {
            h.refresh();
            const end = ev.path[ev.path.length - 1]!;
            if (showAll || this.visibleToPlayer(end)) {
              const c = center(end);
              void tileFlash(this.sc, this.view, ev.ambush, PAL.red);
              await floatText(this.sc, this.view, { x: c.x, y: c.y - 6 }, t('fxAmbush'), PAL_CSS.redSoft);
            }
          }
          break;
        }
        case 'attack':
          await this.playAttack(ev);
          break;
        case 'capture':
          h.refresh();
          if (!this.fastForward && this.visibleToPlayer(ev.at)) {
            await this.lookAt(ev.at);
            const c = center(ev.at);
            void burst(this.sc, this.view, c, { colors: COLORS.gold, count: 12, radius: 22 });
            void tileFlash(this.sc, this.view, ev.at, PAL.gold);
            const partial = ev.left !== undefined && ev.left > 0;
            await floatText(
              this.sc,
              this.view,
              { x: c.x, y: c.y - 6 },
              partial ? `${ev.left}/${ev.total}` : ev.owner === null ? t('fxNeutral') : t('fxCaptured'),
              partial ? '#fff1a8' : '#ffd447',
            );
          }
          break;
        case 'spawn':
          h.refresh();
          if (!this.fastForward && this.visibleToPlayer(ev.at)) {
            await this.lookAt(ev.at);
            const sp = this.view.unitSprite(ev.uid);
            void burst(
              this.sc,
              this.view,
              { x: center(ev.at).x, y: ev.at.y * TILE + TILE - 2 },
              { colors: COLORS.smoke, count: 8, radius: 14, size: 2 },
            );
            await Promise.all([tileFlash(this.sc, this.view, ev.at, 0xffffff), sp ? blink(this.sc, sp, 2, 60) : Promise.resolve()]);
          }
          break;
        case 'ability':
          await this.playAbility(ev);
          break;
        default:
          break;
      }
    }
    h.hidden.clear();
    if (h.phase === 'busy' && prevPhase !== 'busy') {
      h.phase = prevPhase;
      // Acelerar una animacion propia no debe saltarse las siguientes.
      this.fastForward = false;
    }
    h.refresh();
  }

  private async animatePath(uid: number, texKey: string, path: Pos[], showAll = true): Promise<void> {
    const visiblePart = showAll ? path : path.filter((p) => this.visibleToPlayer(p));
    await this.lookAt(visiblePart[visiblePart.length - 1] ?? path[path.length - 1]!);
    this.h.hidden.add(uid);
    this.h.refresh();
    this.view.placeCursor(false);
    const img = this.view.ghost(texKey, path[0]!);
    img.setVisible(showAll || this.visibleToPlayer(path[0]!));
    // [CAMBIO] Mira hacia donde va (los dibujos rojos miran a la izquierda: ver faceFlip), arranca y
    // frena suave, la infanteria da un saltito por casilla y los vehiculos levantan polvo.
    // Al unirse o subir a un transporte la unidad ya no esta en el estado: entonces no se sabe su tipo.
    const mover = unitById(this.s, uid);
    const team = mover?.team ?? (this.h.enemyPlaying ? 1 : 0);
    const foot = mover ? Movement.of(mover.type) === MoveType.FOOT : false;
    const air = mover ? Movement.of(mover.type) === MoveType.AIR : false;
    let facing = this.view.facingOf(uid, team);
    img.setFlipX(faceFlip(team, facing));
    const n = path.length - 1;
    for (let i = 1; i < path.length; i++) {
      const p = path[i]!;
      const shown = showAll || this.visibleToPlayer(p);
      if (!shown && !img.visible) {
        img.setPosition(p.x * TILE + TILE / 2, (p.y + 1) * TILE);
        continue;
      }
      const prev = path[i - 1]!;
      const dir = facingToward(prev, p);
      if (dir) {
        facing = dir;
        img.setFlipX(faceFlip(team, dir));
      }
      const from = { x: prev.x * TILE + TILE / 2, y: (prev.y + 1) * TILE };
      const to = { x: p.x * TILE + TILE / 2, y: (p.y + 1) * TILE };
      const ms = this.fastForward ? 1 : this.stepMs() * (n === 1 ? 1.25 : i === 1 || i === n ? 1.15 : 0.9);
      const ease = n === 1 ? 'Sine.easeInOut' : i === 1 ? 'Quad.easeIn' : i === n ? 'Quad.easeOut' : 'Linear';
      if (!this.fastForward && !foot && !air && img.visible && this.stepMs() > 1)
        void burst(
          this.sc,
          this.view,
          { x: from.x - (to.x - from.x) * 0.3, y: from.y - 3 },
          { colors: COLORS.smoke, count: 2, radius: 6, size: 2, duration: 240 },
        );
      const prog = { t: 0 };
      await new Promise<void>((resolve) =>
        this.sc.tweens.add({
          targets: prog,
          t: 1,
          duration: ms,
          ease,
          onUpdate: () => {
            const hop = foot ? Math.round(Math.sin(prog.t * Math.PI) * 3) : 0;
            img.setPosition(Math.round(from.x + (to.x - from.x) * prog.t), Math.round(from.y + (to.y - from.y) * prog.t) - hop);
          },
          onComplete: () => resolve(),
        }),
      );
      img.setPosition(to.x, to.y);
      img.setVisible(shown);
    }
    this.view.face(uid, facing);
    // Al llegar, un poco de polvo (solo las unidades propias, que se ven siempre).
    const last = path[path.length - 1]!;
    if (showAll && path.length > 1 && !this.fastForward && this.stepMs() > 1) {
      void burst(
        this.sc,
        this.view,
        { x: last.x * TILE + TILE / 2, y: (last.y + 1) * TILE - 3 },
        { colors: COLORS.smoke, count: 6, radius: 10, size: 2, duration: 260 },
      );
    }
    img.destroy();
    this.h.hidden.delete(uid);
  }

  /** Milisegundos de un efecto de combate a la velocidad elegida (0 si es instantanea). */
  private combatMs(ms: number): number {
    const step = this.stepMs();
    return this.fastForward || step <= 1 ? 0 : Math.round((ms * step) / STEP_MS);
  }

  /**
   * Combate, paso a paso para que se entienda: mira sobre el objetivo, disparo desde el atacante,
   * daño con la barra de vida bajando y, si lo hay, el contraataque igual pero al reves. Mientras
   * tanto el panel de combate (abajo) enseña las dos unidades, su acierto y sus vidas.
   */
  private async playAttack(ev: Extract<GameEvent, { kind: 'attack' }>): Promise<void> {
    const seen = this.visibleToPlayer(ev.target) && !this.fastForward;
    // Lo que habia dibujado antes del ataque (la victima puede haber desaparecido ya del estado).
    const victimKey = this.view.unitKeyAt(ev.target);
    // El atacante puede haber caido en el contraataque: su posicion y su imagen, de lo dibujado.
    const atkSprite = this.view.unitSprite(ev.attacker);
    const atkPos = atkSprite ? { x: Math.round(atkSprite.x / TILE), y: Math.round(atkSprite.y / TILE) } : null;
    const atkKey = atkPos ? this.view.unitKeyAt(atkPos) : null;
    const atkSeen = !!atkPos && this.visibleToPlayer(atkPos);
    const info = ev.combat;
    const atkTeam = info?.attackerTeam ?? unitById(this.s, ev.attacker)?.team ?? (this.h.enemyPlaying ? 1 : 0);
    const defTeam = (1 - atkTeam) as 0 | 1;
    const atkType = info?.attackerType ?? unitById(this.s, ev.attacker)?.type ?? 0;
    const defType = info?.defenderType ?? unitAt(this.s, ev.target.x, ev.target.y)?.type ?? 0;
    const victim = unitAt(this.s, ev.target.x, ev.target.y);
    const victimUid = victim?.uid ?? null;
    const teamColor = (team: number) => (team === 0 ? PAL.blue : PAL.red);
    // Velocidad de las animaciones (Opciones): 1 = normal.
    const k = this.combatMs(1000) / 1000;
    const panelId = Date.now();
    const panel = (stage: 'start' | 'hit' | 'counter') => {
      if (!seen) return;
      const vm = combatVM(ev, stage, { attacker: atkKey, defender: victimKey }, { attacker: atkSeen, defender: true }, panelId);
      if (vm) ui.set({ combat: vm });
    };

    // 1. Apuntar y disparar: el atacante mira al objetivo, retrocede con el fogonazo y sale el proyectil.
    if (seen) {
      panel('start');
      await this.lookAt(ev.target);
      if (atkPos) this.faceTo(ev.attacker, atkPos, ev.target);
      if (victimUid !== null && atkPos) this.faceTo(victimUid, ev.target, atkPos);
      void targetMark(this.sc, this.view, ev.target, teamColor(atkTeam), this.combatMs(150));
      if (atkSprite && atkPos && atkSeen) await this.fire(atkSprite, atkPos, ev.target, shotKind(atkType, defType), k);
      else await this.wait(this.combatMs(150));
    }
    // 2. Impacto.
    if (seen) {
      panel('hit');
      await this.hitFx(victimUid, ev.target, ev.damage, ev.killed, victimKey, defTeam, info?.defenderLife ?? null, k);
    } else this.h.refresh();
    // 3. Contraataque: el defensor responde enseguida, con el mismo lenguaje que el ataque.
    if (ev.counter !== undefined && atkPos && (ev.counter > 0 || ev.attackerKilled) && !this.fastForward && this.visibleToPlayer(atkPos)) {
      const vs = victimUid !== null ? this.view.unitSprite(victimUid) : null;
      void tag(this.sc, this.view, ev.target, t('fxCounter'), PAL_CSS.gold, k);
      await this.wait(this.combatMs(80));
      if (vs) await this.fire(vs, ev.target, atkPos, shotKind(defType, atkType), k);
      panel('counter');
      await this.hitFx(ev.attacker, atkPos, ev.counter, !!ev.attackerKilled, atkKey, atkTeam, info?.attackerLife ?? null, k);
    }
    // [CAMBIO] Botin: quien destruye cobra parte del precio (dorado, como el dinero de Ambar).
    const lootAt = ev.killed ? ev.target : ev.attackerKilled ? atkPos : null;
    if (ev.bounty && lootAt && !this.fastForward && this.visibleToPlayer(lootAt)) {
      const c = center(lootAt);
      void floatText(this.sc, this.view, { x: c.x, y: c.y - 16 }, `+${fmtNum(ev.bounty)}`, PAL_CSS.gold);
      this.h.refreshHud();
    }
    if (seen && info) await this.wait(this.combatMs(200));
    ui.set({ combat: null });
  }

  /** Gira una unidad para que mire de `from` hacia `to` (si no estan en la misma columna). */
  private faceTo(uid: number, from: Pos, to: Pos): void {
    const dir = facingToward(from, to);
    if (dir) this.view.face(uid, dir);
  }

  /** Disparo: retroceso y fogonazo a la vez, y el proyectil hasta el impacto. */
  private async fire(sprite: Phaser.GameObjects.Container, from: Pos, to: Pos, kind: ShotKind, k: number): Promise<void> {
    void recoil(this.sc, sprite, from, to, k);
    void muzzleFlash(this.sc, this.view, from, to, k);
    await projectile(this.sc, this.view, kind, from, to, k);
  }

  /**
   * Impacto en `at`: destello en la unidad, explosion, numero de daño y su barra de vida bajando. Si cae,
   * restos y una marca de quemado en el suelo hasta el turno siguiente.
   */
  private async hitFx(
    uid: number | null,
    at: Pos,
    damage: number,
    killed: boolean,
    victimKey: string | null,
    team: 0 | 1,
    lifeBefore: number | null,
    k: number,
  ): Promise<void> {
    const live = unitAt(this.s, at.x, at.y);
    // Si ha caido ya no esta en el estado: una copia de su dibujo, mirando hacia donde miraba.
    let sprite: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null = live ? this.view.unitSprite(live.uid) : null;
    if (!live && killed && victimKey) {
      const ghost = this.view.ghost(victimKey, at);
      ghost.setFlipX(faceFlip(team, uid !== null ? this.view.facingOf(uid, team) : baseFacing(team)));
      sprite = ghost;
    }
    void hitFlash(this.sc, sprite, k);
    void popNumber(this.sc, this.view, at, damage > 0 ? `-${damage}` : t('fxMiss'), damage > 0 ? PAL_CSS.red : '#cfe8ff', k);
    const bar =
      lifeBefore !== null
        ? lifeBar(this.sc, this.view, at, lifeBefore, lifeBefore - damage, team === 0 ? PAL.blue : PAL.red, this.combatMs(220))
        : Promise.resolve();
    await impact(this.sc, this.view, at, killed, k);
    if (killed) {
      if (sprite && !live) sprite.destroy();
      this.view.scorch(at, this.s.day);
      await debris(this.sc, this.view, at, team, k);
    }
    this.h.refresh();
    // La barra sigue bajando mientras pasa lo siguiente (no se espera).
    void bar;
  }

  /** Animacion de una habilidad: el area se ilumina y cada unidad tocada explota y enseña lo que pierde. */
  private async playAbility(ev: Extract<GameEvent, { kind: 'ability' }>): Promise<void> {
    this.h.refresh();
    if (this.fastForward) return;
    const def = generalOf(this.s, ev.team)?.def;
    const ability = def?.abilities.find((a) => a.id === ev.ability);
    const name = ability?.name[settings.lang] ?? ev.ability;
    // El enemigo avisa siempre (aunque sea en la niebla): sabes que te han bombardeado o te ven.
    if (ev.team !== 0) showToast(`${t('enemy')} · ${def?.name[settings.lang] ?? ev.general}: ${name}`);
    const at = ev.target ?? this.view.cursor;
    if (ev.target) await this.lookAt(ev.target);
    const c = center(at);
    void floatText(this.sc, this.view, { x: c.x, y: c.y - 18 }, name, PAL_CSS.gold);
    const r = ability ? abilityArea(ability) : null;
    if (ev.target && r !== null) {
      for (const p of areaTiles(ev.target, r))
        if (p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H) void tileFlash(this.sc, this.view, p, PAL.red);
      this.sc.cameras.main.shake(220, 0.006);
    }
    await Promise.all([
      ...ev.hits.map(async (h) => {
        const u = unitById(this.s, h.uid);
        if (!u || (u.team !== 0 && !this.visibleToPlayer(u))) return;
        const p = center(u);
        void playAnim(this.sc, this.view, p, 'boom', { frameMs: 65 });
        void burst(this.sc, this.view, p, { colors: COLORS.fire, count: 14, radius: 20 });
        await floatText(this.sc, this.view, { x: p.x, y: p.y - 6 }, `-${h.damage}`, PAL_CSS.redSoft);
      }),
      // Curar: "+N" en verde sobre cada unidad que recupera vida.
      ...(ev.heals ?? []).map(async (h) => {
        const u = unitById(this.s, h.uid);
        if (!u || (u.team !== 0 && !this.visibleToPlayer(u))) return;
        const p = center(u);
        void burst(this.sc, this.view, p, { colors: COLORS.heal, count: 10, radius: 16 });
        await floatText(this.sc, this.view, { x: p.x, y: p.y - 6 }, `+${h.amount}`, PAL_CSS.green);
      }),
      // Dinero: la cantidad, bajo el nombre de la habilidad.
      ...(ev.funds ? [floatText(this.sc, this.view, { x: c.x, y: c.y }, `+${fmtNum(ev.funds)}`, PAL_CSS.gold)] : []),
    ]);
  }
}
