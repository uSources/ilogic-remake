/**
 * Animar lo que ya ha pasado: las reglas cambian el estado y devuelven eventos (GameEvent) y aqui
 * solo se cuentan (moverse, combatir, capturar, comprar, poderes del general). Lo usan el turno
 * del jugador, el de la IA, su repeticion y el laboratorio.
 *
 * Cada tipo de evento tiene su animacion en `ANIMATORS` (una entrada por tipo, lo exige el tipo):
 * un evento nuevo trae su propia funcion en vez de abrir un `switch`.
 */
import { unitTypeOf } from '../../core/gameContent';
import type Phaser from 'phaser';
import { MoveType, type UnitType } from '../../core/content';
import { movementOf, unitAt, unitById } from '../../core/rules';
import { powerArea, powerOf, generalOf } from '../../core/generals';
import { squareArea, posOf } from '../../core/geom';
import { mapGrid } from '../../core/mapGrid';
import type { GameEvent, GameEventKind, GameEventOf, GameState, Pos, TeamId, Unit } from '../../core/model';
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
import { FxTimeline } from '../../ui/fxKit';
import { baseFacing, faceFlip, type MapView } from '../../ui/mapView';
import { combatVM } from '../../ui/hudModels';
import { PAL, PAL_CSS } from '../../ui/palette';
import { sideColor, sideOf, type Side } from '../../ui/sides';
import { unitKey } from '../../ui/sprites';
import { STEP_MS, type Phase } from './types';

/** Lo que el reproductor necesita de la escena. */
export interface PlaybackHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (cambia al deshacer o al repetir el turno enemigo: se lee cada vez). */
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
  phase: Phase;
  /** Saltarse las animaciones (Enter durante el turno enemigo, velocidad instantanea). */
  fastForward: boolean;
  readonly othersPlaying: boolean;
  readonly replaying: boolean;
  /** El equipo que esta jugando (el que hace lo que se anima). */
  readonly acting: TeamId;
  /** Unidades que no se dibujan (las que se estan animando aparte). */
  readonly hidden: Set<number>;
  /** El jugador ve esa casilla. */
  visible(pos: Pos): boolean;
  refresh(): void;
  refreshHud(): void;
  /** Cada evento, antes de animarlo (deshacer, estadisticas, tutorial, ultima jugada). */
  noteEvent(event: GameEvent): void;
}

/** Lo que puede usar la animacion de un evento: la escena, la partida y esperas a la velocidad elegida. */
export interface EventStage {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
  /** Se pueden saltar a media animacion (Enter): leerlo despues de cada espera. */
  readonly fastForward: boolean;
  readonly othersPlaying: boolean;
  /** El equipo que esta jugando (el que hace lo que se anima). */
  readonly acting: TeamId;
  /** Unidades que no se dibujan (las que se estan animando aparte). */
  readonly hidden: Set<number>;
  visible(pos: Pos): boolean;
  refresh(): void;
  refreshHud(): void;
  wait(ms: number): Promise<void>;
  lookAt(pos: Pos): Promise<void>;
  stepMs(): number;
  combatMs(ms: number): number;
}

/** Animacion de un evento. `ghostKey`: dibujo que usar al mover (si el que llama lo sabe). */
type EventAnimation<E extends GameEvent> = (stage: EventStage, event: E, ghostKey?: string | null) => Promise<void>;
/** Animacion de un tipo de evento, p. ej. `Animator<'attack'>`. */
export type Animator<K extends GameEventKind> = EventAnimation<GameEventOf<K>>;

/** Espera de la camara al ir a una casilla que no se veia. */
const LOOK_AT_MS = 180;
/** Al mirar a una casilla: margen (casillas) para darla por vista y para colocar la camara. */
const ON_SCREEN_MARGIN = 2;
const LOOK_AT_MARGIN = 4;
/** Paso de un movimiento: con la velocidad "instantanea" o acelerado, 1 ms (no 0, para que el tween acabe). */
const INSTANT_STEP_MS = 1;

export class EventPlayer implements EventStage {
  constructor(private readonly host: PlaybackHost) {}

