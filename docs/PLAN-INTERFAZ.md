# Plan: interfaz limpia para la partida 3D

## Estado (16-11-2026)

- Fase 1 (base visual: fichas de juguete): **hecha**. Letras, colores y forma en
  `src/hud/styles/base/base.css` y `panel.css`, piezas `Pill` y `Chip` (`src/hud/common/toy.tsx`),
  barra de arriba y fin del turno abajo a la derecha. La estética, en `docs/ESTETICA.md`, "Interfaz".
- Fases 2 y 3 (sin barra, esperar implícito y la rueda): **hechas**, juntas (sin la rueda, quitar la
  barra dejaba sin formar escuadras ni dar órdenes con el ratón). `systems/turn/unitOptions.ts`
  (fichas, rueda y `orderForTile`), `hud/game/ActionChips.tsx` y `RadialMenu.tsx`; clic derecho y
  mantener pulsado en `systems/input/pointerInput.ts`; F y Ctrl+Z en `keyInput.ts`. Cambio sobre el
  plan: bajar carga sigue siendo una ficha (que elige la casilla después) y no casillas verdes, porque
  con el transporte sin mover sus casillas de al lado también son «ir allí».
- Fase 4 (comprar con fichas): **hecha**. `hud/game/BuyGrid.tsx`: rejilla de retratos con su precio, sin
  «Cancelar» (tocar fuera o Esc cierra); un toque compra.
- Fases 5 y 6: pendientes. Ver amenaza (T), en la fase 5.

## Contexto

La interfaz HTML de la partida se diseñó para el 2D: barra de acciones al lado de la unidad, menú de
compra en lista, bandeja con botones, línea de ayuda fija arriba, tarjetas abajo a la izquierda,
todo con paneles azules biselados y letra de píxel. Al usuario no le gustan los menús. Quiere que
casi todo sea automático (tocar una unidad y luego un enemigo = atacar; tocar una ciudad = ir a
capturarla) y una interfaz **súper limpia**, con la información en ventanas que salen cuando hacen
falta. Referencias: Into the Breach (lo que pasará se ve en el tablero), Advance Wars Re-Boot Camp
(azul/rojo y pocas opciones), Polytopia (tocar la cosa y salen solo sus iconos), Wargroove (la
previsión de daño encima del objetivo).

Decidido con el usuario:
- **Estética «caja de juguete»**: fichas redondeadas y gorditas, borde oscuro, sombra dura como de
  plástico, base crema y colores de bando. Letra redonda. Los iconos de píxel que ya hay van dentro
  de las fichas.
- **«Esperar» implícito**: tras mover, si la unidad ya no puede hacer nada útil, termina sola. Si
  aún puede hacer algo, sigue elegida con solo esas fichas al lado. Elegir otra unidad o terminar
  el turno cuenta como esperar.
- **Lo raro va en una rueda**: clic derecho (sin arrastrar) o mantener pulsado sobre la unidad o el
  grupo. Ahí van órdenes, escuadras, disolver y deshacer escuadra. Las teclas siguen igual.

## Cómo queda (resumen)

- **En pantalla siempre, solo 4 piezas**:
  - arriba a la izquierda, la pastilla de dinero (al pasar el ratón, el desglose);
  - arriba en el centro, el día y el clima;
  - arriba a la derecha, el botón de menú;
  - abajo a la derecha, «Fin del turno» con las unidades que quedan por mover.
- **Abajo a la izquierda, solo si hace falta**: «Sin mover · N» (Tab) y las escuadras como fichas
  pequeñas. Ver amenaza (T) y ver órdenes (V) pasan a dos iconos pequeños en esa esquina.
- **Fuera**: la línea fija de ayuda (va a la ayuda y a consejos de la primera partida) y la barra de
  acciones con texto.
- **Información cuando se pide**:
  - al pasar por una casilla un rato, una ficha pequeña junto a ella (unidad: vida y fuerza;
    terreno: defensa);
  - con Alt o pulsación larga, la tarjeta entera;
  - sobre un enemigo atacable, la previsión compacta encima (daño, % de matar, contraataque).
- **En el tablero**: lo que ya dibuja el motor (aros, flechas, letra de la orden, fantasma). Más la
  vida como número cuando no está entera y las casillas donde puede bajar un transporte en verde.

