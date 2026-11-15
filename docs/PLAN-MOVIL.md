# Plan: que se pueda jugar bien en el móvil

## Estado (15-11-2026)

Sin empezar. El juego se instala como app (PWA), pero jugar una partida entera en un móvil es
incómodo. Desde que el juego es 3D, lo que se midió sobre el mapa 2D (tamaño de casilla, cuatro
toques para mover, arrastrar con pulsación larga) ya no vale: la partida 3D se juega tocando (tocar
una unidad la elige, tocar una casilla azul la mueve y abre su menú: **dos toques y el menú**) y
arrastrar con un dedo desplaza la cámara. **Falta para el dedo:** pellizcar para acercar y girar la
cámara con dos dedos (`src/view3d/pointerInput.ts` solo sabe de botones del ratón y de la rueda).

## Cómo está ahora (medido antes del 3D: la interfaz HTML es la misma)

Probado con Playwright en un móvil típico (393×852 CSS, densidad 2, táctil), en vertical, en
horizontal (852×393) y en uno pequeño (360×640).

**Pantallas que se cortan**
- **Inicio:** en horizontal solo se ve la tarjeta Nueva partida; Campaña y la fila de abajo quedan
  fuera y no se puede desplazar. En vertical, el aviso de licencia de abajo se sale por la derecha.
- **Menú de partida (pausa):** en vertical se sale un poco por los dos lados; en horizontal no se ven
  Rendirse ni Salir al menú.
- **Cómo se juega:** en vertical el texto se corta por la derecha (no hace salto de línea); en
  horizontal la tabla de controles se sale por abajo.

**La interfaz tapa el tablero**
- **En horizontal la interfaz tapa más de la mitad de la pantalla:** ficha del edificio, ficha de la
  unidad, bandeja "Sin mover" y la barra de arriba ocupan casi toda la altura (393 px).
- En vertical la ficha de abajo tapa la parte de abajo del tablero.

**Cosas de escritorio que estorban**
- Teclas en los botones (E, TAB, T, ESC, H, O) que en el móvil no existen.
- La línea de ayuda de abajo explica el ratón (clic, botón central, botón derecho, rueda).

## Fase V0: ver y probar el móvil sin un móvil

Antes de cambiar nada, poder comprobarlo cada vez. Ya no hay capturas comparadas (`npm run shots`
se quitó con el 2D): hace falta una forma nueva de abrir inicio, partida, pausa, ayuda, compra y
menú de acciones en **vertical 393×852**, **horizontal 852×393** y **pequeño 360×640**, con un
control de que **nada se sale de la pantalla** (ningún elemento visible del HUD con
`getBoundingClientRect()` fuera de la ventana, salvo los que tienen scroll).

**Hecho cuando:** ese control existe y falla hoy en las pantallas de arriba.

## Fase V1: que nada se corte

Arreglos de maquetación, sin cambiar cómo se juega.

- Inicio, pausa, ayuda, Novedades, Opciones, Nueva partida y Campaña caben en las tres pantallas:
  con `max-height: 100dvh` y desplazamiento dentro del panel, nunca de la página.
- En horizontal bajo (alto < 500 px), el inicio pone las tarjetas en fila y se desliza en horizontal.
- La ayuda hace salto de línea; la tabla de controles pasa a lista en pantallas estrechas.
- **Márgenes seguros** (`env(safe-area-inset-*)`) para la muesca y la barra de gestos, en el HUD y
  en el borde del mapa.
- En pantallas táctiles (`pointer: coarse`) se esconden las teclas de los botones.

**Hecho cuando:** el control de V0 no encuentra nada fuera de la pantalla en ninguna escena.

## Fase V2: más tablero

El tablero es el juego: tiene que ocupar casi toda la pantalla.

- **Horizontal:** una sola columna estrecha a un lado (dinero, día, fin del turno, menú) en vez de
  barra arriba, y una ficha compacta que solo sale con algo seleccionado. Objetivo: **el tablero se
  ve en al menos el 75 % de la pantalla** con la ficha abierta, y el 90 % sin ella.
