/**
 * Configuracion del jugador (idioma, autoguardado, musica).
 * En el original se guardaba en data/config al cerrar la ventana;
 * aqui se guarda en localStorage en cada cambio.
 */

export type Lang = 'es' | 'en';

export interface Settings {
  lang: Lang;
  autosave: boolean;
  music: boolean;
}

const KEY = 'ilogic.settings';

const DEFAULTS: Settings = { lang: 'es', autosave: false, music: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      lang: parsed.lang === 'en' ? 'en' : 'es',
      autosave: !!parsed.autosave,
      music: !!parsed.music,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento disponible (modo privado, etc.): se ignora.
  }
}

/** Textos de la interfaz (el original los tenia dibujados en imagenes). */
const TEXTS = {
  es: {
    enemyTurn: 'TURNO ENEMIGO',
    yourTurn: 'TU TURNO',
    saved: 'Partida guardada',
    confirmQuit: 'Pulsa Esc otra vez para salir al menú',
    confirmDelete: 'Pulsa otra vez para disolver la unidad',
    day: 'DÍA',
    endTurn: 'Fin del turno',
    save: 'Guardar partida',
    quit: 'Salir al menú',
    resume: 'Volver',
    attack: 'Atacar',
    capture: 'Capturar',
    unload: 'Desembarcar',
    supply: 'Abastecer',
    wait: 'Esperar',
    back: 'Atrás',
    delete: 'Disolver',
    cancel: 'Cancelar',
    buy: 'Comprar',
    funds: 'Fondos',
    neutral: 'Neutral',
    you: 'Tuyo',
    enemy: 'Enemigo',
    defense: 'Defensa',
    income: 'Ingresos',
    move: 'Mov',
    range: 'Alcance',
    vision: 'Visión',
    fuel: 'Comb.',
    ammo: 'Mun.',
    hp: 'Vida',
    noAttack: 'No ataca',
    expected: 'Daño estimado',
    kill: '¡Lo destruye!',
    cargo: 'Carga',
    empty: 'Vacío',
    unknown: 'Desconocido',
    play: 'Jugar',
    continue: 'Continuar',
    music: 'Música',
    autosave: 'Autoguardado',
    language: 'Idioma',
    website: 'Web original',
    on: 'SÍ',
    off: 'NO',
    pressKey: 'Pulsa Enter o haz clic para continuar',
    skip: 'Enter / clic: acelerar',
    cantAfford: 'Fondos insuficientes',
    unitLimit: 'Límite de 30 unidades',
    hintMap: 'Enter: seleccionar · Esc: menú · Tab: siguiente · T: amenaza · Rueda: zoom',
    confirmEndTurn: 'Quedan unidades sin mover. Vuelve a pulsar para terminar el turno',
    badSave: 'La partida guardada estaba dañada: empieza una nueva',
    perDay: 'por día',
    buildingsN: 'edificios',
    gameMenu: 'Menú de partida',
    lessThan1: 'menos del 1%',
    moreThan99: 'más del 99%',
    forecast: 'Previsión de combate',
    enemyLife: 'Vida enemiga',
    destroyIt: 'Destruirlo',
    counter: 'Contraataque',
    none: 'no hay',
    idle: 'Sin mover',
    allMoved: 'Todas movidas',
    threatOn: 'Ocultar amenaza',
    threatOff: 'Ver amenaza enemiga',
    threatShort: 'Amenaza',
    loading: 'Cargando',
    nextUnit: 'Tab: siguiente unidad',
  },
  en: {
    enemyTurn: 'ENEMY TURN',
    yourTurn: 'YOUR TURN',
    saved: 'Game saved',
    confirmQuit: 'Press Esc again to quit to the menu',
    confirmDelete: 'Press again to disband the unit',
    day: 'DAY',
    endTurn: 'End turn',
    save: 'Save game',
    quit: 'Quit to menu',
    resume: 'Resume',
    attack: 'Attack',
    capture: 'Capture',
    unload: 'Unload',
    supply: 'Supply',
    wait: 'Wait',
    back: 'Back',
    delete: 'Disband',
    cancel: 'Cancel',
    buy: 'Buy',
    funds: 'Funds',
    neutral: 'Neutral',
    you: 'Yours',
    enemy: 'Enemy',
    defense: 'Defense',
    income: 'Income',
    move: 'Move',
    range: 'Range',
    vision: 'Vision',
    fuel: 'Fuel',
    ammo: 'Ammo',
    hp: 'HP',
    noAttack: 'No attack',
    expected: 'Expected damage',
    kill: 'Destroys it!',
    cargo: 'Cargo',
    empty: 'Empty',
    unknown: 'Unknown',
    play: 'Play',
    continue: 'Continue',
    music: 'Music',
    autosave: 'Autosave',
    language: 'Language',
    website: 'Original website',
    on: 'ON',
    off: 'OFF',
    pressKey: 'Press Enter or click to continue',
    skip: 'Enter / click: speed up',
    cantAfford: 'Not enough funds',
    unitLimit: '30 unit limit reached',
    hintMap: 'Enter: select · Esc: menu · Tab: next · T: threat · Wheel: zoom',
    confirmEndTurn: 'Some units have not moved. Press again to end the turn',
    badSave: 'The saved game was damaged: starting a new one',
    perDay: 'per day',
    buildingsN: 'buildings',
    gameMenu: 'Game menu',
    lessThan1: 'under 1%',
    moreThan99: 'over 99%',
    forecast: 'Combat forecast',
    enemyLife: 'Enemy HP',
    destroyIt: 'Destroy it',
    counter: 'Counterattack',
    none: 'none',
    idle: 'Not moved',
    allMoved: 'All moved',
    threatOn: 'Hide threat',
    threatOff: 'Show enemy threat',
    threatShort: 'Threat',
    loading: 'Loading',
    nextUnit: 'Tab: next unit',
  },
} as const;

