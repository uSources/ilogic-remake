/**
 * El ambiente de la partida mientras se juega: el fondo del tema, el clima de hoy y los emisores del mapa
 * que quedan cerca del oyente (ambience.ts decide cuales), con su fundido al entrar y salir. El fondo y
 * los emisores siguen al zoom (`setZoomLevel`): se oyen con la camara baja; el clima, siempre. Los
 * truenos suenan con cada relampago, lejos y algo despues. No sabe de Web Audio: pide los bucles a un
 * `LoopPort`.
 */
import type { AmbientName, LoopHandle, LoopPort } from '../../../audio/ambientNames';
import type { SoundName } from '../../../audio/sounds';
import type { GameState } from '../../../core/model';
import type { Point3 } from '../../ports/camera';
import {
  ambientEmitters,
  ambientVolumeOf,
  bedAmbientOf,
  emittersInEarshot,
  thunderOf,
  weatherAmbientOf,
  type AmbientEmitter,
} from './ambience';

/** Lo que el reproductor pide fuera: bucles, un efecto con sitio, esperar y el azar. */
export interface AmbienceHost {
  readonly loops: LoopPort;
  playAt(sound: SoundName, at: Point3): void;
  later(seconds: number, run: () => void): void;
  random(): number;
}

/** Cada cuanto se mira que emisores quedan cerca (segundos): no hace falta cada fotograma. */
const CHECK_SECONDS = 0.5;
/** Los emisores suenan un poco por encima del suelo de su casilla. */
const EMITTER_HEIGHT = 0.5;
/** El fondo del tema va por debajo de los emisores; el clima, entero. */
const BED_LEVEL = 0.5;
const WEATHER_LEVEL = 1;
/** Con el zoom, el volumen se cambia cuando se mueve al menos esto (no a cada fotograma del giro de la rueda). */
const ZOOM_LEVEL_STEP = 0.02;

/** Un bucle sin sitio que se cambia por otro (el fondo, el clima). */
interface Layer {
  readonly name: AmbientName;
  readonly handle: LoopHandle;
}

/** En el mundo 3D el suelo es x, z (ports/camera.ts): la casilla (x, y) esta en (x, ·, y). */
const pointOf = (emitter: AmbientEmitter): Point3 => ({ x: emitter.at.x, y: EMITTER_HEIGHT, z: emitter.at.y });

export class AmbiencePlayer {
  private emitters: AmbientEmitter[] = [];
  private readonly playing = new Map<number, LoopHandle>();
  private bed: Layer | null = null;
  private weather: Layer | null = null;
  private sinceCheck = CHECK_SECONDS;
  private listener: Point3 | null = null;
  /** Lo que deja oir el zoom de la camara (ambienceZoomLevel, listener.ts): 1 pegada al suelo. */
  private zoomLevel = 1;

  constructor(private readonly host: AmbienceHost) {}

  /** El mapa de la partida: sus emisores y el fondo de su tema. */
  load(s: GameState): void {
    this.stopEmitters();
    this.emitters = ambientEmitters(s);
    this.bed = this.swap(this.bed, bedAmbientOf(s), (name) => this.bedLevelOf(name));
  }

  /** El clima de hoy (id de weather.json; null: despejado). */
  setWeather(kind: string | null): void {
    this.weather = this.swap(this.weather, weatherAmbientOf(kind), (name) => WEATHER_LEVEL * ambientVolumeOf(name));
  }

  /** La camara se ha acercado o alejado: el fondo y los emisores suenan a `level` de lo suyo. */
  setZoomLevel(level: number): void {
    if (Math.abs(level - this.zoomLevel) < ZOOM_LEVEL_STEP) return;
    this.zoomLevel = level;
    for (const [index, handle] of this.playing) handle.setLevel(this.emitterLevelOf(this.emitters[index]!));
    if (this.bed) this.bed.handle.setLevel(this.bedLevelOf(this.bed.name));
  }

  /** Cada fotograma, con el oyente donde este: enciende lo que se acerca y apaga lo que se aleja. */
  update(seconds: number, listener: Point3): void {
    this.listener = listener;
    this.sinceCheck += seconds;
    if (this.sinceCheck < CHECK_SECONDS) return;
    this.sinceCheck = 0;
    const wanted = emittersInEarshot(this.emitters, listener, new Set(this.playing.keys()));
    for (const [index, handle] of this.playing) if (!wanted.has(index)) this.stopEmitter(index, handle);
    for (const index of wanted) if (!this.playing.has(index)) this.startEmitter(index);
  }

  /** Un relampago: su trueno, lejos del oyente y algo despues. */
  lightning(): void {
    if (!this.listener) return;
    const thunder = thunderOf(this.listener, () => this.host.random());
    this.host.later(thunder.delaySeconds, () => this.host.playAt('thunder', thunder.at));
  }

  private startEmitter(index: number): void {
    const emitter = this.emitters[index]!;
    this.playing.set(index, this.host.loops.start(emitter.sound, pointOf(emitter), this.emitterLevelOf(emitter)));
  }

  private emitterLevelOf(emitter: AmbientEmitter): number {
    return emitter.level * ambientVolumeOf(emitter.sound) * this.zoomLevel;
  }

  private bedLevelOf(name: AmbientName): number {
    return BED_LEVEL * ambientVolumeOf(name) * this.zoomLevel;
  }

  private stopEmitter(index: number, handle: LoopHandle): void {
    handle.stop();
    this.playing.delete(index);
  }

  private stopEmitters(): void {
    for (const [index, handle] of this.playing) this.stopEmitter(index, handle);
  }

  /** Cambia una capa sin sitio por `name`, a `levelOf(name)` (si ya suena esa, sigue; null: ninguna). */
  private swap(layer: Layer | null, name: AmbientName | null, levelOf: (name: AmbientName) => number): Layer | null {
    if (layer?.name === name) return layer;
    layer?.handle.stop();
    return name ? { name, handle: this.host.loops.start(name, null, levelOf(name)) } : null;
  }
}
