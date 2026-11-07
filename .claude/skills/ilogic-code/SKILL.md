---
name: ilogic-code
description: Use when writing, refactoring or reviewing TypeScript in Ilogic (game rules, AI, scenes, HUD, tests). Project architecture, layering rules, conventions and the checks every change must pass.
---

# Codigo de Ilogic

Juego de estrategia por turnos: TypeScript estricto + Phaser 4 (dibujo) + Preact (interfaz HTML).
Para cualquier cosa de Phaser, ademas, la skill `phaser4`.

## Capas (de dentro afuera)

| Carpeta | Que va | Puede importar |
|---|---|---|
| `src/core/` | Reglas, IA, mapas, misiones, guardado, estadisticas. **TypeScript puro.** | solo `src/core` |
| `src/ui/` | Dibujo del mapa con Phaser (`mapView` = fachada de las capas de `ui/map/`; `fx`, `combatFx`, `terrainArt`), datos para el HUD (`hudModels` → `models/<panel>.ts`) | core, settings, atlas |
| `src/hud/` | Componentes Preact (`game/`, `menus/`, `overlays/`, piezas en `common/`), `store` (estado; tipos en `state.ts`, `actions.ts`, `vm/`) y estilos (`styles/`) | settings, assets, patchNotes, tipos de core |
| `src/scenes/` | Escenas de Phaser: orquestan core + ui + hud | todo |
| `src/scenes/game/` | Modulos de `GameScene` (animar eventos, turno enemigo, final, seleccion, ordenes, modelos del HUD...). Cada uno recibe de la escena una interfaz `...Host` pequeña (con `live()`, `host.ts`); lo puro, con test | todo |
| `src/menu/`, `src/patchNotes/` | Pantallas del menu, fondo vivo, notas de parche | core, ui, hud |
| `src/controls/` | Ordenes del jugador (`InputCommand` en el mapa, `MenuCommand` en los menus) y adaptadores de cada mando (teclado...): funciones puras, sin Phaser | menu (teclas compartidas) |
| `src/controls/pointer.ts` | Adaptador de raton y dedos (`PointerGestures`): de eventos de bajo nivel a gestos (toque, arrastre, coger y soltar, recuadro, pulsacion larga, pellizco, rueda). Sin Phaser | `scenes/game/pointerInput.ts` implementa `PointerTarget` |
| `tools/` | Equilibrio, automejora, partida por texto, contenido (Node) | solo core, como `'@core/...'` |
| `tests/` | Vitest | todo; core como `'@core/...'` |

- `src/core/rules.ts` y `src/core/ai.ts` son fachadas: el codigo esta en `src/core/rules/` y
  `src/core/ai/`, un modulo por tema (mapa en `docs/ARQUITECTURA.md`, "El nucleo por dentro").
  Fuera de core se importa de la fachada; dentro, del modulo concreto, sin crear ciclos. Un import
  por modulo, con los tipos dentro (`import { a, type B }`; lo vigila ESLint).
- `src/core` **no** importa Phaser, Preact, DOM, `localStorage` ni `settings` (lo impide ESLint).
  Si una regla se escribe dentro de una escena, no se puede probar: va a core (ver `core/targeting.ts`).
- Las escenas no leen teclas ni botones de un mando: un adaptador de `src/controls` los traduce a
  `InputCommand` (mapa) o `MenuCommand` (menus) y la escena los cumple (`command` / `menu`, segun
  `controlContext()`). Un mando nuevo es un adaptador nuevo (`docs/ARQUITECTURA.md`, "Mandos").
- Las escenas no calculan lo que enseña la interfaz a mano: usan funciones puras de `ui/hudModels.ts`
  y publican con `ui.set(...)`. Los componentes solo pintan lo que hay en el store. Como se añade un
  panel y que pieza usar (`Button`, `Popover`, `Veil`...): `docs/ARQUITECTURA.md`, "Interfaz HTML".