  get scene(): Phaser.Scene {
    return this.host.scene;
  }
  get state(): GameState {
    return this.host.state;
  }
  get viewer(): TeamId {
    return this.host.viewer;
  }
  get acting(): TeamId {
    return this.host.acting;
  }
  get view(): MapView {
    return this.host.view;
  }
  get fastForward(): boolean {
    return this.host.fastForward;
  }
  get othersPlaying(): boolean {
    return this.host.othersPlaying;
  }
  get hidden(): Set<number> {
    return this.host.hidden;
  }
  visible(pos: Pos): boolean {
    return this.host.visible(pos);
  }
  refresh(): void {
    this.host.refresh();
  }
  refreshHud(): void {
    this.host.refreshHud();
  }

  /** Milisegundos por casilla al mover, segun la velocidad elegida (tuyas o del enemigo). */
  stepMs(): number {
    const speed = this.host.othersPlaying ? settings.speedEnemy : settings.speedOwn;
    if (speed === 'instant') return INSTANT_STEP_MS;
    return speed === 'fast' ? Math.round(STEP_MS / 2) : STEP_MS;
  }

  /** Milisegundos de un efecto de combate a la velocidad elegida (0 si es instantanea). */
  combatMs(ms: number): number {
    const step = this.stepMs();
    if (this.fastForward || step <= INSTANT_STEP_MS) return 0;
    return Math.round((ms * step) / STEP_MS);
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.scene.time.delayedCall(ms, resolve));
  }

  /** Lleva la camara a una casilla si no se ve bien, y espera a que llegue. */
  async lookAt(pos: Pos): Promise<void> {
    if (!this.visible(pos) || this.view.isOnScreen(pos, ON_SCREEN_MARGIN)) return;
    this.view.ensureVisible(pos, LOOK_AT_MARGIN);
    await this.wait(this.fastForward ? 0 : LOOK_AT_MS);
  }

  /** Anima eventos (movimiento, ataque...) y vuelve a dibujar al terminar. */
  async play(events: GameEvent[], ghostKey?: string | null): Promise<void> {
    const host = this.host;
    const phaseBefore = host.phase;
    if (!host.othersPlaying && !host.replaying && settings.speedOwn === 'instant') host.fastForward = true;
    host.phase = 'busy';
    this.view.placeCursor(false);
    host.refreshHud();
    for (const event of events) {
      host.noteEvent(event);
      await animatorFor(event)(this, event, ghostKey);
    }
    host.hidden.clear();
    if (host.phase === 'busy' && phaseBefore !== 'busy') {
      host.phase = phaseBefore;
      // Acelerar una animacion propia no debe saltarse las siguientes.
      host.fastForward = false;
    }
    host.refresh();
  }
}

// ---------------------------------------------------------------------------------------------
// Moverse (y unirse o subir a un transporte, que tambien son un camino)
// ---------------------------------------------------------------------------------------------

type PathEvent = GameEventOf<'move' | 'merge' | 'load'>;

/** La unidad en la que entra al unirse o al subir (ya no queda la que se mueve). */
const unitEntered = (s: GameState, event: PathEvent): Unit | undefined => ('into' in event ? unitById(s, event.into) : undefined);

/** Dibujo de la unidad al salir, en la primera casilla del camino. */
function moverTexture(stage: EventStage, event: PathEvent): string | null {
  const s = stage.state;
  const mover = unitById(s, event.uid);
  const start = event.path[0]!;
  // Al unirse o subir ya no esta en el estado: se dibuja como la unidad en la que entra (es de su
  // mismo equipo y, al unirse, de su mismo tipo). Si tampoco esta, no se anima.
  const drawn = mover ?? unitEntered(s, event);
  return drawn ? unitKey(stage.scene.textures, s, { ...drawn, x: start.x, y: start.y, turnState: 'ready' }, stage.viewer) : null;
}

