/**
 * Los sonidos que se hacen con IA (Stable Audio 3 en ComfyUI): que es cada uno, cuanto dura y cuantas
 * variantes usa el juego. Lo que pide el juego esta en src/audio/soundNames.ts (efectos y voces),
 * src/audio/ambientNames.ts (ambientes) y src/audio/music.ts (musica).
 *
 * Un efecto lo hace una sola herramienta: los que ya hace Ashfox (tools/art/ashfox/models/sounds.mjs)
 * no estan aqui; para rehacer uno con IA, se quita de alli y se pone aqui.
 */
import { AMBIENCE_SOUNDS } from './ambience';
import { ANIMAL_SOUNDS } from './animals';
import { BOARD_SOUNDS } from './board';
import { INTERFACE_SOUNDS } from './interface';
import { MUSIC_SOUNDS } from './music';
import type { SoundSpec } from './spec';
import { UNIT_SOUNDS } from './units';
import { VOICE_SOUNDS } from './voices';

export type { SoundKind, SoundSpec } from './spec';

export const CATALOG: readonly SoundSpec[] = [
  ...UNIT_SOUNDS,
  ...BOARD_SOUNDS,
  ...INTERFACE_SOUNDS,
  ...VOICE_SOUNDS,
  ...AMBIENCE_SOUNDS,
  ...ANIMAL_SOUNDS,
  ...MUSIC_SOUNDS,
];

export function soundSpec(id: string): SoundSpec {
  const spec = CATALOG.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`"${id}" no esta en el catalogo (tools/audio/catalog/)`);
  return spec;
}
