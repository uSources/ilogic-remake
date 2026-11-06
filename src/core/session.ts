/**
 * Jugar una partida: quien decide cada equipo (`Controller`) y la partida en juego (`GameSession`),
 * que empieza y acaba los turnos, apunta lo que se hace y avisa de ello. La usan la escena, `npm run
 * play`, el fondo del menu, las herramientas y los tests. El codigo esta en `session/`:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `controller` | la forma de un controlador (`Controller`, `TurnStep`) y los sencillos: quieto, en serie, de fuera |
 * | `aiControllers` | los que deciden con la IA: la IA rival, el piloto automatico de las ordenes y la persona |
 * | `replay` | repetir lo apuntado (`replayController`, `LoggedAction`) |
 * | `controllers` | el controlador de cada equipo segun su `TeamState.controller` (`controllersFor`) |
 * | `gameSession` | `GameSession` y como llevarla: seguida (`runMatch`) o paso a paso (`playMatch`) |
 */
export {
  externalController,
  passiveController,
  propose,
  sequence,
  type Controller,
  type ControllerName,
  type TurnPlan,
  type TurnStep,
} from './session/controller';
export { aiController, humanController, remoteController, standingOrderAutopilot, type AiBrain } from './session/aiControllers';
export { replayController, replayControllers, type LoggedAction } from './session/replay';
export { controllersFor } from './session/controllers';
export {
  GameSession,
  isAutosaveMoment,
  playMatch,
  runMatch,
  type ActedStep,
  type RunOptions,
  type SessionListener,
  type SessionStep,
} from './session/gameSession';
