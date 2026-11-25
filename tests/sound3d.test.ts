import { describe, expect, it } from 'vitest';
import {
  BED_AMBIENTS,
  WEATHER_AMBIENTS,
  ZONE_AMBIENTS,
  type AmbientName,
  type LoopHandle,
  type LoopPort,
  type ZoneAmbient,
} from '../src/audio/ambientNames';
import { SOUND_FALLBACKS, hasSound, resolveSound } from '../src/audio/soundNames';
import type { Point3 } from '../src/view3d/ports/camera';
import type { AnimalMoment } from '../src/view3d/ports/life';
import type { EffectStage, PieceStage, Spot } from '../src/view3d/ports/stage';
import { feet, sound } from '../src/view3d/systems/events/steps';
import { runSteps } from '../src/view3d/systems/events/timeline';
import {
  ambientEmitters,
  ambientVolumeOf,
  animalLevelOf,
  emittersInEarshot,
  thunderOf,
  type AmbientEmitter,
} from '../src/view3d/systems/sound/ambience';
import { AmbiencePlayer } from '../src/view3d/systems/sound/ambiencePlayer';
import { AnimalCalls, callVolumeOf, type Hearing } from '../src/view3d/systems/sound/animalCalls';
import { ambienceZoomLevel, animalZoomLevel, CameraListener, zoomLevel } from '../src/view3d/systems/sound/listener';
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

  it('el ambiente se oye con la camara baja y casi nada desde arriba', () => {
    expect(ambienceZoomLevel(6)).toBe(1);
    expect(ambienceZoomLevel(13)).toBeLessThan(1);
    expect(ambienceZoomLevel(13)).toBeGreaterThan(ambienceZoomLevel(20));
    expect(ambienceZoomLevel(40)).toBeCloseTo(0.15);
  });

  it('los animalitos, solo al acercar la camara: desde la vista de empezar, nada', () => {
    expect(animalZoomLevel(6)).toBe(1);
    expect(animalZoomLevel(8)).toBeGreaterThan(0);
    expect(animalZoomLevel(8)).toBeLessThan(1);
    expect(animalZoomLevel(13)).toBe(0);
    expect(animalZoomLevel(40)).toBe(0);
  });
});

/** Pone `terrain` en el cuadrado de `size` casillas que empieza en `from`. */
function paint(s: ReturnType<typeof blankState>, from: { x: number; y: number }, size: number, terrain: string): void {
  for (let x = from.x; x < from.x + size; x++) for (let y = from.y; y < from.y + size; y++) s.map[x]![y] = terrain;
}

const soundsOf = (emitters: readonly AmbientEmitter[]) => new Set(emitters.map((emitter) => emitter.sound));

