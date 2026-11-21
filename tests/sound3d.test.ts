import { describe, expect, it } from 'vitest';
import {
  BED_AMBIENTS,
  WEATHER_AMBIENTS,
  ZONE_AMBIENTS,
  type AmbientName,
  type LoopPort,
  type ZoneAmbient,
} from '../src/audio/ambientNames';
import { SOUND_FALLBACKS, hasSound, resolveSound } from '../src/audio/soundNames';
import type { Point3 } from '../src/view3d/ports/camera';
import type { EffectStage, PieceStage, Spot } from '../src/view3d/ports/stage';
import { feet, sound } from '../src/view3d/systems/events/steps';
import { runSteps } from '../src/view3d/systems/events/timeline';
import { ambientEmitters, emittersInEarshot, thunderOf, type AmbientEmitter } from '../src/view3d/systems/sound/ambience';
import { AmbiencePlayer } from '../src/view3d/systems/sound/ambiencePlayer';
import { CameraListener, zoomLevel } from '../src/view3d/systems/sound/listener';
import { CATALOG } from '../tools/audio/catalog';
import { blankState } from './helpers';

describe('nombres con sustituto', () => {
  it('un sonido que hay suena el mismo', () => {
    expect(resolveSound('shot_rifle')).toBe('shot_rifle');
  });

  it('toda cadena de sustitutos acaba en un sonido que hay o en nada, sin vueltas', () => {
    const names = Object.keys(SOUND_FALLBACKS);
    const chainLength = (name: string, seen: Set<string> = new Set()): number => {
      if (hasSound(name) || seen.has(name)) return seen.size;
      const next = (SOUND_FALLBACKS as Record<string, string | null>)[name];
      return next ? chainLength(next, new Set([...seen, name])) : seen.size;
    };
    for (const name of names) expect(chainLength(name), name).toBeLessThan(names.length);
    for (const name of names) {
      const next = (SOUND_FALLBACKS as Record<string, string | null>)[name];
      if (!hasSound(name) && next) expect(resolveSound(name), name).toBe(resolveSound(next));
    }
  });

  it('un sustituto es un nombre conocido', () => {
    const known = (name: string) => hasSound(name) || name in SOUND_FALLBACKS;
    for (const next of Object.values(SOUND_FALLBACKS)) if (next) expect(known(next), next).toBe(true);
  });
});