const animatePathEvent: EventAnimation<PathEvent> = async (stage, event, ghostKey) => {
  const isSeen = event.path.some((pos) => stage.visible(pos));
  if (!isSeen || stage.fastForward) return;
  const texture = ghostKey ?? moverTexture(stage, event);
  if (!texture) return;
  // Lo de los demas equipos solo se ve donde hay vision (no se delatan sus unidades en la niebla).
  const mover = unitById(stage.state, event.uid) ?? unitEntered(stage.state, event);
  const showWholePath = mover?.team === stage.viewer;
  await animatePath(stage, event.uid, texture, event.path, showWholePath);
  if (event.kind === 'move' && event.ambush && !stage.fastForward) {
    await showAmbush(stage, event.ambush, event.path[event.path.length - 1]!, showWholePath);
  }
};

/** Emboscada: la casilla de la unidad escondida destella y sale el aviso donde se paro. */
async function showAmbush(stage: EventStage, ambusher: Pos, stoppedAt: Pos, showWholePath: boolean): Promise<void> {
  stage.refresh();
  if (!showWholePath && !stage.visible(stoppedAt)) return;
  const centerPoint = center(stoppedAt);
  void tileFlash(stage.scene, stage.view, ambusher, PAL.red);
  await floatText(stage.scene, stage.view, { x: centerPoint.x, y: centerPoint.y - 6 }, t('fxAmbush'), PAL_CSS.redSoft);
}

/** Punto donde se apoya una unidad en una casilla (centro abajo, como sus sprites). */
const feetOf = (pos: Pos) => ({ x: pos.x * TILE + TILE / 2, y: (pos.y + 1) * TILE });

/** Duracion de cada paso respecto a `stepMs`: arranca y frena suave; un solo paso, algo mas lento. */
const SINGLE_STEP_PACE = 1.25;
const EDGE_STEP_PACE = 1.15;
const MIDDLE_STEP_PACE = 0.9;
/** Saltito de la infanteria en cada casilla (pixeles). */
const HOP_PX = 3;

/** Como es el paso `index` (1..last) de un camino de `last` pasos: cuanto dura respecto a `stepMs` y su curva. */
function stepPace(index: number, last: number): { pace: number; ease: string } {
  if (last === 1) return { pace: SINGLE_STEP_PACE, ease: 'Sine.easeInOut' };
  if (index === 1) return { pace: EDGE_STEP_PACE, ease: 'Quad.easeIn' };
  if (index === last) return { pace: EDGE_STEP_PACE, ease: 'Quad.easeOut' };
  return { pace: MIDDLE_STEP_PACE, ease: 'Linear' };
}

/** Lo que hace falta para mover el dibujo de una unidad casilla a casilla. */
interface Walker {
  readonly image: Phaser.GameObjects.Image;
  /** Su lado para el que mira (hacia donde mira el dibujo al principio). */
  readonly side: Side;
  /** La infanteria da un saltito por casilla. */
  readonly hops: boolean;
  /** Los vehiculos de tierra levantan polvo al arrancar de cada casilla. */
  readonly raisesDust: boolean;
}

function walkerFor(stage: EventStage, uid: number, image: Phaser.GameObjects.Image): Walker {
  // Al unirse o subir a un transporte la unidad ya no esta en el estado: entonces no se sabe su tipo.
  const mover = unitById(stage.state, uid);
  const side = sideOf(stage.state, stage.viewer, mover?.team ?? stage.acting);
  const moveType = mover ? movementOf(stage.state, mover) : null;
  return { image, side, hops: moveType === MoveType.FOOT, raisesDust: moveType !== MoveType.FOOT && moveType !== MoveType.AIR };
}

/**
 * [CAMBIO] Mira hacia donde va (los dibujos rojos miran a la izquierda: ver faceFlip), arranca y
 * frena suave, la infanteria da un saltito por casilla y los vehiculos levantan polvo.
 */
