/**
 * Las voces de los muñecos: chillonas, ininteligibles, sin palabras (el estilo de voz va en
 * soundKinds.ts). Suenan con cada orden, cuatro variantes de cada una.
 */
import { voice, type SoundSpec } from './spec';

export const VOICE_SOUNDS: readonly SoundSpec[] = [
  voice('voice_ack_infantry', 0.8, 'A tiny soldier answers an order with a quick eager two-syllable chirp'),
  voice('voice_ack_driver', 0.8, 'A tiny tank driver answers an order with a gruff low mumble, muffled inside a metal vehicle'),
  voice('voice_ack_pilot', 1, 'A tiny pilot answers an order over a crackly radio: a short squeaky mumble between two radio static clicks'),
  voice('voice_attack', 0.8, 'A tiny soldier shouts a short brave battle cry'),
  voice('voice_hurt', 0.5, 'A tiny soldier lets out a short comic yelp of pain'),
  voice('voice_down', 1, 'A tiny toy soldier lets out a comic falling wail that fades away'),
  voice('voice_cheer', 1, 'A tiny soldier cheers with a happy whoop'),
];