- **La partida solo cambia con acciones**: quien juega un equipo manda una `GameAction` (datos: uids y
  casillas) con `dispatch(s, team, action)` (`core/actions.ts`), que la comprueba (`validate`, desde
  la partida; solo el equipo al que le toca: `GameState.turn`), la hace y devuelve sus sucesos (o por
  que no vale). Cada equipo lo juega un controlador dentro de una `GameSession` (`core/session.ts`):
  la escena manda las de la persona con `host.act(...)`/`host.perform(...)` (`ActionHost`, por
  `session.act`); la IA y las ordenes permanentes **solo proponen**: son planes (`ActionPlan`, un
  generador que da cada `GameAction` y recibe su `ActionResult`; `act`/`doMove`/`finish` en
  `autopilot/context.ts`) que cumple la sesion (`proposing`) o, fuera de ella, `carryOut`. Quien
  decide lee la vista de su equipo (`PlayerView`, `core/playerView.ts`: sin lo que no ve, al dia con
  `seeing`), nunca la partida de verdad; ESLint lo vigila (`DECIDERS_ONLY_PROPOSE`). Las herramientas y los tests juegan partidas enteras con `runMatch`; nada de bucles de
  turnos a mano. Las fachadas (`core/rules`, `core/squads`) solo preguntan; ESLint no deja usar sus
  modulos de dentro fuera del nucleo. Ver `docs/ARQUITECTURA.md`, "Acciones" y "Sucesos".
- El azar: los dados de las reglas son de la partida (`GameState.dice`, `diceOf(s)`) y el de las
  decisiones de la IA tambien, aparte (`GameState.decisionSeed`; el de cada turno, `decisionRng(s,
  equipo)`); el generador de mapas lleva su `Rng` (`seededRng`); elegir al azar, `pick`/`weightedPick`
  (`core/util/random.ts`); nada de `Math.random` en core. La IA y los mapas son deterministas con la
  misma partida.

## Estilo: que se lea a la primera

Todo codigo nuevo o tocado sigue `docs/ESTILO.md` (con un ejemplo de antes y despues). En corto:
nombres completos (`unit`, `distanceToGoal`; no `u`, `d`, `c`), una funcion por idea (unas 25
lineas, 2 niveles de anidacion), salir pronto con `return`, nada de numeros ni condiciones magicas,
recorrer y elegir con las piezas comunes (`Grid<T>` de `core/util/grid.ts` con `at`/`set`/`forEach`/`cells`, `minBy`/`maxBy`
de `core/util/pick.ts`, `reachableTilesWithCost`, `distanceMap`, `stepToward`) en vez de bucles a mano,
lo que crece como lista de datos y no como `switch`, cada modulo pide solo lo que usa, y comentarios
del porque. Reescribir sin cambiar lo que hace: `npm run huella` tiene que dar lo mismo antes y despues.

## Convenciones

- **Datos, no numeros sueltos**: unidades, edificios, terreno, temas, generador de mapas, reglas por
  defecto y pesos de la IA en `core/content/*.json` (ver `docs/CONTENIDO.md`). El contenido va con
  cada partida, ya resuelto en tipos con nombre: `unitTypeOf(s, unit).cost`, `buildingTypeOf(s, b)`,
  `terrainAt(s, pos)`, `themeOf(s)`, `weatherTypeOf(s, id)`, los pesos de la IA en su perfil
  (`AiProfile.weights`, `defaultAiProfile(contenido)`; las ordenes, `autopilotProfileOf`) y
  `s.content` (core/gameContent.ts), nunca de una constante de modulo; fuera de una partida (menus,
  etiquetas), `defaultContent()`. Un tipo se busca por su id en su catalogo (`entryOf(content.units,
  id, 'unidad')`). El codigo no compara nombres de unidades (`'Tank'`) ni de temas: si necesita saber
  algo de uno, es un campo del JSON.
- **Tipos con nombre, no indices sueltos**: `MoveType.FOOT` (`'foot'`), `movementOf(s, unit)`,
  `canMoveOn(moveType, terrain)`; como se mueve una unidad en esta partida (por donde, lo que cuesta,
  lo que puede gastar) es su `movementProfile(s, unit)`; las partidas guardan ids
  (`unit.type = 'Tank'`, `s.theme = 'Plains'`), nunca el puesto en el fichero.