## Fases (cada una, su PR desde `main`, con el juego jugable al acabar)

### Fase 1. Base visual: fichas de juguete
- **Tokens nuevos** en `src/hud/styles/base/` (nuevo `tokens.css`, importado primero en
  `src/hud/hud.css`):
  - crema, tinta, colores de bando, radio, borde, sombra dura y tamaños;
  - mantener los nombres de variables que ya se usan (`--ink`, `--panel`, `--text`...) y cambiar
    sus valores, para que lo viejo no se rompa a la vez.
- **Letras**: Fredoka (títulos y números) y Nunito (texto), **dentro del proyecto** (woff2 en
  `src/hud/fonts/`, licencia OFL). No se cargan de Google Fonts: el juego tiene que funcionar en
  un solo HTML y sin red (`scripts/singleFile.mjs`). La letra de píxel `Ilogic` queda para el logo.
- **Piezas comunes** en `src/hud/common/`: `Chip` (icono con número o letra), `Pill` (pastilla
  de esquina) y `Card` (tarjeta). Las fichas de acción, la rueda y la compra se montan con ellas.
- Rehacer con esas piezas `game/TopBar.tsx` (dinero, día, menú) y el botón de fin de turno.
- Apuntar la estética de la interfaz en `docs/ESTETICA.md` (sección nueva «Interfaz»), como pide
  CLAUDE.md para lo que se decide de estética.

### Fase 2. Sin barra: fichas de contexto y esperar implícito
Todo lo que se decide va en `src/view3d/systems/turn/` (puro y con tests). El HUD solo pinta.
- **`unitBar.ts` → `contextActions.ts`**: solo lo que no se hace ya con un clic:
  - capturar (si ya está encima);
  - reparar (suministros);
  - bajar carga, solo cuando hay pasajero y casilla.
  - «Esperar», órdenes, escuadras, deshacer y disolver salen de aquí: van a la rueda o son
    implícitos.
- **Esperar implícito** en `turnControls.ts`:
  - tras un movimiento, si `contextActions` queda vacío, se manda `wait` solo;
  - si no, la unidad sigue elegida, y al elegir otra o terminar el turno se manda `wait`;
  - Esc y Ctrl+Z deshacen el movimiento mientras siga elegida (ya existe `undoMove`).
- **Bajar carga sin opción**: con un transporte cargado elegido, las casillas donde puede bajar
  alguien se marcan (puerto `TileMarks`, color nuevo) y tocar una baja al primer pasajero que
  puede. Va junto al toque inteligente (`clickIntent.ts`).
- **HUD**: `game/PopMenu.tsx` deja de usarse para la unidad. Un componente nuevo `ActionChips.tsx`
  pinta 1-3 fichas solo con icono (nombre al pasar el ratón), pegadas a la unidad con `Popover` y
  `placeBeside` (`src/hud/common/placement.ts`), que ya existen.
- **`MenuView`** (`turnControls.ts`, `hudBridge.ts`): `kind` pasa a `'chips' | 'radial' | 'buy'`.

### Fase 3. La rueda (clic derecho o mantener pulsado)
- **`systems/turn/radialOptions.ts`** (puro): las opciones de la unidad o del grupo, con lo que
  ya dicen `availableActions` y `canDoWithSelection` (`src/core/actions`):
  - órdenes atacar, capturar y defender, y cancelar orden;
  - formar, sacar, renombrar y deshacer escuadra;
  - disolver (la de peligro, separada).
- **`systems/input/pointerInput.ts`**:
  - el clic derecho sin arrastrar (por debajo de un umbral de movimiento) abre la rueda; arrastrar
    con el derecho sigue girando la cámara;
  - mantener pulsado ya existe en `src/controls/pointer.ts` (`longPress`) y se usa con el dedo.
- **Clic derecho en una casilla con algo elegido = orden ahí**: la que tiene sentido (enemigo →
  atacar, edificio → capturar, otra → defender). Es el mando `orderHere` (F), que hoy no hace
  nada en 3D. Cierra el punto 6 de `docs/IDEAS.md`.
- **HUD**: `RadialMenu.tsx`, con 4-8 fichas en círculo alrededor de la unidad (anclada con
  `scene.anchorOf`). Esc o tocar fuera la cierra.

