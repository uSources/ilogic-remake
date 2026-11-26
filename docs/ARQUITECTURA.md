# Arquitectura

Mapa del codigo para personas y agentes de IA: que hace cada parte, como fluye un turno y por que se
tomaron las decisiones que no conviene deshacer sin pensarlo.

## Capas

```mermaid
flowchart TB
  subgraph core["src/core — TypeScript puro (sin three.js, sin DOM)"]
    model["model/<br/>tipos de la partida (sin dependencias)"]
    data["content/ + gameContent.ts<br/>tipos resueltos de content/*.json,<br/>unidos a cada partida (unitTypeOf)"]
    actions["actions.ts + actions/<br/>GameAction, ACTIONS, dispatch:<br/>la unica via para cambiar la partida"]
    rules["rules.ts + rules/<br/>alcance, combate, captura, economia, fin de ronda"]
    ruleModules["ruleModules/<br/>RULE_MODULES: piezas de reglas que<br/>se enchufan segun los ajustes"]
    orders["trail.ts<br/>camino trazado"]
    squads["squads.ts + squads/<br/>escuadras y ordenes permanentes"]
    autopilot["autopilot.ts + autopilot/<br/>cumplir ordenes permanentes:<br/>pasos de unidad (atacar, retirarse, formacion)<br/>que proponen acciones"]
    ai["ai.ts + ai/<br/>IA: un plan que propone acciones<br/>(ActionPlan), con su perfil (AiProfile)"]
    view["playerView.ts<br/>lo que sabe cada equipo (PlayerView)"]
    session["session.ts + session/<br/>GameSession y controladores sin IA"]
    controllers["controllers.ts + controllers/<br/>controladores de la IA"]
    gen["mapgen.ts + mapgen/ / missions.ts + missions/"]
    save["save.ts / stats.ts"]
    teams["teams.ts<br/>equipos y alianzas"]
    net["net.ts + net/<br/>partida por la red: protocolo, sala (Room),<br/>niebla de los sucesos, vista del cliente"]
  end
  subgraph view3d["src/view3d — la vista 3D"]
    main3d["app/main.ts<br/>imagenes y modelos GLB"] --> menuFlow["app/menuFlow.ts<br/>menu principal"]
    main3d --> match["app/match3d.ts<br/>junta sistemas y motor"]
    match --> game["systems/turn<br/>el turno de la persona"]
    match --> systems["systems/events · board · camera · input<br/>deciden (sin three.js)"]
    match --> bridge["systems/hud<br/>publican la interfaz"]
    match --> engine["engine/ (three.js)<br/>MatchScene: terreno, piezas, efectos"]
    systems -. "ports/" .-> engine
  end
  subgraph ui["src/ui — datos para la interfaz (puro)"]
    hudModels["hudModels.ts → models/*<br/>fichas, prevision, minimapa"]
  end
  subgraph hud["src/hud — interfaz HTML (Preact)"]
    store["store.ts<br/>estado de la interfaz"] --> comps["Hud.tsx → game/ · menus/ · overlays/"]
  end
  game -- "session.act(accion)" --> session
  game --> rules
  session -- "dispatch(accion)" --> actions
  controllers --> session & ai
  ai -- "propone (ActionPlan)" --> controllers
  ai -- "lee" --> view
  ai --> autopilot
  session -- "da a cada controlador" --> view
  net -- "GameSession.act / remoteController" --> session
  net -- "asientos de la IA" --> controllers
  net -- "lo que sabe cada equipo" --> view
  actions --> rules & squads & autopilot
  game --> anim
  bridge --> hudModels
  bridge -- "ui.set(...)" --> store
  comps -- "ui.actions.*" --> bridge
```

- `src/core` no conoce la pantalla: se prueba con vitest, la usa la herramienta de equilibrio y la
  partida por texto (`npm run play`). ESLint prohibe que importe three.js, Preact o el DOM.
- La vista 3D orquesta: lee la entrada, manda acciones por la sesion (`session.act`), anima los
  sucesos que devuelven y publica el estado de la interfaz. La interfaz HTML no toca el juego: llama
  a `ui.actions`, que registra la vista (ver "Vista 3D").

### El nucleo por dentro

`actions.ts`, `rules.ts`, `ai.ts`, `autopilot.ts`, `session.ts`, `controllers.ts`, `squads.ts` y
`net.ts` son fachadas: reexportan lo publico de sus modulos, uno por tema, y desde fuera de `src/core` se importa
siempre de ellas (`'../core/rules'`, `'@core/actions'`); ESLint no deja que la vista, la interfaz
ni las herramientas importen los modulos de dentro. Dentro de core, mejor del modulo concreto
(`'./rules/movement'`): menos acoplamiento y sin ciclos. **La IA es un jugador mas**: las reglas,
las acciones, las ordenes permanentes (autopilot/) y la sesion no importan nada de la IA (ai/,
ai.ts, controllers/); ESLint lo vigila (`NO_AI`) y `tests/layers.test.ts` comprueba
que `session.ts`, `actions.ts`, `autopilot.ts` y `rules.ts` no la cargan ni de lejos. La IA
reutiliza autopilot/. Y **quien decide solo propone**: la IA y autopilot/ no importan dispatch, las
acciones ni la sesion, no se hacen su propia vista de la partida y no tiran de los dados
(`DECIDERS_ONLY_PROPOSE`; tests/layers.test.ts comprueba que `ai.ts`, `autopilot.ts` y
`playerView.ts` no cargan dispatch ni la sesion). Los modulos de `rules/` y `squads/` tienen, ademas de sus consultas,
los pasos con los que se cambia la partida (`advanceCapture`, `mergeInto`, `earn`, `spendUnit`,
`giveStandingOrder`, `formSquad`...): solo los llaman el `apply` de las acciones, los pasos de ronda
y de turno, las `INVARIANTS` y lo que prepara una partida. La IA, autopilot/, la sesion, los
controladores, la vista y el camino que traza la vista (`trail.ts`) no los importan
(`APPLY_STEPS`, eslint.config.js; tambien los del clima y las estadisticas:
`advanceWeather`, `recordEvents`...), y las fachadas no los dan
(tests/lintImports.test.ts, que ademas busca con los tipos de TypeScript toda funcion del nucleo que
escribe en la partida, `tests/stateWriters.ts`, y falla si no esta en la lista de su modulo). Los de
la raiz del nucleo (clima, estadisticas, `changeSettings`), que no tienen fachada que los
esconda, tampoco se pueden importar desde src/ ni tools/ (`ROOT_STEPS`): las
herramientas y los tests que preparan una partida a mano ponen sus unidades con `newUnit` de
`core/measure.ts`.

### Acciones: la unica via para cambiar la partida

Quien juega un equipo (la persona en la pantalla, la IA, `npm run play`, el jugador al azar del
fuzz, la huella) cambia la partida mandando una **accion**: `dispatch(s, team, action)`
(`core/actions.ts`). Una `GameAction` (`model/actions.ts`) son datos, con uids y casillas (nunca
objetos de la partida): se puede guardar, repetir o mandar por la red.

```ts
const result = dispatch(s, viewer, { kind: 'attack', uid: tank.uid, target: enemy.uid });
if (result.ok) await play(result.events); // si no, result.reason dice por que ('notTarget', 'spent'...)
```

- Las `INVARIANTS` son de las reglas (`rules/invariants.ts`): las repasan `dispatch` despues de cada
  accion y `endRound` al acabar la ronda, asi que ninguno de los dos copia sus pasos.
- `dispatch` pasa las comprobaciones comunes (`ACTION_GUARDS`, `actions/guards.ts`, en orden: que
  tenga la forma de una accion, `isGameAction` con `ACTION_SHAPES` de `actions/shape.ts`, o
  `'badAction'`; que la mande un equipo de la partida, `'notATeam'`; que la partida no se haya
  decidido, `'matchOver'`; que sea su turno, `'notYourTurn'`, y que lo haya empezado,
  `'turnNotStarted'` (estas dos, `turnOnly`, no cuentan para las acciones con `anyTime`: rendirse
  vale en cualquier momento, como pide una partida por la red o con varias personas); que ese equipo
  no haya perdido, `'defeated'`, salvo para pasar el turno), el `validate` de la accion, su `apply`
  (con los dados de la partida, `diceOf(s)`), despues las `INVARIANTS` (`rules/invariants.ts`: fuera
  los muertos, las capturas cuya unidad se ha ido, las escuadras vacias, el dinero por encima del
  maximo, los movimientos que ya no se pueden deshacer) y apunta los sucesos en las estadisticas
  (`recordEvents`, stats.ts: de todos, se animen o no). Las invariantes no saben de acciones;
  `dispatch` tampoco: lee lo que dice la entrada del registro.
- `ACTIONS` (`actions/registry.ts`) tiene una entrada por accion (el tipo obliga), cada una en el
  modulo de su tema (`movement`, `combat`, `capture`, `transport`, `units`, `economy`,
  `standingOrders`, `squads`). `validate(s, team, action)` lo calcula todo desde la partida (alcance,
  vision, dinero, de quien es cada unidad): no se fia de nada que traiga la accion. `apply` usa las
  piezas de `rules/` y `squads/` y devuelve los sucesos.
- `actionProblem`/`isValidAction` preguntan lo mismo sin cambiar nada. El menu de una unidad sale de
  ahi: `UNIT_MENU` (`actions/menu.ts`) dice con que acciones se cumple cada opcion y
  `availableActions(s, team, unit)` ofrece, en ese orden, las que tienen alguna que vale (la vista
  solo añade «Atras», en el sitio que dice `BACK_GOES_BEFORE`). Lo que se manda a unas unidades
  elegidas (un grupo, una escuadra) sale igual de `SELECTION_MENU` y `canDoWithSelection`; las
  opciones que son las mismas con una sola unidad (las ordenes, quitarlas) salen de ahi tambien
  (`ORDER_OPTIONS` dice cual es cada orden), y mover un grupo es su plan (`groupMoveOrder`,
  `groupMoveStep`), que la vista cumple paso a paso (en 3D aun no hay grupos). La vista solo pregunta
  ahi y añade lo que es de la interfaz. Lo que pasaria al soltar la
  unidad en otra casilla tambien lo dice el nucleo (`targetProblem`, `canCaptureAt`).
- Un solo deshacer, en el nucleo: la accion `undoMove`. La partida apunta cada movimiento
  (`GameState.undoableMoves`, con la captura a medias que perdio la unidad al irse; `rules/undo.ts`)
  y los deja mientras lo de despues no cuente nada nuevo de la partida: las entradas con `keepsUndo`
  (mover, deshacer, esperar, viajes, escuadras, ordenes); tras cualquier otra del equipo que juega,
  dispatch los olvida (`forgetUndoableMoves`; una de otro fuera de su turno, rendirse, no). El paso
  de un viaje no se deshace (seria un movimiento gratis). La invariante 'undoWindow' olvida los de
  unidades que ya no estan como las dejo su movimiento (caen, suben a un transporte o vuelven a
  estar listas con la ronda nueva). Se deshace siempre el ultimo (`lastUndoableMove`,
  `undoMoveProblem`), uno tras otro; si al moverse descubrio enemigos (`revealed`), no
  (`'revealed'`): con niebla seria mirar gratis. «Atras» del menu de la unidad y Ctrl+Z mandan
  `undoMove` con la misma funcion (y avisan si el nucleo dice `'revealed'`). Si el movimiento acabo
  una orden de ir alli, deshacerlo la devuelve (`UndoableMove.goto`, con su suceso 'standingOrder').
- «Ir alli» (el viaje de varios turnos) es una orden permanente mas: `StandingOrder` de tipo 'goto'
  (reglas del viaje en `rules/travel.ts`). Se da con 'giveStandingOrder' como las demas, a una
  casilla que la unidad pueda pisar, a la que no llegue ya este turno —`'withinReach'`: para eso se
  mueve— y hacia la que pueda dar ya un paso (`travelProblem`, su `block` en `STANDING_ORDER_TYPES`), y se
  quita con 'cancelStandingOrder'. Es siempre de cada unidad (nunca de su escuadra: `unitOnly`) y
  manda sobre la de su escuadra mientras dura. Cada orden dice cuando se cumple
  (su `moment`, `momentOf`): la de ir alli al empezar el turno (la fase 'gotoOrders' de
  `TURN_START_PHASES`: su paso, 'gotoStep', hacia la casilla del alcance que mas acerca,
  `travelStepOf`, y despues quien juega puede seguir con ella), las de pelear al acabarlo. Si ya
  esta en el destino o llega este turno, la orden se cumple sin moverla (el ultimo trozo lo hace
  quien juega: puede seguir, atacar o capturar); un camino cortado (`interruption`, la emboscada)
  tambien la cumple: su suceso es 'standingOrderDone' con como acabo (`end`: 'arrived',
  'withinReach' o la clase del corte), y la vista avisa «llega» solo con 'withinReach'. Moverla a
  mano ('move', 'load', 'merge', y 'attack' sin haberse movido aun) la acaba (`endGotoByHand`, con
  el suceso de quitarla); capturar, esperar o atacar despues del paso, no. El paso no se deshace
  (seria un movimiento gratis); si un movimiento a mano la acabo, deshacerlo la devuelve
  (`UndoableMove.goto`). La interfaz enseña la de ir alli como una flecha hasta el destino
  (`gotoDestination`) y las de pelear con su bandera (`turnEndOrderOf`).
- **Turnos**: la partida sabe de quien es el turno (`GameState.turn`, en el orden de la ronda
  `turnOrder`, que pone el modo; `turnStarted`). 'startTurn' lo empieza (`TURN_START_PHASES`, en
  actions/turn.ts: las ordenes de ir alli dan su paso, `assistTurn` de 'turnStart') y 'endTurn' lo
  acaba (`TURN_END_PHASES`: las ordenes de pelear del equipo se cumplen, `assistTurn` de 'turnEnd', y las unidades que se han quedado sobre un
  edificio que pueden capturar siguen capturando, `autoCapturers` en rules/capture.ts) y lo pasa al
  siguiente que juega (`nextTurn`, rules/turnOrder.ts: los derrotados no); tras el ultimo del orden,
  el fin de ronda (`endRound`, con `roundPhasesOf`). Sus sucesos: 'turnStart' y 'turnEnd'. Cada paso
  de turno hace acciones del equipo (las mismas entradas de ACTIONS, con su validate). Las fases son
  acciones mandadas por el mismo camino que las demas (el `ActionDispatcher` que recibe el `apply`
  de las acciones de turno, y solo ellas: `CompositeActionDefinition`; guardas, validate,
  invariantes) y sus sucesos se cuentan una vez en las estadisticas; el modo puede añadir las suyas
  (`turnPhases`). Las ordenes permanentes son una regla para todos los equipos (la persona, la IA o
  un jugador por la red), no del controlador: las cumple core/autopilot, no la IA. 'startTurn' y
  'endTurn' solo los manda la sesion (`isTurnBoundary`; `session.act` los rechaza con
  'sessionOnly'). Rendirse es la accion 'surrender' (`TeamState.resigned`: cuenta como derrotado),
  en su turno o fuera de el (`anyTime`); el menu solo lo ofrece si la partida se puede perder
  (`canBeLost`: el laboratorio no; el nucleo tampoco lo deja, 'cannotLose'), y guardar, si su modo se
  guarda (`saves`; `gameMenuOf`).
- Lo que cambia la partida y no es de quien juega se queda fuera de `dispatch`: preparar una partida
  (`buildMatch`, `newGameState`, `newUnit`).
- **Una accion nueva**: su forma en `GameAction` (`model/actions.ts`) y la de cada campo en
  `ACTION_SHAPES` (`actions/shape.ts`; el tipo la pide), su suceso en `GameEvent`
  (`model/events.ts`) y su entrada en el modulo de `actions/` que toque (con `keepsUndo` si no
  cuenta nada nuevo de la partida y deja deshacer lo de antes, y con `anyTime` si vale fuera del
  turno, como rendirse); si se ofrece en el menu de una unidad, su entrada en `UNIT_MENU`; si se
  puede mandar a unas unidades elegidas, en `SELECTION_MENU`; si se anima, su entrada en
  `EVENT_STEPS` (`view3d/systems/events/eventSteps.ts`). Lo comun a todas las acciones es una entrada en `ACTION_GUARDS`; lo
  que hay que limpiar despues de cualquiera (y de cada ronda), una en `INVARIANTS`, que devuelve sus
  sucesos.

### Sucesos

