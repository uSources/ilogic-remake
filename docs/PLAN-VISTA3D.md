# Plan: la vista 3D por sistemas, agnosticos al motor

La regla esta en `docs/ARQUITECTURA.md` ("Vista 3D", "La regla: sistemas agnosticos, solo el motor
dibuja") y la vigila ESLint (`ENGINE_FILES`, `ONLY_THE_ENGINE_DRAWS`). Este plan dice como llegar a
ella desde lo que hay, en pasos pequeños: cada uno en su PR, con el juego igual al acabar
(`npm run check`, la partida y el playground en el navegador).

## Donde estamos

`src/view3d/` es una carpeta plana de 34 modulos (mas `models/` y `playground/`):

- **Ya son sistemas** (sin three.js): `turnControls.ts` (el turno), `attackPlan.ts`, `menuItems.ts`,
  `hudBridge.ts`, `matchMenus.ts`, `menuFlow.ts`, `gameStart.ts`, `keyInput.ts`, `pointerInput.ts`,
  `weatherStyles.ts` (datos), `models/` (bloques descritos como datos).
- **Son motor** (three.js, sin decidir nada): `world.ts`, `space.ts`, `toon.ts`, `blocks.ts`,
  `badges.ts`, `glbModels.ts`, `terrain.ts`, `relief.ts`, `water.ts`, `sandDust.ts`, `pixelPoints.ts`,
  `particles.ts`, `fx.ts`, `groundMarks.ts`, `wrecks.ts`, `highlights.ts`, `weather3d.ts`.
- **Mezclan** decidir y dibujar:
  - `animations.ts`: decide que se hace con cada suceso (orden, esperas, textos, tintes) y lo hace
    con three.js.
  - `board.ts`: decide que piezas hay, donde y como se ven (niebla, vida, captura, tinte de la que
    ya jugo) y monta y mueve los objetos de three.js.
  - `cameraRig.ts`: la logica de la camara de estrategia (a donde mira, limites, suavizado) dentro
    del objeto de three.js.
  - `match3d.ts`: la raiz de composicion, pero tambien crea objetos del motor y reparte cosas a mano.
- **Dependencias al reves**: `turnControls.ts` (sistema) importa `animations.ts` y `highlights.ts`
  (motor) y usa sus clases; `keyInput.ts` y `pointerInput.ts` usan el tipo `CameraRig` entero.

## A donde vamos

```
src/view3d/
  app/          la raiz de composicion: main.ts, menuFlow.ts, gameStart.ts, match3d.ts
                (el unico sitio que junta cada sistema con su motor)
  ports.ts      las interfaces entre sistemas y motor (o una por sistema, junto a el)
  systems/      deciden; sin three.js; se prueban sin navegador
    turn/       el turno: fases (elegir, mover, atacar, comprar), menus de unidad y compra,
                desde donde atacar (attackPlan, menuItems)
    events/     que se anima con cada suceso y en que orden (la tabla EVENT_ANIMATIONS, en datos)
    board/      que pieza hay donde y como se ve para quien mira (niebla, vida, captura, tinte)
    camera/     la camara de estrategia como logica: objetivo, distancia, giro, limites, suavizado
    input/      teclado y punteros a ordenes (keyInput, pointerInput)
    hud/        lo que publica la interfaz y los menus de la partida (hudBridge, matchMenus)
    weather/    como se ve cada clima (datos: weatherStyles)
  engine/       representa; el unico con three.js; no decide nada
    core/       lienzo, escena, luz, bucle (world), casilla ↔ mundo (space), materiales (toon)
    terrain/    casillas, relieve, agua, polvo de la arena
    pieces/     dibujar las piezas que dice systems/board: modelos GLB y de bloques, marcas de
                vida, restos, rodadas
    fx/         efectos de un momento, particulas, clima, marcas del tablero (highlights)
    camera/     aplica a la camara de three.js lo que decide systems/camera
  playground/   la herramienta de modelos (puede usar el motor directamente)
```

¿`view3d` o `scenes3d`? El nombre de la carpeta es decision del usuario; si cambia, se hace en el
paso 5 (un solo movimiento, con los imports y la documentacion).

## Los puertos (interfaces pequeñas)

Las pide el sistema que las usa y las implementa el motor. Bocetos (los nombres finales salen al
hacerlo):

| Puerto | Lo usa | Que pide |
|---|---|---|
| `TileMarks` | turno | enseñar alcance, objetivos y la casilla señalada; quitarlos |
| `PieceStage` | sucesos, tablero | mover una pieza por un camino, girarla, tintarla, quitarla, ponerla en su sitio (`sync`) |
| `EffectStage` | sucesos | proyectil, chispas, texto que sube, humo o polvo en un punto, temblor |
| `CameraView` | camara | situar la camara donde dice la logica (objetivo, distancia, giro) |
| `ScreenPick` | entrada | que casilla hay bajo un punto de la pantalla |
| `FrameClock` | sucesos, camara, entrada | avisar en cada fotograma; esperar un tiempo |

Los sistemas dependen del puerto, no de la clase (`TileMarks`, no `Highlights`); los tests usan un
puerto falso que apunta lo que se le pide.

## Los pasos

Cada paso es una PR; el juego se ve y se juega igual al final de cada uno.

1. **Puertos para el turno.** `turnControls.ts` deja de importar `animations.ts` y `highlights.ts`:
   pide `TileMarks` y un `EventPlayer` (reproducir los sucesos de una accion). `match3d.ts` le da las
   implementaciones. Primeros tests del turno con puertos falsos.
2. **Separar `animations.ts`.** `systems/events/`: la tabla de cada suceso como pasos (mover por el
   camino, girar hacia, disparar, chispas, texto, esperar) sin three.js, con tests. `engine/fx/`:
   el que ejecuta esos pasos sobre `PieceStage` y `EffectStage`.
3. **Separar `board.ts`.** `systems/board/`: que piezas hay y como se ven para quien mira (puro, con
   tests: niebla, vida, captura, tinte). `engine/pieces/`: crear, mover y quitar los objetos.
4. **Separar `cameraRig.ts`.** `systems/camera/`: objetivo, distancia, giro, limites y suavizado
   (puro, con tests). `engine/camera/`: aplicarlo a la camara de three.js. `keyInput` y
   `pointerInput` piden la logica, no el objeto del motor.
5. **Mover a carpetas** (`app/`, `systems/`, `engine/`), sin cambiar codigo; si se renombra la
   carpeta, aqui. `ENGINE_FILES` queda en `src/view3d/engine/**` (y el playground), y una regla mas
   de ESLint: `systems/` no importa `engine/` (solo puertos).
6. **Documentacion.** `docs/ARQUITECTURA.md` ("Vista 3D": la tabla de modulos por sistema), la skill
   `ilogic-code` y `docs/AGENTES.md` (como probar un sistema sin navegador).

Lo que falta portar del 2D (recuadro, grupos, ordenes, minimapa... en `docs/IDEAS.md`) se hace ya
con esta forma: su sistema en `systems/`, su dibujo en `engine/`, y su puerto.

## Como se comprueba cada paso

- `npm run check` (tipos, ESLint con la regla, formato y tests: los nuevos de cada sistema).
- La partida en el navegador (`npm run dev`, `/?seed=2013` y `?seed=7` con nieve): elegir, mover,
  atacar, comprar, terminar turno, el turno de la IA animado, el clima.
- El playground (`/units3d.html`): modelos y animaciones.
- Mover codigo no cambia comportamiento: si un paso cambia algo que se ve, es un error del paso.

## Coordinacion

Otra sesion puede estar tocando `src/view3d/` (sonidos, opciones, menus). Cada paso, en su rama
desde `main`, pequeño y fusionado pronto, para que los choques sean pocos; el paso 5 (mover
ficheros) mejor cuando no haya otro trabajo a medias en la vista.