- **Equipos, no bandos**: ningun numero de equipo es especial (ni `team === 0` ni `team = 0` por
  defecto). Enemigo es `isHostile(s, a, b)` (otra alianza); lo de cada equipo, `teamState(s, team)`
  (dinero, general, estadisticas); quien lo juega, su `controller`. Lo que actua por un equipo lo
  recibe (`playerView(s, team)`, `formSquad(s, team, units)`); como acaba la partida es
  igual para todos (`matchResult(s)`: quien gana, nada de 'won'/'lost' de un equipo). En la escena, el
  equipo que mira es `viewer` y la interfaz pinta por lado (`ui/sides.ts`). Ver `docs/ARQUITECTURA.md`, "Equipos".
- **SOLID en pequeño**: un modulo por responsabilidad (`core/content/units.ts` valida y construye solo
  unidades; `index.ts` solo compone). Funciones puras que reciben lo que necesitan (`ContentContext`) en
  vez de leer globales; las herramientas separan la logica (pura, con test) de la linea de comandos. Colores de Phaser en `ui/palette.ts` (iguales que
  las variables de `hud/styles/base/base.css`). Textos de pantalla en `settings.ts` (`t('clave')`, es/en).
- **La partida es la unica fuente**: reglas en `s.settings`, tamaño del mapa en `s.map` (`mapGrid(s)`),
  tipos de la partida en `core/model/` (sin dependencias). Nada de variables de modulo con la partida
  en curso; para probar otras reglas, una partida con otras reglas (`blankState(settingChanges)` en los tests,
  `createMatch(skirmishConfig({ seed, teams, settingChanges }))`). Reglas con cambios: `settingsWith(contenido, { fog: false })` (nunca
  `{ ...ajustes, ... }` a mano). Partida nueva: `newGameState({ map, settings, content, mode, teams, seeds })`, el unico sitio
  que escribe su forma (`teams: duel('human', 'ai')` o una lista de `TeamSetup`); el contenido es el campo `s.content` (no se guarda). Leer una guardada:
  `loadGame(json)`, o `readSave(json, contenido)` para saber que falla (`deserialize` da
  null). Solo se lee el formato de ahora: mientras el juego no ha salido, un cambio en lo que se guarda
  sube `SAVE_VERSION` (core/saveVersion.ts, y el tipo de `GameState.version`) y las partidas de antes se
  descartan (`badVersion`). Sin migraciones ni valores por defecto para campos que antes faltaban.
- **Casillas como `Pos`**: firmas con `pos: Pos`, no `(x, y)`; copiar la casilla de una unidad o
  edificio con `posOf(unit)`; los bordes, con `mapGrid(s).contains(pos)`, `isOnBoard(s, pos)` o
  `grid.atClamped(pos)` (no hay `isInside` fuera de util/grid.ts).
- **Una sola forma por cosa**: eventos con `moveEvent`/`captureEvent` (con su `actor`), el turno de
  una unidad con `rules/unitTurn.ts` (`canStillAct`, `canStillMove`, `canStillFire`, `spendUnit`), el
  dinero con `earn`/`pay` (`rules/funds.ts`), las reglas validas con `SETTINGS_SCHEMA`
  (`core/settingsSchema.ts`), lo que viene de fuera con `util/validation.ts`, proteccion con
  `tileProtection`, casillas alcanzables con `reachableTiles`, si se puede dar un paso con
  `stepAllowed`, recorrer un camino con `traverse`/`moveAlong`, distancias con `distanceMap` (y lo
  que corta el paso, `Blockers`), acercarse con `stepToward` y un `Approach`, desde donde se dispara
  con `fireOrigins`, si hace dano con `canDamage`, a distancia con `isRanged` y si se mueve y
  dispara con `firesAfterMove`, un combate hipotetico con `engagement(...)` (nunca copias de
  unidades), el daño con `damageModelOf`, numeros con `fmtNum`; en
  el mapa, esperas y textos de efectos con `ui/fxKit.ts`, esquinas y marcos con `ui/pixelDraw.ts`,
  casillas con `ui/map/geometry.ts` y marcas nuevas como funcion de `OVERLAYS` (`docs/ARQUITECTURA.md`,
  "Vista del mapa").
