/**
 * Inteligencia artificial del rival (IA.java), con sus fallos corregidos.
 * Cada unidad decide sola, en orden: retirarse (si esta debil),
 * atacar, capturar, avanzar hacia edificios ajenos y, si nada de eso, moverse al azar.
 * [CAMBIO] Antes de mover reparte un plan de fuego concentrado (planFire) entre varias unidades.
 * Al final fabrica unidades en sus edificios.
 * Es un plan (`ActionPlan`): propone cada accion y decide lo siguiente con lo que ha dicho la partida.
 *
 * Es una fachada: las piezas, una por tema, en `ai/`:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `general` | el general de la IA: que poder usa y cuando (`choosePower`, `aiGeneral`) |
 * | `tactics` | ir a capturar, avanzar, moverse al azar |
 * | `fire` | plan de fuego concentrado y orden de juego |
 * | `unitTurn` | prioridades de cada unidad en el turno de la IA (`UNIT_BEHAVIOURS`) |
 * | `production` | que fabrica |
 * | `turn` | el turno completo (`aiTurn`): general, plan de fuego, cada unidad y la compra |
 * | `profile` | como juega una IA (`AiProfile`: pesos, razones de ataque, comportamientos y su turno, `turn`) |
 * | `defaultProfile` | la IA del juego: `defaultAiProfile` |
 *
 * Lo que hace una unidad paso a paso (retirarse, atacar, capturar, ir en formacion: `PlayCtx` y
 * autopilot/) no es de la IA: lo usan tambien las ordenes permanentes, que cumple la partida para
 * todos los equipos (core/autopilot.ts). La IA lo reutiliza.
 *
 * Fuera de aqui se importa de este fichero.
 */
export { aiTurn } from './ai/turn';
export { defaultAiProfile } from './ai/defaultProfile';
export type { AiProfile, AiTurn } from './ai/profile';
export { UNIT_BEHAVIOURS, type UnitBehaviour, type UnitTurnContext } from './ai/unitTurn';
export { aiGeneral, choosePower, type PowerChoice } from './ai/general';
