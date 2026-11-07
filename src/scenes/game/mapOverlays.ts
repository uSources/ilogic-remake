/**
 * Lo que la escena dibuja encima del mapa ademas de las casillas marcadas: capturas a medias, ordenes
 * (lineas y banderas), lo que hara cada unidad con orden, puntos de control y la escolta de una
 * mision. Funciones puras: la escena las junta en las ViewOptions de MapView.render.
 */
import type { StandingOrderIntent } from '../../core/autopilot';
import { capturePointsOf, captureProgress, inControlZone, isOnMap, unitById } from '../../core/rules';
import { gotoDestination, turnEndOrderOf } from '../../core/squads';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { objectiveOf } from '../../core/objectives';
import { isAlliedOwner, isHostile } from '../../core/teams';
import { ownerSideOf, sideOf } from '../../ui/sides';
import type { ViewOptions } from '../../ui/mapView';
import { posOf } from '../../core/geom';

type Overlay<K extends keyof ViewOptions> = NonNullable<ViewOptions[K]>;

/** Capturas a medias que ve el equipo que mira (o de edificios de su alianza). */
export function captureBars(s: GameState, viewer: TeamId, vis: Grid<boolean>): Overlay<'captures'> {
  return s.buildings.flatMap((building) => {
    const progress = captureProgress(s, building);
    if (!progress || !(vis.at(building) || isAlliedOwner(s, building.owner, viewer))) return [];
    const total = capturePointsOf(s, building);
    return [{ x: building.x, y: building.y, left: progress.left, total, side: sideOf(s, viewer, progress.team) }];
  });
}

/**
 * Ordenes del equipo que mira: las de ir alli (linea hasta el destino) y, [CAMBIO], las ordenes
 * con destino (bandera siempre; linea solo si `showsLine`: la unidad señalada y su escuadra).
 */
export function orderMarks(s: GameState, viewer: TeamId, showsLine: (unit: Unit) => boolean): Overlay<'orders'> {
  const isOwn = (unit: Unit) => unit.team === viewer && isOnMap(unit);
  const multiTurn = s.units.flatMap((unit) => {
    const goal = isOwn(unit) ? gotoDestination(unit) : undefined;
    return goal ? [{ from: posOf(unit), to: goal }] : [];
  });
  const withTarget = s.units.flatMap((unit) => {
    const order = isOwn(unit) ? turnEndOrderOf(s, unit) : undefined;
    return order ? [{ from: posOf(unit), to: order.at, kind: order.kind, line: showsLine(unit) }] : [];
  });
  return [...multiTurn, ...withTarget];
}

/** Lo que hara al terminar el turno cada una de estas unidades con orden (si se mueve, ataca o captura). */
export function intentLines(
  shown: readonly Unit[],
  preview: ReadonlyMap<number, StandingOrderIntent>,
  vis: Grid<boolean>,
): Overlay<'intents'> {
  return shown.flatMap((unit) => {
    const intent = preview.get(unit.uid);
    if (!intent) return [];
    // Por si acaso: nunca se marca un objetivo que el jugador no ve.
    const attack = intent.attack && vis.at(intent.attack) ? intent.attack : undefined;
    const doesSomething = intent.path.length > 1 || attack || intent.capture;
    return doesSomething ? [{ path: intent.path, attack, capture: intent.capture }] : [];
  });
}

/**
 * [CAMBIO] Puntos de control, con el color del dueño para el equipo que mira: disputado solo si se
 * ven dentro unidades de alianzas enemigas.
 */
export function controlPointMarks(s: GameState, viewer: TeamId, visible: (pos: Pos) => boolean): ViewOptions['controlPoints'] {
  return s.controlPoints?.map((point) => {
    const inside = s.units.filter((unit) => isOnMap(unit) && inControlZone(s, point, unit) && (unit.team === viewer || visible(unit)));
    const contested = inside.some((unit) => inside.some((other) => isHostile(s, unit.team, other.team)));
    return { x: point.x, y: point.y, owner: ownerSideOf(s, viewer, point.owner), r: s.settings.controlRadius, contested };
  });
}

/** Mision de escolta: la casilla de destino y donde esta la unidad a escoltar (o quien la lleva). */
export function escortMarks(s: GameState, viewer: TeamId, hidden: ReadonlySet<number>): { goal: Pos | null; vip: Pos | null } {
  const objective = objectiveOf(s, viewer);
  if (objective?.kind !== 'escort') return { goal: null, vip: null };
  const vip = unitById(s, objective.uid);
  const shownAt = vip && vip.carrier !== null ? (unitById(s, vip.carrier) ?? vip) : vip;
  const vipPos = shownAt && !hidden.has(shownAt.uid) ? posOf(shownAt) : null;
  return { goal: objective.to, vip: vipPos };
}