- **Extender sin abrir funciones grandes**: accion nueva = su forma en `GameAction` y en
  `ACTION_SHAPES` (`core/actions/shape.ts`, campo a campo), su suceso en `GameEvent` y su entrada en
  `ACTIONS` (`core/actions/`; y en `UNIT_MENU` si sale en el menu de la unidad, en `SELECTION_MENU`
  si se manda a unas elegidas, y en `ANIMATORS` de la escena); lo que se limpia tras cualquier
  accion y cada ronda = entrada en `INVARIANTS` (`core/rules/invariants.ts`); lo que se mira antes
  de cualquiera = entrada en `ACTION_GUARDS`; una pieza de reglas que depende de un ajuste = un
  modulo de reglas (`core/ruleModules/`, entrada en `RULE_MODULES`) que aporta a las listas
  (`RuleHooks`): acierto nuevo = `hitModifiers` de su modulo; paso por ronda = `roundPhases` (con su
  momento; los de siempre en `ROUND_PHASES`); algo que pasa en cada ataque = `combatSteps` (los de
  siempre en `COMBAT_RESOLUTION`, `core/actions/combat.ts`) y lo que apunta en el ataque = su campo en `AttackRecordParts` (`declare module`); quien contraataca = `counterRules`; por
  donde se pasa = `passRules`/`stopRules`; lo que corta un camino = `pathInterruptions` (su nombre
  ampliando `InterruptionKinds`; animacion propia opcional en `INTERRUPTION_ANIMATIONS`); parte del
  resumen de ronda = `roundReportParts` (su forma ampliando `RoundReportParts`); nombre de un modulo
  = `RuleModuleIds` (un modo lo amplia con `declare module`); reparto del daño = entrada en `DAMAGE_MODELS` (ajuste `damageModel`); un modo
  puede traer sus propios modulos (`GameMode.ruleModules`: se resuelven con la partida, `s.ruleset`); las reglas no preguntan por un ajuste (`if (!s.settings.x)`); paso al empezar o acabar cada turno =
  entrada en `TURN_START_PHASES`/`TURN_END_PHASES` (`core/actions/turn.ts`); forma de acabar la
  partida = entrada en `VICTORY_RULES` (`core/rules/victory.ts`) y en la lista de su modo; modo de
  juego = entrada en `GAME_MODES` (`core/modes.ts`), su configuracion en `MatchConfig` y su
  preparacion en `MATCH_SETUPS` (`core/match.ts`); quien juega un equipo = un `Controller`
  (`core/session`); habilidad de unidad nueva = su forma en `AbilityDef`, su validacion en
  `ABILITY_SHAPES` (`content/abilities.ts`), lo que aporta en `ABILITY_HOOKS` y su sitio
  en `ABILITY_ORDER` (`abilities.ts`; el compilador exige las dos);
  efecto nuevo de un poder del general = su validacion en `EFFECT_SHAPES` (`content/generals.ts`) y
  su entrada en `POWER_EFFECTS` (`generalPowers.ts`: casilla, area, efecto y `aiValue`).
  La IA no tiene variables globales: lo del turno va en `PlayCtx` (equipo, perfil, `paths`,
  `focusFire`); como juega, en su `AiProfile` (pesos, `scoreTerms`, `behaviours`), que se le da al
  controlador; como pelea una unidad, un preset de `EngagementPolicy` (`HUNT`, `SHOOT_FROM_HERE`,
  `guardZone`, `fireOnTheWay`); lo que sabe de la partida, una consulta de las reglas
  (`visibleFoes`, `projectedIncome`, `canRepair`, `isEnemyHq`...), nunca una copia; lo que un
  equipo no sabe, una entrada en `FOG` (`playerView.ts`); un tipo de orden permanente, su
  linea en `StandingOrderKinds` (model) y sus entradas en `STANDING_ORDER_TYPES` y `STANDING_ORDER_TURNS` («Ir alli» es
  la orden 'goto'). Antes de escribir un bucle o un
  literal, buscar si ya existe la ayuda.
- Tipos estrictos con `noUncheckedIndexedAccess`: para rejillas, `grid.at(pos)` en vez de
  `grid[x]![y]!`. El tamaño del mapa sale siempre del estado (`mapGrid(s)`, `createLayer(s, fill)`,
  `isOnBoard(s, pos)` de `core/mapGrid.ts`): no hay tamaño global; un `!` sobre algo que puede no existir (unidad por uid, seleccion) es un fallo
  esperando a pasar.