async function animatePath(stage: EventStage, uid: number, textureKey: string, path: Pos[], showWholePath = true): Promise<void> {
  const view = stage.view;
  const isShown = (pos: Pos) => showWholePath || stage.visible(pos);
  const visiblePart = showWholePath ? path : path.filter((pos) => stage.visible(pos));
  await stage.lookAt(visiblePart[visiblePart.length - 1] ?? path[path.length - 1]!);
  stage.hidden.add(uid);
  stage.refresh();
  view.placeCursor(false);
  const image = view.ghost(textureKey, path[0]!);
  image.setVisible(isShown(path[0]!));
  const walker = walkerFor(stage, uid, image);
  let facing = view.facingOf(uid, walker.side);
  image.setFlipX(faceFlip(walker.side, facing));
  for (let i = 1; i < path.length; i++) {
    const to = path[i]!;
    // Por la niebla sin verse: salta a la casilla sin animar.
    if (!isShown(to) && !image.visible) {
      image.setPosition(feetOf(to).x, feetOf(to).y);
      continue;
    }
    const from = path[i - 1]!;
    const direction = facingToward(from, to);
    if (direction) {
      facing = direction;
      image.setFlipX(faceFlip(walker.side, direction));
    }
    await walkStep(stage, walker, from, to, stepPace(i, path.length - 1));
    image.setVisible(isShown(to));
  }
  view.face(uid, facing);
  if (showWholePath && path.length > 1) arrivalDust(stage, path[path.length - 1]!);
  image.destroy();
  stage.hidden.delete(uid);
}

/** Un paso de una casilla a la siguiente; acaba con el dibujo justo en la casilla nueva. */
async function walkStep(stage: EventStage, walker: Walker, from: Pos, to: Pos, step: { pace: number; ease: string }): Promise<void> {
  const start = feetOf(from);
  const end = feetOf(to);
  const image = walker.image;
  const isAnimated = !stage.fastForward;
  const duration = isAnimated ? stage.stepMs() * step.pace : INSTANT_STEP_MS;
  if (isAnimated && walker.raisesDust && image.visible && stage.stepMs() > INSTANT_STEP_MS) {
    void burst(
      stage.scene,
      stage.view,
      { x: start.x - (end.x - start.x) * 0.3, y: start.y - 3 },
      { colors: COLORS.smoke, count: 2, radius: 6, size: 2, duration: 240 },
    );
  }
  const progress = { t: 0 };
  await new Promise<void>((resolve) =>
    stage.scene.tweens.add({
      targets: progress,
      t: 1,
      duration,
      ease: step.ease,
      onUpdate: () => {
        const hop = walker.hops ? Math.round(Math.sin(progress.t * Math.PI) * HOP_PX) : 0;
        image.setPosition(Math.round(start.x + (end.x - start.x) * progress.t), Math.round(start.y + (end.y - start.y) * progress.t) - hop);
      },
      onComplete: () => resolve(),
    }),
  );
  image.setPosition(end.x, end.y);
}

/** Al llegar, un poco de polvo (solo las unidades propias, que se ven siempre). */
function arrivalDust(stage: EventStage, at: Pos): void {
  if (stage.fastForward || stage.stepMs() <= INSTANT_STEP_MS) return;
  const feet = feetOf(at);
  void burst(stage.scene, stage.view, { x: feet.x, y: feet.y - 3 }, { colors: COLORS.smoke, count: 6, radius: 10, size: 2, duration: 260 });
}

// ---------------------------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------------------------

type AttackEvent = GameEventOf<'attack'>;

/** Lo que se sabe del combate antes de animarlo (parte ya no esta en el estado: se saca de lo dibujado). */
interface Battle {
  readonly event: AttackEvent;
  /** El jugador ve el objetivo y no se esta acelerando. */
  readonly isSeen: boolean;
  /** Dibujo de la victima antes del ataque (puede haber desaparecido ya del estado). */
  readonly victimKey: string | null;
  readonly victimUid: number | null;
  /** El atacante puede haber caido en el contraataque: su posicion y su imagen, de lo dibujado. */
  readonly attackerSprite: Phaser.GameObjects.Container | null;
  readonly attackerPos: Pos | null;
  readonly attackerKey: string | null;
  readonly isAttackerSeen: boolean;
  /** El lado de cada uno para el que mira (colores y hacia donde miran). */
  readonly attackerSide: Side;
  readonly defenderSide: Side;
  /** El tipo de cada uno (para el disparo); null si ya no se sabe (no se dibuja el disparo). */
  readonly attackerType: UnitType | null;
  readonly defenderType: UnitType | null;
  /** Reloj de los efectos, a la velocidad de las animaciones (Opciones). */
  readonly timeline: FxTimeline;
  /** Identifica este combate en el panel (para que no se mezcle con el anterior). */
  readonly panelId: number;
}

