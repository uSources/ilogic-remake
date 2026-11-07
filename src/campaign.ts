/**
 * Campaña: progreso guardado, textos de objetivos y consejos del tutorial.
 */
import { buildingsOf } from './core/rules';
import { defaultContent } from './core/content/default';
import type { Mission } from './core/missions';
import { measureObjective, missionGoal, objectiveOf, type ObjectiveKind } from './core/objectives';
import type { GameEvent, GameState, ObjectiveGoal, TeamId } from './core/model';
import { nameOf, settings } from './settings';
import { entryOf, type GameContent, type MissionObjective } from './core/content';

const STORAGE_KEY = 'ilogic.campaign';

/** Mejor marca de cada mision terminada (dias), o null si no se guardo. */
type MissionRecords = Record<string, number | null>;

const isValidRecord = (days: unknown): days is number => typeof days === 'number' && days > 0;

/** Las marcas guardadas (id de mision → dias); lo que no lo es, como si no hubiera nada. */
function recordsFromSaved(saved: unknown): MissionRecords {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const records: MissionRecords = {};
  for (const [id, days] of Object.entries(saved)) records[id] = isValidRecord(days) ? days : null;
  return records;
}

function loadRecords(): MissionRecords {
  try {
    return recordsFromSaved(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    // datos dañados: como si no hubiera nada
    return {};
  }
}

export function completedMissions(): Set<string> {
  return new Set(Object.keys(loadRecords()));
}

/** Mejor marca (menos dias) de una mision terminada. */
export function bestDays(id: string): number | null {
  return loadRecords()[id] ?? null;
}

/** La marca que se guarda: la nueva si mejora la anterior (o si no habia), si no la anterior. */
function bestRecord(previous: number | null | undefined, days: number | undefined): number | null {
  const isBetter = days && (previous == null || days < previous);
  return isBetter ? days : (previous ?? days ?? null);
}

export function markCompleted(id: string, days?: number): void {
  const records = loadRecords();
  records[id] = bestRecord(records[id], days);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // sin almacenamiento
  }
}

/** Las misiones de la campaña del juego, en orden (el contenido del juego: content/missions.json). */
export const campaignMissions = (): readonly Mission[] => defaultContent().missions.list;

/** Se puede jugar si es la primera o la anterior esta hecha. */
export function missionUnlocked(index: number, done = completedMissions()): boolean {
  const missions = campaignMissions();
  return index === 0 || done.has(missions[index - 1]!.id) || done.has(missions[index]!.id);
}

/** La primera mision que queda por hacer y se puede jugar, o -1. */
export function nextMissionIndex(done = completedMissions()): number {
  return campaignMissions().findIndex((mission, index) => !done.has(mission.id) && missionUnlocked(index, done));
}

const es = () => settings.lang === 'es';

/** Frase de cada objetivo, para la pantalla de campaña y el panel de la partida. */
const OBJECTIVE_TEXT: { [K in ObjectiveKind]: (objective: Extract<ObjectiveGoal, { kind: K }>, content: GameContent) => string } = {
  hq: () => (es() ? 'Conquista la Base enemiga.' : 'Take the enemy HQ.'),
  survive: ({ days }) => (es() ? `Aguanta hasta el final del día ${days}.` : `Hold out until the end of day ${days}.`),
  capture: ({ count, type, days }, content) => {
    const what =
      type === null
        ? es()
          ? 'edificios'
          : 'buildings'
        : nameOf(entryOf(content.buildings, type, 'edificio')).toLowerCase() + (es() ? 'es' : 's');
    return es() ? `Ten ${count} ${what} antes de que acabe el día ${days}.` : `Own ${count} ${what} before day ${days} ends.`;
  },
  destroy: ({ days }) =>
    es() ? `Destruye todas las unidades enemigas antes de que acabe el día ${days}.` : `Destroy every enemy unit before day ${days} ends.`,
  escort: ({ days }) =>
    es()
      ? `Lleva el camión de suministros a la ciudad marcada antes de que acabe el día ${days}.`
      : `Get the supply truck to the marked city before day ${days} ends.`,
};

/** Sin partida no hay uid de la unidad a escoltar, pero la frase no lo usa. */
const NO_UNIT_UIDS: readonly number[] = [];

/** El objetivo de quien juega la mision desde el menu (el del primer equipo de una persona que tiene uno). */
export const playerObjective = (mission: Mission): MissionObjective | undefined =>
  mission.teams.find((team) => team.controller === 'human' && team.objective)?.objective;

/** Quien mira la partida y que equipo es (el objetivo que se cuenta es el suyo). */
export interface ObjectiveViewer {
  s: GameState;
  team: TeamId;
}

/**
 * El objetivo de quien mira si hay partida; si no, el de quien juega la mision; si no hay ninguno,
 * conquistar la Base.
 */
function objectiveToDescribe(mission: Mission | null, content: GameContent, viewer?: ObjectiveViewer): ObjectiveGoal {
  if (viewer) return objectiveOf(viewer.s, viewer.team) ?? { kind: 'hq' };
  const written = mission && playerObjective(mission);
  return written ? missionGoal(written, NO_UNIT_UIDS, content) : { kind: 'hq' };
}

function describeObjective(objective: ObjectiveGoal, content: GameContent): string {
  // TypeScript no sabe que la entrada de cada tipo recibe ese mismo tipo de objetivo.
  const describe = OBJECTIVE_TEXT[objective.kind] as (objective: ObjectiveGoal, content: GameContent) => string;
  return describe(objective, content);
}