### Fase 4. Comprar con fichas
- Tocar una fábrica propia abre encima una rejilla de retratos (`Chip` con el precio). Las que no
  se pueden pagar van apagadas y el motivo sale al pasar el ratón (`menuItems.ts` `buyItem` ya lo
  calcula).
- Sin fila «Cancelar»: tocar fuera o Esc cierra. Un toque compra.
- Rehacer `PopMenu.tsx` en modo compra o un `BuyGrid.tsx` nuevo; quitar `popmenu.css` si queda
  sin uso.

### Fase 5. Información cuando se pide
- **Ficha de la casilla**:
  - al parar el ratón ~400 ms sobre una casilla, una `Card` pequeña junto a ella;
  - con Alt o pulsación larga, la tarjeta entera (lo que hoy hay en `game/Cards.tsx`);
  - los datos ya salen de `src/ui/models/*`;
  - fuera las tarjetas fijas de abajo a la izquierda.
- **Previsión** (`game/Forecast.tsx`): más compacta, encima del objetivo (daño, % de matar y
  contraataque); el detalle, con Alt.
- **`game/Tray.tsx`**: solo «Sin mover · N» y las escuadras como fichas; amenaza y órdenes como
  dos iconos.
- **Arreglar de paso**: `toggleThreat` no está enganchado en `match3d.ts` y T no hace nada en 3D.
- **Fuera la línea fija** (`HINT_3D` en `hudBridge.ts`).
- **Vida en el tablero**: número en el modelo cuando no está entera. La decide `systems/board`
  (`UnitLook`) y la dibuja `engine/pieces/badges.ts`, como la letra de la orden.

### Fase 6. Lo demás con la misma estética
- Pausa, opciones, pantalla final, avisos, cartel del día y ayuda (`src/hud/menus/*`,
  `overlays/*`), con las piezas de la fase 1.
- Quitar `styles/legacy.css` y los estilos de paneles que el 3D no publica: minimapa, general,
  misión, `MoveTip`, combate y laboratorio. Se rehacen con las piezas nuevas cuando se porten
  (`docs/IDEAS.md`, «Vista 3D»).
- Menú de inicio y nueva partida: misma piel. Si se alarga, en su propia PR.

## Documentación (en cada fase lo suyo)
- `docs/PLAN-INTERFAZ.md`: este plan dentro del repositorio, con el estado de cada fase.
- `docs/SPEC-INTERFAZ.md` y `src/i18n/*/help.ts`: los controles nuevos (sin barra, la rueda, clic
  derecho = orden, Alt = detalle, bajar tocando la casilla verde).
- `docs/ARQUITECTURA.md` («Vista 3D» e «Interfaz HTML»): `contextActions`, `radialOptions` y el
  nuevo `MenuView`.
- `docs/IDEAS.md`: quitar el punto 6 al acabar la fase 3.
- `CHANGELOG.md` (`[Sin publicar]`) lo escribe la versión que lo saque.

## Cómo se comprueba
- **`npm run check`** en cada fase. Tests nuevos o ampliados (puros, sin navegador):
  - `tests/turnControls.test.ts`: esperar implícito (mover sin nada más que hacer → `wait`; con
    algo más → sigue elegida; elegir otra → `wait`), bajar tocando la casilla y clic derecho =
    orden;
  - `tests/contextActions.test.ts` y `tests/radialOptions.test.ts`: qué sale en cada caso (sobre un
    edificio, transporte cargado, suministros, grupo, escuadra);
  - `tests/i18n.test.ts`: las claves nuevas en los dos idiomas.
- **En el navegador** (`npm run dev`, `/?seed=2013` y `?seed=7`), con capturas antes y después:
  elegir, mover, mover y atacar, capturar, transporte que carga y baja, comprar en una fábrica,
  rueda con clic derecho, orden con clic derecho en casilla, Tab, T y V, fin de turno y turno de
  la IA. Sin errores en la consola.
- **Móvil**: `resize_window` a 375×812. Comprobar pulsación larga = rueda, arrastrar = cámara, que
  las fichas tengan al menos 44 px y que no tapen la unidad.
- **Escala de la interfaz** (`settings.uiScale`) a 0,75 y 1,5: las fichas siguen pegadas a su
  casilla.