/** Un efecto de combate de 1000 ms a la velocidad elegida, en segundos: el factor del reloj de combatFx. */
const SPEED_REFERENCE_MS = 1000;

/** El tipo de una unidad del combate, o null si ya no se sabe (un evento sin `combat` de una unidad que ha caido). */
const typeShown = (s: GameState, type: Unit['type'] | undefined): UnitType | null => (type === undefined ? null : unitTypeOf(s, { type }));

/** El disparo de `shooter` contra `target`, si se saben los dos tipos. */
const shotOf = (shooter: UnitType | null, target: UnitType | null) => (shooter && target ? shotKind(shooter, target) : null);

function describeBattle(stage: EventStage, event: AttackEvent): Battle {
  const s = stage.state;
  const isSeen = stage.visible(event.target) && !stage.fastForward;
  const victimKey = stage.view.unitKeyAt(event.target);
  const attackerSprite = stage.view.unitSprite(event.attacker);
  const attackerPos = attackerSprite ? { x: Math.round(attackerSprite.x / TILE), y: Math.round(attackerSprite.y / TILE) } : null;
  const attackerKey = attackerPos ? stage.view.unitKeyAt(attackerPos) : null;
  const isAttackerSeen = !!attackerPos && stage.visible(attackerPos);
  const info = event.combat;
  const attackerTeam = info?.attackerTeam ?? unitById(s, event.attacker)?.team ?? stage.acting;
  const victim = unitAt(s, event.target);
  const defenderTeam = info?.defenderTeam ?? victim?.team;
  const defenderSide = defenderTeam === undefined ? 'enemy' : sideOf(s, stage.viewer, defenderTeam);
  return {
    event,
    isSeen,
    victimKey,
    victimUid: victim?.uid ?? null,
    attackerSprite,
    attackerPos,
    attackerKey,
    isAttackerSeen,
    attackerSide: sideOf(s, stage.viewer, attackerTeam),
    defenderSide,
    attackerType: typeShown(s, info?.attackerType ?? unitById(s, event.attacker)?.type),
    defenderType: typeShown(s, info?.defenderType ?? victim?.type),
    timeline: new FxTimeline(stage.scene, stage.combatMs(SPEED_REFERENCE_MS) / SPEED_REFERENCE_MS),
    panelId: Date.now(),
  };
}

/** Enseña el panel de combate (abajo) en un momento del combate, si el jugador lo ve. */
function showCombatPanel(s: GameState, viewer: TeamId, battle: Battle, moment: 'start' | 'hit' | 'counter'): void {
  if (!battle.isSeen) return;
  const icons = { attacker: battle.attackerKey, defender: battle.victimKey };
  const seen = { attacker: battle.isAttackerSeen, defender: true };
  const panel = combatVM(s, viewer, battle.event, moment, icons, seen, battle.panelId);
  if (panel) ui.set({ combat: panel });
}

/**
 * Combate, paso a paso para que se entienda: mira sobre el objetivo, disparo desde el atacante,
 * daño con la barra de vida bajando y, si lo hay, el contraataque igual pero al reves. Mientras
 * tanto el panel de combate (abajo) enseña las dos unidades, su acierto y sus vidas.
 */
const animateAttack: Animator<'attack'> = async (stage, event) => {
  const battle = describeBattle(stage, event);
  if (battle.isSeen) {
    await aimAndFire(stage, battle);
    showCombatPanel(stage.state, stage.viewer, battle, 'hit');
    await hitEffects(stage, {
      uid: battle.victimUid,
      at: event.target,
      damage: event.damage,
      killed: event.killed,
      drawnKey: battle.victimKey,
      side: battle.defenderSide,
      lifeBefore: event.combat?.defenderLife ?? null,
      timeline: battle.timeline,
    });
  } else stage.refresh();
  await counterAttack(stage, battle);
  showBounty(stage, battle);
  if (battle.isSeen && event.combat) await stage.wait(stage.combatMs(200));
  ui.set({ combat: null });
};