- **Vertical:** la ficha de abajo se pliega a una línea (nombre, vida, movimiento) y se despliega al
  tocarla; la bandeja "Sin mover" pasa a un botón con el número que salta a la siguiente unidad.
- Distancia de la cámara al empezar según la pantalla.

**Hecho cuando:** en las pantallas de V0 el tablero se ve lo dicho.

## Fase V3: el dedo en el 3D

Tocar para elegir y mover ya está. Falta:

- **Pellizcar** para acercar y **girar con dos dedos** (en `src/view3d/pointerInput.ts`).
- **Tocar un enemigo atacable** enseña la previsión de combate en grande con un botón Atacar.
- Mantener pulsado enseña la ficha y el alcance de cualquier unidad, también enemiga.
- Vibración corta al elegir, al mover y al atacar (`navigator.vibrate`, se puede quitar en Opciones).
- Línea de ayuda de abajo con los gestos del dedo en pantallas táctiles.

## Fase V4: menús hechos para el pulgar

- **Menú de acciones y compra como hoja que sube desde abajo** en vertical (al alcance del pulgar),
  con filas de 48 px. En horizontal, en el lado contrario a la unidad.
- **Compra:** cuadrícula de unidades grandes con precio y puntos de mando; tocar una enseña su ficha
  y un botón Comprar.
- **Fin del turno con aviso** si quedan unidades sin mover (con "No volver a preguntar").
- **Deshacer** a mano: botón visible mientras se pueda deshacer el último movimiento.

**Hecho cuando:** una partida rápida (20×20) se juega entera con el dedo sin abrir el menú de pausa
más que para guardar.

## Fase V5: que se sienta como una app

- **Pantalla completa** al empezar una partida (Fullscreen API en Android; en iOS ya lo da la PWA
  instalada) y **pantalla siempre encendida** durante el turno (`navigator.wakeLock`).
- **Orientación:** el juego funciona en las dos; opción en Opciones para fijarla (Android).
- Sin "tirar para recargar", sin seleccionar texto, sin menú del navegador al mantener pulsado
  (`overscroll-behavior: none`, `user-select: none`, `-webkit-touch-callout: none`).
- **Batería:** bajar a 30 fps en reposo (el bucle de `src/view3d/world.ts` dibuja siempre).
- Guardar al salir de la app (`visibilitychange`), por si el sistema la cierra.

**Hecho cuando:** jugando 20 minutos en un Android y un iPhone reales no salta nada del navegador ni
se pierde la partida al cambiar de app.

## Fase V6: prueba en móviles de verdad

- PR con la etiqueta `preview` y probar en Chrome de Android y Safari de iOS, instalada como app y
  sin instalar.
- Lista: una partida rápida entera, la primera misión de la campaña, rotar la pantalla a mitad de
  turno, cambiar de app y volver, sin conexión.
- Apuntar lo que falle como issues (plantilla `fallo`) con la pantalla y el móvil.

## Orden y tamaño

| Fase | Tamaño | Por qué en este orden |
|---|---|---|
| V0 Ver y probar | mediana | sin ella no se sabe si cada fase mejora algo |
| V1 Que nada se corte | pequeña | arreglos rápidos que ya se notan |
| V2 Más tablero | mediana | lo que más se nota al jugar |
| V3 El dedo en el 3D | mediana | los gestos de dos dedos; toca `src/view3d/pointerInput.ts` |
| V4 Menús para el pulgar | mediana | se apoya en V3 |
| V5 Como una app | pequeña | independiente, se puede hacer en cualquier momento |
| V6 Móviles reales | — | al final de cada fase grande, no solo al final |

Cada fase en su PR, con el control de V0 pasando y su línea en el CHANGELOG. El teclado y el ratón no cambian en ninguna fase: los tests de escritorio siguen igual.