Cada accion y el fin de ronda devuelven sus sucesos (`GameEvent`, `model/events.ts`), completos para
contar lo que ha pasado sin mirar la partida: quien lo hizo (`actor`: el equipo que mando la accion,
o null en los del fin de ronda), a quien (uids), tipos y casillas. El ataque nombra a su objetivo
por uid (`target`) y su casilla (`at`) y lleva como estaban las dos (`combat`), el botin; la compra, el tipo y el equipo; la captura, siempre los puntos que
quedan. Lo que dejan en orden las `INVARIANTS` tambien se cuenta, detras de los de la accion y sin
actor: `cargoLost` (los pasajeros de un transporte que cae; tambien al retirarlo), `captureDropped`
(una captura a medias cuya unidad se ha ido), la escuadra que se queda vacia y `fundsCapped` (el
dinero que pasaba del maximo; botin e ingresos se cuentan enteros y lo perdido va aqui,
porque el tope se aplica al acabar la accion o la ronda, no al cobrar). Cada escuadra que desaparece
tiene un solo suceso `squad` (`SquadChange`): `change: 'disbanded'` si su equipo la deshace, o
`change: 'removed'` si se queda vacia; si la vacia una accion (salir, formar otra con sus unidades),
lleva el equipo de esa accion como actor y va antes que el `formed` o `grouped`; si la vacia la
partida (caen sus unidades), la cuenta la invariante sin actor. Los numeros de escuadra no se
reutilizan (`nextSquadId`). Con ellos
se anima (`EVENT_STEPS`, view3d/systems/events/eventSteps.ts), se cuentan las estadisticas (`recordEvents` en dispatch, por el `actor`) y se resume el
fin de ronda (`roundReport(s, events)`: lo que enseña la vista; cada parte del resumen es una
`ROUND_REPORT_PARTS` de siempre, ingresos y curas, o una `roundReportParts` de su modulo:
mantenimiento, clima; el resumen solo tiene la parte de un modulo si este la ha apuntado, y cada
modulo dice su forma ampliando `RoundReportParts` con `declare module`). `endRound` devuelve los suyos:
`income`, `heal`, `upkeep`, `newDay`, `weather` (cada paso del fin de ronda, `roundPhasesOf`, da los
que tiene; el ultimo, 'army', apunta el valor de cada ejercito del dia nuevo) y, al final, los de
las `INVARIANTS`, que `endRound` tambien repasa (`fundsCapped`...). Van dentro de los del 'endTurn'
que acaba la ronda.

### Las piezas del nucleo

Las piezas de abajo, que usa todo lo demas (los detalles, debajo de la tabla):

| Pieza | Que va |
|---|---|
| `model/` | los tipos de la partida; solo tipos (ESLint lo vigila) |
| `content/` | el contenido (JSON validados) resuelto en tipos con nombre y catalogos por id; ver docs/CONTENIDO.md |
| `gameContent.ts` | el contenido de cada partida (`s.content`) y sus atajos (`unitTypeOf`, `terrainAt`...); `cloneState` |
| `modes.ts` | `GAME_MODES`: lo que fija cada modo de juego (congelado; se lee con `gameModeOf`) |
| `match.ts` | empezar una partida: `MatchConfig`, `MATCH_SETUPS`, `buildMatch`, `skirmishConfig`, `rematchOf` |
| `gameState.ts` | `newGameState(...)`: el unico sitio que escribe la forma de una partida nueva |
| `dice.ts`, `turnSeeds.ts` + `util/random.ts` | el azar: los dados de la partida (`diceOf`), la semilla de las decisiones de cada turno (`turnSeedOf`; quien decide, de su vista: `decisionRngOf`, playerView.ts), el `Rng` con semilla (`seededRng`) y elegir al azar (`pick`, `weightedPick`) |
| `playerView.ts` | lo que sabe cada equipo (`PlayerView`, con lo que no sabe en `FOG`), un plan con la vista al dia (`seeing`), su azar (`decisionRngOf`) y una copia con su niebla para simular (`foggedCopy`) |
| `settingsSchema.ts` | `SETTINGS_SCHEMA`: que valores puede tener cada ajuste |
| `matchSettings.ts` | `settingsWith(contenido, cambios)`: los ajustes por defecto con cambios (`MatchSettings`, `s.settings`) |
| `ruleModules/` | los modulos de reglas (`RULE_MODULES`) y lo que aporta cada uno a las listas de las reglas (`RuleHooks`); ver "Modulos de reglas" |
| `abilities.ts` | lo que hace cada clase de habilidad de las unidades (`ABILITY_EFFECTS`; lo enchufa el modulo `abilities`) |
| `weather.ts` | el clima de la partida: cual hay, el pronostico y como cambia (lo enchufa el modulo `weather`) |
| `damage.ts` | como sale el daño (`DamageModel`: la tirada y su reparto); cada modelo por su nombre en `DAMAGE_MODELS` (el ajuste `damageModel`: `shotByShot`, `spread`), construido una vez por partida (`damageModelOf`); solo usa `model/` |
| `teams.ts` | los equipos de la partida: alianzas, enemigos, quien los juega (ver "Equipos") |
| `data.ts` | constantes que no son contenido (`MAP_SIZES`, `MAP_MIN`/`MAP_MAX`, `MAX_LIFE`) |
| `defaultGames.ts` | partidas con el contenido del juego: `createMatch`, `loadGame` |
| `save.ts` + `savedParts.ts` + `saveVersion.ts` | guardar y leer (`readSave`): solo el formato de ahora |
| `util/grid.ts`, `mapGrid.ts` | rejillas (`Grid<T>`, `GridBounds`) y el mapa de una partida como rejilla (`mapGrid(s)`) |
| `geom.ts` | `posOf`, rombos (`diamond`, `neighbors4`), cuadrados (`squareArea`), `posKey` |
| `util/validation.ts` | comprobar lo que viene de fuera: `isInt`, `isPos`, `isPosOn` (e `isEntryId`, en content/catalog.ts) |

#### Los tipos y el contenido

- `model/`: `GameState`, `Unit` y su `UnitTurnState`, `Building`, `GameAction`, `GameEvent`,
  `StandingOrder`, `Squad`, `UndoableMove`, `MatchResult`, `GameModeId`, `MatchSettings`, `Rng`,
  `Dice`... No importa nada ni exporta constantes o funciones.
- `content/`: los JSON validados se resuelven al cargar en tipos con campos con nombre (`UnitType`,
  `BuildingType`, `TerrainType`, `WeatherType`, `Theme`), cada uno en un
  catalogo por id (`Catalog`: `list` en el orden del fichero y `byId`; `findEntry`/`entryOf`).
  `loadContent(ficheros)` da un `GameContent` congelado; `content/default.ts`, el del juego
  (`defaultContent()`, perezoso).
- `gameContent.ts`: el contenido de cada partida es un campo, `GameState.content` (en el modelo,
  `MatchContent`; content/index.ts le da la forma de `GameContent`). Lo ponen `newGameState` y
  `readSave`, no se guarda (`serialize` escribe `SavedGameState`) y se lee como `s.content` o con
  los atajos que dan el tipo resuelto: `unitTypeOf(s, unit)`, `buildingTypeOf`, `isHq`,
  `terrainAt(s, pos)`, `themeOf(s)`, `weatherTypeOf(s, id)` (los pesos de la IA, `content.ai`, los
  lee quien juega por su perfil: ver "La IA") (y
  `findUnitType`/`findBuildingType` para lo que viene de fuera). Las partidas guardan ids
  (`unit.type = 'Tank'`), nunca el puesto en el fichero; `cloneState(s)` copia la partida y comparte
  el contenido.
- `data.ts`: las tablas del generador de mapas (`mapgen.json`) y los temas (`themes.json`: letras de
  los mapas en texto, probabilidades de terreno) son contenido, y tambien los tipos de movimiento
  (`movements.json`, `content.movements`: `MoveType` es su id; el generador mide la tierra con el
  de `mapgen.json`, "landMovement", y la vista dibuja segun su `motion`, que lleva cada tipo de
  unidad: `unitType.motion`).

#### Modos y partidas nuevas

- `modes.ts`: lo que fija cada modo (`GameState.mode`: escaramuza, mision, partida para mirar): como
  se acaba (`victory`, en orden), el orden de los turnos de cada ronda (`turnOrder`: se fija al
  crear la partida y se guarda con ella), las reglas que impone (`fixedSettings`, que aplica
  `buildMatch`: la partida para mirar no tiene clima), sus pasos de turno (`turnPhases`, detras de
  los de siempre), como sacan unidades los edificios (`production`, el puerto de
  `rules/production.ts`: precio, por que no se puede y lo que se gasta; sin ninguna, se compra con
  dinero, `PURCHASE`) y si la pantalla guarda sola al empezar el turno de una persona
  (`saves`). Esta congelado. Cada partida resuelve su modo al crearse o leerse, como sus modulos de
  reglas (`s.ruleset.mode`), de un registro (`GameModeRegistry`; los del juego, `GAME_MODES`), y
  todo lo lee por `gameModeOf(s)` (las reglas, la sesion, la preparacion). Asi otro modo (uno de
  prueba, uno de un servidor) se juega sin tocar nada global: su nombre en `GameModeIds`
  (model/match.ts, `declare module`, como ModuleEvents) y su definicion en el registro que se da a
  `newGameState({ modes })`, `buildMatch(config, { modes })` o `readSave(json, contenido, modes)`
  (tests/modeHooks.test.ts lo hace asi). Un modo del juego nuevo es su nombre en `GameModeIds`, su
  entrada en `GAME_MODES` y, si se empieza desde una configuracion, esta en `MatchConfig` y su
  forma de prepararse en `MATCH_SETUPS` (el compilador pide las dos).
- `match.ts`: `MatchConfig` son datos (`SkirmishConfig`, `MissionConfig`, `SandboxConfig`);
  `MATCH_SETUPS`, como se prepara cada modo; `buildMatch(config, { content, mapRng? })`, con su
  clima y la muestra del ejercito del primer dia. Todo lo de la partida va en la configuracion, nada
  se cambia despues; empezar cada equipo en el sitio del que
  va k puestos detras en `rotateStarts: k`, con cualquier numero de equipos (la herramienta de
  equilibrio; con dos y 1, se cambian). `skirmishConfig` pone lo de
  siempre en lo que no se elige (mapa de `DEFAULT_MAP_SIZE`, tema al azar, reglas por defecto);
  `rematchOf(s)` da la revancha. La usan la pantalla, `npm run play`, las herramientas y los tests:
  una misma semilla da la misma partida en todos (K4).
- `gameState.ts`: `newGameState({ map, settings, content, mode, teams, seeds, firstTeam?, theme? })`
  lo usan mapgen, misiones, laboratorio, duelos y tests. Quien la crea dice sus equipos (`teams:
  duel('human', 'ai')` o una lista de `TeamSetup`) y las semillas de su azar (`seeds`: dados y decisiones, una aparte de la otra; ver "El azar").
- `defaultGames.ts`: `createMatch(config, mapRng?)` y `loadGame(json)` (lo que usa la web). Con `content/default.ts`, el unico sitio del nucleo que conoce el contenido del
  juego (ESLint).
- `settingsSchema.ts`: cada regla es un interruptor o un numero (entero o no, en un intervalo, quiza
  null). La usan el contenido (settings.json) y el guardado; settings.schema.json dice lo mismo para los
  editores (lo comprueba un test). `settingsWith` usa `content.defaultSettings`; nunca `{ ...ajustes, ...
  }` a mano.
- `teams.ts`: `teamState`, `isHostile`/`areAllied`, `isHostileOwner`/`isAlliedOwner`,
  `enemiesOf`/`alliesOf`, `teamsControlledBy`, `playerTeam`, `perTeam`,
  `duel`/`duelTeams`, `newTeams`.

#### El azar

Los dados de las reglas (el combate) son de la partida: `GameState.dice` es el estado de un
mulberry32 (un entero de 32 bits) y `diceOf(s)` tira de el, asi que se guarda y se repite con la
partida. Las decisiones de la IA tienen su propio azar, tambien de la partida pero aparte:
`GameState.decisionSeed` (fija; quien crea la partida la saca aparte de la de los dados: `MatchSeeds`,
`matchSeedsFrom(semilla)` para una mision o un laboratorio, dos tiradas distintas del generador en
mapgen; no es un secreto: con una, la otra sale probando las 2^32 semillas, unos 10 s) y, para cada
turno, `turnSeedOf(s, equipo)` (turnSeeds.ts: la semilla del turno, `turnSeed`, mezcla la de la
partida, el dia y el equipo). Quien decide no la saca de la partida: la vista se la da
(`PlayerView.turnSeed`) y su azar es `decisionRngOf(vista)`; en la vista la semilla de la partida es
0, asi que `turnSeedOf(vista.state, ...)` daria siempre lo mismo, y por eso ESLint no deja a la IA ni
a autopilot/ importar `dice.ts` ni `turnSeeds.ts` (`DECIDERS_ONLY_PROPOSE`). Asi el mismo turno da las mismas decisiones al cargar la partida, al
repetirla o en otra maquina (por la red), y lo que decide no cambia lo que sale en los dados. El
generador de mapas lleva su `Rng` (`seededRng`), que da quien crea la partida. `util/random.ts`: el
paso de mulberry32 (`randomStep`), `seededRng`, `seedFromDraw`, `matchSeedsFrom`, `turnSeed`, y
elegir al azar (`pick`, `weightedPick` con lo que sale si no hay a quien elegir; con la lista vacia no
tiran), un entero entre dos (`randomInt`) y barajar (`shuffleInPlace`). El clima del dia tiene su azar,
de la semilla del mapa y del dia (`weatherSeed`, weather.ts).

#### Guardar y leer

- `readSave(json, contenido)` da `{ ok, state }` o `{ ok: false, error }` con el `SaveError` de la
  parte rota (`badVersion`, `badMap`, `badUnits`, `badSettings`...); `deserialize` es su atajo que da
  null. El contenido no va en la partida: lo da quien lee.
- El JSON leido es un `SavedGame` (sus campos, `unknown`) hasta que se ha comprobado entero;
  `savedParts.ts` comprueba o limpia cada parte (lo opcional roto se quita) con lo que necesita
  (`SaveFrame`: contenido, bordes del mapa, cuantos equipos), y leer no cambia nada mas (ni
  escuadras ni teclas). Lo que la partida siempre guarda tiene que estar: no se rellena con valores
  por defecto (una regla que falta es `badSettings`).
- Cada partida guarda la version de su formato (`SAVE_VERSION` en saveVersion.ts, ahora 12, atada al
  tipo de `GameState.version`) y **solo se lee la de ahora**: no hay migraciones. Mientras el juego no
  ha salido, cambiar lo que se guarda es subir la version, y las partidas guardadas con una de antes
  se descartan (`badVersion`): el menu no ofrece Continuar y, al intentar cargarla, se borra el hueco.
- Se prueba con partidas creadas por el codigo de ahora (`tests/readSave.test.ts`), sin ficheros
  guardados.

#### Rejillas y casillas

`Grid<T>` tiene `at`, `atClamped`, `set`, `contains`, `forEach`, `cells`, `createLayer`,
`width`/`height`; `GridBounds` (tamaño y `contains`) es para lo que solo mira los bordes.
`mapGrid.ts`: `mapGrid(s)`, `terrainAt`, `isOnBoard`, `createLayer(s, fill)`. Los rombos y cuadrados
de `geom.ts` reciben los bordes y solo dan casillas de dentro; `posOf` copia la casilla de una
unidad o edificio.

**El estado es la unica fuente de la partida**: los ajustes van en `s.settings` (obligatorios; de ellos salen los modulos de reglas que lleva), el tamaño
del mapa en `s.map`, los equipos en `s.teams` y el contenido va unido a la partida (`s.content`); no hay variables de modulo
con la partida en curso, y dos partidas con otro tamaño, otras reglas u otro contenido se juegan a la
vez en el mismo proceso (tests/gameContent.test.ts, tests/mapSizes.test.ts). Las consultas no la cambian
(`armyValue`, `captureProgress`); lo que la cambia son las acciones (`dispatch`), el fin de ronda y lo
que la prepara, y lo dice en el nombre (`recordEvent`, `newUnit`...).

`src/core/squads/` (escuadras y ordenes permanentes del jugador): `queries` (unidades de una
escuadra), `naming` (nombres y teclas de grupo), las ordenes permanentes en tres piezas
(`standingOrderTypes`: que es cada tipo; `standingOrderQueries`: que orden cumple cada unidad, la de
su escuadra o la propia, y si se puede dar; `standingOrderSteps`: los pasos que las cambian, lo que
prohibe `APPLY_STEPS`), `membership` (formar, meter, sacar, deshacer; no hace sucesos) y `events` (el suceso
de una escuadra, `squadEvent`): las piezas con las que se hacen las acciones de escuadras y ordenes
(`actions/squads.ts`, `actions/standingOrders.ts`); la fachada `squads.ts` solo da las consultas.
Las cumple la partida al acabar el turno de cada equipo, sea quien sea quien lo juegue (la fase
'standingOrders' de `TURN_END_PHASES`, con `assistTurn` de `autopilot/standingOrders.ts`).
`trail.ts`: el camino trazado con el cursor, para la vista (desde donde atacar lo elige la vista con
la regla del ataque, `attackProblem` con `from`: `view3d/systems/turn/attackPlan.ts`).

`src/core/rules/` (cada modulo solo importa los de encima en la tabla; no hay ciclos):

