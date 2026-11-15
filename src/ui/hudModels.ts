/**
 * Datos que enseña la interfaz HTML durante la partida (fichas, prevision de combate, minimapa),
 * calculados a partir del estado. Sin efectos: la partida 3D los publica en el store (view3d/hudBridge.ts).
 *
 * Van por panel en ui/models/ (con los tipos de hud/vm/ del mismo nombre) y se reexportan aqui:
 * las escenas y los tests los siguen importando de '../ui/hudModels'.
 */

export { standingOrderLabel, squadsVM } from './models/army';
export { combatVM, forecastVM } from './models/combat';
export { buyBlockedText, dayInfoVM, economyVM } from './models/economy';
export { armyChartVM, endScoreVM, endStatsVM } from './models/end';
export { generalVM } from './models/general';
export { minimapVM } from './models/minimap';
export { abilitiesVM, abilityVM, captureHintText, tileVM, unitStatChips, unitStatsText } from './models/tile';
export { weatherEffectsText, weatherVM } from './models/weather';
