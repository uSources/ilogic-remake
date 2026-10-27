/**
 * Campaña: progreso guardado, textos de objetivos y consejos del tutorial.
 */
import { BUILDING_NAMES } from './core/data';
import { MISSIONS, type MissionDef } from './core/missions';
import { objectiveProgress } from './core/rules';
import type { GameEvent, GameState } from './core/types';
import { buildingLabel, settings } from './settings';

const KEY = 'ilogic.campaign';

export function completedMissions(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markCompleted(id: string): void {
  const done = completedMissions();
  done.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]));
  } catch {
    // sin almacenamiento
  }
}

/** Se puede jugar si es la primera o la anterior esta hecha. */
export function missionUnlocked(i: number, done = completedMissions()): boolean {
  return i === 0 || done.has(MISSIONS[i - 1]!.id) || done.has(MISSIONS[i]!.id);
}

const es = () => settings.lang === 'es';

/** Objetivo en una frase (para la pantalla de campaña y el panel de la partida). */
export function objectiveText(m: MissionDef | null, s?: GameState): string {
  const o = s?.mission?.objective ?? null;
  const kind = o?.kind ?? m?.objective.kind ?? 'hq';
  const days = (o && 'days' in o ? o.days : m && 'days' in m.objective ? m.objective.days : 0) as number;
  switch (kind) {
    case 'hq':
      return es() ? 'Conquista la Base enemiga.' : 'Take the enemy HQ.';
    case 'survive':
      return es() ? `Aguanta hasta el final del día ${days}.` : `Hold out until the end of day ${days}.`;
    case 'capture': {
      const count = o && o.kind === 'capture' ? o.count : m && m.objective.kind === 'capture' ? m.objective.count : 0;
      const type = o && o.kind === 'capture' ? o.type : m && m.objective.kind === 'capture' && m.objective.type ? BUILDING_NAMES.indexOf(m.objective.type) : null;
      const what = type === null ? (es() ? 'edificios' : 'buildings') : buildingLabel(type).toLowerCase() + (es() ? 'es' : 's');
      return es() ? `Ten ${count} ${what} antes de que acabe el día ${days}.` : `Own ${count} ${what} before day ${days} ends.`;
    }
    case 'destroy':
      return es() ? `Destruye todas las unidades enemigas antes de que acabe el día ${days}.` : `Destroy every enemy unit before day ${days} ends.`;
    case 'escort':
      return es() ? `Lleva el camión de suministros a la ciudad marcada antes de que acabe el día ${days}.` : `Get the supply truck to the marked city before day ${days} ends.`;
  }
}

/** Progreso en corto: "3/6", "día 4 de 8"... */
export function objectiveStatus(s: GameState): string | null {
  const o = s.mission?.objective;
  if (!o || o.kind === 'hq') return null;
  const p = objectiveProgress(s);
  const day = es() ? `Día ${Math.min(s.day, o.days)} de ${o.days}` : `Day ${Math.min(s.day, o.days)} of ${o.days}`;
  if (o.kind === 'capture' && p) return `${p.done}/${p.total} · ${day}`;
  if (o.kind === 'destroy' && p) return `${es() ? 'Quedan' : 'Left'}: ${p.total} · ${day}`;
  return day;
}

/** Lo que pasa en la partida, para saber cuando se ha cumplido un paso del tutorial. */
export interface TutorialContext {
  s: GameState;
  phase: string;
  /** Eventos del jugador desde que empezo el paso actual. */
  events: GameEvent[];
  ownedAtStart: number;
}

export interface TutorialStep {
  text: { es: string; en: string };
  done: (c: TutorialContext) => boolean;
}

const owned = (s: GameState) => s.buildings.filter((b) => b.owner === 0).length;
const onCapturable = (c: TutorialContext) =>
  c.s.units.some((u) => u.team === 0 && c.s.buildings.some((b) => b.x === u.x && b.y === u.y && b.owner !== 0));

export const TUTORIAL: TutorialStep[] = [
  {
    text: {
      es: 'Abajo a la izquierda está tu Base. Pulsa sobre uno de tus soldados (azules) para seleccionarlo.',
      en: 'Your HQ is in the bottom left. Click one of your soldiers (blue) to select it.',
    },
    done: (c) => c.phase === 'move' || c.events.some((e) => e.kind === 'move'),
  },
  {
    text: {
      es: 'Las casillas azules son adonde puede ir. Pulsa sobre una ciudad gris (neutral) que esté al alcance para llevarlo allí.',
      en: 'The blue tiles show where it can go. Click a grey (neutral) city within reach to send it there.',
    },
    done: (c) => onCapturable(c) || c.events.some((e) => e.kind === 'capture'),
  },
  {
    text: {
      es: 'En el menú, elige Capturar. Una ciudad tiene 20 puntos y tu soldado entero le quita 10 cada turno: mira la barra encima del edificio.',
      en: 'In the menu, choose Capture. A city has 20 points and a full-health soldier removes 10 per turn: watch the bar above the building.',
    },
    done: (c) => c.events.some((e) => e.kind === 'capture'),
  },
  {
    text: {
      es: 'Mueve también tu otro soldado (o elige Esperar) y termina el turno con FIN DEL TURNO, arriba a la derecha, o con la tecla E.',
      en: 'Move your other soldier too (or choose Wait) and end your turn with END TURN, top right, or the E key.',
    },
    done: (c) => c.s.day >= 2,
  },
  {
    text: {
      es: 'Te toca otra vez. Vuelve a elegir Capturar con el mismo soldado, sin moverlo: si se va de la ciudad, la captura empieza de cero.',
      en: 'Your turn again. Choose Capture again with the same soldier, without moving it: if it leaves the city, the capture starts over.',
    },
    done: (c) => owned(c.s) > c.ownedAtStart,
  },
  {
    text: {
      es: '¡Ciudad tuya! Cada edificio da dinero en cada ronda. Pulsa sobre tu fábrica y compra una unidad: el Jeep es rápido y barato.',
      en: 'The city is yours! Every building pays you each round. Click your factory and buy a unit: the Jeep is fast and cheap.',
    },
    done: (c) => c.events.some((e) => e.kind === 'spawn'),
  },
  {
    text: {
      es: 'Las unidades nuevas esperan al turno siguiente. Hay un soldado enemigo herido por el centro: ponte a su lado y elige Atacar. La previsión te dice el daño que harás y el que te devolverá.',
      en: 'New units wait until next turn. There is a wounded enemy soldier near the centre: move next to it and choose Attack. The forecast shows the damage you will deal and what comes back.',
    },
    done: (c) => c.events.some((e) => e.kind === 'attack'),
  },
  {
    text: {
      es: 'Para ganar, conquista la Base enemiga (la roja, arriba a la derecha): tiene 30 puntos. Si dudas, pulsa H para ver la ayuda.',
      en: 'To win, take the enemy HQ (the red one, top right): it has 30 points. If in doubt, press H for help.',
    },
    done: () => false,
  },
];


