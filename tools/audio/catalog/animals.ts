/**
 * Lo que dicen los animalitos del tablero (src/view3d/engine/life/kinds.ts) cuando hacen algo cerca de la
 * camara: la rana que salta, el pajaro que sale de una copa, los gansos que pasan. Cada uno con lo suyo,
 * pequeño y del campo (el estilo, `nature`, en soundKinds.ts); con mal tiempo se callan (el juego, en
 * src/view3d/systems/sound/animalCalls.ts).
 */
import { nature, type SoundSpec } from './spec';

export const ANIMAL_SOUNDS: readonly SoundSpec[] = [
  nature('animal_frog', 0.6, 'constant', 'A small frog croaks twice: a short throaty ribbit'),
  nature('animal_squirrel', 0.6, 'often', 'A squirrel chatters in a tree: a quick high chittering squeak'),
  nature('animal_deer', 0.7, 'often', 'A young deer at the edge of a forest gives one soft short bleat'),
  nature('animal_bird', 0.8, 'constant', 'A small songbird takes off from a tree: a quick flutter of wings and one bright chirp'),
  nature('animal_vulture', 1.2, 'often', 'A vulture screeches once, high in the sky far away: a harsh raspy cry'),
  nature('animal_penguin', 0.8, 'often', 'A penguin calls once: a short braying squawk'),
  nature('animal_seal', 0.8, 'often', 'A seal on the ice barks twice: short hoarse barks'),
  nature('animal_goose', 1, 'often', 'A few geese honk while flying overhead, with slow wing flaps'),
  nature('animal_splash', 0.6, 'often', 'A small animal plops into cold water with a light splash'),
];