export type TextKey = keyof (typeof TEXTS)['es'];

export function t(key: TextKey): string {
  return TEXTS[settings.lang][key];
}

const UNIT_LABELS = {
  es: ['Soldado', 'Tanque', 'Artillería', 'Jeep', 'Tanque ligero', 'Barricada', 'Bazuca', 'Transporte', 'Escudero', 'Lanzamisiles', 'Caza ligero', 'Caza', 'Bombardero', 'Suministros', 'Antiaéreo', 'Helicóptero', 'Mortero', 'Motorizado', 'Tanque anfibio'],
  en: ['Soldier', 'Tank', 'Artillery', 'Jeep', 'Light tank', 'Blocker', 'Bazooka', 'Transport', 'Shield trooper', 'Missile truck', 'Light fighter', 'Fighter', 'Bomber', 'Supplier', 'Anti-air', 'Helicopter', 'Mortar', 'Motor trooper', 'Amphibious tank'],
};
const BUILDING_LABELS = {
  es: ['Ciudad', 'Pozo de petróleo', 'Fábrica', 'Fortaleza', 'Aeropuerto', 'Base'],
  en: ['City', 'Oil well', 'Factory', 'Stronghold', 'Airport', 'HQ'],
};
const TERRAIN_LABELS = {
  es: ['Llanura', 'Agua', 'Bosque', 'Arena', 'Cactus', 'Acantilado', 'Flores', 'Acantilado', 'Agua poco profunda', 'Agua profunda', 'Nieve', 'Escarcha', 'Acantilado nevado', 'Bosque nevado', 'Hielo'],
  en: ['Plains', 'Water', 'Woods', 'Sand', 'Cactus', 'Cliff', 'Flowers', 'Cliff', 'Shallow water', 'Deep water', 'Snow', 'Frost', 'Snowy cliff', 'Snowy woods', 'Ice'],
};

export const unitLabel = (type: number): string => UNIT_LABELS[settings.lang][type] ?? '?';
export const buildingLabel = (type: number): string => BUILDING_LABELS[settings.lang][type] ?? '?';
export const terrainLabel = (type: number): string => TERRAIN_LABELS[settings.lang][type] ?? '?';