/** Apuntar y disparar: los dos se miran, la mira se cierra sobre el objetivo y sale el disparo. */
async function aimAndFire(stage: EventStage, battle: Battle): Promise<void> {
  const { event, attackerPos, attackerSprite } = battle;
  showCombatPanel(stage.state, stage.viewer, battle, 'start');
  await stage.lookAt(event.target);
  if (attackerPos) faceTo(stage, event.attacker, attackerPos, event.target);
  if (battle.victimUid !== null && attackerPos) faceTo(stage, battle.victimUid, event.target, attackerPos);
  void targetMark(stage.scene, stage.view, event.target, sideColor(battle.attackerSide), stage.combatMs(150));
  const shot = shotOf(battle.attackerType, battle.defenderType);
  if (attackerSprite && attackerPos && battle.isAttackerSeen && shot) {
    await fire(stage, attackerSprite, attackerPos, event.target, shot, battle.timeline);
  } else await stage.wait(stage.combatMs(150));
}

/** Contraataque: el defensor responde enseguida, con el mismo lenguaje que el ataque. */
async function counterAttack(stage: EventStage, battle: Battle): Promise<void> {
  const { event, attackerPos } = battle;
  if (event.counter === undefined || !attackerPos) return;
  const didCounter = event.counter > 0 || !!event.attackerKilled;
  if (!didCounter || stage.fastForward || !stage.visible(attackerPos)) return;
  const defenderSprite = battle.victimUid !== null ? stage.view.unitSprite(battle.victimUid) : null;
  void tag(battle.timeline, stage.view, event.target, t('fxCounter'), PAL_CSS.gold);
  await stage.wait(stage.combatMs(80));
  const shot = shotOf(battle.defenderType, battle.attackerType);
  if (defenderSprite && shot) await fire(stage, defenderSprite, event.target, attackerPos, shot, battle.timeline);
  showCombatPanel(stage.state, stage.viewer, battle, 'counter');
  await hitEffects(stage, {
    uid: event.attacker,
    at: attackerPos,
    damage: event.counter,
    killed: !!event.attackerKilled,
    drawnKey: battle.attackerKey,
    side: battle.attackerSide,
    lifeBefore: event.combat?.attackerLife ?? null,
    timeline: battle.timeline,
  });
}

/** [CAMBIO] Botin: quien destruye cobra parte del precio (dorado, como el dinero de Ambar). */
function showBounty(stage: EventStage, battle: Battle): void {
  const { event } = battle;
  const lootAt = event.killed ? event.target : event.attackerKilled ? battle.attackerPos : null;
  if (!event.bounty || !lootAt || stage.fastForward || !stage.visible(lootAt)) return;
  const centerPoint = center(lootAt);
  void floatText(stage.scene, stage.view, { x: centerPoint.x, y: centerPoint.y - 16 }, `+${fmtNum(event.bounty)}`, PAL_CSS.gold);
  stage.refreshHud();
}

/** Gira una unidad para que mire de `from` hacia `to` (si no estan en la misma columna). */
function faceTo(stage: EventStage, uid: number, from: Pos, to: Pos): void {
  const facing = facingToward(from, to);
  if (facing) stage.view.face(uid, facing);
}

/** Disparo: retroceso y fogonazo a la vez, y el proyectil hasta el impacto. */
async function fire(
  stage: EventStage,
  sprite: Phaser.GameObjects.Container,
  from: Pos,
  to: Pos,
  kind: ShotKind,
  timeline: FxTimeline,
): Promise<void> {
  void recoil(timeline, sprite, from, to);
  void muzzleFlash(timeline, stage.view, from, to);
  await projectile(timeline, stage.view, kind, from, to);
}

/** Quien recibe un golpe y como estaba antes. */
interface HitTarget {
  readonly uid: number | null;
  readonly at: Pos;
  readonly damage: number;
  readonly killed: boolean;
  /** Su dibujo antes del golpe (si cae ya no esta en el estado). */
  readonly drawnKey: string | null;
  readonly side: Side;
  readonly lifeBefore: number | null;
  readonly timeline: FxTimeline;
}