/**
 * Objetivo en una frase (para la pantalla de campaña y el panel de la partida). Con partida, el de
 * quien mira, con su contenido; en el menu de campaña, antes de jugar, el de quien la juega, con el
 * del juego.
 */
export function objectiveText(mission: Mission | null, viewer?: ObjectiveViewer): string {
  const content = viewer?.s.content ?? defaultContent();
  return describeObjective(objectiveToDescribe(mission, content, viewer), content);
}

/** Progreso en corto del objetivo de quien mira: "3/6", "día 4 de 8"... */
export function objectiveStatusText({ s, team }: ObjectiveViewer): string | null {
  const objective = objectiveOf(s, team);
  if (!objective || objective.kind === 'hq') return null;
  const shownDay = Math.min(s.day, objective.days);
  const day = es() ? `Día ${shownDay} de ${objective.days}` : `Day ${shownDay} of ${objective.days}`;
  const progress = measureObjective(s, objective);
  if (objective.kind === 'capture' && progress) return `${progress.done}/${progress.total} · ${day}`;
  if (objective.kind === 'destroy' && progress) return `${es() ? 'Quedan' : 'Left'}: ${progress.total} · ${day}`;
  return day;
}

/** Lo que pasa en la partida, para saber cuando se ha cumplido un paso del tutorial. */
export interface TutorialContext {
  s: GameState;
  /** El equipo de la persona en la mision (el de su objetivo). */
  team: TeamId;
  phase: string;
  /** Eventos del jugador desde que empezo el paso actual. */
  events: GameEvent[];
  ownedAtStart: number;
}

export interface TutorialStep {
  text: { es: string; en: string };
  done: (context: TutorialContext) => boolean;
}

/** Cuantos edificios tiene un equipo. */
export const ownedBuildingCount = (s: GameState, team: TeamId) => buildingsOf(s, team).length;

/** Alguna unidad del jugador esta sobre un edificio que no es suyo (puede capturarlo). */
const isOnCapturable = ({ s, team }: TutorialContext) =>
  s.units.some(
    (unit) =>
      unit.team === team && s.buildings.some((building) => building.x === unit.x && building.y === unit.y && building.owner !== team),
  );

const hasEvent = (context: TutorialContext, kind: GameEvent['kind']) => context.events.some((event) => event.kind === kind);

export const TUTORIAL: TutorialStep[] = [
  {
    text: {
      es: 'Abajo a la izquierda está tu Base. Pulsa sobre uno de tus soldados (azules) para seleccionarlo.',
      en: 'Your HQ is in the bottom left. Click one of your soldiers (blue) to select it.',
    },
    done: (context) => context.phase === 'move' || hasEvent(context, 'move'),
  },
  {
    text: {
      es: 'Las casillas azules son adonde puede ir. Pulsa sobre una ciudad gris (neutral) que esté al alcance para llevarlo allí.',
      en: 'The blue tiles show where it can go. Click a grey (neutral) city within reach to send it there.',
    },
    done: (context) => isOnCapturable(context) || hasEvent(context, 'capture'),
  },
  {
    text: {
      es: 'En el menú, elige Capturar. Una ciudad tiene 20 puntos y tu soldado entero le quita 10 cada turno: mira la barra encima del edificio.',
      en: 'In the menu, choose Capture. A city has 20 points and a full-health soldier removes 10 per turn: watch the bar above the building.',
    },
    done: (context) => hasEvent(context, 'capture'),
  },
  {
    text: {
      es: 'Mueve también tu otro soldado (o elige Esperar) y termina el turno con FIN DEL TURNO, arriba a la derecha, o con la tecla E.',
      en: 'Move your other soldier too (or choose Wait) and end your turn with END TURN, top right, or the E key.',
    },
    done: (context) => context.s.day >= 2,
  },
  {
    text: {
      es: 'Te toca otra vez. Vuelve a elegir Capturar con el mismo soldado, sin moverlo: si se va de la ciudad, la captura empieza de cero.',
      en: 'Your turn again. Choose Capture again with the same soldier, without moving it: if it leaves the city, the capture starts over.',
    },
    done: (context) => ownedBuildingCount(context.s, context.team) > context.ownedAtStart,
  },
  {
    text: {
      es: '¡Ciudad tuya! Cada edificio da dinero en cada ronda. Pulsa sobre tu fábrica y compra una unidad: el Jeep es rápido y barato.',
      en: 'The city is yours! Every building pays you each round. Click your factory and buy a unit: the Jeep is fast and cheap.',
    },
    done: (context) => hasEvent(context, 'spawn'),
  },
  {
    text: {
      es: 'Las unidades nuevas esperan al turno siguiente. Hay un soldado enemigo herido por el centro: ponte a su lado y elige Atacar. La previsión te dice el daño que harás y el que te devolverá.',
      en: 'New units wait until next turn. There is a wounded enemy soldier near the centre: move next to it and choose Attack. The forecast shows the damage you will deal and what comes back.',
    },
    done: (context) => hasEvent(context, 'attack'),
  },
  {
    text: {
      es: 'Para ganar, conquista la Base enemiga (la roja, arriba a la derecha): tiene 30 puntos. Si dudas, pulsa H para ver la ayuda.',
      en: 'To win, take the enemy HQ (the red one, top right): it has 30 points. If in doubt, press H for help.',
    },
    done: () => false,
  },
];
