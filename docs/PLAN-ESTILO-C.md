# Plan: toda la interfaz en estilo C

Fecha: 26-11-2026. Cada fase va en su propia PR desde `main`.

## Contexto

El lienzo de diseño «Ilogic · Rediseño de Jugar en línea» tiene una página, «Todo en estilo C», con
doce tableros. Pasan toda la interfaz al **menú clásico de texto** de Inicio: títulos grandes en
Fredoka sobre el tablero 3D, sin marcos. La elegida crece y lleva la flecha dorada delante. Lo que se
lee aparte va en fichas oscuras translúcidas. El usuario eligió este diseño para seguir con la
interfaz.

Hechos antes de este plan: Inicio ([#203](https://github.com/uSources/ilogic-remake/pull/203)), y
Novedades, Aprender y Opciones ([#208](https://github.com/uSources/ilogic-remake/pull/208)).

Piezas comunes:
- `hud/menus/TextEntry.tsx` y `styles/menus/textlist.css`: una entrada de la lista, con su nota
  debajo y su tecla al lado. Cada pantalla cambia los tamaños con `--entry-size` y `--entry-size-sel`.
- Los colores de la noche están en `base.css`: `--menu-gold`, `--menu-title`, `--menu-note`,
  `--menu-own` (lo tuyo, azul claro) y `--menu-danger` (lo enemigo y lo que no se deshace).

## Fase 1. Pausa y final (hecha)

- **Pausa** (tablero «Pausa en la partida»). Va sobre el tablero desenfocado y oscuro a la izquierda.
  - Arriba, lo que se juega, el día y el mapa, y «Pausa» en grande.
  - La lista: Seguir, Ver amenaza enemiga, Ver órdenes (si alguna unidad lleva), Opciones, Cómo se
    juega, «Guardar y salir al menú» y, aparte y en rojo, Rendirse («Te pedirá que lo confirmes»).
  - «Fin del turno» sale de la pausa: su botón y su tecla siguen en la partida. «Guardar partida»
    también sale: al salir de la página la partida ya se guardaba sola (`keepSaved`), así que salir
    no pierde nada y lo dice. Por la red, o si el modo no se guarda, es «Salir al menú» y pide
    confirmarlo.
  - A la derecha, «Cómo va»: unidades, edificios e ingresos al día, tuyos y del enemigo
    (`standingVM`). Con niebla no se sabe cuántas unidades tiene el enemigo: sale «?».
- **Final** (tablero «Victoria»):
  - Arriba, lo jugado (escaramuza y mapa, o la misión) y el resultado en grande: dorado si ganas,
    rojo si pierdes. Debajo, por qué ha acabado.
  - Las cifras: días, unidades perdidas, destruidas, edificios («5 de 37») y, con límite de días,
    los puntos. Con misión, la mejor marca.
  - La lista: «Otra escaramuza» (mismas reglas, otro mapa), la revancha, la siguiente misión o
    reintentar, «Mirar el tablero» y «Volver al menú».
  - La gráfica del valor de los ejércitos va en su ficha oscura, a la derecha.
  - El final es un panel de teclas (`MatchEnd`, `systems/hud/matchEnd.ts`): flechas, Tab y Enter, y
    nada del mapa lo quita (era la idea 11). «Mirar el tablero» lo esconde: el ratón mueve la cámara
    y Esc o Enter lo vuelven a enseñar.

## Lo que queda

Dos cosas valen para todas las fases. Lo que está en el lienzo se hace como está. Lo que el lienzo
no dibuja se pregunta con capturas, sin suponerlo. Antes de cada fase se comparan las capturas de
antes y después con su tablero.

### Fase 2. Escaramuza y Campaña (hecha)
Se dibujaron tres formas de cada una en el lienzo, en su página «Escaramuza y Campaña». El usuario
eligió la A de Escaramuza y la C de Campaña. Las dos van como la pausa: a la izquierda, lo pequeño
en oro, el título en grande y la lista; a la derecha, en su ficha oscura, lo que se va a jugar
(`MenuScreen.tsx`, `styles/menus/screen.css`). El velo de detrás oscurece hasta la ficha.
- **Escaramuza** (A, «todo en la lista»): Empezar, «Modo ◂ Normal ▸» con lo que da debajo,
  «Rival ◂ La IA ▸» y Atrás. En Personalizada, sus nueve opciones salen debajo del rival, más
  pequeñas y apartadas con una raya.
  - Cada valor se cambia con ← → o con ◂ ▸, y pulsar el nombre es un paso adelante
    (`ChoiceEntry.tsx`, pieza nueva).
  - A la derecha, el mapa, de qué es, su código (se puede escribir) y «Otro mapa» (R).
- **Campaña** (C, «el camino de misiones»): las misiones son puntos unidos por una raya, en oro lo
  ya andado.
  - Las hechas llevan ✓ en oro; las abiertas, su número en un aro dorado (más grande la elegida); las
    cerradas, un candado.
  - Las cerradas salen apagadas, con «termina la anterior para abrirla» (`disabled` de `TextEntry`,
    el mismo de la fase 4).
  - Debajo de cada nombre va su objetivo y cómo está («hecha en 9 días»); arriba, «1 de 6 hechas».
  - A la derecha, la ficha de la elegida: su mapa, de qué va, el objetivo en oro, la mejor marca y
    «Jugar ▸».
  - Las flechas saltan las cerradas y llegan a «Atrás».
- En el móvil, la ficha va debajo de la lista. En Escaramuza, los valores de las nueve opciones van a
  la derecha y, si no caben al lado del nombre, bajan debajo.
- Descartadas (en `docs/IDEAS.md`, con el porqué): Escaramuza B («los modos son la lista») y C
  («lista corta y las reglas a la vista»); Campaña A («lista y ficha de la elegida») y B («la elegida
  se abre en la lista»).

### Fase 3. La partida: arriba y abajo (tablero «Partida: tu turno») (hecha)
- Arriba a la izquierda, «Tu turno» con el punto del bando (o «Turno enemigo», con el punto rojo).
  Debajo, el día, el clima (no está en el tablero, pero no se quita) y el dinero con lo que entra al
  día. El día y el dinero tienen su desglose al pasar el ratón.
- Arriba a la derecha, el enemigo: sus edificios y, sin niebla, sus unidades (`standingVM`, el mismo
  de «Cómo va»). Al lado, el botón de pausa con su tecla. Sustituye al ☰.
- Abajo a la derecha, en fila, «Acabar turno ▸» en texto (antes «Fin del turno») y el minimapa en
  su ficha oscura.
  - Debajo de «Acabar turno», «N sin mover», que lleva a la siguiente.
  - «¿Terminar?» sale en rojo y, por la red, parpadea al acabarse el tiempo.
- Abajo a la izquierda, lo que hay bajo el cursor (`TileTip.tsx`), en dos columnas de texto. Una es
  el sitio, con sus chapas; la otra, la unidad, con retrato, de quién es y su vida en diez pastillas.
  Sale al momento (ya no tapa nada) y con Alt crece.
- La línea de ayuda de arriba del tablero («Clic o Enter: elegir…») **se descarta** (decidido con el
  usuario el 26-11-2026; el porqué, en `docs/IDEAS.md`, «Descartado»). En el lienzo nombra teclas que
  en el juego hacen otra cosa (Q es la orden de atacar, no girar la cámara), y la interfaz 0.12.0
  quitó las líneas de ayuda fijas.

### Lo que sale de las casillas (hecho; decidido con el usuario el 26-11-2026)
En el lienzo, la página «Lo que sale de las casillas» tiene tres formas: A, el bocadillo con tallo;
B, la corona de texto; C, el cartel que se levanta. Se eligió **A** con **las cifras de B** para la
previsión.
- **A** (`common/Callout.tsx`, `game/TileMenu.tsx`): sirve para todo lo que sale de una casilla y se
  maneja igual que la pausa (lista de texto, flecha dorada, Intro). Sale rápido y siempre se ve de
  qué casilla viene.
  - Hoy salen así las fichas de la unidad, su rueda y el aviso de elegir casilla.
  - Colocación: `placeCallout` (`common/placement.ts`, con tests).
- La previsión: el daño sube como cifra grande sobre el enemigo y lo que te devuelve sale a los pies
  de tu unidad. Con Alt, el detalle va en el bocadillo con tallo rojo.
- La compra en la fábrica no va en el bocadillo: con diez unidades no cabe encima ni debajo de la
  casilla. Va a la derecha, como en el tablero 10 (fase 5).

### Fase 4. Unidad elegida y previsión (tableros 8 y 9) (hecha; decidido con el usuario el 26-11-2026)
El bocadillo con tallo ya cubría lo que hace la unidad, y las cifras que suben, la previsión. Se
añadió lo de los tableros que faltaba:
- «Atacar» con cuántos hay a tiro, primero y solo si hay alguno (`chipChoices`,
  `systems/turn/unitOptions.ts`). Tocar un enemigo sigue atacando y tocar una casilla, moviendo.
- «Capturar» apagado con el porqué (`captureBlockAt` del núcleo): solo en las que capturan y solo si
  el bocadillo ya sale por otra cosa. Lo apagado es `disabled` de `TextEntry`: se ve, pero no se
  señala ni se elige.
- Elegir «Atacar» lleva a «Elige a quién atacar» (tablero 9; `systems/turn/targetPick.ts`): ← → pasan
  de un enemigo a otro con su previsión, Intro ataca, Esc vuelve, y con el ratón se señala pasando
  por encima y se ataca tocando. El bocadillo no tapa a los enemigos a tiro (`placeCallout`, `avoid`).
- Abajo a la izquierda, la ficha de la unidad elegida (`ChosenUnit.tsx`, `chosenUnitVM`): retrato,
  nombre, vida, «Mueve · Alcance · Visión» y, en dorado, lo que sabe hacer. Sin nada elegido, lo de
  bajo el cursor, como antes.
- No se pusieron «Esperar», «Cancelar», la munición ni el combustible (`docs/IDEAS.md`,
  «Descartado»). La línea de ayuda del tablero 8 («Lo azul es hasta dónde llega…») tampoco, por lo
  mismo que en la fase 3: queda por decidir con el usuario.


### Fase 5. Fábrica (tablero 10) (hecha)
- Una lista a la derecha con retrato, nombre y precio (`game/BuyList.tsx`). Se comparó con capturas
  con la misma lista en el bocadillo con tallo y el usuario eligió la derecha. Con las diez unidades
  de la fábrica, el bocadillo no cabe encima ni debajo de la casilla, se aparta y la tapa.
- La elegida va en grande. Al pie dice de qué va (mueve, alcance y visión; contra qué es fuerte y
  débil) y con cuánto te quedas.
- Lo que no te llega sale apagado y con lo que falta. Se puede señalar igual, para leer de qué va.
- Lo decide `systems/turn/buyItems.ts`, con tests.
- Se maneja con flechas, Enter y Esc, como la pausa (`systems/turn/buyKeys.ts`, un `KeyPanel`).
- Mientras se compra, se van de la derecha el enemigo y la pausa de arriba, «Acabar turno» y el
  minimapa. En el móvil, la lista es una hoja abajo.
- Sustituye al abanico (`BuyFan.tsx` y `fanAround`, quitados; `IDEAS.md`, «Descartado»).

### Fase 6. Cambio de turno (tablero 11)
Una franja oscura en el centro con «Día 12», «Turno de Rojo» y «Rojo está pensando…», que late.
Falta decidir con capturas si sustituye a la banderola (el cartel del día, en 3D) o va además de
ella.

Las fases 3 a 6 cambian piezas que el plan de la interfaz 2 («mesa de juego»,
`docs/PLAN-INTERFAZ-2.md`) puso sobre el tablero. Al hacerlas, se apunta en `docs/ESTETICA.md` lo
que se queda y en `docs/IDEAS.md`, en «Descartado», lo que sale, con el porqué.

## Cómo se comprueba (cada fase)
- `npm run check`, con tests de lo que decide cada sistema (`tests/keyRouter.test.ts`,
  `tests/matchEnd.test.ts`, `tests/standing.test.ts`).
- En el navegador (`npm run dev`, `/?seed=2013`): escritorio (1280×800), pantalla baja (1366×640) y
  móvil (390×844), con teclado y ratón, y sin errores en la consola.
