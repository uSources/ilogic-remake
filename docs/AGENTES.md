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

## Automejora

Solo cuando el usuario lo pide (skill `automejora`). Medidas:

- `npm run metrics`: nota del juego 0-100 por partes con 120 partidas IA contra IA; se compara con
  `improve/baseline.json`. `--save-baseline` al aceptar un cambio.
- `npm run arena -- --games 200`: la IA del juego contra la de referencia (la misma con los pesos guardados en
  `improve/ai-baseline.json`); `--candidate fichero.ts` prueba otro perfil (`AiProfile`: comportamientos,
  razones de ataque, pesos o su turno entero: asi se mide un cambio de codigo de la IA antes de ponerlo en
  `src/core`; ejemplo en `tools/improve/candidates/example.ts`) contra la del juego, y `--rival` cambia el rival. Un cambio de IA solo vale si el intervalo del 95 % queda
  por encima del 50 %. `--snapshot` guarda los pesos de ahora al aceptarlo.
- `npm run fuzz`: invariantes (`tools/improve/invariants.ts`) en partidas con jugadas al azar e IA;
  `--repro N` para ver una partida entera.
- `improve/DIARIO.md`: todo lo probado. Leerlo antes de proponer; apuntar tambien lo descartado.

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
  de la pagina: al empezar una se recarga, y salir al menu tambien (`src/view3d/gameStart.ts`).
- `/?seed=2013`: una escaramuza directa (la persona contra la IA) con ese mapa; `&elevation=0`, sin la
  regla de altura. Siempre el mismo mapa: sirve para comparar antes y despues.
- `/units3d.html`: el playground de modelos (todas las unidades y edificios, sus animaciones, luz por
  clima; `?model=Tank&side=enemy`). Desde la consola, `window.ilogicPlayground`.

En la partida, `window.ilogic3d` da `session` (la partida: `session.state`), `board` (las piezas),
`controls` (la entrada del turno: `tap(pos)`, `endTurn()`, `focusUnit(uid)`), `rig` (la camara:
`lookAt(punto)`), `world` (escena, `setWeather(id)`), `weather`, `animations` (para lanzar sucesos a mano
con `playEvents` de `/src/view3d/animations.ts`), `wrecks`, `pause` (el menu de pausa) y `ui` (el estado de la
interfaz: `ui.get()`, y sus botones: `ui.actions`). Usar estos y no `import()` desde la consola: tras una
recarga en caliente, `import()` puede dar otra copia del modulo.

Normas:
- Con el panel del navegador oculto, la pagina va a saltos (sin fotogramas): esperar con varios
  `requestAnimationFrame` o pedir que se enseñe el panel.
- Novedades consulta GitHub: sin red no pasa nada.
- Ajustes del juego por `localStorage['ilogic.settings']` antes de cargar.

## Antes de tocar...

- **Graficos**: nunca a mano en `public/assets/atlas`; skill `arte-retro-diffusion` (y **no gastar
  dinero en Retro Diffusion sin permiso**).
- **Reglas o IA**: `tests/aiGolden.test.ts` falla si cambia como se juega. Bien si era a proposito.
- **Refactor (reescribir sin cambiar nada)**: `npm run huella` antes y despues; la huella total tiene que
  ser la misma. Juega 24 partidas IA contra IA (4 juegos de reglas, mapas de 16 a 32, generales y una
  escuadra del jugador con orden) y resume cada suceso y el estado tras cada ronda.
- **Una version**: skill `sacar-version`.
- **GitHub**: la web se publica con cada push a `main` si pasa `npm run check`.