describe('ambiente por zonas', () => {
  it('pradera en la hierba; sin agua no hay mar, tampoco en el borde del tablero', () => {
    expect(soundsOf(ambientEmitters(blankState()))).toEqual(new Set(['amb_meadow']));
  });

  it('el hielo no suena a agua, ni el agua que solo toca hielo', () => {
    const s = blankState();
    paint(s, { x: 10, y: 10 }, 8, 'Ice');
    paint(s, { x: 12, y: 12 }, 4, 'Water');
    expect(soundsOf(ambientEmitters(s)).has('amb_sea')).toBe(false);
  });

  it('el agua suena flojita frente al resto', () => {
    expect(ambientVolumeOf('amb_sea')).toBeLessThan(ambientVolumeOf('amb_desert'));
    expect(ambientVolumeOf('amb_desert')).toBeLessThan(ambientVolumeOf('amb_meadow'));
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

/** Apunta los bucles que se empiezan y se paran, y el ultimo volumen de cada uno. */
class FakeLoops implements LoopPort {
  readonly started: { name: AmbientName; at: Point3 | null }[] = [];
  readonly stopped: AmbientName[] = [];
  readonly levels = new Map<AmbientName, number>();
  start(name: AmbientName, at: Point3 | null, level: number): LoopHandle {
    this.started.push({ name, at });
    this.levels.set(name, level);
    return { setLevel: (next) => this.levels.set(name, next), stop: () => this.stopped.push(name) };
  }
}

function playerWith(loops: FakeLoops, random = () => 0.5) {
  const thunders: Point3[] = [];
  const heard: string[] = [];
  const later: (() => void)[] = [];
  const player = new AmbiencePlayer({
    loops,
    playAt: (sound, at) => {
      heard.push(sound);
      thunders.push(at);
    },
    later: (_seconds, run) => later.push(run),
    random,
  });
  return { player, thunders, heard, later };
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

  it('al alejar la camara bajan el fondo y lo de cerca, no el clima', () => {
    const loops = new FakeLoops();
    const { player } = playerWith(loops);
    const s = blankState();
    s.theme = 'Desert';
    paint(s, { x: 2, y: 14 }, 4, 'GrassMountain');
    player.load(s);
    player.setWeather('Rain');
    player.update(1, point(4, 16));
    const before = new Map(loops.levels);
    player.setCameraDistance(40);
    expect(loops.levels.get('amb_desert')).toBeCloseTo(before.get('amb_desert')! * ambienceZoomLevel(40));
    expect(loops.levels.get('amb_peaks')).toBeCloseTo(before.get('amb_peaks')! * ambienceZoomLevel(40));
    expect(loops.levels.get('amb_rain')).toBe(before.get('amb_rain'));
  });

  it('lo de animales (el bosque, el fondo de la llanura) solo al acercar la camara; el viento de las cumbres, no', () => {
    const loops = new FakeLoops();
    const { player } = playerWith(loops);
    const s = blankState();
    paint(s, { x: 2, y: 14 }, 4, 'Woods');
    paint(s, { x: 10, y: 14 }, 4, 'GrassMountain');
    player.load(s);
    player.update(1, point(6, 16));
    const near = new Map(loops.levels);
    player.setCameraDistance(13);
    expect(loops.levels.get('amb_woods')).toBe(0);
    expect(loops.levels.get('amb_plains')).toBe(0);
    expect(loops.levels.get('amb_peaks')).toBeCloseTo(near.get('amb_peaks')! * ambienceZoomLevel(13));
    player.setCameraDistance(8);
    expect(loops.levels.get('amb_woods')).toBeCloseTo(near.get('amb_woods')! * animalZoomLevel(8));
    player.setCameraDistance(6);
    expect(loops.levels.get('amb_woods')).toBeCloseTo(near.get('amb_woods')!);
  });

  it('con mal tiempo los animales se callan: bajan el bosque y el fondo de la llanura, no el viento ni el clima', () => {
    const loops = new FakeLoops();
    const { player } = playerWith(loops);
    const s = blankState();
    paint(s, { x: 2, y: 14 }, 4, 'Woods');
    paint(s, { x: 10, y: 14 }, 4, 'GrassMountain');
    player.load(s);
    player.update(1, point(6, 16));
    const sunny = new Map(loops.levels);
    player.setWeather('Storm');
    expect(loops.levels.get('amb_woods')).toBe(0);
    expect(loops.levels.get('amb_plains')).toBe(0);
    expect(loops.levels.get('amb_peaks')).toBe(sunny.get('amb_peaks'));
    expect(loops.levels.get('amb_storm')).toBeGreaterThan(0);
    player.setWeather('Rain');
    expect(loops.levels.get('amb_woods')).toBeCloseTo(sunny.get('amb_woods')! * animalLevelOf('Rain'));
    player.setWeather(null);
    expect(loops.levels.get('amb_woods')).toBeCloseTo(sunny.get('amb_woods')!);
  });

  it('los animales del tablero suenan desde su sitio, y con tormenta no', () => {
    const loops = new FakeLoops();
    const { player, heard, thunders } = playerWith(loops, () => 0);
    player.load(blankState());
    player.update(1, point(10, 10));
    const frog: AnimalMoment = { animal: 'frog', act: 'move', at: { x: 11, y: 0, z: 10 } };
    player.animal(frog);
    expect(heard).toEqual(['animal_frog']);
    expect(thunders).toEqual([frog.at]);
    player.setWeather('Storm');
    player.update(5, point(10, 10));
    player.animal(frog);
    expect(heard).toEqual(['animal_frog']);
  });

  it('los animales del tablero, solo con la camara cerca: desde la vista de empezar, ni uno', () => {
    const loops = new FakeLoops();
    const { player, heard } = playerWith(loops, () => 0);
    player.load(blankState());
    player.update(1, point(10, 10));
    const frog: AnimalMoment = { animal: 'frog', act: 'move', at: { x: 11, y: 0, z: 10 } };
    player.setCameraDistance(13);
    player.animal(frog);
    expect(heard).toEqual([]);
    player.setCameraDistance(6);
    player.animal(frog);
    expect(heard).toEqual(['animal_frog']);
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

describe('lo que dicen los animales', () => {
  const sunny: Hearing = { listener: point(0, 0), zoomLevel: 1, weather: null };
  const moment = (animal: string, act: AnimalMoment['act'], x = 1): AnimalMoment => ({ animal, act, at: { x, y: 0, z: 0 } });
  const soundOf = (calls: AnimalCalls, ...args: Parameters<AnimalCalls['callOf']>) => calls.callOf(...args)?.sound ?? null;

  it('cada uno lo suyo; lo que no tiene voz calla', () => {
    const calls = new AnimalCalls(() => 0);
    expect(soundOf(calls, moment('goose', 'leave'), sunny, 0)).toBe('animal_goose');
    expect(soundOf(calls, moment('penguin', 'splash'), sunny, 10)).toBe('animal_splash');
    expect(soundOf(calls, moment('butterfly_yellow', 'leave'), sunny, 20)).toBeNull();
    expect(soundOf(calls, moment('frog', 'leave'), sunny, 30)).toBeNull();
  });

  it('uno cada poco, no un coro', () => {
    const calls = new AnimalCalls(() => 0);
    expect(soundOf(calls, moment('frog', 'move'), sunny, 0)).toBe('animal_frog');
    expect(soundOf(calls, moment('seal', 'move'), sunny, 0.5)).toBeNull();
    expect(soundOf(calls, moment('seal', 'move'), sunny, 2)).toBe('animal_seal');
  });

  it('ni lejos, ni con la camara arriba, ni con tormenta; con lluvia, menos veces', () => {
    const calls = new AnimalCalls(() => 0.15);
    expect(soundOf(calls, moment('frog', 'move', 30), sunny, 0)).toBeNull();
    expect(soundOf(calls, moment('frog', 'move'), { ...sunny, zoomLevel: 0 }, 0)).toBeNull();
    expect(soundOf(calls, moment('frog', 'move'), { ...sunny, weather: 'Storm' }, 0)).toBeNull();
    expect(soundOf(calls, moment('frog', 'move'), { ...sunny, weather: 'Rain' }, 0)).toBeNull();
    expect(soundOf(calls, moment('frog', 'move'), sunny, 0)).toBe('animal_frog');
    expect(soundOf(new AnimalCalls(() => 0), moment('frog', 'move'), { ...sunny, listener: null }, 0)).toBeNull();
  });

  it('flojos, y mas fuertes cuanto mas cerca; con la camara arriba, casi nada', () => {
    expect(callVolumeOf(0, 1)).toBeLessThan(0.6);
    expect(callVolumeOf(1, 1)).toBeGreaterThan(callVolumeOf(4, 1) * 3);
    expect(callVolumeOf(7, 1)).toBe(0);
    expect(callVolumeOf(1, 0.15)).toBeLessThan(callVolumeOf(1, 1) / 5);
  });

  it('cada vez con un tono algo distinto', () => {
    const low = new AnimalCalls(() => 0).callOf(moment('frog', 'move'), sunny, 0)!;
    const high = new AnimalCalls(() => 0.49).callOf(moment('frog', 'move'), sunny, 0)!;
    expect(low.tone.rate).toBeLessThan(1);
    expect(high.tone.rate).toBeCloseTo(1, 1);
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
