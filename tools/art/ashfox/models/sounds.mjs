// Los efectos de sonido del juego, descritos en corto: cada uno son sus voces (de donde sale el
// sonido: ruido, FM o un resonador que suena como madera, metal o cristal) y sus notas (cuando suena
// cada voz y cuanto). `sounds.mjs` lo pasa a .ashfox y, con --export, a WAV en public/assets/sfx/.
// Lo que exige Ashfox (envolventes que empiezan y acaban en 0, filtros que no se cruzan, duracion
// total) lo pone el generador. La lista de nombres del juego es `SOUND_IDS` (src/audio/sfx.ts).

/** Una curva suave por puntos `[momento 0..1, valor]`. */
export const curve = (points) => ({
  domain: 'linear',
  interpolation: 'smooth',
  points: points.map(([at, value]) => ({ at, value })),
});

/** Ganancia de un golpe: sube, cae y acaba en silencio (Ashfox pide 0 al principio y al final). */
export const envelope = (...points) => curve([[0, 0], ...points, [1, 0]]);

/** Golpe seco: llega a `peak` enseguida y se apaga poco a poco. */
export const pluck = (peak = 1, attack = 0.03) => envelope([attack, peak], [0.35, peak * 0.35]);

/** Nota sostenida: sube, se mantiene y se suelta. */
export const swell = (peak = 1, attack = 0.15, release = 0.7) => envelope([attack, peak], [release, peak * 0.8]);

export const noise = () => ({ kind: 'noise' });

/** Tono FM: `pitch` en Hz (o una curva), `ratio` y `index` lo hacen mas metalico o mas sucio. */
export const fm = (pitch, { ratio = 1, index = 0.3, vibratoHz = 0, vibratoCents = 0 } = {}) => ({
  kind: 'fm',
  pitch,
  ratio,
  index,
  vibratoHz,
  vibratoCents,
});

/** Algo que se golpea y vibra: cada modo `[Hz, segundos en apagarse, ganancia]`. */
export const resonator = (modes, excitation = { kind: 'impulse' }) => ({
  kind: 'resonator',
  excitation,
  modes: modes.map(([hz, decay, gain], index) => ({ id: `mode_${index}`, hz, decay, gain })),
});

/** Golpe con ruido (mas sordo que el impulso): para pasos y madera. */
export const scuff = (seconds = 0.01) => ({ kind: 'noise', duration: seconds });

/** Las notas de una melodia: cada una `[segundos, semitonos desde la primera]`. */
export const melody = (voice, notes, duration) => notes.map(([at, semitones]) => ({ voice, at, duration, pitchCents: semitones * 100 }));

// ---- Los sonidos ----

const BELL = resonator([
  [880, 0.5, 1],
  [2210, 0.25, 0.3],
  [3520, 0.12, 0.15],
]);
const SOFT_BELL = resonator([
  [660, 0.35, 1],
  [1650, 0.18, 0.25],
]);
const KNOCK = resonator(
  [
    [520, 0.07, 1],
    [1380, 0.04, 0.4],
  ],
  scuff(0.006),
);

