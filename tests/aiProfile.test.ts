import { describe, expect, it } from 'vitest';
import { aiTurn, defaultAiProfile, UNIT_BEHAVIOURS, type AiProfile } from '@core/ai';
import { aiController } from '@core/controllers';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { newUnit } from '@core/measure';
import { GameSession, runMatch } from '@core/session';
import { duel } from '@core/teams';
import { defaultContent } from '@core/content/default';
import type { GameAction } from '@core/model';
import { blankState, giveTurn, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');

/** Una partida corta de dos IAs con estos perfiles: lo que ha propuesto cada equipo. */
function play(profiles: [AiProfile, AiProfile], days = 3): [GameAction[], GameAction[]] {
  const s = createMatch(skirmishConfig({ seed: 4, size: 16, teams: duel('ai', 'ai') }));
  const session = new GameSession(s, [aiController(profiles[0]), aiController(profiles[1])]);
  const proposed: [GameAction[], GameAction[]] = [[], []];
  session.subscribe((step) => proposed[step.team]?.push(step.action));
  runMatch(session, { until: (state) => state.day > days });
  return proposed;
}

/** La IA juega con el perfil que se le da (I3): sus comportamientos, sus razones y su turno. */
describe('AiProfile', () => {
  const content = defaultContent();
  const base = defaultAiProfile(content);

  it('solo con moverse al azar, ninguna de sus unidades ataca ni captura', () => {
    const wander: AiProfile = { ...base, behaviours: UNIT_BEHAVIOURS.filter((behaviour) => behaviour.id === 'randomMove') };
    const [wandering, normal] = play([wander, base], 6);
    const kinds = new Set(wandering.map((action) => action.kind));
    expect(kinds.has('attack') || kinds.has('capture')).toBe(false);
    expect(kinds.has('move')).toBe(true);
    // La otra, con la IA del juego, en la misma sesion, si ataca o captura.
    expect(normal.some((action) => action.kind === 'attack' || action.kind === 'capture')).toBe(true);
  });

  it('sus razones para valorar un ataque: con una que lo resta todo, no ataca', () => {
    const s = giveTurn(blankState({ fog: false }), 1);
    newUnit(s, TANK, 1, { x: 5, y: 5 });
    newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    const proposed = (profile: AiProfile) => {
      const session = new GameSession(s, [aiController(base), aiController(profile)]);
      const actions: GameAction[] = [];
      session.subscribe((step) => actions.push(step.action));
      session.step();
      return actions;
    };
    const pacifist: AiProfile = { ...base, scoreTerms: [...base.scoreTerms, { id: 'never', value: () => -1e9 }] };
    expect(proposed(pacifist).some((action) => action.kind === 'attack')).toBe(false);
  });

  it('su turno entero (`turn`): otro codigo de IA es otro perfil', () => {
    let turns = 0;
    const counting: AiProfile = {
      ...base,
      turn: (view, profile, rng) => {
        turns++;
        return aiTurn(view, profile, rng);
      },
    };
    play([counting, base], 2);
    expect(turns).toBeGreaterThan(0);
  });

  it('dos perfiles distintos en la misma sesion juegan cada uno el suyo, y repetir da lo mismo', () => {
    // Sin ir a capturar: sus soldados hacen otra cosa desde el primer dia.
    const other: AiProfile = { ...base, behaviours: UNIT_BEHAVIOURS.filter((behaviour) => behaviour.id !== 'capture') };
    expect(play([other, base])).toEqual(play([other, base]));
    expect(play([other, base])[0]).not.toEqual(play([base, base])[0]);
  });
});
