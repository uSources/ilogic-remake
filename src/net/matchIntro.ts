/**
 * «¡Rival encontrado!»: cuando «Buscar rival» empareja, el vestibulo apunta aqui lo que se va a jugar
 * (quien empieza, el mapa, el reloj) y la carga de la pagina de la partida lo enseña mientras carga,
 * en vez de la barra sola. Va en sessionStorage porque la partida empieza en otra carga de la pagina
 * (gameStart.ts) y solo vale para esa carga: se lee una vez y se borra (recargar a mitad de la partida
 * ya no lo enseña).
 *
 * No espera nada: el reloj del primer turno ya corre en el servidor, asi que esto no puede comerse
 * tiempo. Se enseña lo que tarde en cargar la partida (main.ts le da un minimo corto para que se lea).
 *
 * Igual, que la partida acaba de empezar (se esperaba en el vestibulo, o se ha encontrado rival): esa
 * carga lo hace sonar (`match_begins`). En el vestibulo no puede: la recarga lo cortaria.
 */
import type { GameState } from '../core/model';
import type { MatchIntroVM } from '../hud/vm/notices';

const INTRO_KEY = 'ilogic3d.intro';
const BEGUN_KEY = 'ilogic3d.begun';

/** Lo que se ve de la partida recien emparejada, desde la vista de quien mira (`team`) y lo que ya se dice en texto. */
export function introOf(state: GameState, team: number, details: string[]): MatchIntroVM {
  return { youStart: state.turn === team, chips: details };
}

/** Lo apunta para la carga de la pagina que empieza la partida. */
export function saveIntro(intro: MatchIntroVM): void {
  try {
    sessionStorage.setItem(INTRO_KEY, JSON.stringify(intro));
  } catch {
    // Sin sessionStorage se carga con la barra de siempre.
  }
}

/** Lo apuntado, una sola vez: se borra al leerlo. null si no hay (o no tiene forma). */
export function takeIntro(): MatchIntroVM | null {
  try {
    const raw = sessionStorage.getItem(INTRO_KEY);
    sessionStorage.removeItem(INTRO_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isIntro(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** La partida empieza ahora: lo apunta para la carga de la pagina que la empieza. */
export function noteMatchBegun(): void {
  try {
    sessionStorage.setItem(BEGUN_KEY, 'yes');
  } catch {
    // Sin sessionStorage empieza callada, como al volver a una que ya iba.
  }
}

/** La partida que carga acaba de empezar (una sola vez: se borra al leerlo). */
export function takeMatchBegun(): boolean {
  try {
    const isBegun = sessionStorage.getItem(BEGUN_KEY) !== null;
    sessionStorage.removeItem(BEGUN_KEY);
    return isBegun;
  } catch {
    return false;
  }
}

function isIntro(value: unknown): value is MatchIntroVM {
  if (typeof value !== 'object' || value === null) return false;
  const intro = value as Partial<MatchIntroVM>;
  return typeof intro.youStart === 'boolean' && Array.isArray(intro.chips) && intro.chips.every((chip) => typeof chip === 'string');
}