export const SOUNDS = {
  // Menus: pasar por las opciones, aceptar y volver.
  ui_move: {
    voices: { tick: { source: resonator([[1900, 0.03, 1]]), gain: pluck(0.7, 0.08), highpass: 400 } },
    notes: [{ voice: 'tick', duration: 0.06 }],
    gainDb: -2,
  },
  ui_select: {
    voices: { blip: { source: fm(880, { ratio: 2, index: 0.2 }), gain: pluck(0.6, 0.06), lowpass: 6000 } },
    notes: melody(
      'blip',
      [
        [0, 0],
        [0.06, 7],
      ],
      0.09,
    ),
    gainDb: -16,
  },
  ui_back: {
    voices: { blip: { source: fm(660, { ratio: 2, index: 0.2 }), gain: pluck(0.6, 0.06), lowpass: 5000 } },
    notes: melody(
      'blip',
      [
        [0, 0],
        [0.06, -5],
      ],
      0.09,
    ),
    gainDb: -16,
  },

  // Elegir una unidad tuya: un toque de madera, como una ficha.
  unit_select: {
    voices: { knock: { source: KNOCK, gain: pluck(0.9), highpass: 120, lowpass: 6000 } },
    notes: [{ voice: 'knock', duration: 0.12 }],
    gainDb: -4,
    variants: 3,
  },

  // Un paso por casilla, segun como se mueva la unidad (`motion` de movements.json).
  step_march: {
    voices: {
      foot: {
        source: resonator(
          [
            [170, 0.05, 1],
            [900, 0.03, 0.35],
          ],
          scuff(0.012),
        ),
        gain: pluck(0.9, 0.04),
        highpass: 40,
        lowpass: 4000,
      },
    },
    notes: [{ voice: 'foot', duration: 0.14 }],
    gainDb: 3,
    variants: 4,
  },
  step_drive: {
    voices: {
      engine: {
        source: fm(
          curve([
            [0, 70],
            [0.5, 84],
            [1, 66],
          ]),
          { ratio: 2, index: 0.9 },
        ),
        gain: swell(0.8, 0.2, 0.6),
        lowpass: 900,
      },
      rattle: { source: noise(), gain: swell(0.15, 0.2, 0.6), highpass: 300, lowpass: 2000 },
    },
    notes: [
      { voice: 'engine', duration: 0.24 },
      { voice: 'rattle', duration: 0.24 },
    ],
    gainDb: -20,
    variants: 3,
  },
  step_fly: {
    voices: {
      air: {
        source: noise(),
        gain: swell(0.5, 0.35, 0.55),
        highpass: 250,
        lowpass: curve([
          [0, 900],
          [0.5, 2600],
          [1, 1100],
        ]),
      },
      hum: { source: fm(140, { ratio: 3, index: 0.4, vibratoHz: 18, vibratoCents: 30 }), gain: swell(0.25, 0.3, 0.6), lowpass: 1500 },
    },
    notes: [
      { voice: 'air', duration: 0.26 },
      { voice: 'hum', duration: 0.26 },
    ],
    gainDb: -10,
    variants: 3,
  },

  // Disparos: fusil (infanteria), cañon (vehiculos), artilleria (en arco, de lejos) y misil (aviones).
  shot_rifle: {
    voices: {
      crack: { source: noise(), gain: envelope([0.03, 1], [0.15, 0.4], [0.5, 0.1]), highpass: 1200, lowpass: 9000 },
      body: {
        source: fm(
          curve([
            [0, 260],
            [1, 90],
          ]),
          { ratio: 1.5, index: 1.2 },
        ),
        gain: envelope([0.03, 0.6], [0.4, 0.15]),
        lowpass: 1800,
      },
    },
    notes: [
      { voice: 'crack', duration: 0.16 },
      { voice: 'body', duration: 0.16 },
    ],
    gainDb: -10,
    variants: 3,
  },
  shot_cannon: {
    voices: {
      blast: {
        source: noise(),
        gain: envelope([0.02, 1], [0.12, 0.5], [0.5, 0.15]),
        highpass: 60,
        lowpass: curve([
          [0, 4000],
          [1, 500],
        ]),
      },
      boom: {
        source: fm(
          curve([
            [0, 120],
            [0.5, 56],
            [1, 46],
          ]),
          { ratio: 1.2, index: 0.6 },
        ),
        gain: envelope([0.02, 1], [0.45, 0.35]),
        lowpass: 700,
      },
    },
    notes: [
      { voice: 'blast', duration: 0.45 },
      { voice: 'boom', duration: 0.45 },
    ],
    gainDb: -12,
    variants: 3,
  },
  shot_artillery: {
    voices: {
      blast: {
        source: noise(),
        gain: envelope([0.02, 1], [0.1, 0.4], [0.4, 0.1]),
        highpass: 60,
        lowpass: curve([
          [0, 3000],
          [1, 400],
        ]),
      },
      boom: {
        source: fm(
          curve([
            [0, 90],
            [1, 46],
          ]),
          { ratio: 1.1, index: 0.8 },
        ),
        gain: envelope([0.02, 1], [0.5, 0.3]),
        lowpass: 500,
      },
      whistle: {
        source: fm(
          curve([
            [0, 1500],
            [1, 700],
          ]),
          { ratio: 1, index: 0.05 },
        ),
        gain: envelope([0.3, 0.12], [0.8, 0.1]),
        highpass: 400,
      },
    },
    notes: [
      { voice: 'blast', duration: 0.55 },
      { voice: 'boom', duration: 0.55 },
      { voice: 'whistle', at: 0.1, duration: 0.6 },
    ],
    gainDb: -11,
    variants: 3,
  },
  shot_missile: {
    voices: {
      launch: {
        source: noise(),
        gain: envelope([0.04, 0.9], [0.3, 0.6], [0.8, 0.2]),
        highpass: 200,
        lowpass: curve([
          [0, 1200],
          [0.4, 5000],
          [1, 2500],
        ]),
      },
      motor: {
        source: fm(
          curve([
            [0, 200],
            [1, 420],
          ]),
          { ratio: 2.5, index: 1.5 },
        ),
        gain: envelope([0.05, 0.3], [0.7, 0.2]),
        lowpass: 2500,
      },
    },
    notes: [
      { voice: 'launch', duration: 0.5 },
      { voice: 'motor', duration: 0.5 },
    ],
    gainDb: -10,
    variants: 3,
  },

  // Recibir un golpe (chapa y polvo) y caer (la explosion).
  hit: {
    voices: {
      thud: { source: noise(), gain: pluck(1, 0.02), highpass: 80, lowpass: 3000 },
      clank: {
        source: resonator([
          [430, 0.12, 1],
          [1170, 0.08, 0.5],
          [2650, 0.05, 0.3],
        ]),
        gain: pluck(0.7, 0.02),
        highpass: 150,
      },
    },
    notes: [
      { voice: 'thud', duration: 0.2 },
      { voice: 'clank', duration: 0.2 },
    ],
    gainDb: -3,
    variants: 3,
  },
  explosion: {
    voices: {
      blast: {
        source: noise(),
        gain: envelope([0.02, 1], [0.15, 0.7], [0.5, 0.3]),
        highpass: 40,
        lowpass: curve([
          [0, 6000],
          [0.3, 1500],
          [1, 250],
        ]),
      },
      rumble: {
        source: fm(
          curve([
            [0, 80],
            [0.4, 52],
            [1, 44],
          ]),
          { ratio: 1.4, index: 1 },
        ),
        gain: envelope([0.03, 1], [0.5, 0.4]),
        lowpass: 400,
      },
      debris: { source: noise(), gain: envelope([0.2, 0.25], [0.6, 0.1]), highpass: 2500, lowpass: 8000 },
    },
    notes: [
      { voice: 'blast', duration: 1.1 },
      { voice: 'rumble', duration: 1.1 },
      { voice: 'debris', at: 0.1, duration: 0.8 },
    ],
    gainDb: -9,
    variants: 3,
  },

  // Capturar: un toque que sube a cada paso y, al acabar, una fanfarria.
  capture: {
    voices: { bell: { source: SOFT_BELL, gain: pluck(0.8), highpass: 150 } },
    notes: melody(
      'bell',
      [
        [0, 0],
        [0.12, 5],
      ],
      0.35,
    ),
    gainDb: -10,
  },
  capture_done: {
    voices: { bell: { source: BELL, gain: pluck(0.8), highpass: 150 } },
    notes: melody(
      'bell',
      [
        [0, 0],
        [0.1, 4],
        [0.2, 7],
        [0.3, 12],
      ],
      0.5,
    ),
    gainDb: -12,
  },

  // Una unidad nueva sale de la fabrica: un golpe de metal y una subida.
  spawn: {
    voices: {
      clunk: {
        source: resonator([
          [210, 0.15, 1],
          [620, 0.1, 0.5],
        ]),
        gain: pluck(1, 0.02),
        highpass: 60,
        lowpass: 5000,
      },
      rise: {
        source: fm(
          curve([
            [0, 300],
            [1, 900],
          ]),
          { ratio: 2, index: 0.3 },
        ),
        gain: swell(0.3, 0.3, 0.6),
        lowpass: 4000,
      },
    },
    notes: [
      { voice: 'clunk', duration: 0.3 },
      { voice: 'rise', at: 0.05, duration: 0.3 },
    ],
    gainDb: -9,
  },

  // Te toca: dos campanadas.
  turn_start: {
    voices: { bell: { source: SOFT_BELL, gain: pluck(0.8), highpass: 150 } },
    notes: melody(
      'bell',
      [
        [0, 0],
        [0.18, 7],
      ],
      0.6,
    ),
    gainDb: -10,
  },

  // Final de la partida.
  victory: {
    voices: {
      bell: { source: BELL, gain: pluck(0.8), highpass: 150 },
      horn: { source: fm(523, { ratio: 1, index: 0.8, vibratoHz: 5, vibratoCents: 8 }), gain: swell(0.35, 0.1, 0.75), lowpass: 3000 },
    },
    notes: [
      ...melody(
        'bell',
        [
          [0, 0],
          [0.15, 4],
          [0.3, 7],
          [0.5, 12],
        ],
        0.7,
      ),
      ...melody('horn', [[0.5, -12]], 0.9),
    ],
    gainDb: -12,
  },
  defeat: {
    voices: {
      bell: { source: SOFT_BELL, gain: pluck(0.8), highpass: 100 },
      horn: { source: fm(262, { ratio: 1, index: 0.6, vibratoHz: 4, vibratoCents: 10 }), gain: swell(0.35, 0.15, 0.7), lowpass: 2000 },
    },
    notes: [
      ...melody(
        'bell',
        [
          [0, 7],
          [0.25, 3],
          [0.5, 0],
        ],
        0.8,
      ),
      ...melody('horn', [[0.5, -12]], 1.1),
    ],
    gainDb: -12,
  },
};
