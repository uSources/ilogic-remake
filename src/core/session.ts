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
 * | `session/controller` | la forma de un controlador (`Controller`, `TurnStep`), un plan como pasos (`proposing`) y los sencillos: persona, remoto, en serie |
 * | `session/log` | el registro: `LoggedAction`, `isOffTurnAction` y como se lee (`LogCursor`) |
 * | `session/replay` | repetir lo apuntado (`replaySession`) |
 * | `session/autopilotController` | `autopilotController`: cumple ya, en el turno, las ordenes permanentes |
 * | `session/gameSession` | `GameSession` y como llevarla: seguida (`runMatch`) o paso a paso (`playMatch`) |
 * | `session/screen` | lo que mira la pantalla: quien es una persona (`isPerson`, `people`), cuando se acaba para ella (`screenEnd`) y cuando se guarda sola (`isAutosaveMoment`) |
 */
export {
  humanController,
  passiveController,
  propose,
  proposing,
  remoteController,
  scriptedController,
  sequence,
  type Controller,
  type ControllerName,
  type TurnPlan,
  type TurnStep,
} from './session/controller';
export { isOffTurnAction, LogCursor, type LoggedAction } from './session/log';
export { replaySession } from './session/replay';
export { autopilotController } from './session/autopilotController';
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
export { isAutosaveMoment, isPerson, people, personStillPlays, screenEnd, type PersonEnd, type SeatedMatch } from './session/screen';
