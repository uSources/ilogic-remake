# Plan: que se pueda jugar bien en el móvil

## Estado (30-10-2026)

En curso. Hechas: V0 (comprobación de lo que se sale de la pantalla: `npm run fuera`), V1 (que nada se
corte) y la parte de V3 de mover con dos toques. Siguiente: V2 (más mapa). El juego ya funciona con el dedo
y se instala como app (PWA, versión 0.4.0).

## Cómo está ahora

Probado con Playwright en un móvil típico (393×852 CSS, densidad 2, táctil), en vertical, en
horizontal (852×393) y en uno pequeño (360×640), abriendo `dist-single/ilogic.html`.

**Pantallas que se cortan**
- **Inicio:** en horizontal solo se ve la tarjeta Nueva partida; Campaña y la fila de abajo quedan
  fuera y no se puede desplazar. En vertical, el aviso de licencia de abajo se sale por la derecha.
- **Menú de partida (pausa):** en vertical se sale un poco por los dos lados; en horizontal no se ven
  Rendirse ni Salir al menú.
- **Cómo se juega:** en vertical el texto se corta por la derecha (no hace salto de línea); en
  horizontal la tabla de controles se sale por abajo.

**El mapa se ve poco**
- La casilla mide 48 px en vertical (64 px en horizontal): buen tamaño para el dedo, pero caben unas
  8 columnas en vertical.
- **En horizontal la interfaz tapa más de la mitad del mapa:** ficha del edificio, ficha de la
  unidad, bandeja "Sin mover" y la barra de arriba ocupan casi toda la altura (393 px).
- En vertical la ficha de abajo y el botón Amenaza tapan las dos últimas filas.
- La columna 0 queda pegada al borde de la pantalla: las unidades del borde se tocan mal y quedan
  bajo el borde redondeado o la muesca del teléfono.

**Mover cuesta demasiado**
- Mover una unidad una casilla: tocar la unidad (señala), tocar otra vez (selecciona), tocar el
  destino (señala), tocar otra vez (confirma) y elegir en el menú. **Cuatro toques y el menú.**
  "Primer toque señala, segundo confirma" viene del cursor de teclado; con el dedo sobra.
- Arrastrar para mover solo funciona tras mantener pulsado; el gesto natural (arrastrar la unidad)
  mueve el mapa.

**Cosas de escritorio que estorban**
- Teclas en los botones (E, TAB, T, ESC, H, O) que en el móvil no existen.
- La explicación de los gestos sale como aviso grande encima del mapa y, en horizontal, **tapa el
  menú de acciones** de la unidad.
- En horizontal, la ficha del terreno enseña un cuadrado verde liso en vez del dibujo de la casilla.

**Lo que ya funciona bien:** el lienzo nítido a la densidad del móvil, el pellizco por pasos enteros,
mantener pulsado para el alcance, los botones de 48 px de la barra de arriba y del menú de pausa, y
la barra de arriba en vertical.

## Fase V0: ver y probar el móvil sin un móvil

Antes de cambiar nada, poder comprobarlo cada vez, como con las capturas de escritorio.

- `npm run shots` añade escenas de móvil: inicio, partida, pausa, ayuda, compra y menú de acciones
  en **vertical 393×852**, **horizontal 852×393** y **pequeño 360×640**, con `hasTouch` e `isMobile`.
- Comprobación automática de que **nada se sale de la pantalla**: en cada escena, ningún elemento
  visible del HUD con `getBoundingClientRect()` fuera de la ventana (salvo los que tienen scroll).
- Una ayuda de toques en `tests/visual/` (tocar la casilla x, y) para escribir recorridos: mover,
  atacar, comprar y terminar el turno solo con el dedo.

**Hecho cuando:** las escenas de móvil están en `tests/visual/ref/` y el control de "nada se sale"
falla hoy en las pantallas de arriba (y sirve para ver que se arreglan).

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

## Fase V2: más mapa

El mapa es el juego: tiene que ocupar casi toda la pantalla.

- **Horizontal:** una sola columna estrecha a un lado (dinero, día, fin del turno, menú) en vez de
  barra arriba, y una ficha compacta que solo sale con algo seleccionado. Objetivo: **el mapa ocupa al
  menos el 75 % de la pantalla** con la ficha abierta, y el 90 % sin ella.
- **Vertical:** la ficha de abajo se pliega a una línea (nombre, vida, movimiento) y se despliega al
  tocarla; la bandeja "Sin mover" pasa a un botón con el número que salta a la siguiente unidad.
- La ficha del terreno enseña el dibujo de la casilla (ver por qué sale el cuadrado verde liso).
- **Margen alrededor del mapa** para poder llevar la columna 0 y la última fila al centro de la
  pantalla, lejos de los bordes.
- Zoom inicial según la pantalla: que quepan unas 9 casillas en el lado corto.

**Hecho cuando:** en las capturas de V0 el mapa ocupa lo dicho y ninguna unidad queda bajo la
interfaz sin poder desplazarla a la vista.

## Fase V3: mover con un toque

El cambio más grande. El ratón y el teclado siguen igual; esto es solo para el dedo.

- **Tocar una unidad propia la selecciona** y enseña su alcance (sin el toque de "señalar").
- **Tocar un destino dentro del alcance mueve** y abre el menú de acciones, con la opción más
  probable marcada. Total: **dos toques y el menú** (ahora cuatro).
- **Tocar un enemigo atacable** enseña la previsión de combate en grande con un botón Atacar; un
  segundo toque sobre el mismo enemigo también ataca.
- **Arrastrar desde una unidad propia la lleva** (como con el ratón, sin mantener pulsado);
  arrastrar desde cualquier otro sitio mueve el mapa.
- Tocar fuera del alcance deselecciona. Mantener pulsado sigue enseñando la ficha y el alcance de
  cualquier unidad, también enemiga.
- Vibración corta al coger, al soltar y al atacar (`navigator.vibrate`, se puede quitar en Opciones).
- El aviso de gestos sale una vez, abajo, pequeño y nunca encima de un menú.

**Hecho cuando:** con la ayuda de toques de V0, mover, atacar, capturar, unir y subir a un transporte
salen en dos toques (más el menú cuando haga falta), y los tests de movimiento siguen igual.

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
- **Batería:** sin animaciones de fondo cuando no pasa nada (bajar a 30 fps en reposo) y menú sin
  fondo vivo por defecto en móvil.
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
| V0 Ver y probar | pequeña | sin ella no se sabe si cada fase mejora algo |
| V1 Que nada se corte | pequeña | arreglos rápidos que ya se notan |
| V2 Más mapa | mediana | lo que más se nota al jugar |
| V3 Mover con un toque | grande | el cambio de controles; toca `GameScene` y necesita V2 para ver el alcance |
| V4 Menús para el pulgar | mediana | se apoya en V3 |
| V5 Como una app | pequeña | independiente, se puede hacer en cualquier momento |
| V6 Móviles reales | — | al final de cada fase grande, no solo al final |

Cada fase en su PR, con las capturas de móvil al día (`npm run shots:update`) y su línea en el
CHANGELOG. El teclado y el ratón no cambian en ninguna fase: los tests de escritorio siguen igual.
