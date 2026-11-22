# Guia para agentes de IA

Como trabajar en Ilogic sin una persona mirando: que comprobar y con que herramientas. Las reglas del
codigo estan en la skill `ilogic-code`; la arquitectura en `docs/ARQUITECTURA.md`.

## Comprobar el trabajo

| Que | Orden | Cuando |
|---|---|---|
| Tipos, lint, formato, tests | `npm run check` | Siempre antes de terminar |
| Ver una regla funcionando | `npm run play -- --seed 7 -e "..."` | Cambios de reglas o IA |
| Equilibrio | `npm run balance -- run ...` | Cambios de numeros o de IA (skill `equilibrar`) |
| Jugarlo en un navegador | `npm run dev` y abrir `http://localhost:5173/` | Interfaz, menus, vista 3D, sonido |
| Ver los modelos 3D y sus animaciones | `npm run dev` y abrir `/units3d.html` | Modelos de Ashfox (skill `ashfox`) |

No hay capturas de referencia: lo que cambia a la vista se comprueba mirandolo (captura del
navegador) y se dice en el commit.

## Cazador de fallos (`npm run fuzz`)

Juega partidas con jugadas al azar e IA y comprueba los invariantes (`tools/improve/invariants.ts`)
despues de cada accion; `--repro N` muestra una partida entera.

## Partida por texto (`npm run play`)

```bash
npm run play --silent -- --seed 7 --size 20 -e "status; units 1; map"
npm run play --silent -- --seed 7 -e "unit 1; move 1 2 3; capture 1; end; status"
npm run play --silent -- --mission tutorial -e "map; ai; ai; status"
npm run play -- --seed 7          # interactivo (help)
```

Mapa en texto con coordenadas; `+01` unidades propias, `-04` enemigas; `end` acaba el turno (como
en la pantalla: ordenes permanentes, capturas que siguen solas, la IA, el fin de ronda y los viajes
del turno siguiente) y pasa el dia; `ai` juega tu turno con la IA; `state` da el JSON de la partida
(se puede abrir en el juego con la API de depuracion). Sin `--size` ni `--no-fog`, la partida es la
misma que una nueva del juego con ese codigo de mapa (`skirmishConfig`). Si una orden falla, la
linea empieza por `error:` y el programa sale con 1.

## Probar en el navegador (`window.ilogic3d`)

`npm run dev` y, en el navegador:

- `/`: el menu principal (Inicio, Nueva partida, Campaña, Opciones). Cada partida va en su propia carga
  de la pagina: al empezar una se recarga, y salir al menu tambien (`src/view3d/app/gameStart.ts`).
- `/?seed=2013`: una escaramuza directa (la persona contra la IA) con ese mapa; `&elevation=0`, sin la
  regla de altura (el relieve se ve igual). Siempre el mismo mapa: sirve para comparar antes y despues.
- `/units3d.html`: el playground de modelos (todas las unidades y edificios, sus animaciones, luz por
  clima; `?model=Tank&side=enemy`). Desde la consola, `window.ilogicPlayground`.

En la partida, `window.ilogic3d` da `session` (la partida: `session.state`), `board` (las piezas),
`controls` (la entrada del turno: `tap(pos)`, `endTurn()`, `focusUnit(uid)`), `camera` (la camara de
estrategia como logica: `lookAt({ x, y, z })`, `pose`), `world` (escena, `setWeather(id)`), `weather`, `stages` (los puertos con los que se
anima un suceso: `stages.pieces.walk(uid, de, a)`, `stages.effects.sparks(sitio, 1)`...; los pasos de cada
suceso los decide `src/view3d/systems/events/eventSteps.ts`), `wrecks`, `recentSounds()` (los ultimos efectos pedidos: nombre, el que sono de verdad y desde
donde; para comprobar el sonido sin oirlo), `ambience` (los emisores de ambiente y cuales suenan), `life` (lo que vive en el tablero: `life.swarms`, las motas de cada clase; `life.critters`, los animalitos sentados (pingüinos y focas incluidos), y `life.travellers`, los que se van: pajaros, buitres, bolas rodadoras, mariposas, peces, gansos), `pause` (el menu de pausa) y `ui` (el estado de la
interfaz: `ui.get()`, y sus botones: `ui.actions`). Usar estos y no `import()` desde la consola: tras una
recarga en caliente, `import()` puede dar otra copia del modulo.

