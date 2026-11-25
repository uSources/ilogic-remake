/**
 * El ambiente de la partida mientras se juega: el fondo del tema, el clima de hoy y los emisores del mapa
 * que quedan cerca del oyente (ambience.ts decide cuales), con su fundido al entrar y salir. Lo que se
 * oye sigue a lo lejos que este la camara (`setCameraDistance`): el fondo y los emisores, con la camara
 * baja; lo de animales (sus ambientes y lo que dicen al moverse, `animal` y animalCalls.ts), solo al
 * acercarla; el clima, siempre. Con mal tiempo los animales se callan: bajan sus ambientes (pajaros,
 * grillos, ranas) y no dicen nada al moverse. Los truenos suenan con cada relampago, lejos y algo despues. No
 * sabe de Web Audio: pide los bucles a un `LoopPort`.
 */
import type { AmbientName, LoopHandle, LoopPort } from '../../../audio/ambientNames';
import type { SoundName, SoundTone } from '../../../audio/sounds';
import type { GameState } from '../../../core/model';
import type { Point3 } from '../../ports/camera';
import type { AnimalMoment } from '../../ports/life';
import {
  ambientEmitters,
  ambientVolumeOf,
  bedAmbientOf,
  emittersInEarshot,
  isAnimalAmbient,
  thunderOf,
  weatherAmbientOf,
  weatherLevelOf,
  type AmbientEmitter,
} from './ambience';
import { AnimalCalls } from './animalCalls';
import { ambienceZoomLevel, animalZoomLevel } from './listener';

/** Lo que el reproductor pide fuera: bucles, un efecto con sitio, esperar y el azar. */
export interface AmbienceHost {
  readonly loops: LoopPort;
  playAt(sound: SoundName, at: Point3, tone?: SoundTone): void;
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

/** Lo que deja oir el zoom de la camara (listener.ts), de 0 a 1: al ambiente y a lo de animales. */
interface ZoomLevels {
  readonly ambience: number;
  readonly animals: number;
}

/**
 * Si un nivel del zoom ha cambiado bastante para tocar los volumenes: al menos `ZOOM_LEVEL_STEP`, o hasta
 * su punta (callado del todo o entero), que si no se quedaria un pelin por encima de nada.
 */
const levelMoved = (from: number, to: number): boolean => from !== to && (Math.abs(to - from) >= ZOOM_LEVEL_STEP || to === 0 || to === 1);

const zoomMoved = (from: ZoomLevels, to: ZoomLevels): boolean =>
  levelMoved(from.ambience, to.ambience) || levelMoved(from.animals, to.animals);

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
  /** Lo que deja oir el zoom: `ambienceZoomLevel` y `animalZoomLevel` (listener.ts); 1 pegada al suelo. */
  private zoom: ZoomLevels = { ambience: 1, animals: 1 };
  /** El clima de hoy (id de weather.json; null: despejado). */
  private weatherKind: string | null = null;
  /** Lo que lleva sonando (segundos): la espera entre dos animales. */
  private clock = 0;
  private readonly calls: AnimalCalls;

  constructor(private readonly host: AmbienceHost) {
    this.calls = new AnimalCalls(() => host.random());
  }

  /** El mapa de la partida: sus emisores y el fondo de su tema. */
  load(s: GameState): void {
    this.stopEmitters();
    this.emitters = ambientEmitters(s);
    this.bed = this.swap(this.bed, bedAmbientOf(s), (name) => this.bedLevelOf(name));
  }

  /** El clima de hoy (id de weather.json; null: despejado): su bucle, y lo que se oye a los animales. */
  setWeather(kind: string | null): void {
    if (kind === this.weatherKind) return;
    this.weatherKind = kind;
    this.weather = this.swap(this.weather, weatherAmbientOf(kind), (name) => WEATHER_LEVEL * ambientVolumeOf(name));
    this.relevel();
  }

  /** La camara se ha acercado o alejado (a `distance` casillas de donde mira): lo que se oye del ambiente y de los animales. */
  setCameraDistance(distance: number): void {
    const zoom = { ambience: ambienceZoomLevel(distance), animals: animalZoomLevel(distance) };
    if (!zoomMoved(this.zoom, zoom)) return;
    this.zoom = zoom;
    this.relevel();
  }

  /** Cada fotograma, con el oyente donde este: enciende lo que se acerca y apaga lo que se aleja. */
  update(seconds: number, listener: Point3): void {
    this.listener = listener;
    this.clock += seconds;
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

  /** Un animalito del tablero ha hecho algo: lo que diga, desde donde esta (si toca). */
  animal(moment: AnimalMoment): void {
    const hearing = { listener: this.listener, zoomLevel: this.zoom.animals, weather: this.weatherKind };
    const call = this.calls.callOf(moment, hearing, this.clock);
    if (call) this.host.playAt(call.sound, moment.at, call.tone);
  }

  /** El fondo y los emisores que suenan, al volumen de ahora (con el zoom y el clima de ahora). */
  private relevel(): void {
    for (const [index, handle] of this.playing) handle.setLevel(this.emitterLevelOf(this.emitters[index]!));
    if (this.bed) this.bed.handle.setLevel(this.bedLevelOf(this.bed.name));
  }

  private startEmitter(index: number): void {
    const emitter = this.emitters[index]!;
    this.playing.set(index, this.host.loops.start(emitter.sound, pointOf(emitter), this.emitterLevelOf(emitter)));
  }

  private emitterLevelOf(emitter: AmbientEmitter): number {
    return emitter.level * this.levelOf(emitter.sound);
  }

  private bedLevelOf(name: AmbientName): number {
    return BED_LEVEL * this.levelOf(name);
  }

  /** Lo de `name` frente a los demas, con lo que deja el clima (los animales se callan) y el zoom (a los animales, menos). */
  private levelOf(name: AmbientName): number {
    const zoomLevel = isAnimalAmbient(name) ? this.zoom.animals : this.zoom.ambience;
    return ambientVolumeOf(name) * weatherLevelOf(name, this.weatherKind) * zoomLevel;
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