| Modulo | Que va |
|---|---|
| `queries` | que hay en una casilla, por donde se anda (`canMoveOn`, `movementOf`), unidades de un equipo, pasajeros |
| `unitTurn` | el turno de cada unidad (`Unit.turnState`) y la unica forma de cambiarlo (ver abajo) |
| `funds` | el dinero: `earn`, `pay` (paga lo que haya) y `capFunds` (lo que pase del maximo se pierde al acabar cada accion y cada ronda) |
| `visibility` | vision y niebla (la de toda la alianza), enemigos a la vista y que se le enseña a cada equipo |
| `capture` | puntos de captura, capturas a medias (`captureProgress`), capturar y su suceso, `autoCapturers` |
| `lifecycle` | crear, quitar y limpiar unidades (`removeWithCargo`, con su `cargoLost`) |
| `undo` | los movimientos que se pueden deshacer (`undoableMoves`), el ultimo, por que no y su invariante |
| `falls` | si un equipo ha caido y por que (`currentDefeat`) y cuando cayo (`recordFalls`, `fallOf`, `lastFallen`) |
| `invariants` | `INVARIANTS` y `restoreInvariants`: lo que se deja en orden tras cada accion y cada ronda, con sus sucesos |
| `movementProfile` | como se mueve cada tipo: por donde entra y lo que le cuesta (`TerrainAccess`), lo que puede gastar (`MovementProfile`), `pathCost` |
| `passage` | lo que le hacen las demas unidades a quien se mueve (las `passRules` de los modulos; si ninguna dice nada, cierra el paso: `surroundingsOf`) y donde tiene que pararse; lo mismo para medir (`passBlockers`) y si se atraviesa a los aliados (`letsAlliesThrough`: lo que dice el `allies` de las reglas, sin unidad de ejemplo) |
| `distance` | pasos por tierra sin limite (`distanceMap`: 0 en el origen, Infinity donde no se llega) y lo que corta el paso al medir (`Blockers`: `noBlockers`, `unitsBlock` o `passBlockers`) |
| `movement` | la regla de cada paso (`stepAllowed`), alcance (`moveRange`), caminos (`plannedPath`, `validPath`, `approachPath`) y el paso hacia algo (`stepToward` con un `Approach`) |
| `traverse` | recorrer de verdad un camino (`traverse`, `moveAlong`): lo corta el primer `pathInterruptions` de los modulos que llega (la emboscada); el suceso de mover lleva el corte (`interruption: { kind, at }`) |
| `travel` | la orden de ir alli (varios turnos): a donde (`travelProblem`), el paso de cada turno (`travelStepOf`) y como acaba (`finishGoto`, `endGotoByHand`) |
| `engagement` | un combate como pregunta (`Engagement`: atacante y defensor como `Fighter`, con casilla y vida): lo hipotetico sin fingir unidades |
| `weapons` | lo que dice el arma de cada tipo: `inAttackRange`, `basePower`, `canDamage` |
| `attackRecord` | un ataque recien empezado (`newAttackRecord`) y quien ha caido (`fallenIn`); la forma, `AttackRecord`, con las partes de los modulos (`AttackRecordParts`), en `model/combat.ts` |
| `combat` | desde donde y a quien se dispara, proteccion, acierto (`HIT_MODIFIERS` y los de los modulos), daño esperado, contraataque (`canCounter`), tirada |
| `forecast` | prevision de combate (`combatForecast` de un `Engagement`) y zona de amenaza |
| `transport`, `supply` | unir y transportes (`mergeProblem`, `loadProblem`, `unloadProblem` y como se hacen); reparar |
| `economy` | ingresos, mantenimiento, limite del ejercito, comprar (`buyProblem`, `buildUnit`) |
| `production` | como sacan unidades los edificios: el puerto que elige el modo (`Production`; la de la partida, `productionOf` de `economy`); comprar con dinero es `PURCHASE` |
| `round` | fin de ronda (`ROUND_PHASES`, cada paso devuelve sus sucesos; `roundReport`, el resumen, con `ROUND_REPORT_PARTS` y las `roundReportParts` de los modulos) |
| `rank` | el rango por bajas (`RANK_KILLS`, `rank`: lo usa el modulo de veterania y la interfaz) |
| `victory` | como acaba la partida, igual para todos (`matchResult(s)`, `VICTORY_RULES`; ver abajo) |
| `turnOrder` | quien juega despues (`nextTurn`, y si con eso acaba la ronda; `takesTurn`) |

- `unitTurn`: `'ready'`, `'moved'`, `'done'`; `canStillAct`, `canStillMove`, `canStillFire` (una
  que no puede moverse y disparar, `firesAfterMove`, ya no dispara si se ha movido), `canActNow`/`canMoveNow` (lo mismo y en el mapa), y se cambia
  solo con `markMoved`, `spendUnit` y `readyUnit`.
- `visibility`: lo que ve un equipo es un `Sight` (`sightOf`); enemigos a la vista con
  `isVisibleFoe` (la pregunta de una unidad), `visibleFoes` (los de la vista) y `visibleFoeAt`; que unidades se le enseñan, `isShownTo`.
- `capture`: `captureProgress` solo consulta; `dropStaleCaptures` es una de las INVARIANTS. `undo`:
  apuntar, olvidar, `lastUndoableMove` y `undoMoveProblem`. `combat`: `attackProblem`,
  `attackTargets` y la tirada (`strike`); lo que pasa en un ataque es `COMBAT_RESOLUTION`
  (`actions/combat.ts`, ver "Modulos de reglas").
- **Movimiento** (G1-G7 de la auditoria del nucleo): `movementProfile(s, unidad)` dice por donde
  entra, lo que cuesta cada casilla y lo que puede gastar (el coste del terreno y el clima los ponen
  sus modulos); `surroundingsOf(s, unidad)` lo que encuentra en cada casilla (`'empty'`,
  `'passThrough'`, `'blocked'`) segun las reglas de paso de los modulos (pasar entre aliados, no
  saber de los enemigos escondidos; si ninguna dice nada, otra unidad cierra el paso) y donde tiene que pararse (`stopRules`: la zona de
  control); `moveRulesOf` junta las dos cosas y `stepAllowed(reglas, paso, 'walk' | 'join')` es la
  unica regla de cada paso: la usan el alcance, `validPath`, el rastro del cursor (`extendTrail`) y
  `approachPath` (unirse o subir a un transporte es un paso `'join'`, que entra en la unidad y no
  en su casilla, aunque cuesta lo mismo que entrar en ella; si aun puede moverse lo mira quien
  llama, `transport.ts`). `MoveRange` lleva esas reglas, `steps` (lo que cuesta acabar en cada casilla, o
  null) y `prev`; no mira si la unidad ya se ha movido (es hasta donde llegaria en su turno). Un
  camino ya comprobado se recorre con `traverse` (`moveAlong` al mover): lo puede cortar una
  `pathInterruptions` de un modulo (la emboscada; si hay varias, la que corta antes) y entonces la
  unidad se para antes y pierde el turno; el suceso lleva el corte (`interruption: { kind, at }`),
  la orden de ir alli acaba con su `kind` y la vista busca su animacion por `kind`; mover, unirse,
  subir y el paso de un viaje usan lo mismo. Distancias sin limite: `distanceMap(s, desde,
  movimiento, blockers)`; acercarse a algo: `stepToward(alcance, approach)` (`overGroundTo`,
  `straightTo` o el `Approach` de la IA y de la formacion). La IA mide con `stepsMap`
  (`autopilot/context.ts`) sobre la vista de su equipo, asi que los enemigos que no ve no le cortan el
  camino al planear, haya emboscadas o no: sola, todas las unidades que conoce cortan el paso; con el
  ejercito a la vez y si las reglas de paso dejan atravesar a los aliados, mide con esas reglas.
- **La rejilla**: el mapa es una rejilla de casillas con cuatro vecinas (`neighbors4`) y distancia
  en linea `manhattan` (`geom.ts`). Es la unica suposicion fija del nucleo: alcance, distancias,
  zona de control, rombos de vision y de alcance la dan por hecha. Otra forma (hexagonos) seria
  cambiar `geom.ts` y lo que usa `diamond`, no una lista de los modulos.
- **Combate como pregunta**: las reglas del combate reciben un `Engagement` (`engagement(atacante,
  defensor, { from, attackerLife, defenderLife, defenderHitToday })`; `reversed` es el del contraataque). Asi la
  prevision desde otra casilla, el valor de un ataque para la IA o el contraataque con la vida que
  le quedaria al defensor se preguntan sin copias de unidades.
- `falls`: si un equipo ha caido y por que, mirando la partida (`currentDefeat`, para un equipo:
  rendido, si no sin nada, si no sin Base; `isDefeated`), y cuando cayo: `TeamState.fell`, con su
  numero de caida, que apunta la invariante 'falls' (`recordFalls`, con el suceso 'teamDefeated') en
  la accion o la ronda en que pasa. Si caen varios a la vez, cual cuenta lo dice `DEFEAT_PRIORITY`
  (sin Base, sin nada, rendido: `mainFall`). Al cargar, `readSave` solo comprueba que lo apuntado
  cuadre con la partida en los dos sentidos (`fallsMatch`) y si no, la rechaza; `assertAllStanding`
  exige que una partida nueva empiece con todos en pie.
- `victory`: `MatchResult` con `status`, `winners` y `reason`; `isMatchOver`, `isWinner`. Las formas
  de acabar estan en `VICTORY_RULES` ('lastAllianceStanding', 'objective', 'dayLimit') y cada modo
  dice las suyas. Solo lee las caidas apuntadas: el motivo del resultado es el de la ultima
  (`decidingFall`, la misma que usa el final para decir de quien fue), la que lo decide, no una
  rendicion de antes. `outcomeFor` dice si un equipo ha ganado, perdido o empatado. Contrato: una
  partida decidida por una caida que no esta apuntada (cambiada sin pasar por las INVARIANTS) hace
  que `matchResult` lance un error; por eso `buildMatch` exige que todos empiecen en pie
  (`assertAllStanding`) y `readSave` rechaza lo que no cuadre. Si lo que pasa al acabar un turno
  decide la partida, 'endTurn' no pasa el turno (ni ronda nueva, ni otro dia). Puntos del limite de
  dias por alianza, progreso del objetivo de un equipo en la mision (`objectiveProgress(s, equipo)`).
- `turnOrder`: `nextTurn` da el siguiente del orden de la ronda que aun juega.

`src/core/autopilot/` (no es la IA: lo usan las ordenes permanentes, una regla para todos):
`profile` (con que juega: `AutopilotProfile`, pesos y razones de ataque; el de las ordenes de la
partida, `autopilotProfileOf`, en defaultProfile.ts), `context` (el `PlayCtx` del turno y ayudas
comunes), `engagement` (como pelea una unidad: `EngagementPolicy`), `scoring` (cuanto vale cada
ataque), `tactics` (retirarse, atacar, capturar lo de debajo), `formation` (escuadras que avanzan
juntas) `standingOrders` (cumplir las ordenes, `StandingOrder`) y `preview` (lo que haran, para las flechas de intencion: `previewStandingOrders`).
`src/core/ai/` los reutiliza: `profile` (`AiProfile`, `defaultAiProfile`), `tactics` (ir a capturar,
avanzar, moverse al azar), `fire` (fuego concentrado), `unitTurn` (prioridades de cada unidad) y
`production` (que fabrica). `turn` tiene `aiTurn`, que los junta (es el `turn` del perfil del juego, `defaultProfile`); `ai.ts` es la fachada.

### La IA

- **Un plan que propone**: el turno de la IA, como lo que hacen las ordenes, es un `ActionPlan`
  (`Generator<GameAction, R, ActionResult>`, model/actions.ts): cada paso propone una accion
  (`act`, `doMove`, `finish` en `autopilot/context.ts`) y recibe lo que ha dicho la partida; no
  manda nada. La sesion lo cumple como lo de cualquier controlador (`proposing`, 'propose'); fuera
  de una sesion (el paso de fin de turno, la prevision, la vista al dar una orden, los tests) se
  cumple con `carryOut(plan, enviar)` (actions/plan.ts). Cuando una persona pide que la IA juegue su
  turno (`ia` en la partida por texto), se lo deja a la sesion (`GameSession.handOver(equipo,
  aiController())`), que lo juega como el de cualquier equipo de la IA, con su perfil. Asi todo lo que hace
  la IA pasa por `dispatch` con las mismas comprobaciones que lo de una persona, queda en el
  registro de la sesion y se puede repetir o mandar por la red.
- **Lo que sabe su equipo**: decide con la `PlayerView` que le da la sesion (`playerView.ts`): la
  partida sin lo que su equipo no sabe (`FOG`: los enemigos que no ve; de los que ve, sus ordenes,
  su escuadra y a quien llevan dentro; las escuadras enemigas; quien captura un edificio que no ve;
  las cuentas de los enemigos: estadisticas y dinero; lo que pueden deshacer los
  demas equipos; y las semillas: dados, decisiones y la del mapa, `setup`). De su azar solo sabe el de sus
  decisiones de este turno (`PlayerView.turnSeed`, que usa su controlador). Las semillas son de 32
  bits y la pantalla enseña a la persona el codigo del mapa (de el salen las de una escaramuza): una
  partida por la red que las tenga que guardar en secreto no las manda. Es la misma partida por
  debajo (un Proxy; sus unidades son las de verdad) y se pone al dia tras cada accion. Las
  caidas son publicas (la partida las anuncia): la vista las lleva como estan apuntadas
  (`TeamState.fell`), nunca las deduce de lo que ve. Las ordenes permanentes deciden igual, con la
  vista del equipo, las cumpla quien las cumpla: los pasos de turno (`followStandingOrders` en
  actions/turn.ts: `playerView` + `seeing`), la vista al darlas (en 3D aun no se dan) y
  `autopilotController` (con la vista que le da la sesion). Su prevision simula sobre una copia de
  la partida tal como la sabe el equipo (`foggedCopy`, con toda la niebla de FOG), asi que sin
  combates ni emboscadas dice lo que despues hacen y no delata nada de lo que no ve.
  La sesion pone al dia la vista de quien juega tras cada accion; fuera de una sesion lo hace
  `seeing`. La vista es de solo lectura hasta el fondo (lo que se lee de ella tambien) y por todas
  las puertas: pedir el descriptor de una propiedad (`Object.getOwnPropertyDescriptor`) da lo mismo
  que leerla (la lista con niebla, no la de verdad), y cambiar el prototipo o cerrar un objeto lanza
  un error, como escribir. Las reglas de la partida (`s.ruleset`: modulos, listas y entradas) estan
  congeladas hasta el fondo desde que se resuelven (`resolveRuleset`), asi que tampoco se cambian por
  la vista. La guarda va siempre puesta: solo lanza errores y cuesta poco por turno de la IA.
- **Un perfil que se le da**: como juega una IA es su `AiProfile` (`weights` de ai.json,
  `scoreTerms`, `behaviours` y su turno entero, `turn`: el del juego, `aiTurn`), que recibe su controlador (`aiController(perfil?)`; sin el, el del
  contenido de la partida: `defaultAiProfile`). Nada de la IA lee pesos de un sitio comun: dos IAs
  con otros perfiles juegan a la vez. Las ordenes de la partida usan
  `autopilotProfileOf(contenido)`.
- **Su azar, de la partida**: `decisionRngOf(vista)` (ver "El azar"): el mismo turno decide igual
  al cargar, al repetir o por la red.
- **Sin estado global**: el equipo que juega, su perfil, como mide los caminos (`paths`: 'alone',
  cada unidad sola, o 'army', el ejercito a la vez: atraviesa a los aliados si las reglas lo
  dejan) y el fuego concentrado del turno (`focusFire`) van en un `PlayCtx` que no cambia; la IA
  crea uno para la compra y otro para mover el ejercito. Dos turnos, o una prevision en
  medio de uno, no se mezclan.
- **Pregunta a las reglas**: lo que necesita saber de la partida es una consulta de las reglas
  (`projectedIncome`, `canRepair`, `isEnemyHq`, `hasFullArmy`, `killReward`; el daño de rematar
  a quien otro ya ha dado, `expectedDamage` de `engagement(..., { defenderHitToday: true })`),
  nunca una copia propia; los numeros con los que decide son pesos de su perfil. Los enemigos que
  conoce y lo que ve los da su vista (`knownFoes`, `sightIn`, playerView.ts): la vision se calcula una
  vez cada vez que la vista se pone al dia (y eso, la primera vez que se mira despues de una accion,
  no en cada una), no en cada unidad que decide; en otra partida (la copia de la prevision) se mira
  en ella.