Normas:
- Con el panel del navegador oculto, la pagina va a saltos (sin fotogramas): esperar con varios
  `requestAnimationFrame` o pedir que se enseñe el panel.
- Novedades consulta GitHub: sin red no pasa nada.
- Ajustes del juego por `localStorage['ilogic.settings']` antes de cargar.

## Probar un sistema de la vista 3D sin navegador

Los sistemas de `src/view3d/systems/` no usan three.js ni el motor, asi que se prueban con Vitest como
el nucleo: una partida de prueba (`blankState`, `newUnit` de `tests/helpers.ts`) y, segun el sistema,
se comparan los datos que devuelve o se le dan puertos falsos (`ports/`) que apuntan lo que se les pide.

| Sistema | Como se prueba | Ejemplo |
|---|---|---|
| El turno (`systems/turn/`) | puertos falsos (`TileMarks`, `MovePreview`, `EventPlayer`, `ScreenView`) y tocar casillas, recuadros, teclas de grupo y la barra | `tests/turnControls.test.ts`, `tests/clickIntent.test.ts` |
| Las ordenes (`systems/orders/`) | `OrderIntents` con una sesion de verdad y un `IntentMarks` falso | `tests/orderIntents.test.ts` |
| Los sucesos animados (`systems/events/`) | `stepsOf(suceso, piezas)` da los pasos como datos; `runSteps` con un motor falso que apunta las llamadas | `tests/eventSteps.test.ts` |
| El tablero (`systems/board/`) | `boardScene(s, viewer)`: niebla, lados, vida, capturas | `tests/boardScene.test.ts` |
| La camara (`systems/camera/`) | `StrategyCamera` y su `pose` tras `update(segundos)` | `tests/strategyCamera.test.ts` |

Lo que se ve de verdad (modelos, luz, efectos) se sigue mirando en el navegador.

## Capturas y rendimiento de la vista 3D

La primera vez: `npx playwright install chromium`.

- `npm run shots`: nueve escenas fijas (menu en escritorio y movil; la partida de semilla 2013 en
  calma, sin elevacion, con una unidad elegida, con lluvia y en movil; dos modelos del playground),
  comparadas con `tests/visual/ref/`. Informe en `tests/visual/out/index.html` (ahora, referencia y en
  rojo lo distinto). En la misma maquina cada captura sale igual pixel a pixel: el reloj de la pagina
  va parado (Playwright) y `Math.random`, que reparte el reposo de las unidades, las particulas y la
  lluvia, lleva semilla. Asi que cualquier cambio salta. Si es a proposito: `npm run shots:update`.
  Una escena nueva es una entrada en `SCENES` (`tests/visual/shots.mjs`), con lo que hacer antes de la
  captura (`act`, sin `await`: con el reloj parado no acabaria) y el tamaño de la ventana.
  Hacerlas con la carpeta quieta: si alguien (otra sesion) edita el codigo mientras tanto, Vite
  recarga la pagina a mitad y salen capturas en blanco. En un worktree aparte, con `npm ci` dentro
  (un enlace a otro `node_modules` no vale: Vite no sirve ficheros de fuera y faltan las fuentes).
- `npm run perf`: la partida 2013 en calma y con lluvia (carga, tiempo por fotograma: mediana, 5 % peor
  y el peor; llamadas de dibujo, triangulos, geometrias, texturas) y el peso de los modelos, frente a
  `tools/perf/baseline.json`. Usa la GPU de la maquina y sin el limite de 60 fps, asi que el tiempo es
  lo que cuesta dibujar. Solo compara con una linea base de la misma GPU. `--save` guarda una nueva;
  `--check` falla si algo empeora de mas (`LIMITS`: 10 % en lo que se cuenta, 30 % en el tiempo).

## Antes de tocar...

- **Graficos**: nunca a mano en `public/assets/atlas`; skill `arte-retro-diffusion` (y **no gastar
  dinero en Retro Diffusion sin permiso**).
- **Reglas o IA**: `tests/aiGolden.test.ts` falla si cambia como se juega. Bien si era a proposito.
- **Refactor (reescribir sin cambiar nada)**: `npm run huella` antes y despues; la huella total tiene que
  ser la misma. Juega 24 partidas IA contra IA (4 juegos de reglas, mapas de 16 a 32 y una escuadra del
  jugador con orden) y resume cada suceso y el estado tras cada ronda.
- **Una version**: skill `sacar-version`.
- **GitHub**: la web se publica con cada push a `main` si pasa `npm run check`.
