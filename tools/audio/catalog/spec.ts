/**
 * Que es un sonido del catalogo y como se escribe uno. El texto va en ingles (es lo que entiende el
 * modelo) y dice solo que suena: el estilo comun de cada clase se le añade en soundKinds.ts.
 */

/**
 * De que clase es un sonido: decide el estilo del texto, como se recorta y donde acaba (soundKinds.ts).
 * `voice` es un efecto de voz de muñeco; `nature`, un efecto del campo (un animal, un trueno), sin el
 * estilo de guerra de juguete; `zone`, un ambiente que suena desde un sitio del mapa (mono); `ambient`,
 * el fondo del tema o del clima (estereo); `jingle`, musica corta que no se repite.
 */
export type SoundKind = 'sfx' | 'voice' | 'nature' | 'zone' | 'ambient' | 'music' | 'jingle';

export interface SoundSpec {
  /** Su nombre en el juego: el de los efectos (src/audio/soundNames.ts) o el de la pista. */
  readonly id: string;
  readonly kind: SoundKind;
  /** Lo que suena, en ingles. */
  readonly prompt: string;
  /** Lo que debe durar, en segundos. */
  readonly seconds: number;
  /** Cuantas variantes usa el juego (efectos y voces; ambientes y musica, una). */
  readonly variants?: number;
}

/**
 * Cada cuanto suena un efecto, que decide cuantas variantes tiene: lo que suena a cada paso o en cada
 * ataque cansa si es siempre igual; lo que pasa pocas veces en una partida, con uno basta.
 */
export type Frequency = 'constant' | 'often' | 'rare';

const VARIANTS_BY_FREQUENCY: Readonly<Record<Frequency, number>> = { constant: 4, often: 3, rare: 1 };

/** Las voces se oyen con cada orden: cuatro, para que no sea siempre la misma frase. */
const VOICE_VARIANTS = 4;

const ZONE_SECONDS = 20;
const AMBIENT_SECONDS = 30;
const JINGLE_SECONDS = 6;

export const effect = (id: string, seconds: number, frequency: Frequency, prompt: string): SoundSpec => ({
  id,
  kind: 'sfx',
  prompt,
  seconds,
  variants: VARIANTS_BY_FREQUENCY[frequency],
});

export const nature = (id: string, seconds: number, frequency: Frequency, prompt: string): SoundSpec => ({
  ...effect(id, seconds, frequency, prompt),
  kind: 'nature',
});

export const voice = (id: string, seconds: number, prompt: string): SoundSpec => ({
  id,
  kind: 'voice',
  prompt,
  seconds,
  variants: VOICE_VARIANTS,
});

export const zone = (id: string, prompt: string): SoundSpec => ({ id, kind: 'zone', prompt, seconds: ZONE_SECONDS });

export const ambient = (id: string, prompt: string): SoundSpec => ({ id, kind: 'ambient', prompt, seconds: AMBIENT_SECONDS });

export const music = (id: string, seconds: number, prompt: string): SoundSpec => ({ id, kind: 'music', prompt, seconds });

export const jingle = (id: string, prompt: string): SoundSpec => ({ id, kind: 'jingle', prompt, seconds: JINGLE_SECONDS });