/** Color del numero cuando el golpe falla. */
const MISS_COLOR = '#cfe8ff';

/**
 * Impacto: destello en la unidad, explosion, numero de daño y su barra de vida bajando. Si cae,
 * restos y una marca de quemado en el suelo hasta el turno siguiente.
 */
async function hitEffects(stage: EventStage, hit: HitTarget): Promise<void> {
  const { scene, view } = stage;
  const survivor = unitAt(stage.state, hit.at);
  const sprite = survivor ? view.unitSprite(survivor.uid) : fallenCopy(stage, hit);
  void hitFlash(hit.timeline, sprite);
  const isHit = hit.damage > 0;
  void popNumber(hit.timeline, view, hit.at, isHit ? `-${hit.damage}` : t('fxMiss'), isHit ? PAL_CSS.red : MISS_COLOR);
  // La barra sigue bajando mientras pasa lo siguiente (no se espera).
  if (hit.lifeBefore !== null) {
    void lifeBar(scene, view, hit.at, hit.lifeBefore, hit.lifeBefore - hit.damage, sideColor(hit.side), stage.combatMs(220));
  }
  await impact(hit.timeline, view, hit.at, hit.killed);
  if (hit.killed) {
    if (sprite && !survivor) sprite.destroy();
    view.scorch(hit.at, stage.state.day);
    await debris(hit.timeline, view, hit.at, hit.side);
  }
  stage.refresh();
}

/** Si ha caido ya no esta en el estado: una copia de su dibujo, mirando hacia donde miraba. */
function fallenCopy(stage: EventStage, hit: HitTarget): Phaser.GameObjects.Image | null {
  if (!hit.killed || !hit.drawnKey) return null;
  const copy = stage.view.ghost(hit.drawnKey, hit.at);
  const facing = hit.uid !== null ? stage.view.facingOf(hit.uid, hit.side) : baseFacing(hit.side);
  return copy.setFlipX(faceFlip(hit.side, facing));
}

// ---------------------------------------------------------------------------------------------
// Captura, compra y poderes
// ---------------------------------------------------------------------------------------------

const CAPTURE_PARTIAL_COLOR = '#fff1a8';
const CAPTURE_DONE_COLOR = '#ffd447';

const animateCapture: Animator<'capture'> = async (stage, event) => {
  stage.refresh();
  if (stage.fastForward || !stage.visible(event.at)) return;
  await stage.lookAt(event.at);
  const centerPoint = center(event.at);
  void burst(stage.scene, stage.view, centerPoint, { colors: COLORS.gold, count: 12, radius: 22 });
  void tileFlash(stage.scene, stage.view, event.at, PAL.gold);
  const isPartial = event.left !== undefined && event.left > 0;
  const label = isPartial ? `${event.left}/${event.total}` : event.owner === null ? t('fxNeutral') : t('fxCaptured');
  await floatText(
    stage.scene,
    stage.view,
    { x: centerPoint.x, y: centerPoint.y - 6 },
    label,
    isPartial ? CAPTURE_PARTIAL_COLOR : CAPTURE_DONE_COLOR,
  );
};

/** Compra: humo a los pies, la casilla destella y la unidad nueva parpadea. */
const animateSpawn: Animator<'spawn'> = async (stage, event) => {
  stage.refresh();
  if (stage.fastForward || !stage.visible(event.at)) return;
  await stage.lookAt(event.at);
  const sprite = stage.view.unitSprite(event.uid);
  const feet = { x: center(event.at).x, y: event.at.y * TILE + TILE - 2 };
  void burst(stage.scene, stage.view, feet, { colors: COLORS.smoke, count: 8, radius: 14, size: 2 });
  await Promise.all([
    tileFlash(stage.scene, stage.view, event.at, PAL.white),
    sprite ? blink(stage.scene, sprite, 2, 60) : Promise.resolve(),
  ]);
};

