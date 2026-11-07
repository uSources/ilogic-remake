# Guia para agentes de IA

Como trabajar en Ilogic sin una persona mirando: que comprobar y con que herramientas. Las reglas del
codigo estan en la skill `ilogic-code`; la arquitectura en `docs/ARQUITECTURA.md`.

## Comprobar el trabajo

| Que | Orden | Cuando |
|---|---|---|
| Tipos, lint, formato, tests | `npm run check` | Siempre antes de terminar |
| Que nada visual cambie sin querer | `npm run shots` | Cambios en dibujo, interfaz, escenas, graficos |
| Ver una regla funcionando | `npm run play -- --seed 7 -e "..."` | Cambios de reglas o IA |
| Equilibrio | `npm run balance -- run ...` | Cambios de numeros o de IA (skill `equilibrar`) |
| Teclado en un navegador real (Tab, foco) | `npm run keys` | Cambios en teclado, `main.ts` o cuadros de texto |
| Jugarlo en un navegador | `npm run build:single` y abrir `dist-single/ilogic.html` | Interaccion, tactil, raton |

`npm run shots` deja `tests/visual/out/index.html` con cada escena: captura actual, referencia y
diferencias en rojo. Leer las imagenes `.diff.png` para ver que ha cambiado. Si el cambio es a
proposito: `npm run shots:update` y decirlo en el commit.

## Automejora

Solo cuando el usuario lo pide (skill `automejora`). Medidas:

- `npm run metrics`: nota del juego 0-100 por partes con 120 partidas IA contra IA; se compara con
  `improve/baseline.json`. `--save-baseline` al aceptar un cambio.
- `npm run arena -- --games 200`: la IA del juego contra la de referencia (la misma con los pesos guardados en
  `improve/ai-baseline.json`); `--candidate fichero.ts` prueba otro perfil (`AiProfile`: comportamientos,
  razones de ataque, pesos) contra la del juego. Un cambio de IA solo vale si el intervalo del 95 % queda
  por encima del 50 %. `--snapshot` guarda los pesos de ahora al aceptarlo.
- `npm run fuzz`: invariantes (`tools/improve/invariants.ts`) en partidas con jugadas al azar e IA;
  `--repro N` para ver una partida entera.
- `improve/DIARIO.md`: todo lo probado. Leerlo antes de proponer; apuntar tambien lo descartado.

## Partida por texto (`npm run play`)

```bash
npm run play --silent -- --seed 7 --size 20 -e "status; units 0; map"
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

## API de depuracion en el navegador (`window.ilogicDebug`)

Desde Playwright (`page.evaluate`) o la consola:

```js
await ilogicDebug.ready();                                  // espera al menu
ilogicDebug.freeze();                                       // sin animaciones (capturas comparables)
await ilogicDebug.startGame({ seed: 7, size: 20, theme: 'Plains', fog: false });
await ilogicDebug.startGame({ seed: 7, rival: 'human' });  // dos personas en la misma pantalla, por turnos
await ilogicDebug.startGame({ mission: 'tutorial' });
await ilogicDebug.startGame({ state: jsonDeUnaPartida });  // p. ej. el de `npm run play ... state`
ilogicDebug.game();    // { phase, busy, ended, day, cursor }
ilogicDebug.state();   // GameState (copia)
ilogicDebug.ui();      // estado de la interfaz HTML (fichas, menus...)
await ilogicDebug.idle();                                   // espera a que acabe el turno enemigo
await ilogicDebug.toMenu();
```

Para jugar, usar teclado y raton de Playwright como un jugador (Enter, flechas, Tab, E para terminar
turno; clic en casillas). `window.ilogic` es el juego de Phaser, por si hace falta algo mas.

Normas al probar en el navegador:
- Abrir `dist-single/ilogic.html` por `file://`. **Nunca** `vite preview` ni servidores.
- Cortar la red (`page.route(/^https?:\/\//, r => r.abort())`): Novedades consulta GitHub.
- Ajustes del juego por `localStorage['ilogic.settings']` antes de cargar (p. ej. `{ "menuBg": "classic" }`).

## Laboratorio de animaciones (`#lab`, `npm run lab:record`)

Para ver y ajustar como se anima mover, atacar, el contraataque y una unidad destruida sin jugar:

- Abrir el juego con `#lab` al final de la direccion (`dist-single/ilogic.html#lab`, o la web
  publicada): una unidad propia y una enemiga en campo abierto, con botones para cada accion,
  elegir las dos unidades y camara lenta (a un cuarto de velocidad). Cada boton empieza de cero.
- Desde Playwright: `ilogicDebug.lab({ attacker: 'Artillery', defender: 'Tank', slow: true, play: 'counter' })`.
- `npm run lab:record` (con el juego compilado) graba las cuatro acciones en video en
  `tests/visual/out/lab/` y dice cuanto dura cada una; con ffmpeg instalado, ademas un GIF y una hoja
  de fotogramas por accion (`counter.png`...), que se pueden mirar como imagen. Opciones:
  `-- --attacker Bomber --defender Tank --slow --out carpeta` (para comparar antes y despues).

Codigo: `src/lab.ts` (la partida de mentira) y `src/scenes/game/labMode.ts` (las animaciones son las
de siempre: `EventPlayer` en `src/scenes/game/playback.ts`).

## Antes de tocar...

- **Graficos**: nunca a mano en `public/assets/atlas`; skill `arte-retro-diffusion` (y **no gastar
  dinero en Retro Diffusion sin permiso**).
- **Reglas o IA**: `tests/aiGolden.test.ts` falla si cambia como se juega. Bien si era a proposito.
- **Refactor (reescribir sin cambiar nada)**: `npm run huella` antes y despues; la huella total tiene que
  ser la misma. Juega 24 partidas IA contra IA (4 juegos de reglas, mapas de 16 a 32, generales y una
  escuadra del jugador con orden) y resume cada suceso y el estado tras cada ronda.
- **Una version**: skill `sacar-version`.
- **GitHub**: la web se publica con cada push a `main` si pasa `npm run check`.
