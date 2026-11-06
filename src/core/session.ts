/**
 * Jugar una partida: quien decide cada equipo (`Controller`) y la partida en juego (`GameSession`),
 * que empieza y acaba los turnos, apunta lo que se hace y avisa de ello. La usan la escena, `npm run
 * play`, el fondo del menu, las herramientas y los tests. No importa la IA, ni ella ni las acciones
 * que manda (las ordenes permanentes son de core/autopilot, no de ai/; ESLint lo vigila): los
 * controladores que deciden con ella, y el de cada equipo segun quien lo juega, estan en
 * `core/controllers.ts`.
 *
 * | Modulo | Que va |
 * |---|---|
 * | `session/controller` | la forma de un controlador (`Controller`, `TurnStep`) y los sencillos: persona, remoto, quieto, en serie |
 * | `session/replay` | repetir lo apuntado (`replaySession`, con su `LogCursor`) |
 * | `session/selfDispatched` | quien manda el mismo sus acciones (`selfDispatched`: la IA) y `autopilotController` |
 * | `session/gameSession` | `GameSession` y como llevarla: seguida (`runMatch`) o paso a paso (`playMatch`) |
 */
export {
  humanController,
  passiveController,
  propose,
  remoteController,
  scriptedController,
  sequence,
  isOffTurnAction,
  type Controller,
  type LoggedAction,
  type ControllerName,
  type TurnPlan,
  type TurnStep,
} from './session/controller';
export { LogCursor, replaySession } from './session/replay';
export { autopilotController } from './session/selfDispatched';
export {
  GameSession,
  playMatch,
  runMatch,
  type ActedStep,
  type RunOptions,
  type SessionListener,
  type SessionOptions,
  type SessionStep,
} from './session/gameSession';