- **Puntos de extension**:
  - una pieza de reglas que la partida lleva o no (con su ajuste) es un modulo de reglas (ver
    "Modulos de reglas"): un fichero en `ruleModules/` y su entrada en `RULE_MODULES`;
  - una regla que cambia la probabilidad de acierto es un `hitModifiers` de su modulo (lo de
    cualquier partida, el poder y la proteccion, esta en `HIT_MODIFIERS`, `rules/combat.ts`); la
    prevision, el panel de combate y la IA la ven solas;
  - un sistema que actua cada ronda es un `roundPhases` de su modulo, en su momento (`RoundStage`);
    lo de cualquier partida esta en `ROUND_PHASES` (`rules/round.ts`);
  - algo que pasa en cada ataque es un `combatSteps` de su modulo, en su momento (`CombatStage`);
    lo de cualquier ataque esta en `COMBAT_RESOLUTION` (`actions/combat.ts`); lo que apunta en el
    ataque (y lleva su suceso) es su campo en `AttackRecordParts` (`model/combat.ts`, con `declare
    module`, como el botin; no puede llamarse como un campo de `AttackEventBase`:
    `AttackPartsFitEvent` no compila); quien contraataca, un `counterRules`;
  - un suceso propio de un modulo (el mantenimiento, el clima) es su tipo en
    `ModuleEvents` (`model/events.ts`, con `declare module` desde el modulo). `GameEvent` es lo de
    cualquier partida (`CoreGameEvent`) mas esos; la vista 3D anima los que tienen entrada en
    `EVENT_STEPS` (`view3d/systems/events/eventSteps.ts`; los demas no se animan), y `npm run play` y las
    estadisticas tienen un caso por defecto. Los sucesos no se guardan ni se leen de fuera, asi que
    no hay validacion que necesite la lista cerrada; un ingreso nuevo del fin de ronda dice de donde
    sale con el nombre de su modulo (`income.source`, ampliando `IncomeSources`);
  - lo que cuenta un suceso en las estadisticas es una entrada en `STAT_COUNTERS` (stats.ts, por tipo
    de suceso) o, si es de un modulo, un `statCounters` suyo;
  - por donde se pasa, un `passRules` o `stopRules`; lo que corta un camino a mitad, un
    `pathInterruptions` (su nombre ampliando `InterruptionKinds`, `model/events.ts`, con `declare
    module`; la vista 3D aun no anima los cortes; en `npm run play`, su nombre o el del codigo);
  - una parte del resumen de ronda, un `roundReportParts` y su forma ampliando `RoundReportParts`;
  - otra forma de repartir el daño, una entrada en `DAMAGE_MODELS` (`damage.ts`) y su nombre
    en el ajuste `damageModel`; el coste de las casillas o lo que se puede gastar,
    un `enterCosts` o `moveBudgets`; la vision, `visionRadius`, `revealRules`, `concealment` o
    `coverSight`;
  - una clase de habilidad de unidad es su forma en `AbilityDef` (`content/types.ts`), su validacion
    en `ABILITY_SHAPES` (`content/abilities.ts`), lo que aporta a las listas en `ABILITY_HOOKS`
    y su sitio en `ABILITY_ORDER` (`abilities.ts`; el compilador exige las dos, y de ahi sale
    `ABILITY_EFFECTS`, en ese orden); el modulo de las habilidades lo enchufa todo;
  - un comportamiento de IA nuevo (un papel de unidad) es una entrada `{ id, when, run }` en
    `UNIT_BEHAVIOURS` (`ai/unitTurn.ts`, los del perfil por defecto), en su sitio de la lista; `run`
    es un plan que devuelve si ha usado la unidad y suele llamar a un paso de `ai/tactics.ts`. Para
    probarlo antes, medirlo con `npm run balance`;
  - una razon nueva para preferir o evitar un ataque es un termino en `ATTACK_SCORE_TERMS`
    (`autopilot/scoring.ts`, los del perfil); una forma de pelear, un preset de `EngagementPolicy`
    (`autopilot/engagement.ts`); un tipo de orden permanente, su linea en `StandingOrderKinds`
    (`model/standingOrder.ts`, con su momento: de ahi salen los tipos), su entrada en
    `STANDING_ORDER_TYPES` (`squads/standingOrderTypes.ts`: nombre, momento, si es solo de la unidad, por
    que no se puede dar, como la cumple quien no puede (`escort`), si es quedarse guardando el sitio
    (`holdsPosition`, la que se da al parar), si es tomar el edificio (`takesBuilding`, la de quien
    captura a mano), si manda en la escuadra (`leadsSquad`), cuando esta cumplida para su escuadra
    (`squadDone`), si es un viaje (`travels`) y su puesto en el menu de una casilla (`menuRank`): nada de las ordenes pregunta por
    un tipo concreto) y como se juega en `STANDING_ORDER_TURNS` (`autopilot/standingOrders.ts`); el
    compilador pide las tres. Que sean tres tablas es a proposito: el modelo (solo tipos) no puede
    tener funciones, las reglas de las ordenes (squads/) no pueden depender de quien las cumple
    (autopilot/, que usa las reglas) y cada capa tiene su entrada por tipo, sin ciclos; las une el
    compilador, no una lista que haya que acordarse de tocar;
  - algo mas que un equipo no sabe de la partida, una entrada en `FOG` (`playerView.ts`).

### Modulos de reglas (`core/ruleModules/`)

Los ajustes de una partida (`s.settings`, un `MatchSettings`: numeros e interruptores; se guardan con
ella) no se preguntan dentro de cada regla. Cada pieza que la partida lleva o no es un modulo
(`RuleModule`: `id`, `isOn(ajustes)` y lo que aporta, `hooks: RuleHooks`), y las reglas miran
listas: las entradas de siempre mas las de los modulos que la partida lleva (`hooksOf(s, lista)`,
en el orden de `RULE_MODULES`; `isRuleOn(s, id)` dice si uno esta puesto). Sin el modulo, sus
entradas no estan: no hay `if (!s.settings.veterancy) return 1`.

Los modulos se resuelven **una vez por partida**: `rulesetFor(partida, ajustes)` junta los del juego
(`RULE_MODULES`) y los que trae su modo (`GameMode.ruleModules`), se queda con los que se enchufan y
deja sus listas ya juntas en `s.ruleset` (con el modelo de daño, `damageModel`). Se pone al crear la
partida, al leerla (`readSave`) y al cambiar sus ajustes (`changeSettings`, que cambia los dos a la
vez: `s.settings` es de solo lectura); no se guarda (como el contenido). `hooksOf` e `isRuleOn` solo
leen `s.ruleset` (`ruleModules/ruleset.ts`). La ayuda de una partida cuenta sus modulos (`helpRulesOfMatch`); la del menu, sin partida, los del juego que van con los ajustes (`helpRulesForSettingsOnly`, `gameModulesFor`). Las
partes del juego que no son reglas (la interfaz, la IA) tampoco miran el ajuste: preguntan al
modulo (`isRuleOn`) o a las reglas (`seesEverything`, `letsAlliesThrough`).

| Modulo | Su ajuste | Lo que aporta |
|---|---|---|
| `abilities` | `abilities` | lo de cada clase de habilidad (`ABILITY_EFFECTS`): escudo y aura al acierto, perforar, zona de control, ver en el bosque, capturar rapido |
| `veterancy` | `veterancy` | el rango al acierto (`rank`, `RANK_KILLS`; las bajas se cuentan siempre) |
| `flank` | `flankBonus` > 0 | rematar a quien ya ha recibido un ataque hoy (`flankBonusFor`, `wasHitToday`) |
| `weather` | `weather` | acierto, lo que se puede gastar al moverse, el radio de vision, el cambio de clima con el dia y el clima del primer dia (`matchSetup`) |
| `buildingIncome` | `incomeScale` > 0 | lo que pagan los edificios al acabar la ronda (la cura encima es de todas las partidas: `repair`, en `ROUND_PHASES`) |
| `upkeep` | `upkeep` > 0 | pagar el mantenimiento al acabar la ronda |
| `commandPoints` | `commandPoints` no null | el tope de puntos de mando del ejercito (`armyLimits`, detras del numero de unidades de `ARMY_LIMITS`; la cuenta, `commandUsed`) |
| `noHealUnderFire` | `noHealUnderFire` | quien ha recibido un ataque hoy no se cura (`unhealable`) |
| `noFog` | `fog` quitado | todos ven todo el mapa |
| `forestHides` | `forestHides` | el terreno que esconde solo se ve desde al lado |
| `terrainCost` | `terrainCost` | lo que cuesta entrar en cada terreno (si no, 1) |
| `passAllies` | `passAllies` | los aliados se atraviesan (sin parar encima) |
| `ambush` | `ambush` | los enemigos que no se ven no cuentan al planear; al chocar, emboscada |
| `counterattack` | `counterattack` | `MELEE_COUNTER`: quien contraataca |
| `bounty` | `bounty` > 0 | el botin al destruir (`killRewards`: lo que se cobra, `killReward` de rules/economy.ts, que preguntan el panel de combate y la IA) |
| `relief` | siempre | la altura de cada casilla al empezar (`matchSetup`, `elevationFor` de core/elevation.ts, en `GameState.elevation`): las montañas son lo alto y se ven como tal, con o sin la regla de elevacion |
| `elevation` | `elevation` (apagado por defecto) | lo que hace la altura (la prepara `relief`): el acierto desde arriba o desde abajo (`elevationHit`), la vision desde lo alto (`elevationVision`) y lo que cuesta subir (`elevationClimb`: `enterCosts` recibe tambien la casilla de la que se viene); los aviones no lo notan |

Las listas (`RuleHooks`, en `ruleModules/hooks.ts`, solo tipos): `hitModifiers`, `coverPiercing`,
`counterRules`, `combatSteps` (con su `CombatStage`), `roundPhases` (con su `RoundStage`),
`matchSetup`, `healingBlocks`, `killRewards`, `armyLimits` (un tope del ejercito; su nombre en
`ArmyLimits`), `visionRadius`, `revealRules`, `concealment`, `coverSight`, `enterCosts`,
`moveBudgets`, `passRules`, `stopRules`, `pathInterruptions`, `roundReportParts` y
`captureFactors`. Las que van por momentos
(el fin de ronda, el ataque) se ordenan por momento y, en cada uno, primero las de siempre y luego
las de los modulos (`roundPhasesOf`, `combatResolutionOf`); en el acierto, el orden de los modulos
importa (coma flotante). La direccion es una: el registro (`ruleModules/registry.ts`) importa los
modulos, los modulos importan lo que enchufan (clima, habilidades...) y las reglas solo
importan `ruleModules/ruleset.ts` (`hooksOf`, `isRuleOn`) y los tipos de `ruleModules/hooks.ts`:
ni el registro, ni un modulo concreto, ni clima o habilidades (L7). Lo comprueba ESLint
(`no-restricted-imports` en `src/core/rules/**` y `src/core/actions/**`, con la ruta que sea:
relativa o por `@core/`). `ruleModules/ruleset.ts` y `ruleModules/hooks.ts` no importan rules/: lo
que comparten con las reglas son tipos de `model/` (`Engagement`, `AttackRecord` y sus
`AttackRecordParts`, `DamageModel`, `RoundReport` y sus `RoundReportParts`, `model/combat.ts` y
`model/roundReport.ts`) y los modelos de daño (`damage.ts`, que solo usa `model/`). Asi la direccion
es rules → ruleModules/ruleset → model, sin vuelta. Los tipos del registro de acciones tambien
estan en `model/actionRegistry.ts`, para que una pieza que trae su accion no importe
actions/. Lo que solo usa el arma de cada tipo esta en `rules/weapons.ts` para que las reglas de
los modulos no tengan que importar el combate.

Un modulo nuevo: su fichero en `ruleModules/` (lo que aporta a cada lista), su nombre en
`RuleModuleIds` (los del juego estan alli; el de un modo la amplia con `declare module`, y
`resolveRuleset` no deja dos con el mismo nombre),
su entrada en `RULE_MODULES` y, si tiene interruptor, su ajuste en `MatchSettings`, `SETTINGS_SCHEMA`,
settings.json y settings.schema.json. Una lista nueva que se pueda ampliar: su campo en `RuleHooks` y la
regla que la mira con `hooksOf`. Lo prueba `tests/ruleModules.test.ts` (cada interruptor quita su
modulo y solo ese).

### Equipos

Una partida tiene dos o mas equipos (`GameState.teams`, `TeamState`; una guardada, hasta 16): cada uno con su numero (`id`, su
puesto en la lista), su `alliance`, quien lo juega (`controller`: `'human'` o `'ai'`), su dinero y sus
estadisticas. **Ningun numero de equipo es especial**: no hay "el 0 es el jugador".

- Enemigos son los de otra alianza (`isHostile`, `enemiesOf`); los de la misma comparten la vision,
  y no se atacan ni se capturan lo suyo.
- Todo lo que es de un equipo lo dice: `unit.team`, `building.owner`, `squad.team`,
  `objective.owner`. Las funciones que hacen algo por un equipo lo reciben siempre
  (`dispatch(s, team, action)`, `playerView(s, team)`, `visibility(s, team)`), sin
  valor por defecto. Como acaba la partida no es de un equipo: `matchResult(s)` dice quien gana.
- Los sucesos dicen que equipo los ha hecho (`actor`); el resumen de la ronda (`RoundReport`) lleva
  una lista por equipo (`perTeam`).
- Un equipo pierde si se queda sin Base o sin nada, o si se rinde (`isDefeated`); los derrotados ya
  no juegan. A quien le toca lo dice la partida (`GameState.turn`, ver "Acciones": 'endTurn' pasa al
  siguiente que juega, `nextTurn`). Lo que le queda en el mapa a un derrotado se queda a proposito y
  el fin de ronda lo trata como el de cualquiera (cobra, se cura): nadie lo usa, y es botin para los
  demas.
- La partida termina (`isMatchOver`) cuando la primera forma de acabar de su modo lo decide
  (`VICTORY_RULES`): solo queda en pie una alianza (o ninguna: empate), un objetivo de la mision
  (cada equipo tiene el suyo o ninguno, `s.mission.objectives`, `objectiveOf(s, equipo)`; decide el
  primero, en el orden de los equipos, que se cumple o falla) o el limite de dias (gana la alianza con mas puntos; si empatan, empate). Con 3 o mas equipos, que
  caiga uno no la acaba.
- Hace falta al menos dos alianzas (`newTeams` y `readSave` no aceptan menos).
- Las reglas no miran el `controller`: solo dice quien decide (el controlador que le pone la sesion,
  ver "Partidas en juego"). Las ordenes con destino se le pueden dar a cualquier equipo.
- **La vista**: el equipo que mira es `viewer` (`StartedGame.viewer`, `view3d/app/gameStart.ts`; sin
  personas, el primer equipo, que juega la persona aunque guarde `controller: 'ai'`,
  `screenControllers` de core/controllers, que usa tambien `npm run play`), y todos los `...Host`
  lo tienen. La niebla, la amenaza, lo que se elige
  y lo que se ordena son del `viewer`. Si un equipo es de una persona solo lo dice
  `isPerson(session, equipo)` (session/screen.ts: el `person` de su controlador, tambien dentro de un `sequence`). La interfaz
  no sabe de numeros de equipo: pinta y escribe por **lado** (`ui/sides.ts`: `'own'`, `'ally'`,
  `'enemy'` y `'neutral'` para lo que no es de nadie; azul lo propio y aliado, rojo lo enemigo).
- **Varias personas en la misma pantalla** (por turnos; el rival «Persona» de Nueva partida): cada
  una tiene su `humanController`, y quien mira en la vista 3D es la persona a la que le toca
  (`HotSeat`, `view3d/systems/turn/hotSeat.ts`). Cuando la sesion espera a otra (`localRunner`,
  `Onlooker.handTo`), la partida se tapa con el aviso de cambio de jugador (`UIState.handoff`,
  `hud/overlays/Handoff.tsx`), la vista pasa a ser la suya (sus colores y su niebla:
  `MatchScene.lookAs`; su camara, donde la dejo o en su Base) y su turno empieza cuando pulsa
  «Empezar mi turno» (o Enter). Por eso los sistemas no guardan el `viewer`: lo piden cada vez (los
  `...Host` lo tienen como `get viewer()`, como la sesion de `runner`). `npm run play` juega la persona
  a la que le toca (`TextMatch`, tools/play/textMatch.ts, sobre la misma `GameSession`).
- El turno en la barra de arriba es el del equipo que juega, por lado (`turn: Side`): tu turno, el
  de un aliado (en azul) o el de un enemigo (en rojo).
- Los mapas al azar valen para 2 o mas equipos (`generateGame` busca una salida por equipo, cada una
  lejos de las anteriores); la pantalla de nueva partida y las misiones son de dos (`duel`). Las
  reglas, la IA, el guardado y la vista ya valen para mas (tests/teams.test.ts: 4 equipos en 2
  alianzas y 3 todos contra todos).

### Herramientas

`tools/` (equilibrio, partida por texto, contenido) solo usa el nucleo, importado por su
alias: `import { createMatch } from '@core/defaultGames'` (definido en `tsconfig.json` "paths" y en
`vite.config.ts`; `tsx` lo entiende solo). ESLint prohibe que `tools/` importe nada mas de `src/`
(vista 3D, interfaz, ajustes) o three.js/Preact, y que los tests importen el nucleo por ruta relativa.
Lo que mide una regla fuera de una partida de verdad, sin comprobar nada (el combate suelto del
laboratorio de duelos y de los tests: `uncheckedAttack`), esta en `core/measure.ts` (no es el modo
'sandbox', la partida para mirar). ESLint prohibe
importar ese fichero desde cualquier fichero de `src/`, tambien del nucleo y con cualquier ruta
(`MEASURING_IS_NOT_THE_GAME`): solo lo usan `tools/` y `tests/`. Y `resolveAttack`, el combate sin
comprobar que hay debajo, solo se puede importar en `measure.ts` (su modulo, `actions/combat.ts`, lo
usa para la accion 'attack'; `UNCHECKED_ATTACK_ONLY_IN_MEASURE`).

Es el paso previo a un monorepo: si algun dia hace falta (un servidor para partidas online que use el
nucleo, una herramienta con dependencias propias, publicar el nucleo), `src/core` pasa a ser el paquete
`@ilogic/core` y basta con cambiar el alias. Hasta entonces, un solo paquete es mas simple.

### Interfaz HTML (src/hud)

La vista 3D publica con `ui.set(...)` lo que hay que enseñar (`view3d/systems/hud/hudBridge.ts`, `matchMenus.ts`,
`matchEnd.ts`, `menuFlow.ts`) y los componentes de Preact solo lo pintan; los botones llaman a `ui.actions.*`, que
pone la vista. Cada pieza en su sitio:

| Que | Donde |
|---|---|
| El store (`ui`, `showToast`, `showBanner`...) | `store.ts` (reexporta todos los tipos: se importan de ahi) |
| Forma del estado y valor al arrancar | `state.ts` (`UIState`, `initialState`) |
| Lo que piden los botones, agrupado por pantalla | `actions.ts` (`UIActions`; su valor por defecto, en `store.ts`) |
| Tipo de lo que enseña cada panel | `vm/<panel>.ts` (`TileVM` en `vm/tile.ts`...) |
| Calculo de esos datos a partir de la partida (puro, con test) | `src/ui/models/<panel>.ts`, reexportado en `src/ui/hudModels.ts` |
| Raiz: pantalla en curso, dialogos y avisos | `Hud.tsx` |
| Paneles de la partida y donde va cada uno | `game/*.tsx`, colocados en `game/GameHud.tsx` (lista `GAME_PANELS`) |
| Pantallas del menu, pausa y final | `menus/*.tsx`; Novedades, Aprender y Opciones son paginas enteras con el mismo marco (`menus/MenuPage.tsx`: en el menu, el logo y las pestañas de Inicio, `MenuTabs.tsx`; en la partida, su titulo y «Cerrar»), y mientras hay una abierta no se pinta lo de debajo (`isPageOpen`) |
| Dialogos (ayuda, novedades, nombre de escuadra) y avisos (carga, aviso, resumen, cartel) | `overlays/*.tsx` |
| Piezas compartidas | `common/`: `Pill`, `Chip` y `Badge` (`toy.tsx`, las piezas "caja de juguete": pastillas de esquina, fichas que se pulsan y chapas sobre una casilla, como las de la prevision: numero y color en `ui/models/forecastBadges.ts`), `Button` (sin foco del navegador), `Btn` (menus), `Icon`, `Popover`, `Veil`, `Seg`, `useTipToggle`, `useUI`, formatos (`pct`, `range`...) |
| Estilos | `styles/<grupo>/<panel>.css`, juntados en orden por `hud.css` |