- `switch` sobre uniones: con todos los casos o con `default:` explicito (lo pide el lint).
- Las reglas cambiadas respecto al juego de 2013 llevan `[CAMBIO]` en un comentario con el porque.
- Comentarios y nombres de cara al jugador en español, sin tildes en el codigo (si en los textos).
- Escenas: estado de partida en `resetMatch()` (lo llama `init()`); limpieza en `SHUTDOWN`
  (ver skill `phaser4`). Esperas asincronas: comprobar `this.match` despues de cada `await` largo.

## Tipos que trabajan por nosotros

El compilador es estricto (`strict`, `noUncheckedIndexedAccess`): que pille los fallos antes que una
partida. Pero un tipo tiene que leerse a la primera, como el codigo (`docs/ESTILO.md`, regla 9).

- **Lo que entra de fuera es `unknown`** (JSON de contenido, partidas guardadas, `localStorage`): se
  comprueba con guardas (`v is number`, `isNum` y `Checker` de `core/content/check.ts`; `hasGameShape`
  en `core/savedParts.ts`, `SavedGame` hasta que `readSave` la ha comprobado) y solo despues se usa. Nada de `as Tipo` para "convencer" al compilador ni de `any`.
- **Guardas en vez de `!` y de `as`**: para quitar huecos de una lista,
  `.filter((unit): unit is Unit => !!unit)`; si un valor tiene que existir, una funcion
  `asserts value is T` que falle con un mensaje claro es mejor que un `!` que falla lejos.
- **Uniones con discriminante** (`kind`, `type`, `mode`) para cosas que son una de varias, y `switch`
  con todos los casos y `default: return valor satisfies never` (como `ui/combatFx.ts`): un caso nuevo
  rompe la compilacion donde falta tratarlo.
- **`satisfies` para comprobar sin perder el tipo exacto**: `{ start: 'load' } satisfies GameStartData`,
  tablas `const X = {...} as const satisfies Record<Clave, Valor>`.
- **Tablas que no pueden quedarse cortas**: `Record<UnionDeClaves, T>` (como `STANDING_ORDER_TURNS`)
  obliga a tener una entrada por caso. Si la lista de claves es un dato, se escribe una vez
  (`const KINDS = [...] as const`) y la union sale de ahi (`type Kind = (typeof KINDS)[number]`).
- **`interface` para formas de objeto** (lo que usa el proyecto), `type` para uniones y tipos derivados.
  Imports de tipos con `type` dentro del mismo import (lo pide ESLint).
- **Genericos con restriccion** solo cuando quitan repeticion de verdad (`Grid<T>`, `minBy<T>`):
  `<T extends ...>` y que se infiera en la llamada, sin escribir `<T>` a mano.
- **Sin gimnasia de tipos**: nada de condicionales anidados, tipos recursivos profundos, builders con
  estados de tipo ni rutas `"a.b.c"` generadas. Si un tipo necesita un comentario largo para entenderse,
  es mejor un tipo mas simple y una comprobacion en el codigo. Ademas ralentizan `npm run check`.
- **Probar un tipo** cuando es una pieza comun: `expectTypeOf(...)` de Vitest en `tests/` (lo comprueba
  `tsc` dentro de `npm run check`), mejor que un `AssertEqual` hecho a mano.

## Antes de dar algo por terminado

```bash
npm run check        # tipos + ESLint + Prettier + tests (lo mismo que pasa GitHub antes de publicar)
npm run format       # si Prettier se queja
npm run build:single # y abrir dist-single/ilogic.html (file://) para probarlo jugando
```

- Reescribir sin cambiar comportamiento (refactor): `npm run huella` antes y despues; la "huella
  total" tiene que ser la misma (24 partidas IA contra IA con varias reglas, generales y escuadras).
- Cambios de reglas o IA: `tests/aiGolden.test.ts` compara partidas IA contra IA con semilla fija.
  Si falla sin querer cambiar el comportamiento, es un fallo del refactor. Si el cambio es a
  proposito, actualizar con `npx vitest run -u tests/aiGolden.test.ts` y comprobar el equilibrio con
  `npm run balance`.
- Logica nueva en core o en `hudModels`: con su test en `tests/`.
- Graficos: nunca a mano en `public/assets/atlas`; se compilan con `npm run assets` (README, "Graficos").
- Nunca `vite preview` ni servidores: el juego se prueba con el fichero unico por `file://`.
