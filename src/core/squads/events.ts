/** El suceso de una escuadra (ver SquadChange en model/events.ts): uno solo para todos los cambios. */
import type { GameEvent, GameState, Squad, SquadChange, TeamId } from '../model';
import { squadUnits } from './queries';

/**
 * Como queda una escuadra tras un cambio: sus unidades ahora (ninguna si ya no existe), nombre y
 * tecla. `actor`: el equipo de la accion, o null si la cambia la partida (la invariante 'squads').
 */
export function squadEvent(s: GameState, actor: TeamId | null, squad: Squad, change: SquadChange): GameEvent {
  return {
    kind: 'squad',
    actor,
    squad: squad.id,
    change,
    uids: squadUnits(s, squad.id).map((unit) => unit.uid),
    name: squad.name,
    ...(squad.key !== undefined ? { key: squad.key } : {}),
  };
}