- **Un panel nuevo**: su tipo en `vm/`, su campo en `UIState` (null = no se ve) y en `initialState`,
  la funcion que lo calcula en `ui/models/` (con test), el componente en `game/` (o `menus/`,
  `overlays/`), su entrada en `GAME_PANELS` de `GameHud.tsx` (o `Hud.tsx`), sus acciones en `actions.ts` con su valor
  por defecto en `DEFAULT_ACTIONS`, y su hoja al final de `hud.css`.
- **Botones**: siempre `Button` (o `Btn` en los menus), que no se queda con el foco: Enter y las
  flechas son del juego (lo lleva la vista con el teclado). Solo el cuadro del nombre de escuadra
  usa botones normales, porque ahi se escribe.
- **Estilos**: cada hoja de `styles/` es un trozo seguido de la hoja de antes y `hud.css` las importa
  en ese orden, que es el de la cascada. Por eso hay alguna mezclada (`base/narrow.css`,
  `legacy.css`): mover reglas de sitio puede cambiar quien gana. Lo nuevo va al final; los colores,
  radios, bordes y sombras son variables de `styles/base/base.css` (los colores, los mismos que
  `ui/palette.ts`), y las letras (Fredoka y Nunito, en `fonts/`) van dentro del proyecto: el juego
  funciona en un solo HTML y sin red. Como se ve, en `docs/ESTETICA.md`, "Interfaz".
- **Textos**: `t('clave')` (de `settings.ts`, que solo la expone) busca en `src/i18n/`, un fichero por tema en `es/` y su
  traduccion con el mismo nombre en `en/` (tipada con `Translation`: si falta una clave, no
  compila). Un texto nuevo va al tema que toca en `es/` y luego en `en/`; las claves no se repiten
  entre temas (`tests/i18n.test.ts`).
- Los textos salen de `t('clave')` al pintar: por eso los componentes no se memorizan (`memo`), un
  cambio de idioma o de escala tiene que repintarlos aunque sus datos no cambien.

## Partidas en juego (`core/session`)

Quien decide lo que hace cada equipo es un **controlador** (`Controller`, `session/controller.ts`):
la sesion le pide su turno (`playTurn`) con la vista de su equipo (`PlayerView`: nunca la partida de
verdad) y va haciendo lo que da, paso a paso (`TurnStep`): 'propose' (una accion para que la mande la
sesion; recibe el resultado) o 'awaitInput' (decide alguien de fuera: la sesion espera a
`finishInput`). Ningun controlador manda nada: la IA y las ordenes son planes que proponen
(`ActionPlan`), y `proposing(plan)` los hace pasos 'propose'. Cuando el turno del controlador acaba,
la sesion manda 'endTurn'.

| Controlador | Que hace |
|---|---|
| `aiController(perfil?)` | la IA rival, con su perfil (`AiProfile`; la arena le da otro) y el azar de la partida |
| `humanController()` | una persona en la pantalla: espera a que acabe (sus ordenes permanentes las cumple la fase de fin de turno) |
| `remoteController()` | un jugador por la red: espera las acciones que lleguen |
| `replaySession(s, log)` | (una sesion entera, no un controlador) repite el registro de otra, con un `LogCursor` |
| `autopilotController()` | cumple ya, en el turno, las ordenes de pelear (la huella; session/autopilotController.ts, sin IA) |
| `randomController(rng)` | jugadas legales al azar, de las que el juego daria por buenas (tools/improve/randomPlayer.ts, para el fuzz) |
| `passiveController()` | no hace nada |
| `scriptedController(acciones)` | manda una lista fija de acciones (la huella: las ordenes del primer dia) |
| `sequence(...)` | uno detras de otro (la huella: sus ordenes, `autopilotController` y la IA) |