describe('el oyente sigue a la camara', () => {
  const cameraAt = (yaw: number) => ({ target: { x: 5, y: 0, z: 7 }, distance: 10, yaw, pitch: 1 });

  it('esta sobre el punto al que mira y mira hacia donde ella', () => {
    const hearing = new CameraListener();
    expect(hearing.follow(cameraAt(0))).toBe(true);
    expect(hearing.pose.position).toEqual({ x: 5, y: 1.5, z: 7 });
    // Con yaw 0 la camara esta en +z mirando a -z: lo de +x sale a la derecha de la pantalla.
    expect(hearing.pose.forward.x).toBeCloseTo(0);
    expect(hearing.pose.forward.z).toBeCloseTo(-1);
    expect(hearing.pose.up).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('solo cambia si la camara se mueve, y siempre en la misma pose', () => {
    const hearing = new CameraListener();
    const pose = hearing.pose;
    hearing.follow(cameraAt(0));
    expect(hearing.follow(cameraAt(0))).toBe(false);
    expect(hearing.follow(cameraAt(Math.PI / 2))).toBe(true);
    expect(hearing.pose).toBe(pose);
    expect(pose.forward.x).toBeCloseTo(-1);
  });

  it('el tablero suena algo mas flojo al alejar la camara, sin apagarse', () => {
    expect(zoomLevel(6)).toBe(1);
    expect(zoomLevel(20)).toBeLessThan(1);
    expect(zoomLevel(40)).toBeCloseTo(0.6);
    expect(zoomLevel(100)).toBeCloseTo(0.6);
  });
});

/** Pone `terrain` en el cuadrado de `size` casillas que empieza en `from`. */
function paint(s: ReturnType<typeof blankState>, from: { x: number; y: number }, size: number, terrain: string): void {
  for (let x = from.x; x < from.x + size; x++) for (let y = from.y; y < from.y + size; y++) s.map[x]![y] = terrain;
}

const soundsOf = (emitters: readonly AmbientEmitter[]) => new Set(emitters.map((emitter) => emitter.sound));

describe('ambiente por zonas', () => {
  it('pradera en la hierba y el mar alrededor de la isla', () => {
    const emitters = ambientEmitters(blankState());
    expect(soundsOf(emitters)).toEqual(new Set(['amb_meadow', 'amb_sea']));
    const sea = emitters.filter((emitter) => emitter.sound === 'amb_sea');
    expect(sea.every((emitter) => emitter.at.x < 6 || emitter.at.y < 6 || emitter.at.x > 25 || emitter.at.y > 25)).toBe(true);
  });

  it('un bosque suena desde el bosque', () => {
    const s = blankState();
    paint(s, { x: 12, y: 12 }, 4, 'Woods');
    const woods = ambientEmitters(s).filter((emitter) => emitter.sound === 'amb_woods');
    expect(woods.length).toBeGreaterThan(0);
    for (const emitter of woods) expect(Math.hypot(emitter.at.x - 13.5, emitter.at.y - 13.5)).toBeLessThan(3);
  });

  it('dos arboles sueltos no son un bosque', () => {
    const s = blankState();
    paint(s, { x: 12, y: 12 }, 1, 'Woods');
    expect(soundsOf(ambientEmitters(s)).has('amb_woods')).toBe(false);
  });

  it('el agua de dentro es costa y, en el pantano, cienaga', () => {
    const s = blankState();
    paint(s, { x: 13, y: 13 }, 3, 'Water');
    expect(soundsOf(ambientEmitters(s)).has('amb_sea')).toBe(true);
    s.theme = 'Swamp';
    const swamp = ambientEmitters(s);
    expect(swamp.some((emitter) => emitter.sound === 'amb_marsh' && emitter.at.x > 6 && emitter.at.x < 25)).toBe(true);
  });

  it('las fabricas suenan desde su casilla', () => {
    const s = blankState();
    s.buildings.push({ type: 'Factory', x: 20, y: 9, owner: null } as (typeof s.buildings)[number]);
    const factory = ambientEmitters(s).find((emitter) => emitter.sound === 'amb_factory');
    expect(factory?.at).toEqual({ x: 20, y: 9 });
  });
});

const ZONE_SOUNDS: readonly ZoneAmbient[] = ['amb_woods', 'amb_sea', 'amb_meadow', 'amb_peaks', 'amb_dunes'];
const emitterAt = (x: number, y: number, sound: ZoneAmbient = 'amb_woods'): AmbientEmitter => ({ sound, at: { x, y }, level: 1 });
const point = (x: number, z: number): Point3 => ({ x, y: 1, z });

describe('que emisores suenan', () => {
  it('los cercanos; lo que ya suena aguanta algo mas lejos', () => {
    const emitters = [emitterAt(0, 0), emitterAt(16, 0, 'amb_sea'), emitterAt(40, 0, 'amb_peaks')];
    expect(emittersInEarshot(emitters, point(0, 0), new Set())).toEqual(new Set([0]));
    expect(emittersInEarshot(emitters, point(0, 0), new Set([1]))).toEqual(new Set([0, 1]));
  });

  it('cada ambiente suena desde un solo sitio, el mas cercano', () => {
    const emitters = [emitterAt(5, 0), emitterAt(1, 0), emitterAt(3, 0)];
    expect(emittersInEarshot(emitters, point(0, 0), new Set())).toEqual(new Set([1]));
  });

  it('el que ya suena no se cambia a otro sitio suyo por poco (sin parpadeos)', () => {
    const emitters = [emitterAt(2, 0), emitterAt(4, 0), emitterAt(10, 0)];
    expect(emittersInEarshot(emitters, point(0, 0), new Set([1]))).toEqual(new Set([1]));
    expect(emittersInEarshot(emitters, point(0, 0), new Set([2]))).toEqual(new Set([0]));
  });

  it('como mucho tres ambientes a la vez, los mas cercanos', () => {
    const emitters = ZONE_SOUNDS.map((sound, index) => emitterAt(index, 0, sound));
    expect(emittersInEarshot(emitters, point(0, 0), new Set())).toEqual(new Set([0, 1, 2]));
  });

  it('el trueno suena lejos y llega despues, mas tarde cuanto mas lejos', () => {
    const near = thunderOf(point(0, 0), () => 0);
    const far = thunderOf(point(0, 0), () => 0.99);
    expect(Math.hypot(near.at.x, near.at.z)).toBeGreaterThan(5);
    expect(far.delaySeconds).toBeGreaterThan(near.delaySeconds);
  });
});

/** Apunta los bucles que se empiezan y se paran. */
class FakeLoops implements LoopPort {
  readonly started: { name: AmbientName; at: Point3 | null }[] = [];
  readonly stopped: AmbientName[] = [];
  start(name: AmbientName, at: Point3 | null): { stop(): void } {
    this.started.push({ name, at });
    return { stop: () => this.stopped.push(name) };
  }
}

function playerWith(loops: FakeLoops) {
  const thunders: Point3[] = [];
  const later: (() => void)[] = [];
  const player = new AmbiencePlayer({
    loops,
    playAt: (_sound, at) => thunders.push(at),
    later: (_seconds, run) => later.push(run),
    random: () => 0.5,
  });
  return { player, thunders, later };
}

describe('el ambiente de la partida', () => {
  it('el fondo del tema y el clima suenan sin sitio, y el clima se cambia', () => {
    const loops = new FakeLoops();
    const { player } = playerWith(loops);
    const s = blankState();
    s.theme = 'Desert';
    player.load(s);
    player.setWeather('Rain');
    player.setWeather('Rain');
    player.setWeather('Clear');
    expect(loops.started).toEqual([
      { name: 'amb_desert', at: null },
      { name: 'amb_rain', at: null },
    ]);
    expect(loops.stopped).toEqual(['amb_rain']);
  });

  it('enciende lo que queda cerca de la camara y apaga lo que se aleja', () => {
    const loops = new FakeLoops();
    const { player } = playerWith(loops);
    const s = blankState();
    paint(s, { x: 2, y: 14 }, 4, 'Woods');
    player.load(s);
    player.update(1, point(4, 16));
    expect(loops.started.some((loop) => loop.name === 'amb_woods' && loop.at !== null)).toBe(true);
    player.update(1, point(60, 60));
    expect(loops.stopped).toContain('amb_woods');
  });

  it('cada relampago trae su trueno, despues', () => {
    const loops = new FakeLoops();
    const { player, thunders, later } = playerWith(loops);
    player.load(blankState());
    player.update(1, point(10, 10));
    player.lightning();
    expect(thunders).toEqual([]);
    later.forEach((run) => run());
    expect(thunders).toHaveLength(1);
  });
});

describe('los pasos de sonido llevan su sitio hasta el puerto', () => {
  it('runSteps pide el sonido con su sitio', async () => {
    const heard: { sound: string; at?: Spot }[] = [];
    const stages = {
      pieces: {} as PieceStage,
      effects: {} as EffectStage,
      sounds: { play: (sound: string, at?: Spot) => heard.push({ sound, at }) },
    };
    await runSteps([sound('hit', feet(3)), sound('ui_select')], stages);
    expect(heard).toEqual([
      { sound: 'hit', at: { kind: 'feet', uid: 3 } },
      { sound: 'ui_select', at: undefined },
    ]);
  });
});

describe('el juego y el catalogo de tools/audio piden los mismos sonidos', () => {
  const LOOP_KINDS: ReadonlySet<string> = new Set(['zone', 'ambient']);
  const TRACK_KINDS: ReadonlySet<string> = new Set(['music', 'jingle']);
  const effects = CATALOG.filter((spec) => !LOOP_KINDS.has(spec.kind) && !TRACK_KINDS.has(spec.kind)).map((spec) => spec.id);
  const loops = CATALOG.filter((spec) => LOOP_KINDS.has(spec.kind)).map((spec) => spec.id);

  it('cada efecto con sustituto se genera, y cada efecto del catalogo lo pide el juego', () => {
    expect(new Set(effects)).toEqual(new Set(Object.keys(SOUND_FALLBACKS)));
  });

  it('cada ambiente del juego se genera, y al reves', () => {
    expect(new Set(loops)).toEqual(new Set([...ZONE_AMBIENTS, ...BED_AMBIENTS, ...WEATHER_AMBIENTS]));
  });
});
