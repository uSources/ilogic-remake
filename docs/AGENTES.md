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
| Jugarlo en un navegador | `npm run build:single` y abrir `dist-single/ilogic.html` | Interaccion, tactil, raton |

`npm run shots` deja `tests/visual/out/index.html` con cada escena: captura actual, referencia y
diferencias en rojo. Leer las imagenes `.diff.png` para ver que ha cambiado. Si el cambio es a
proposito: `npm run shots:update` y decirlo en el commit.

## Automejora

Solo cuando el usuario lo pide (skill `automejora`). Medidas:

- `npm run metrics`: nota del juego 0-100 por partes con 120 partidas IA contra IA; se compara con
  `improve/baseline.json`. `--save-baseline` al aceptar un cambio.
- `npm run arena -- --games 200`: IA actual contra `improve/ai-baseline/ai.ts`; un cambio de IA solo vale
  si el intervalo del 95 % queda por encima del 50 %. `--snapshot` al aceptarlo.
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

Mapa en texto con coordenadas; `+01` unidades propias, `-04` enemigas; `end` hace jugar a la IA y
pasa el dia; `ai` juega los dos bandos; `state` da el JSON de la partida (se puede abrir en el juego
con la API de depuracion). Si una orden falla, la linea empieza por `error:` y el programa sale con 1.

## API de depuracion en el navegador (`window.ilogicDebug`)

Desde Playwright (`page.evaluate`) o la consola:

```js
await ilogicDebug.ready();                                  // espera al menu
ilogicDebug.freeze();                                       // sin animaciones (capturas comparables)
await ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, fog: false });
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

## Antes de tocar...

- **Graficos**: nunca a mano en `public/assets/atlas`; skill `arte-retro-diffusion` (y **no gastar
  dinero en Retro Diffusion sin permiso**).
- **Reglas o IA**: `tests/aiGolden.test.ts` falla si cambia como se juega. Bien si era a proposito.
- **Una version**: skill `sacar-version`.
- **GitHub**: la web se publica con cada push a `main` si pasa `npm run check`.