Los de la IA (`aiController`, y `controllersFor`, que da el de cada equipo segun su
`TeamState.controller`) estan en `core/controllers/` (fachada `core/controllers.ts`), fuera de
session/: la sesion no importa la IA. El azar de la IA sale de la partida (`decisionRngOf` de su vista, ver "El
azar"): nadie se lo da, asi que la pantalla, el fondo del menu y las herramientas deciden igual.

- La partida en juego es una `GameSession` (`session/gameSession.ts`): la partida, sus
  controladores, el registro de lo que se ha hecho (`log`, para repetirlo) y los avisos de cada
  accion (`subscribe`). Avanza paso a paso (`step`): empieza el turno de quien le toca, hace lo
  siguiente de su controlador o acaba su turno, y para si espera a alguien de fuera o si la partida
  se ha decidido. Quien la juega decide como esperar entre pasos: `runMatch` la lleva seguida (las
  herramientas y los tests, con `until`) y la vista 3D pide los pasos uno a uno y anima cada uno
  (`TurnControls.runUntilInput`).
- Las acciones de una persona entran por `session.act(team, action)`, o por `session.dispatcher`
  donde hace falta un `ActionDispatcher` (la partida por texto; solo vale para la partida
  de la sesion: para simular en una copia, `dispatch`). Solo mientras se la espera, salvo rendirse,
  que vale siempre.
- 'startTurn' y 'endTurn' son solo de la sesion: la regla esta en `sessionOnlyProblem` y la usan
  `act` y lo que propone un controlador (los pasos de turno, ademas, solo mandan acciones de su
  equipo: `ownTeamOnly`).
- El registro (`log`, de `LoggedAction`) y como se lee estan en `session/log.ts`. Lo que un equipo
  manda fuera de su turno (rendirse mientras juega otro, o antes de empezar el suyo) queda en el
  registro en su sitio; si lo es lo dice una sola pregunta, `isOffTurnAction` (el turno es de otro o
  el suyo aun no ha empezado, y vale en cualquier momento). Los controladores no traen acciones de
  otros equipos: lo que llega fuera de turno lo da quien crea la sesion
  (`SessionOptions.offTurnFeed`), que la sesion mira antes de cada paso. La repeticion es una sesion
  propia (`replaySession`): su controlador (uno para todos los equipos) y su `offTurnFeed` leen el
  registro con el mismo `LogCursor` (mirar no mueve; `advance`, `skipBoundariesDoneBy`, `seekTurnOf`
  y `takeOffTurn` si), asi lo de fuera de turno entra en su sitio y la repeticion sale igual; al
  acabarse el registro se para esperando, como la partida que se apunto. Si a quien se espera ya no
  juega (se ha rendido), la sesion deja de esperarle y pasa su turno.
- Lo que mira la pantalla no es de la sesion (ella solo lleva los turnos): son preguntas puras de
  `session/screen.ts` sobre la partida y sus controladores (`SeatedMatch`, que una `GameSession` ya
  es). Si es una persona lo dice `isPerson(session, team)` (`Controller.person`): la unica pregunta, que
  usan la vista, el autoguardado y quien mira. Que un paso empieza un turno lo dice
  `startsTurn(paso)`.
- El guardado automatico es al empezar el turno de una persona, si su modo guarda
  (`isAutosaveMoment(session, paso)`): con los viajes de ese turno ya dados, al cargar nada se repite ni se pierde.
- Si la partida sigue pero ya no juega ninguna persona (se han rendido o han caido, y quedan otros
  equipos), se acaba para esta pantalla: `screenEnd(session, viewer)` lo dice (un `PersonEnd`;
  `people`, `personStillPlays`, session/screen.ts) y la pantalla del final se lee desde quien mira
  (`screenEndFor`: `ScreenEnd.fallenBy` dice de quien fue la caida que lo decidio, asi «Te has
  rendido» solo lo lee quien se rindio). En 3D lo mira `MatchEnd.showIfOver` (`view3d/systems/hud/matchEnd.ts`), que
  borra el guardado; asi la partida por texto acaba igual (K4). Pendiente en 3D: el guardado
  automatico (`isAutosaveMoment`), el aviso de cada equipo que cae y salir mientras juegan los demas.

```mermaid
sequenceDiagram
  participant J as Jugador
  participant G as TurnControls (view3d)
  participant S as GameSession
  participant R as core/actions + rules
  participant V as systems/events + engine
  participant H as store → Preact
  J->>G: clic / tecla / arrastrar
  G->>S: act(viewer, { kind: 'move' | 'attack' | 'capture' | 'buy'... })
  S->>R: dispatch: estado cambiado + GameEvent[] (o el motivo del rechazo)
  G->>V: playEvents (animar), board.sync
  G->>H: refresh() → publishHud → ui.set
  J->>G: fin de turno (E)
  G->>S: finishInput(viewer)
  loop runUntilInput: session.step() hasta el turno de la persona
    S->>R: 'endTurn' (ordenes permanentes, capturas, fin de ronda), 'startTurn' y acciones de cada otro equipo
    G->>V: animar los sucesos del paso
  end
  G->>H: cartel «Dia N · Tu turno»

```

- Las acciones **cambian el estado y devuelven sucesos**; las animaciones solo cuentan lo que ya ha
  pasado. Por eso los turnos ajenos se pueden repetir (el registro de la sesion sobre una copia de
  la partida de antes, `replaySession`; en 3D aun no hay boton) y acelerar sin cambiar nada.
- El azar: los dados de los combates van en la partida (`GameState.dice`, `diceOf(s)`) y las
  decisiones llevan su propio `Rng` con semilla. La misma semilla da el mismo mapa y la misma partida
  IA contra IA (`tests/aiGolden.test.ts` y `npm run huella` lo vigilan); cargar una partida no cambia
  lo que saldra en sus combates: el resultado de un ataque ya esta fijado por la partida, y volver a
  cargar para atacar otra vez da el mismo.
- [CAMBIO] La semilla de las decisiones de la IA es de la partida (`GameState.decisionSeed`, se
  guarda con ella) y la de cada turno sale de ella, del dia y del equipo (`turnSeedOf`; quien decide, `decisionRngOf(vista)`): cargar y
  pasar turno da las mismas decisiones, y una partida por la red o una repeticion decide igual en
  cada maquina. Va aparte de los dados: lo que decide la IA no cambia lo que sale en los combates.
- **Nada de estado global de partida**: los ajustes van en `s.settings` (obligatorios; los de siempre,
  `content.defaultSettings`, estan congelados y cada partida lleva su copia, con los cambios de su modo,
  mision o laboratorio; que modulos de reglas lleva sale de ahi, sin guardar nada mas) y el tamaño
  del mapa sale de `s.map` (`mapGrid(s)`, `createLayer(s, fill)`, `isOnBoard(s, pos)` en `core/mapGrid.ts`).
  Asi dos partidas a la vez (la de la pantalla y la miniatura del menu, una prevision, un servidor) no se pisan.

## Red (`core/net`)

Una partida por la red, en el nucleo y sin red: el servidor (un Durable Object en Cloudflare
Workers, o un proceso de Node para alojarlo uno mismo) y la pantalla solo tienen que mover mensajes. **El recorrido entero** (que garantiza, el
glosario, el viaje de una jugada funcion a funcion, los mensajes, los estados de la sala y en que
orden leer los archivos) esta en [`docs/RED.md`](RED.md); aqui, las decisiones que no conviene
deshacer y el porque:

- **El servidor manda.** La partida de verdad vive en el servidor, en una `GameSession` como la de la
  pantalla: cada persona es un `remoteController` (la sesion espera sus acciones), cada equipo de la IA
  juega alli con `aiController` y los dados son los de la partida. Todo lo que manda un cliente pasa
  por `session.act` con las mismas comprobaciones que lo de cualquiera (`dispatch`: su turno, su
  unidad, su alcance): un cliente trucado no puede hacer nada que la partida no deje.
- **Lo que no se ve no ha llegado.** Un cliente solo recibe la vista de su equipo (`PlayerView`, con
  toda la niebla de `FOG`: `viewSnapshotOf`, en la forma de una partida guardada) y, de cada paso, los
  sucesos que su equipo ve (`eventsSeenBy`). Asi mirar a traves de la niebla no es posible ni leyendo
  la memoria del navegador ni escuchando la red. Lo que la sala le contesta tampoco cuenta nada: antes
  de mandar una accion a la partida, la sala se la pregunta a la partida tal como la sabe el equipo
  (`actionProblem` sobre su vista con niebla) y, si ahi no vale, contesta eso sin preguntar a la de
  verdad (que diria lo que el equipo no ve: 'notTarget' o 'notYours' de una unidad escondida, o
  'unreachable' de una casilla ocupada por alguien que no se ve; probando uids o casillas se contaria
  el ejercito escondido). Un edificio que cambia de dueño si se ve: los dueños son publicos, como en
  la pantalla compartida. El resultado de su propia accion lleva los sucesos tal como el los ve (un
  ataque aereo no nombra a quien no ve); y los pasos de los demas van juntos en un solo `events`
  (courier.ts), que no sale si no trae nada (ni sucesos ni cambio en su vista): asi no se cuenta
  cuantas cosas han hecho los enemigos donde no ve. Las semillas (dados, decisiones, la del mapa)
  tampoco salen del servidor.
- **Amigos por enlace.** Una sala (`Room`) da una ficha (`token`) por asiento de persona, que no se
  puede adivinar (192 bits de azar que pone el servidor: `RoomContext.newToken`; el nucleo no tira de
  ningun azar; comparar fichas en tiempo constante, `sameToken`, tambien lo da el servidor). Quien
  crea se queda con el primer asiento; los demas lo piden con el codigo o el enlace de la sala
  (`Room.claimSeat`: el primer asiento de persona libre, una vez cada uno y mientras se espera) y
  guardan su ficha; con ella se entra y se vuelve a entrar. El codigo y el enlace no llevan fichas.
  Una sala empieza cuando han entrado todos (`start: 'everyoneIn'`) o, la de una busqueda de rival,
  en cuanto cada asiento es de alguien (`'everyoneSeated'`): asi una partida por turnos empieza
  aunque quien la abrio no este, y se entera en «Mis partidas».
- **Orden y repeticiones.** Lo que tiene efecto (`act`, `endTurn`, `surrender`) lleva un numero de
  orden del cliente (`seq`, creciente por asiento; `welcome` dice el ultimo atendido, para seguir
  contando tras un corte): la sala contesta con el en `result` y no repite uno ya atendido
  (`'stale'`), asi un mensaje reenviado tras un corte no compra dos veces ni acaba el turno
  siguiente. Cada `view`, `events` y `turn` que se manda a un asiento lleva su `step` (creciente por
  asiento): si al cliente le falta uno, pide su vista (`resync`), que es el punto de partida nuevo.
- **La sala guardada** (`snapshot`, con su propia version `ROOM_SNAPSHOT_VERSION`) es la partida, sus
  asientos (con sus numeros de orden y de mensaje) y su estado; el registro de la sesion no hace
  falta: la partida decide igual al recuperarla (los dados y la semilla de las decisiones van en ella;
  `tests/room.test.ts` lo comprueba jugando la misma partida seguida y a trozos). Al recuperarla nadie
  esta dentro: cada cliente vuelve a saludar y recibe su vista entera.
- **Sin relojes ni azar en el nucleo.** Los tiempos (caducar, el turno, la espera a los que faltan)
  los lleva el servidor y le dice a la sala que hacer (`endTurnOf`, `replaceWithAi`, `abandon`). La
  partida avanza de `ADVANCE_STEP_BUDGET` pasos en pasos (`isMidway()`, `continueMatch()`): una
  llamada del servidor tiene su tiempo contado, y un turno largo de la IA se reparte en varias.

**La niebla de los sucesos.** La regla: un suceso se ve si el equipo conoce lo que nombra **antes o
despues del paso**. Hace falta el antes porque el paso puede dejar sin rastro a quien lo protagoniza
(la unidad que cae, la que se mete en la niebla, la que sube a un transporte) y el despues porque
puede dejar algo nuevo a la vista (la que sale de la niebla, la que se fabrica). Lo que un equipo sabe
de una unidad lo decide `FOG` (playerView.ts): eventFog no calcula la vision, pregunta a las dos
vistas (`Knowledge.state`, una `foggedCopy`). Lo que es de cada tipo de suceso es una entrada de
`EVENT_FOG`, una por tipo (el compilador la exige, tambien para los de los modulos; un suceso que no
esta en la tabla no sale):

| Se ve... | Sucesos |
|---|---|
| siempre (la partida lo anuncia a todos) | `turnStart`, `turnEnd`, `newDay`, `weather`, `surrender`, `teamDefeated` |
| si conoce a la unidad (antes o despues) | `capture`, `spawn`, `wait`, `remove`, `heal`, `captureDropped`; `supply` (sus reparaciones, solo las de unidades que conoce); `undoMove` (y ve adonde vuelve) |
| si conoce a las dos | `merge`, `load`, `unload` |
| si conoce a la unidad; del camino, solo las casillas que ve | `move` (y el corte, si ve donde esta lo que corto); una unidad que cruza la vision sin pararse en ella no esta en ninguna vista: no se cuenta |
| si ve donde cae el disparo | `attack`: entero si conoce a quien dispara; si no, sin su uid (`attacker: null`) ni si se le pudo contestar (`counterHit: null`, diria si estaba al alcance), pero con su tipo, su vida y su rango (lo que enseña el panel de combate, como en la pantalla de hoy) |
| si conocia el transporte | `cargoLost`, con solo los pasajeros que conocia (quien iba dentro de un transporte enemigo nunca se supo) |
| solo su alianza | `standingOrder`, `standingOrderDone`, `squad`, `income`, `upkeep`, `fundsCapped` |

Lo que hace la propia alianza se sabe entero (el camino de una unidad propia pasa por donde no ve).
Sin niebla todo lo del mapa pasa tal cual; lo privado de cada alianza, no. Y lo que la vista no
cuenta de los enemigos tampoco lo cuenta un cambio de la vista: de los demas equipos no se ve el
dinero (`FOG`, 'foreignBooks': dirian lo que compran donde
no se ve), un edificio sin captura a la vista va siempre sin el campo `capture` (si apareciera,
delataria la captura escondida) y la lista de movimientos que se pueden deshacer solo esta si hay
alguno propio. Lo prueba `tests/eventFog.test.ts` en partidas enteras de 2 a 4 equipos (con alianzas,
clima, emboscadas y bosques): cada uid y cada casilla que nombra un
suceso recortado se conocen antes o despues del paso (`tests/sim/eventReferences.ts` dice lo que
nombra cada tipo), y `tests/room.test.ts` prueba por mensajes que ningun cliente recibe una unidad
escondida y que, para cada tipo de accion, una unidad o escuadra escondida se rechaza igual que una
que no existe.

La vista de un cliente se lee con `loadView` (`readSaved` con origen 'view': las caidas son las
apuntadas, nunca se deducen de lo que se ve) y `cloneState`, `serialize` y la pantalla la tratan como
cualquier partida. Un `events` no trae la accion (el suceso de rendirse ya lo cuenta), trae un lote
(varios pasos y la vista del final: una unidad que se metio en la niebla por el camino se anima
contra la vista de antes, no contra la del final), el `attacker` de un ataque puede ser null (la
vista ya dibuja un combate sin atacante a la vista), y el dinero de los
demas equipos llega a 0.

ESLint pone la red encima de todo (`NO_NET`, eslint.config.js): ni la IA, ni las ordenes, ni la
sesion, ni las reglas, ni la vista la importan (una partida se juega igual con red que sin ella), y la
red no cambia la partida a mano (`APPLY_STEPS`) ni manda con `dispatch` (`NO_DIRECT_DISPATCH`): pasa
por la sesion. `tests/layers.test.ts` y `tests/lintImports.test.ts` lo comprueban.

### Servidor (`server/`)

Un adaptador fino sobre `Room` que se puede alojar en dos sitios: un Worker de Cloudflare con un
Durable Object por sala (la web publica) o un proceso de Node que cualquiera aloja en su casa o en un
servidor suyo (el como de los dos, `server/README.md`; el recorrido de cada mensaje y las rutas,
`docs/RED.md`). No sabe de la partida: solo mueve lo que la sala devuelve para cada asiento
(`Outgoing`), la guarda y lleva los relojes. Es un paquete aparte (`server/package.json`, workspace de npm) que importa el nucleo tal cual
(`@core/...` → `src/core`): el mismo codigo que la pantalla, sin compilar nada aparte; `npm run check`
de la raiz acaba con sus tipos y sus tests. Las decisiones:

- **Una sala, dos anfitriones.** Lo que hace una sala del servidor (entrar, cada mensaje, guardarla,
  recuperarla, sus relojes) esta una sola vez, en `HostedRoom` (`server/src/hostedRoom.ts`), y las
  rutas tambien (`routes.ts`, sobre `Request`/`Response`). Lo de cada sitio entra por interfaces
  pequeñas: `RoomHost` (`roomHost.ts`: guardar con la hora de su alarma, cargar, borrar, sus
  conexiones como `RoomSocket`, la hora) y `RoomDirectory` (las salas por su codigo). Cloudflare
  (`server/src/cloudflare/`) las da con el almacen, la alarma y los sockets del Durable Object;
  Node (`server/node/`), con un JSON por sala en disco, un `setTimeout` y `ws`. Un tercer sitio seria
  otro adaptador, sin tocar la sala. Las pruebas de integracion son las mismas para los dos
  (`server/test/shared/`). Node va aparte (`server/node/`, con su `tsconfig.json`) porque sus tipos
  (`@types/node`) y los de workerd chocan.
- **Node: todo en un proceso.** Las salas viven en memoria y se guardan tras cada mensaje (cada
  escritura entera o nada: un fichero aparte que se renombra; las de una sala, en fila). Al arrancar
  se cargan las guardadas y se ponen sus alarmas. Sirve tambien el juego compilado en la misma
  direccion: un navegador no deja que una pagina https (la web publica) hable con un servidor sin
  cifrar, que es lo normal en casa; asi el juego se compila con `VITE_SERVER_URL=/`
  (`npm run build:selfhost`, `.env.selfhost`) y, abierto por su IP, no hace falta configurar CORS ni
  certificado (con un nombre, ese nombre va en `ALLOWED_ORIGINS`: ver CORS, abajo). Como en Node los
  mensajes de una conexion se atienden a la vez (en Cloudflare, uno tras otro), lo que depende del
  orden se hace al llegar cada uno, antes de esperar a guardar (contar los rechazos), y una sala que
  caduca sale de memoria antes de borrarse. Tiene topes de salas y de conexiones (`ILOGIC_MAX_ROOMS`,
  `ILOGIC_MAX_CONNECTIONS`): en Cloudflare cada sala es un Durable Object y el disco no es de nadie;
  aqui son el disco y la memoria de quien lo aloja.
- **La ficha no viaja en la URL.** El saludo (`hello`) va como primer mensaje del WebSocket, asi la
  ficha no queda en registros de acceso ni en el historial. Lo que una conexion necesita saber
  (asiento, conexion, ficha) va pegado al socket (`Attachment`, WebSocket Hibernation API) y
  sobrevive a que el objeto duerma: al despertar, la sala recuperada no conoce a nadie y el objeto
  vuelve a meter a cada socket con su ficha (reciben su vista entera otra vez).
- **Todo guardado tras cada mensaje.** La sala entera (`snapshot`) y los relojes (`meta`) van al
  almacen del objeto despues de cada mensaje atendido; asi nada se pierde si el objeto muere.
- **Una alarma, varios relojes** (`timers.ts`, datos puros; el objeto pone la alarma del primero que
  vence, `nextAlarm`): caducar a los 30 dias sin actividad (se borra todo y se cierran las
  conexiones), el turno de quien se espera (`endTurnOf`; otro dia u otro asiento es otro reloj, y
  cada `turn` que sale lleva lo que le queda, `TurnTimeLeft`: lo pone el servidor, `withTurnClock`),
  la espera a los que no llegan (`replaceWithAi` a cada asiento vacio y la partida empieza) y seguir
  una partida a medias (`isMidway()` tras cada paso → alarma ya → `continueMatch()` desde ella: cada
  llamada tiene su tiempo de CPU, y un turno largo de la IA se reparte en varias).
- **Buscar rival: un emparejador para todo el servidor** (`matchmaker.ts`; en Cloudflare, un solo
  Durable Object, `MatchmakerObject`; en Node, uno en el proceso con su cola en
  `emparejador.json`). Una cola por ritmo (`PACE_RULES`, `core/net/search.ts`: por turnos, un dia
  por turno; en vivo, dos minutos) con las salas que esperan rival. Quien busca se queda el asiento
  libre de la primera que vale (la sala empieza: `'everyoneSeated'`); si no hay, se le abre una
  suya, que entra en la cola. En la busqueda no se eligen reglas (1 contra 1, las de siempre, mapa
  al azar): con poca gente, cada eleccion partiria la cola y nadie coincidiria. Las salas son las
  de siempre (`createRoomWithFreeCode`, como `POST /rooms`); el emparejador solo las apunta y les
  pide asiento, y lo que ya no vale (cerrada, empezada, caducada) sale de la cola al mirarla. Las
  busquedas van de una en una (un Durable Object atiende otra mientras espera a una sala: dos a la
  vez partirian de la misma cola). En vivo solo se empareja con quien esta en su sala; quien busca
  dice sus salas (`avoid`) para que no le toque la suya, y hay un tope de busquedas por direccion
  (`RequestLimit`; la direccion, `CF-Connecting-IP`, que en Node escribe el servidor con la del
  socket). Cancelar es cerrar la sala (`POST /rooms/:code/close`, solo su creador y mientras espera).
- **Topes antes de leer.** Los bytes de cada mensaje y del cuerpo de `POST /rooms` se acotan antes
  de leer el JSON (`MAX_MESSAGE_BYTES`; los topes de la forma los pone `isValidMessage`); a quien la
  sala le rechaza mas de `MAX_REJECTIONS_PER_WINDOW` mensajes en un minuto (`rateLimit.ts`) se le
  corta; lo que no entra se despide con un codigo de cierre propio (`CLOSE_CODES`).
- **CORS** (`cors.ts`): la web del juego y lo que diga `ALLOWED_ORIGINS` (wrangler.toml, o la
  variable de entorno en Node), mas `localhost`, `127.0.0.1`, la propia direccion del servidor si es
  una IP (el de Node sirve el juego; un nombre va en `ALLOWED_ORIGINS`, o cualquier dominio que apunte
  a esa IP pasaria por el mismo sitio: DNS rebinding) y `null` (el HTML abierto desde un fichero). Sin
  origen (otro servidor) pasa: no es un navegador.
- **Lo que hay que configurar en Cloudflare** (una vez, `server/README.md`): una cuenta de Cloudflare (vale el plan
  gratuito: las salas son Durable Objects con SQLite, `new_sqlite_classes`; los clasicos piden el de
  pago), los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en GitHub (con ellos,
  `.github/workflows/server.yml` publica con cada push a `main` que toque el servidor o el nucleo;
  sin ellos no hace nada) y la variable `VITE_SERVER_URL` con la URL del Worker (los workflows de
  la web y de las previews la pasan al `vite build`; en local, `.env` a partir de `.env.example`).
- **Tests**: `server/test/unit` (las piezas puras con la sala de verdad); `server/test/shared`, lo
  que tiene que hacer cualquier servidor (dos personas por WebSocket y la IA juegan varios dias con
  el cliente simulado de `tests/sim/netClient.ts`, que comprueba cada mensaje; volver a entrar, un
  `seq` repetido, buscar rival y cerrar una sala, el tope de bytes, los rechazos), que corren los dos: `server/test/workers`
  (`@cloudflare/vitest-plugin`: el Worker y el objeto de verdad dentro de workerd; ademas despertar el
  objeto, `evictDurableObject`, y las alarmas adelantando los relojes guardados y sonando con
  `runDurableObjectAlarm`) y `server/node/test` (el servidor de Node en un puerto; ademas sus alarmas
  con la hora adelantada a mano, arrancar otra vez con las salas en disco y servir el juego).

### Cliente (`src/net/`, el menu y la partida 3D)

La pantalla de una partida por la red. Lo de fuera del nucleo que habla con el servidor esta en
`src/net/` (sin navegador: se prueba con un socket falso, `tests/onlineClient.test.ts`); el menu y la
partida 3D solo lo enchufan: lo que la partida hace distinto por la red es un sistema,
`view3d/systems/net/onlinePlay.ts` (`OnlinePlay`, `tests/onlinePlay.test.ts`). Que hay en cada
archivo y por donde pasa cada cosa, en `docs/RED.md`. Las decisiones:

- **La partida de la pantalla es la vista del servidor**, en una sesion espejo (`mirrorSession`,
  `src/net/mirrorSession.ts`): la persona juega su equipo (`humanController`) y los demas son
  remotos (`remoteController`: la sesion los espera y no juega nada por ellos). Asi la pantalla
  pregunta a la partida lo mismo que en una de esta pantalla (a quien se espera, que se puede hacer).
- **El turno no sabe si es por la red**: `TurnControls` habla con quien lleva la partida por
  `MatchRunner` (`systems/turn/matchRunner.ts`: hacer una accion, acabar el turno, esperar a que
  vuelva a tocar enseñando lo de los demas). En una partida de esta pantalla es `localRunner` (la
  sesion, paso a paso); por la red, `OnlinePlay`. `app/match3d.ts` elige uno y lo da al turno, a la
  pausa y al final.
- **Toda accion propia la decide el servidor.** `OnlinePlay.act` la comprueba antes con lo que sabe
  el equipo (`actionProblem`, como la sala antes de preguntar a la partida de verdad: lo que no vale
  se contesta sin preguntar), la manda y espera su `result` y su eco (la vista al dia, que la sala
  manda siempre tras una accion que vale). La vista pasa a ser la partida y sus sucesos, tal como los
  ve el equipo, se animan como siempre. Nada se hace antes en la sesion espejo: asi un rechazo (algo
  escondido lo impedia) no deja nada que deshacer (aviso y `resync`), y la espera es una ida y vuelta.
- **La vista que llega se mete en la misma partida** (`fillWith`, `core/net/clientState.ts`): el
  tablero, el turno y la interfaz leen siempre `session.state`, y asi no hay que avisar a cada uno de
  que la partida es otra. La partida que se ve es una copia aparte de la del cliente (`cloneState`):
  la del cliente es el "antes" del siguiente lote. Como las unidades son objetos nuevos, el turno
  busca lo elegido por su uid (`TurnControls.onBoardNow`).
- **Lo que llega se atiende en orden, uno a uno** (`OnlinePlay.pump`, que espera a la accion en
  curso): mientras no es el turno propio, a la cola de quien mira (`untilInput`); en el turno propio,
  la vista al dia, salvo lo que lo acaba (un `turn` de otro equipo, o un lote que pasa de turno: se
  acabo el tiempo), que suelta lo elegido y se pone a animar a los demas (`TurnControls.othersGoOn`).
- **Los demas llegan por lotes** y cada lote se anima contra `animationView(antes, despues)`: la
  vista de despues mas las unidades que solo estan en la de antes (cayeron o se metieron en la niebla
  por el camino: sin ellas no habria pieza que animar). Al acabar el lote, la de despues es la
  partida. Un `ended` deja la ultima vista y el final lo decide la pantalla como siempre
  (`MatchEnd.showIfOver`).
- **Cada partida por la red es su carga de pagina, como todas**: el vestibulo cierra su conexion y
  apunta el arranque 'online' (codigo y ficha); la partida vuelve a entrar al cargar (`joinMatch`,
  `app/gameStart.ts`: `OnlineMatch.inPlay`). Ese arranque no se borra al cargar, asi que recargar
  vuelve a la sala; salir al menu lo quita.
- **El enlace aguanta los cortes solo** (`ServerLink`): vuelve con esperas crecientes, saluda otra
  vez y reenvia lo que mando sin contestar; el `seq` se guarda en localStorage por sala y asiento,
  asi otra pestaña o una recarga siguen contando. Lo atendido cuya respuesta se perdio se da por
  bueno (`RoomClient.answerLost`). Un cierre sin arreglo (ficha mala, otra version, otra pestaña con
  la misma ficha, la sala ya no existe) no se reintenta: se avisa y se sale al menu.
- **Buscar rival es entrar en una sala** (`OnlineScreen.searchRival`): el servidor contesta con un
  asiento, como al crear o al pedir uno con el codigo, y la pantalla entra en esa sala. Con rival
  (`matched`) la partida ya ha empezado y pasa a la escena; si no, la sala propia se apunta en «Mis
  partidas» con su ritmo (`OnlineRoomEntry.search`) y su vestibulo dice que se busca (en vez de
  invitar), con «Jugar contra la IA» (dar el asiento del rival a la IA) y «Cancelar búsqueda» (cerrar
  la sala). Al buscar se mandan las salas propias que esperan, para no caer en una.
- **Lo que dice el servidor de tus salas es uno para todo el menu** (`RoomWatch`,
  `src/menu/online/roomWatch.ts`): la tarjeta «En línea» de Inicio (si te toca en alguna) y «Mis
  partidas» miran lo mismo. Pregunta solo mientras se ve una de las dos: Inicio empieza a mirar al
  abrirse si hay partidas apuntadas y lo deja al salir (`HomeScreen.open`/`close`, desde `MenuFlow`),
  y «Jugar en línea» igual con su menu. Con lo que contesta sabe tambien si el servidor responde (la
  pastilla «Conectado»); sin salas apuntadas, se lo pregunta a `GET /health` (`serverHealth`).
- **Donde esta el servidor** (`serverUrl.ts`): `VITE_SERVER_URL` al compilar o, por encima,
  `ilogic.server` en localStorage (el propio servidor de quien juega, o uno local en los tests); sin
  ninguna, el juego no ofrece «Jugar en línea».
- **Lo que no vale por la red**: guardar no esta en el menu de pausa (`PauseHost.savesHere`; la
  partida sigue desde el servidor: «Mis partidas en línea», el enlace o recargar), rendirse lo decide
  la sala, el final solo ofrece volver al menu (la revancha seria otra sala) y no hay autoguardado.
- **El reloj del turno**: con `turnSeconds`, la pastilla bajo el dia cuenta lo que le queda al
  turno que se ve (`TurnClock`, `src/view3d/systems/net/turnClock.ts`; lo que pinta, `turnClockVM`):
  azul, rojo con un tic por segundo los ultimos 15 s («Fin del turno» parpadea) y oscuro en el de otro.
- **Lo que suena**: en el vestibulo, que entra alguien mas (`player_joined`, comparando cada respuesta
  de `GET /rooms/:code` con la anterior). Que la partida empieza (`match_begins`) suena en la carga de
  la pagina de la partida, no en el vestibulo, que la recarga lo cortaria: el vestibulo lo apunta
  (`noteMatchBegun`, `src/net/matchIntro.ts`) si vio la sala esperando o llego buscando rival, y
  volver a una partida que ya iba no lo apunta. La conexion (`LinkSounds`, `src/net/linkSounds.ts`,
  en el vestibulo y en `OnlinePlay`): un corte suena solo si dura 4 s (`net_reconnecting`), su vuelta
  solo si sono el corte (`net_connected`) y el cierre sin arreglo en el acto (`net_lost`). Conectar
  la primera vez no suena: mientras todo va bien, silencio.
- **Limites de hoy**: lo que hacen los demas durante el turno propio (rendirse) no se anima, solo se
  ve; el final no sabe las cuentas de los demas (no estan en la vista: `docs/IDEAS.md`).

`tests/visual/online.mjs` (`npm run online`) lo prueba de punta a punta: arranca el servidor de Node
(salas en una carpeta temporal) y vite en puertos libres, y dos navegadores con el servidor en
`ilogic.server`: A crea la sala, B entra por el enlace, juegan dos rondas (los dos ven lo mismo), B
recarga y vuelve a la partida, y A se rinde (los dos ven el final). Deja capturas en
`tests/visual/out/online-*.png`.

## Graficos

Dos clases de graficos:

- **Imagenes de la interfaz** (iconos, retratos, terreno de las miniaturas): `tools/art/` (dibujos
  guardados de Retro Diffusion) → `npm run assets` → `public/assets/img/` (cada imagen) →
  `public/assets/atlas/` (2 paginas). Las carga `src/atlas.ts` (`loadGameImages`, `GameImages`: `url`
  para un `<img>`, `draw` en un lienzo), sin motor de juego. Ver README, "Graficos".
- **Modelos 3D** (unidades, edificios, casillas y decorado): fuentes en `tools/art/ashfox/` → `.glb`
  en `public/assets/models/` (skill `ashfox`). Los carga `view3d/engine/pieces/glbModels.ts` (`GlbLibrary`); un
  tipo sin GLB se ve con su modelo de bloques (`engine/pieces/models/`, `blocks.ts`).

## Vista 3D

`index.html` arranca `src/view3d/app/main.ts`: carga la interfaz HTML, el atlas y los GLB y abre el
menu (`app/menuFlow.ts`, con las pantallas de `src/menu/`) o la partida pendiente (`app/gameStart.ts`).
Cada partida va en su propia carga de pagina: el menu apunta lo elegido y recarga, y salir al menu
recarga sin nada (asi no hay que deshacer a mano la escena 3D). `?seed=N` empieza una escaramuza
directa y `?elevation=0` quita lo que hace la altura en el juego (el relieve se ve igual).

La vista esta en cuatro carpetas, y cada cosa tiene su sitio:

```
src/view3d/
  app/        raiz de composicion: arranque, menu y la partida (match3d.ts junta cada sistema con el motor)
  ports/      lo que los sistemas piden al motor (interfaces pequeñas; las implementa el motor)
  systems/    deciden, sin three.js; se prueban sin navegador
  engine/     dibuja con three.js; no decide nada
  playground/ la herramienta de modelos (units3d.html; usa el motor directamente)
```

| Carpeta | Que hace |
|---|---|
| `app/main.ts`, `menuFlow.ts`, `gameStart.ts` | arranque, menu principal y empezar o cargar una partida (o volver a entrar en una sala: `joinMatch`) |
| `app/menuBackdrop.ts` | el tablero 3D detras del menu: una partida de muestra de la IA contra la IA (`menu/menuBoard.ts`) que la camara rodea de cerca, una vuelta tras otra (`OrbitCamera`); lo empieza `main.ts` cuando estan los modelos |
| `app/match3d.ts` | la partida: crea el motor (`MatchScene`) y los sistemas y los conecta (por la red, con `OnlinePlay` como quien lleva la partida); no dibuja ni decide |
| `ports/threat.ts` | para la amenaza: `ThreatMarks` (`showThreat`, las casillas; `showThreatLines`, una linea por cada enemigo que podria atacar a la unidad que se mira) |
| `ports/turn.ts` | para el turno: `TileMarks` (alcance, hasta donde ataca con `showAttackReach`, objetivos, lo elegido y los aros de un grupo), `MovePreview` (flecha y fantasma; `aim`, el visor de un disparo en arco), `EventPlayer` (enseñar sucesos) y `ScreenView` (si una casilla se ve) |
| `ports/orders.ts`, `ports/pointer.ts` | `IntentMarks` (lo que haran las ordenes); `SelectionBoxView` (el recuadro de seleccion) |
| `ports/stage.ts` | `PieceStage`, `EffectStage`, `PieceLookup` y los sitios (`Spot`), para los sucesos animados |
| `ports/camera.ts`, `ports/frame.ts` | `CameraView` (situar la camara), `CameraPose`, `Point3`; el reloj (`FrameListener`) |
| `systems/turn/` | el turno de la persona y los de los demas paso a paso (`turnControls.ts`), con quien lleva la partida por `MatchRunner` (`matchRunner.ts`: `localRunner` en una partida de esta pantalla); quien mira y el cambio de jugador con varias personas en la misma pantalla (`hotSeat.ts`, que tapa la partida hasta que la siguiente esta lista); guardarla a mano y sola, al salir de la pagina y con el autoguardado al empezar cada turno de una persona (`saving.ts`: `saveGame`, `keepSaved`); «Fin del turno» con unidades sin mover, que las hace saltar y pide otra pulsacion (`endTurnGuard.ts`); que hace un clic con una unidad elegida (`clickIntent.ts`: ir, atacar, capturar al llegar, subir, unirse); que sale junto a lo elegido (`unitOptions.ts`: las fichas, solo lo que no es tocar el tablero; la rueda del clic derecho, lo poco frecuente; la orden que tiene sentido en una casilla, `orderForTile`); el camino trazado, el fantasma y si el disparo va en arco (`movePreview.ts`: `arcShotOf`); hasta donde ataca, el borde rojo (`attackReach.ts`, con `attackZone` del nucleo); que se puede elegir (`selection.ts`); desde donde atacaria (`attackPlan.ts`); textos e iconos de las fichas, la rueda y la compra (`menuItems.ts`; los pinta el HUD: `ActionChips.tsx`, `RadialMenu.tsx` y `BuyFan.tsx`, el abanico de la compra; donde va cada ficha, `fanAround` en `hud/common/placement.ts`). Esperar es implicito: la que se mueve y ya no puede hacer nada espera sola, y dejar una que se movio tambien (`leavingMovedUnit`). `MenuView.kind`: `chips`, `radial`, `prompt` (elegir casilla), `buy` o `game` (pausa) |
| `systems/orders/` | lo que haran las ordenes al terminar el turno: cuales enseñar (`orderIntents.ts`, con `previewStandingOrders` del nucleo) |
| `systems/threat/` | «Ver amenaza» (T o el menú de la partida): las casillas a las que puede disparar algun enemigo que se ve (`threatZone.ts`, con `threatMap` del nucleo, que no delata a los de la niebla; se ven con un velo y un borde rojos); y al señalar o elegir una unidad propia, quien podria atacarla en su turno (`threatLinesTo`: enemigos que se ven, que llegan y que le hacen daño; lo que podria pasar, no lo que hara la IA). Lo pinta el motor por `ThreatMarks` (`ports/threat.ts`: las casillas en `engine/fx/highlights.ts`, las lineas en arco en `engine/fx/threatLines.ts`) |
| `systems/events/` | que pasos lleva cada suceso (`EVENT_STEPS`, `eventSteps.ts`; los del dia, como lo que cobra cada edificio propio, con `DayLookup` e `incomeSpotsOf`, una entrada por fuente de ingresos), los pasos como datos (`steps.ts`) y la linea de tiempo que los cumple sobre los puertos (`timeline.ts`: `STEP_RUNNERS`, `playEvents`) |
| `systems/board/` | el tablero tal como lo ve quien mira (`boardScene`): lado, niebla, vida, quien ya jugo, capturas; el humo de las heridas; lo que perderia el enemigo al que se apunta (`hitLookOf`) |
| `systems/camera/` | la camara de estrategia como logica (`StrategyCamera`): desplazar, acercar, girar, limites y suavizado; da su pose como datos. Y la del fondo del menu (`OrbitCamera`): da vueltas a un punto, siempre igual, y lo deja donde no lo tapa el menu; mueve su pose en el sitio, sin crear nada por fotograma |
| `systems/input/` | teclado (tablas de `src/controls/`, `KEY_ACTIONS`: grupos con numero, ordenes, «Ver órdenes») y raton o dedo sobre el mundo (`pointerInput.ts`: tocar, recuadro, doble clic, borde), a ordenes de la camara y del turno |
| `systems/hud/` | publicar la interfaz (`publishHud`, `installHudActions`: tambien el numero de «Fin del turno» y el panel de lo elegido), la pausa con «Cómo va» (`matchMenus.ts`), la pantalla final (`matchEnd.ts`: es un `KeyPanel`, con su teclado y «Mirar el tablero», mientras la partida no publica nada mas), el minimapa (`minimapBridge.ts`: lo publica solo si cambia algo que se ve en el, y el recuadro de lo que esta en pantalla, que da `MatchScene.viewedArea`) |
| `systems/net/` | la partida por la red (`onlinePlay.ts`: `OnlinePlay`, el `MatchRunner` de una sala; las acciones las decide el servidor y lo que llega se atiende en orden) y el aviso de «Tu turno» con la pestaña escondida (`turnNotice.ts`) |
| `systems/sound/`, `systems/weather/` | que suena con cada cosa (`soundCues.ts`); como se ve cada clima (datos: `weatherStyles.ts`) |
| `engine/matchScene.ts` | todo lo que se dibuja de una partida: lo crea, lo mueve en cada fotograma (`render`), la casilla bajo un punto (`tileAt`) y el recuadro de una casilla en pantalla (`anchorOf`) |
| `engine/core/` | lienzo, escena, luz cartoon (y por clima), cielo de bandas con nubes de bloques y niebla del horizonte (`sky.ts`) y bucle (`world.ts`: `onFrame`, `animate`); materiales de dos tonos (`toon.ts`); casilla ↔ mundo (`space.ts`); el recuadro de seleccion (`screenBox.ts`); texto en lienzos para texturas (`canvasText.ts`: `whenFontLoads` vuelve a pintar lo pintado antes de que cargue la letra pixelada) |
| `engine/terrain/` | que lleva cada terreno y cada tema (`pieces.ts`: casilla, decorado, relieve y lo que vive en ella), sus copias instanciadas con la niebla (`placed.ts`), relieve de montañas y dunas (`relief.ts`; los macizos, `massif.ts`; sus colores, `reliefColors.ts`), agua, lo que rodea el mapa según el tema (`surroundings.ts`: el suelo hasta el horizonte, `surface.ts`, que es el mar con sus bajíos, `sea.ts`, el mar de dunas, `duneSea.ts`, o el mar helado, `iceSea.ts`, y los islotes, mesetas o icebergs de bloques, `islets.ts`) |
| `engine/life/` | lo que vive en el tablero sin ser de la partida, como datos (`kinds.ts`: el polvo y los remolinos de la arena, la lagartija, las bolas rodadoras y los buitres del desierto, las luciernagas y la rana del pantano, las hojas, la ardilla, el ciervo y los pajaros del bosque, los copos, el pingüino y la foca de la nieve, las mariposas, el conejo, los peces y los gansos de la llanura): las motas que vuelan cerca de la camara (`motes.ts`, una bandada por clase: `MoteKind` dice cuantas, sus capas de puntos con sus colores, como vuelan, como brillan y si giran), los animalitos sentados en el decorado o en el suelo de la casilla (`critters.ts`: `CritterKind`, su modelo de Ashfox y como se mueve en su sitio, como posturas a lo largo del movimiento: `CritterMove.pose`, con `hopping` y `peeking` para lo comun; y otro movimiento que hace alguna vez, `sometimes`, como la zambullida del pingüino) y los que nacen en una casilla y se van (`travellers.ts`: `TravellerKind`, su modelo, como va, si bate las alas, si rueda, si se inclina al subir y bajar (`pitches`, el pez), si sale creciendo (`grows`) y si va por el suelo, subiendo y bajando con el relieve: `heightAt` del terreno, con `surfaceAt` del relieve). Motas y viajeros nacen igual, en las casillas de su clase cerca de lo que se mira (`births.ts`: cuantos, juntos o de uno en uno, cada uno con su puesto en la tanda, `rank`, como los gansos en V, y si van a otra de sus casillas, a que distancia, hacia donde y por donde, con `Landing`). Lo junta `biomeLife.ts` y lo crea el terreno (los animales se oscurecen con la niebla). Algo nuevo para un bioma: su entrada en `kinds.ts` y su sitio en la pieza (`motes`, `critters` con su `CritterSeat`, que puede ir en el suelo, `onTheGround`, y pedir el borde con otro terreno o con agua, `edge`, o `travellers`) |
| `engine/pieces/` | las piezas como dice `systems/board` (`boardView.ts`: `sync`, y `previewHit` para la barra a rayas de lo que perderia; `overheadOf`, encima de la barra, para las chapas), sus modelos (`unitPiece.ts`, `buildingPiece.ts`; GLB de Ashfox en `glbModels.ts`, de bloques en `models/` y `blocks.ts`), colores de cada lado, chapas y barras (`badges.ts`: la vida y la captura en numero), restos y rodadas |
| `engine/fx/` | los puertos de los sucesos (`pieceStage.ts`, `effectStage.ts`, `spots.ts`), efectos de un momento (`fx.ts`), humo y polvo (`particles.ts`), marcas del tablero (`highlights.ts`: losas azules con su contorno, `tileOutline.ts`; marco rojo, diana y cursor de esquinas, piezas en `markParts.ts`; sobre el relieve, apoyadas en lo mas alto de su suelo, enteras en las dunas y en trozos en las laderas: `groundFit.ts`, con `surfaceAt` del terreno), las flechas rojas de quien podria atacar (`threatLines.ts`), la flecha de bloques y el fantasma al mover (`movePreview.ts`), el visor de puntitos de la artilleria (`aimArc.ts`) y las flechas de las ordenes (`intentArrows.ts`; piezas comunes en `arrowParts.ts`), lluvia y nieve (`weather3d.ts`), el contorno de la unidad elegida y la señalada (`unitOutline.ts`: una pasada encima de la escena, `World.addOverlay`, con el stencil) |
| `engine/camera/` | situa la camara de three.js en la pose que da `systems/camera` |

- **La partida cambia con acciones**: `TurnControls` manda por la sesion (`session.act`) y enseña los
  sucesos que devuelve (`EventPlayer`) con las piezas como estaban, asi sigue la de lo que cae (su
  disparo y su caida); despues `sync` deja cada pieza donde dice la partida. Por la red, la vista que
  trae la respuesta tampoco se pinta hasta entonces (`viewReplaced`), y los lotes de los demas se
  animan sobre `animationView` (la vista de despues con lo que cayo). Lo que
  se ofrece lo dice siempre el nucleo (`availableActions`, `reachableTiles`, `attackTargets`,
  `buyOptions`...). La vista no juega a los demas equipos: pide pasos a la sesion (`step`).
- **La animacion de un `GameEvent`**: su entrada en `EVENT_STEPS` (`systems/events/eventSteps.ts`),
  que da sus pasos como datos (`[{ kind: 'aim', ... }, { kind: 'sound', ... }, { kind: 'together',
  steps: [...] }]`). Un suceso sin entrada no se anima (la pieza salta con el siguiente `sync`); lo que
  la niebla tapa no se anima. Un paso nuevo: su forma en `steps.ts` y su entrada en `STEP_RUNNERS`
  (`timeline.ts`), y lo que pide al motor, en su puerto (`ports/stage.ts`) y en `engine/fx/`.
- **Un efecto** o una particula nueva: una funcion en `engine/fx/fx.ts` que recibe un `FxHost` y
  puntos del mundo, o una entrada en `PUFFS` (`engine/fx/particles.ts`; su nombre, en `PuffKind` de
  `ports/stage.ts`).
- **Como se ve una pieza** para quien mira (un estado nuevo: tintada, con un icono...): un campo en
  `UnitLook` o `BuildingLook` (`systems/board/boardScene.ts`, con su test) y su dibujo en
  `engine/pieces/boardView.ts`.
- **Depuracion**: en la consola, `window.ilogic3d` (`session`, `board`, `controls`, `camera`, `world`,
  `weather`, `stages`, `wrecks`...). Playground de modelos y animaciones: `units3d.html`
  (`src/view3d/playground/`, `window.ilogicPlayground`).
- **Aun no en 3D** (estaban en el 2D): repetir el turno enemigo, tutorial, laboratorio de animaciones
  y campaña online. Cada uno entra con esta forma: su sistema en `systems/`, su dibujo en `engine/` y su puerto en `ports/`.
- Colores de los lienzos de la interfaz: `PAL_CSS` en `ui/palette.ts` (los mismos que `hud.css`).

### La regla: sistemas agnosticos, solo el motor dibuja

La vista se divide en dos clases de piezas, y la frontera es una regla, no una costumbre:

- **El motor** (`engine/`, three.js) es lo unico que representa: crea y mueve mallas, materiales,
  luz, camara, particulas, el bucle de dibujo. No decide nada de la partida.
- **Los sistemas** (`systems/`) deciden: el turno (que se puede tocar, que pasa al tocarlo), la
  entrada (de teclas y punteros a ordenes), que se anima con cada suceso y en que orden, que se ve en
  el tablero, la logica de la camara (a donde mirar, limites), lo que enseña la interfaz y los menus.
  **No importan three.js ni el motor**: le piden lo que necesitan por **interfaces pequeñas (puertos,
  `ports/`)** —«enseña estas casillas», «mueve esta pieza por este camino», «lanza este efecto
  aqui»— que el motor implementa. Asi un sistema se prueba sin navegador ni WebGL, y el motor se
  podria cambiar sin tocar ningun sistema.
- **La raiz de composicion** (`app/`) es el unico sitio que junta un sistema con su motor.

Como se hablan: lo que decide un sistema sale como **datos** siempre que se puede (los pasos de un
suceso, la pose de la camara, el tablero visto por quien mira) y el motor solo los cumple; los
puertos quedan para lo que el motor hace por dentro (mover una pieza, poner un efecto). Lo que va en
orden y espera es una **linea de tiempo** de pasos (`systems/events/`), con el sonido como un paso
mas. Descartado: ECS, un almacen global para la vista y jerarquias de clases (el porque, en
`docs/PLAN-VISTA3D.md`).

SOLID en la practica: una responsabilidad por modulo (un sistema no dibuja; el motor no decide),
abierto a ampliar con datos (un suceso nuevo, una entrada en una tabla; un efecto nuevo, una entrada
en `PUFFS`), interfaces pequeñas por quien las usa (`...Host`, `...Port`, `ports/`) y depender de
ellas, no de las clases concretas. Cada sistema, en su subcarpeta.

**Sonido 3D.** Cada efecto del tablero sale de su sitio: el paso `sound` lleva un `Spot` (los pies o
la boca de una pieza, una casilla), el puerto `SoundStage` (`ports/stage.ts`) lo pide y el motor
(`engine/fx/soundStage.ts`) lo pasa a un punto del mundo con `worldOf`, que da a un anfitrion; `app/`
lo junta con `src/audio` (`gameAudio.ts`). El audio no es three.js y el motor no lo importa:
`src/audio/spatial.ts` pone el efecto a un lado y mas flojo lejos (`PannerNode`, sin HRTF), y el oyente
lo calcula un sistema puro con la pose de la camara (`systems/sound/listener.ts`) y solo se toca cuando
ella se mueve (sin crear nada por fotograma). Lo
de la interfaz suena sin sitio (`SoundPort`). El ambiente tambien decide puro: que suena en cada sitio
del mapa (`systems/sound/ambience.ts`: costa, bosque, cumbres, cienaga, fabricas...) y cuales quedan
cerca del oyente; `ambiencePlayer.ts` los enciende y apaga con un `LoopPort` (`src/audio/loops.ts`) y
les baja el volumen al alejar la camara (`ambienceZoomLevel`, `listener.ts`). A los de animales (pajaros,
grillos, ranas: `isAnimalAmbient`), ademas, con mal tiempo (`weatherLevelOf`), y de lejos los calla: solo
se oyen al acercar la camara (`animalZoomLevel`), como lo que dicen los animalitos. Los animalitos del tablero cuentan lo que hacen
(`BiomeLife.onAnimal`, un `AnimalMoment` de `ports/life.ts`: la rana que salta, el pajaro que sale de una
copa) y un sistema decide si dicen algo y que (`systems/sound/animalCalls.ts`: cerca del oyente, que el
motor no filtra; uno cada poco, con buen tiempo y solo al acercar la camara: desde la vista de empezar,
ninguno, `animalZoomLevel`, `listener.ts`) y como: flojos, y mas cuanto mas cerca
(`callVolumeOf`: casi nada en el borde de lo que se oye), y cada vez con un tono algo distinto (un
`SoundTone`, `src/audio/sounds.ts`). Suenan por el canal del ambiente (los efectos `animal_*`, `sfx.ts`),
con un panner que solo los pone a su lado (`PAN_ONLY`, `spatial.ts`): lo flojo por la distancia ya viene
en su tono. Ningun efecto repite la variante de la vez anterior (`variants.ts`).
Los efectos se piden por nombre aunque aun no haya WAV (`src/audio/soundNames.ts`): mientras, suena
su sustituto.

**Volumenes.** El jugador elige en Opciones un volumen general y uno por canal (musica, efectos del
tablero, ambiente, voces, interfaz), cada uno de 0 a 100 y con su silencio aparte: `settings.volumes`,
con sus tipos y su lectura en `src/audio/volumes.ts` (puro, con test; va al cuadrado para que la mitad
del deslizador suene a la mitad). El mezclador (`audioContext.ts`) tiene un nodo general y uno por
canal, que suena a su volumen de serie (`CHANNEL_VOLUMES`, el de antes de haber volumenes) por el de
Opciones y por lo que pida la vista (`setChannelLevel`: el tablero baja al alejar la camara). La musica
va con `<audio>` aparte y sigue los mismos numeros (`music.ts`); `volumeControl.ts` aplica los dos
(`applyVolumes`) al cambiar Opciones y al esconder la pestaña (`muteInBackground`). Un canal callado no
pide sus efectos ni baja la musica; los bucles de ambiente siguen corriendo para oirse en cuanto se sube.
Un canal nuevo: su nombre en `MIXER_CHANNELS`, su volumen de serie, su texto y su muestra (`PREVIEW_SOUNDS`, `sfx.ts`).

**Lo vigila ESLint**: solo `ENGINE_FILES` (`src/view3d/engine/**` y el playground) importa `three`, y
`systems/` y `ports/` no importan `engine/` (`SYSTEMS_ASK_BY_PORTS`). Un fichero nuevo que dibuje va
al motor; uno que decida, a su sistema; lo que se piden, a un puerto.

**Probar un sistema sin navegador**: se le da la partida (`blankState`, `newUnit` de los tests) y
puertos falsos que apuntan lo que se les pide, o se comparan los datos que devuelve. Ejemplos:
`tests/turnControls.test.ts` (el turno con marcas y sucesos falsos), `tests/eventSteps.test.ts` (los
pasos de cada suceso y la linea de tiempo), `tests/boardScene.test.ts` (niebla, lados, vida, capturas)
y `tests/strategyCamera.test.ts` (la camara).

## Decisiones (y por que)

| Decision | Por que | Que romperia deshacerla |
|---|---|---|
| Logica en `src/core` sin three.js ni DOM | Probar reglas e IA sin navegador; equilibrio con miles de partidas | Tests, `npm run balance`, `npm run play` |
| Interfaz en HTML (Preact) sobre el lienzo | Texto nitido en cualquier escala, accesible, facil de maquetar | Todo el HUD y los menus |
| Eventos en vez de animar dentro de las reglas | Repetir y acelerar turnos; la IA y el jugador comparten codigo | Repeticion del turno enemigo |
| Toda accion es un dato y pasa por `dispatch` | Una sola regla de lo que vale (menu, IA, partida por texto); acciones que se pueden guardar, repetir o mandar por la red | Validacion, sucesos completos, INVARIANTS |
| Dados en la partida, aparte de las decisiones | Cargar no cambia la suerte; la IA decide con su azar sin mover los dados | Formato 4, huella, partidas de referencia |
| Semillas para mapas y para la IA | Mapas compartibles por codigo; partidas reproducibles | Codigo de mapa, tests de referencia |
| Imagenes compiladas antes (`npm run assets`) en un atlas; modelos 3D ya exportados a GLB | Carga rapida, nada se dibuja ni se genera al jugar | Rendimiento, HTML de un fichero |
| Color de bando por giro de tono desde un dibujo magenta | Una generacion por unidad (coste en RD) y bandos identicos | Arte y presupuesto de RD |
| Sistemas de la vista sin three.js; solo el motor dibuja, por interfaces (puertos) | Probar la logica de la vista sin navegador; cambiar o mejorar el motor sin tocar el juego; modulos con una sola responsabilidad que escalan | Tests de la vista sin navegador, `ENGINE_FILES` y `SYSTEMS_ASK_BY_PORTS` |
| Cada partida en su propia carga de pagina (`view3d/app/gameStart.ts`) | No hay que deshacer a mano la escena 3D ni sus escuchas | Fallos al volver a jugar |
| Version en un solo fichero HTML | Jugar sin servidor (file://), compartir por correo | Releases, pruebas por file:// |
| Releases y web por GitHub Actions | La sesion de Claude no puede crear Releases; asi no hace falta | Novedades y aviso de version |
| Contenido resuelto al cargar en tipos con nombre, y guardado por id | `unitType.cost` se lee y se comprueba; añadir o reordenar una unidad no rompe partidas ni reglas | Formato 3 de las partidas, CONTENIDO.md |
| El turno es de la partida; cada equipo, un controlador | Todos juegan igual (K4); persona, IA o red son controladores | Formato 6 |
| Equipos con alianza y controlador; ningun numero especial | Partidas de 3 o 4 equipos, con aliados, o IA contra IA, sin tocar las reglas | `isHostile`, la vision compartida, la interfaz por lado |
| Por la red manda el servidor y cada cliente solo recibe su vista y los sucesos que ve; lo que la sala contesta tampoco cuenta nada | Sin trampas: ni acciones que la partida no deje, ni mirar a traves de la niebla, ni contar lo que pasa donde no se ve | `Room`, `Courier`, `eventsSeenBy`, `actionProblem` sobre la vista, la IA en el servidor |

## Mandos

La vista no decide que tecla es que: un **adaptador** de `src/controls/` (funciones puras, con tests)
traduce lo que pulsa el jugador a **ordenes**, y la vista las cumple.

| Orden | Donde vale | Quien la cumple |
|---|---|---|
| `InputCommand` (`inputCommands.ts`): cursor, aceptar, atras, fin de turno, siguiente unidad, zoom... | la partida | `KEY_ACTIONS` de `view3d/systems/input/keyInput.ts` (cursor = desplazar la camara mientras se mantiene) |
| `MenuCommand` (`menu.ts`): mover, aceptar, atras y atajos (opciones, notas, otro mapa) | menus de pantalla: inicio, partida nueva, campaña, opciones, notas, ayuda; en la partida, la pausa, las opciones y la ayuda abiertas encima del mapa | `MenuFlow` (`view3d/app/menuFlow.ts`, que pasa a `OptionsPanel.command`...); en la partida, `KeyRouter` (`keyInput.ts`) al primer `KeyPanel` abierto (`MatchEnd`, `OptionsPanel`, `helpPanel`, `PauseMenu`), y el mapa no recibe ninguna. Un panel puede hacer suyas algunas ordenes del mapa (`KeyPanel.shortcut`: la pausa, las de sus opciones, con la tecla que tenga el jugador) |

- **Teclado**: `keyCommand(key, settings.keys)` en la partida, con las tablas `FIXED_KEYS` y
  `REBINDABLE_KEYS` (una entrada por `KeyBindingId` con su tecla de serie; el jugador la cambia en
  Opciones → Controles y `Settings.keys` guarda solo los cambios, que `keyBindings` pone encima);
  `menuKeyCommand(key, context)` (tabla `MENU_BINDINGS`, una por menu) en los menus; el contexto
  `keyCapture` (Opciones esperando una tecla) da cualquier tecla como orden `key`. Son las unicas
  tablas de teclas: la ayuda, los botones y la linea de abajo enseñan la tecla de cada orden con
  `hud/keyLabels.ts` (`keyLabelOf`, `currentKeyLabels`; nombres por idioma en `i18n/<idioma>/keyNames.ts`),
  nunca una letra escrita a mano. Una orden nueva en la partida es una entrada en `KEY_ACTIONS`.
- **Raton y dedos**: `view3d/systems/input/pointerInput.ts` (izquierdo: tocar la casilla o arrastrar para
  desplazar; central: desplazar; derecho: girar; rueda: acercar); la casilla tocada la decide un
  rayo sobre el tablero (`MatchScene.tileAt`, `engine/matchScene.ts`) y la cumple `TurnControls.tap`. Los gestos puros de
  `controls/pointer.ts` (`PointerGestures`, `gestures/`) y la seleccion de `controls/selection.ts`
  (`clickSelect`, `boxSelect`) son del 2D y el 3D aun no los usa.
- **Se queda fuera a proposito**: `installTabGuard` (`browserKeys.ts`, desde `view3d/app/main.ts`: Tab no
  mueve el foco del navegador, es «siguiente unidad») y el cuadro de texto del nombre de escuadra
  (`hud/overlays/RenameSquad.tsx`).

### Añadir un mando (gamepad)

Un fichero nuevo, `src/controls/gamepad.ts`, con la misma forma que el teclado:

1. Tablas puras de botones → ordenes, p. ej. `padCommand(button): InputCommand | null` (A = aceptar,
   B = cancelar, cruceta = cursor, Start = opciones, LB/RB = zoom...) y
   `padMenuCommand(button, context): MenuCommand | null` (cruceta = mover, A = `ok`, B = `back`). La
   repeticion al mantener la cruceta se decide aqui (`ok` lleva `repeat`, como el teclado). Con tests.
2. En la vista, solo el enganche: leer los botones recien pulsados con `navigator.getGamepads()` en
   cada fotograma (`world.onFrame`) y mandar la orden a `KEY_ACTIONS` (partida) o a `MenuFlow`
   (menus).
3. La ayuda (`helpText.ts`) explica los botones.

## Donde mirar

| Quiero... | Fichero |
|---|---|
| Añadir o cambiar unidades y edificios (precio, daño...) | `src/core/content/*.json` (`docs/CONTENIDO.md`, skill `nueva-unidad`) |
| Cambiar terreno, reglas, pesos de la IA | `src/core/content/terrain.json`, `settings.json`, `ai.json` (+ skill `equilibrar`) |
| Cambiar una regla | su modulo en `src/core/rules/` (ver "El nucleo por dentro"; + test en `tests/`) |
| Cambiar cuando vale una accion o lo que hace, o añadir una | su entrada en `src/core/actions/` (ver "Acciones"; + test en `tests/dispatch.test.ts`) |
| Cambiar como juega la IA | `src/core/ai/` (`unitTurn.ts` prioridades, `tactics.ts` cada paso, `production.ts` compras), pesos en `data.AI` |
| Cambiar lo que enseña una ficha | `src/ui/models/tile.ts` y `src/hud/game/TileParts.tsx` (ver "Interfaz HTML") |
| Añadir un panel o una pantalla a la interfaz | `src/hud/` (ver "Interfaz HTML") |
| Cambiar como se ve el tablero (terreno, relieve, piezas, luz, clima) | su modulo de `src/view3d/engine/` (ver "Vista 3D"); lo que se ve para quien mira, `systems/board/`; los modelos, `tools/art/ashfox/` (skill `ashfox`) |
| Añadir una marca sobre el tablero o un efecto | `src/view3d/engine/fx/highlights.ts`; `engine/fx/fx.ts`, `particles.ts` (y si va con un suceso, su paso en `systems/events/`) |
| Cambiar las teclas, o añadir un mando (gamepad...) | `src/controls/` (ver "Mandos": teclas del mapa en `keyboard.ts`, de los menus en `menu.ts`) |
| Cambiar el raton o el dedo sobre el tablero | `src/view3d/systems/input/pointerInput.ts` (y que hace la casilla tocada, `TurnControls.tap`) |
| Cambiar algo de la partida en pantalla (animaciones, turno enemigo, pausa, final...) | `src/view3d/` (ver "Vista 3D": `systems/turn/`, `systems/events/`, `systems/hud/matchMenus.ts`, `matchEnd.ts`) |

| Textos | `src/i18n/es/*.ts` (un fichero por tema) y su traduccion en `src/i18n/en/` (ver "Interfaz HTML", "Textos"); `t('clave')` y `nameOf` en `src/settings.ts` |
| Generar mapas | `src/core/mapgen/` (un modulo por paso: terreno, salidas, edificios; los pasos en orden en `steps.ts`, fachada `mapgen.ts`), sus numeros en `mapgen.json` y `themes.json` |
| Añadir un tipo de movimiento (a pie, rueda, vuelo...) | `src/core/content/movements.json` (y su coste en cada terreno, `terrain.json`) |
| Medir el combate sin partida (laboratorio, duelos) | `src/core/measure.ts` (`uncheckedAttack`, `newUnit`: solo para medir) |
| Cuando acaba la partida para una pantalla, quien es persona, el autoguardado | `src/core/session/screen.ts` |
| Las flechas de lo que haran las ordenes permanentes | `src/core/autopilot/preview.ts` (`previewStandingOrders`) |
| El azar de cada turno de quien decide | `src/core/turnSeeds.ts` (`turnSeedOf`) y `decisionRngOf` en `src/core/playerView.ts` |
| Las opciones de una herramienta (`npm run fuzz -- --games 50`) | `tools/cliArgs.ts` (`commandLine`) |
| La partida por la red (mensajes, sala, lo que ve cada equipo de un paso, el servidor, la pantalla) | `docs/RED.md` (el recorrido entero y en que orden leer); el nucleo en `src/core/net/`, el servidor en `server/src/`, el cliente en `src/net/` |
| Misiones | `src/core/content/missions.json` (contenido, con su esquema); la partida de una, `src/core/missions/build.ts`, y lo que se mira de su mapa, `missions/check.ts` (+ skill `nueva-mision`); un tipo de objetivo nuevo, una entrada en `OBJECTIVES` (`src/core/objectives.ts`, con su `isValid` para las partidas guardadas) y su frase en `OBJECTIVE_TEXT` (`src/campaign.ts`) |