/** Se ve lo que le pasa a esa unidad: las propias siempre, las demas si estan a la vista. */
function seenUnit(stage: EventStage, uid: number): Unit | null {
  const unit = unitById(stage.state, uid);
  if (!unit || (unit.team !== stage.viewer && !stage.visible(unit))) return null;
  return unit;
}

/** Una unidad tocada por el poder: explota y enseña lo que pierde. */
async function powerHit(stage: EventStage, hit: { uid: number; damage: number }): Promise<void> {
  const unit = seenUnit(stage, hit.uid);
  if (!unit) return;
  const centerPoint = center(unit);
  void playAnim(stage.scene, stage.view, centerPoint, 'boom', { frameMs: 65 });
  void burst(stage.scene, stage.view, centerPoint, { colors: COLORS.fire, count: 14, radius: 20 });
  await floatText(stage.scene, stage.view, { x: centerPoint.x, y: centerPoint.y - 6 }, `-${hit.damage}`, PAL_CSS.redSoft);
}

/** Curar: "+N" en verde sobre cada unidad que recupera vida. */
async function powerHeal(stage: EventStage, heal: { uid: number; amount: number }): Promise<void> {
  const unit = seenUnit(stage, heal.uid);
  if (!unit) return;
  const centerPoint = center(unit);
  void burst(stage.scene, stage.view, centerPoint, { colors: COLORS.heal, count: 10, radius: 16 });
  await floatText(stage.scene, stage.view, { x: centerPoint.x, y: centerPoint.y - 6 }, `+${heal.amount}`, PAL_CSS.green);
}

/** Toda el area de el poder se ilumina en rojo y la camara tiembla. */
function flashArea(stage: EventStage, target: Pos, radius: number): void {
  for (const pos of squareArea(mapGrid(stage.state), target, radius)) void tileFlash(stage.scene, stage.view, pos, PAL.red);
  stage.scene.cameras.main.shake(220, 0.006);
}

/** Animacion de un poder: el area se ilumina y cada unidad tocada explota y enseña lo que pierde. */
const animatePower: Animator<'power'> = async (stage, event) => {
  stage.refresh();
  if (stage.fastForward) return;
  const general = generalOf(stage.state, event.team)?.definition;
  const power = general && powerOf(general, event.power);
  const name = power?.name[settings.lang] ?? event.power;
  // Los demas equipos avisan siempre (aunque sea en la niebla): sabes que te han bombardeado o te ven.
  const side = sideOf(stage.state, stage.viewer, event.team);
  if (side !== 'own') showToast(`${t(side)} · ${general?.name[settings.lang] ?? event.general}: ${name}`);
  const at = event.target ?? stage.view.cursor;
  if (event.target) await stage.lookAt(event.target);
  const centerPoint = center(at);
  void floatText(stage.scene, stage.view, { x: centerPoint.x, y: centerPoint.y - 18 }, name, PAL_CSS.gold);
  const radius = power ? powerArea(power) : null;
  if (event.target && radius !== null) flashArea(stage, event.target, radius);
  await Promise.all([
    ...event.hits.map((hit) => powerHit(stage, hit)),
    ...(event.heals ?? []).map((heal) => powerHeal(stage, heal)),
    // Dinero: la cantidad, bajo el nombre de el poder.
    ...(event.funds ? [floatText(stage.scene, stage.view, posOf(centerPoint), `+${fmtNum(event.funds)}`, PAL_CSS.gold)] : []),
  ]);
};

/** Esperar no se anima. */
const noAnimation = async (): Promise<void> => {};

/** La animacion de cada tipo de evento. Un tipo nuevo de GameEvent no compila sin su entrada. */
export const ANIMATORS: { [K in GameEventKind]: Animator<K> } = {
  move: animatePathEvent,
  merge: animatePathEvent,
  load: animatePathEvent,
  attack: animateAttack,
  capture: animateCapture,
  spawn: animateSpawn,
  power: animatePower,
  wait: noAnimation,
};

/** La animacion de un evento, con su tipo (TypeScript no lo deduce solo al indexar `ANIMATORS`). */
function animatorFor<K extends GameEventKind>(event: GameEventOf<K>): Animator<K> {
  return ANIMATORS[event.kind];
}
