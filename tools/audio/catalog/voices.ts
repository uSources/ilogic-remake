/**
 * Las voces de los muñecos: un balbuceo ininteligible, sin palabras (el estilo de voz va en
 * soundKinds.ts); el piloto, por radio. Suenan con cada orden, cuatro variantes de cada una.
 */
import { voice, type SoundSpec } from './spec';

export const VOICE_SOUNDS: readonly SoundSpec[] = [
  voice('voice_ack_infantry', 0.8, 'A soldier answers an order with a quick eager two-syllable reply'),
  voice('voice_ack_driver', 0.8, 'A vehicle driver answers an order with a short calm confident reply'),
  voice(
    'voice_ack_pilot',
    1,
    'A pilot answers an order over a small walkie-talkie radio: a short cool reply, muffled and narrow-band, with a click at the start',
  ),
  voice('voice_attack', 0.8, 'A soldier shouts a short brave battle cry'),
  voice('voice_hurt', 0.5, 'A soldier lets out a short comic yelp of pain'),
  voice('voice_down', 1, 'A soldier lets out a comic falling wail that fades away'),
  voice('voice_cheer', 1, 'A soldier cheers with a short happy whoop'),
];
