/**
 * Lo que la escena dibuja encima del mapa ademas de las casillas marcadas: capturas a medias, ordenes
 * (lineas y banderas), lo que hara cada unidad con orden, puntos de control y la escolta de una
 * mision. Funciones puras: la escena las junta en las ViewOptions de MapView.render.
 */
import type { CommandIntent } from '../../core/ai';
import { RULES } from '../../core/data';
import { capturePointsOf, captureProgress, inControlZone, unitById } from '../../core/rules';
import { effectiveCommand } from '../../core/squads';
import { cellAt } from '../../core/util/grid';
import type { GameState, Pos, Unit } from '../../core/model';
import type { ViewOptions } from '../../ui/mapView';

type Overlay<K extends keyof ViewOptions> = NonNullable<ViewOptions[K]>;

const isPlayer = (unit: Unit) => unit.team === 0;
const onMap = (unit: Unit) => unit.carrier === null;

/** Capturas a medias que el jugador ve (o de sus propios edificios). */
export function captureBars(s: GameState, vis: boolean[][]): Overlay<'captures'> {
  return s.buildings.flatMap((building) => {
    const progress = captureProgress(s, building);
    if (!progress || !(cellAt(vis, building) || building.owner === 0)) return [];
    return [{ x: building.x, y: building.y, left: progress.left, total: capturePointsOf(building), team: progress.team }];
  });
}

/**
 * Ordenes del jugador: las de varios turnos (linea hasta el destino) y, [CAMBIO], las ordenes con
 * destino (bandera siempre; linea solo si `showsLine`: la unidad señalada y su escuadra).
 */
export function orderMarks(s: GameState, showsLine: (unit: Unit) => boolean): Overlay<'orders'> {
  const multiTurn = s.units
    .filter((unit) => isPlayer(unit) && unit.order && onMap(unit))
    .map((unit) => ({ from: { x: unit.x, y: unit.y }, to: unit.order! }));
  const withTarget = s.units.flatMap((unit) => {
    const command = isPlayer(unit) && onMap(unit) ? effectiveCommand(s, unit) : undefined;
    return command ? [{ from: { x: unit.x, y: unit.y }, to: command.at, kind: command.kind, line: showsLine(unit) }] : [];
  });
  return [...multiTurn, ...withTarget];
}

/** Lo que hara al terminar el turno cada una de estas unidades con orden (si se mueve, ataca o captura). */
export function intentLines(shown: readonly Unit[], preview: ReadonlyMap<number, CommandIntent>, vis: boolean[][]): Overlay<'intents'> {
  return shown.flatMap((unit) => {
    const intent = preview.get(unit.uid);
    if (!intent) return [];
    // Por si acaso: nunca se marca un objetivo que el jugador no ve.
    const attack = intent.attack && cellAt(vis, intent.attack) ? intent.attack : undefined;
    const doesSomething = intent.path.length > 1 || attack || intent.capture;
    return doesSomething ? [{ path: intent.path, attack, capture: intent.capture }] : [];
  });
}

/** [CAMBIO] Puntos de control: disputado solo si se ven unidades de los dos bandos dentro. */
export function controlPointMarks(s: GameState, visible: (p: Pos) => boolean): ViewOptions['controlPoints'] {
  return s.controlPoints?.map((point) => {
    const inside = s.units.filter((unit) => onMap(unit) && inControlZone(point, unit) && (isPlayer(unit) || visible(unit)));
    const contested = inside.some((unit) => unit.team === 0) && inside.some((unit) => unit.team === 1);
    return { ...point, r: RULES.controlRadius, contested };
  });
}

/** Mision de escolta: la casilla de destino y donde esta la unidad a escoltar (o quien la lleva). */
export function escortMarks(s: GameState, hidden: ReadonlySet<number>): { goal: Pos | null; vip: Pos | null } {
  const objective = s.mission?.objective;
  if (objective?.kind !== 'escort') return { goal: null, vip: null };
  const vip = unitById(s, objective.uid);
  const shownAt = vip && vip.carrier !== null ? (unitById(s, vip.carrier) ?? vip) : vip;
  const vipPos = shownAt && !hidden.has(shownAt.uid) ? { x: shownAt.x, y: shownAt.y } : null;
  return { goal: objective.to, vip: vipPos };
}
