/**
 * Lo que dicen los animalitos del tablero cuando hacen algo (el motor lo cuenta: ports/life.ts): la rana
 * que salta croa, el pajaro que sale de una copa pia, los gansos que pasan graznan. No todos ni siempre:
 * solo cerca del oyente, uno cada poco, con la camara baja (desde arriba casi nunca, como los ambientes)
 * y con buen tiempo: con mal tiempo se callan, como sus ambientes (`animalLevelOf`, ambience.ts). Puro:
 * decide que suena; lo hace sonar el ambiente de la partida (ambiencePlayer.ts).
 */
import type { SoundName } from '../../../audio/sounds';
import type { Point3 } from '../../ports/camera';
import type { AnimalAct, AnimalMoment } from '../../ports/life';
import { animalLevelOf } from './ambience';

/** Lo que dice un animal al hacer algo, y que parte de las veces (0 a 1): la rana no croa en cada salto. */
interface AnimalCall {
  readonly sound: SoundName;
  readonly share: number;
}

/**
 * Cada animal (su modelo, engine/life/kinds.ts) y lo que dice con lo que hace; lo que no esta, calla (la
 * lagartija, el conejo, las mariposas).
 */
const ANIMAL_CALLS: Readonly<Record<string, Partial<Record<AnimalAct, AnimalCall>>>> = {
  frog: { move: { sound: 'animal_frog', share: 0.5 } },
  squirrel: { move: { sound: 'animal_squirrel', share: 0.3 } },
  deer: { move: { sound: 'animal_deer', share: 0.3 } },
  bird: { leave: { sound: 'animal_bird', share: 0.7 } },
  vulture: { leave: { sound: 'animal_vulture', share: 1 } },
  penguin: {
    move: { sound: 'animal_penguin', share: 0.2 },
    other: { sound: 'animal_penguin', share: 0.6 },
    splash: { sound: 'animal_splash', share: 1 },
  },
  seal: { move: { sound: 'animal_seal', share: 0.4 } },
  goose: { leave: { sound: 'animal_goose', share: 1 } },
  // El pez salta a menudo junto al agua: con chapoteo en cada salto seria un goteo sin parar.
  fish: { leave: { sound: 'animal_splash', share: 0.3 } },
};

/** Se oye lo que pasa a menos de esto del oyente (casillas, por el suelo); el motor cuenta todo, el filtro es este. */
const HEAR_RADIUS = 10;
/** Entre dos animales, al menos esto (segundos): uno cada vez, no un coro. */
const CALL_GAP = 1.2;

/** Como se oye ahora: desde donde (null: aun no se sabe), lo que deja el zoom (0-1) y el clima (null: despejado). */
export interface Hearing {
  readonly listener: Readonly<Point3> | null;
  readonly zoomLevel: number;
  readonly weather: string | null;
}

const groundDistance = (a: Readonly<Point3>, b: Readonly<Point3>): number => Math.hypot(a.x - b.x, a.z - b.z);

export class AnimalCalls {
  private lastCallAt = -Infinity;

  constructor(private readonly random: () => number) {}

  /** Lo que suena con `moment` a los `now` segundos, o null si nada (y entonces no cuenta para la espera). */
  callOf(moment: AnimalMoment, hearing: Hearing, now: number): SoundName | null {
    const call = ANIMAL_CALLS[moment.animal]?.[moment.act];
    if (!call || !hearing.listener || now - this.lastCallAt < CALL_GAP) return null;
    if (groundDistance(moment.at, hearing.listener) > HEAR_RADIUS) return null;
    const share = call.share * hearing.zoomLevel * animalLevelOf(hearing.weather);
    if (this.random() >= share) return null;
    this.lastCallAt = now;
    return call.sound;
  }
}
