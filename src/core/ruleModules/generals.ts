/**
 * [CAMBIO] Los generales (core/generals.ts) se enchufan a las reglas desde aqui: su ventaja fija en el
 * acierto, su carga en combate, lo que hacen al empezar cada ronda y su reconocimiento. Siempre esta: que un equipo tenga general lo dice su `TeamState`, no los ajustes.
 */
import { chargeFromCombat, generalHitFactor, generalsNewRound, revealsAll } from '../generals';
import { quietly } from '../util/quietly';
import type { GeneralCharge } from '../model';
import type { RuleModule } from './hooks';

declare module '../model/combat' {
  interface AttackRecordParts {
    /** Carga que gana el general de cada equipo por el combate (solo los que la ganan; si nadie, no esta). */
    charge: GeneralCharge[];
  }
}

export const GENERALS: RuleModule = {
  id: 'generals',
  isOn: () => true,
  hooks: {
    // La ventaja fija de cada general (ataque de uno, defensa del otro).
    hitModifiers: [{ id: 'generals', factor: generalHitFactor }],
    // Al empezar la ronda pueden volver a usar un poder y se acaba el reconocimiento.
    roundPhases: [{ id: 'generals', stage: 'start', run: quietly(generalsNewRound) }],
    // La barra se carga con lo que hace y recibe cada equipo en combate.
    combatSteps: [
      {
        id: 'charge',
        stage: 'wound',
        run: (s, attack) => {
          const charge = chargeFromCombat(s, attack.attacker, attack.defender, attack.damage, attack.counter);
          if (charge.length) attack.parts.charge = charge;
        },
      },
    ],
    // El poder de reconocimiento: ve todo el mapa hasta que acaba la ronda.
    revealRules: [{ id: 'reconnaissance', revealsAll }],
  },
};
