# Ilogic (remake)

Remake en **TypeScript + Phaser 4** de *Ilogic*, el juego de estrategia por turnos
(estilo Advance Wars) que hicimos en Java en 2013. El codigo Java se recupero
descompilando el `.jar`; las reglas, la IA y el generador de mapas se han portado
a partir de el, con vuestros graficos y vuestra musica originales.

## Requisitos

- [Node.js](https://nodejs.org) 20 o superior.

## Uso

```bash
npm install          # la primera vez
npm run dev          # abre el juego en http://localhost:5173 y recarga al guardar cambios
npm test             # tests de la logica (reglas, mapas, IA, guardado)
npm run build        # version para publicar en dist/ (subela a cualquier hosting estatico)
npm run build:single # todo el juego en un solo fichero: dist-single/ilogic.html
```

`dist-single/ilogic.html` se puede abrir con doble clic, sin servidor, y pasarselo a quien sea.

## Como se juega

| Accion | Teclado | Raton |
|---|---|---|
| Mover el cursor | Flechas / WASD | Pasar por encima |
| Aceptar | Enter / Espacio | Clic |
| Atras / cancelar | Esc / Retroceso | Clic derecho (o clic fuera del menu) |
| Menu de partida | Esc en el mapa | Boton ☰ arriba a la derecha |
| Fin del turno | E | Boton "Fin del turno" |
| Mover el mapa | (sigue al cursor) | Arrastrar, o raton en el borde de la pantalla |
| Zoom | + / - | Rueda |
| Siguiente unidad sin mover | Tab | Clic en la bandeja de abajo a la derecha |
| Zona de amenaza enemiga | T | Boton "Ver amenaza enemiga" |
| Alcance de una unidad | Enter sobre ella | Clic derecho (movil: mantener pulsado) |
| Minimapa | M | Clic o arrastrar sobre el minimapa |
| Ayuda | H | Menu de partida > Como se juega |

- Pulsa sobre una unidad tuya (azul) para ver adonde puede ir. Al pasar por encima de una casilla
  se dibuja el camino; pulsa el destino y elige una accion en el menu que aparece junto a la unidad.
  Casillas azules = moverse, moradas = unirse a una unidad igual, turquesa = subir a un transporte,
  rojas = objetivos de ataque. Al pasar por encima de un objetivo sale la prevision de combate:
  margen de dano (del 5 % al 95 % de las tiradas), vida que le quedara y probabilidad de destruirlo.
- Con T se ve en rojo todo lo que el enemigo (lo que ves de el) puede atacar en su proximo turno.
- La ficha de abajo muestra la unidad, el edificio y el terreno bajo el cursor (vida, combustible,
  municion, movimiento, alcance, defensa del terreno...).
- Pulsa sobre una ciudad, fabrica o aeropuerto tuyo libre para comprar unidades.
- Despues de mover, "Atras" deshace el movimiento.
- **Se gana conquistando la Base enemiga.** Con las reglas nuevas (por defecto) capturar va por
  puntos: un edificio tiene 20 (la Base 30) y cada turno la unidad le resta su vida ÷ 10; si se
  mueve o muere se pierde lo avanzado. Con las reglas clásicas de 2013 es instantáneo, pero un
  edificio enemigo hay que capturarlo dos veces (primero queda neutral).
- Reglas nuevas: el defensor que sobrevive contraataca (salvo unidades a distancia) y el daño varía
  poco (el esperado ±10 %). La previsión de combate enseña ambas cosas.
- Durante el turno enemigo, Enter o clic acelera las animaciones.
- En pantallas tactiles: primer toque mueve el cursor, segundo toque confirma; mantener pulsado
  ensena el alcance de una unidad y se pellizca para hacer zoom.
- **Nueva partida** deja elegir reglas (nuevas o clásicas de 2013), tamaño del mapa (20, 32 o 40),
  terreno, niebla, dinero inicial, ingresos y límite de días (al acabar gana quien tenga más puntos:
  valor del ejército + 1000 por edificio). Cada mapa tiene un código (menú de partida) que se puede
  escribir en "Código del mapa" para volver a jugarlo o pasárselo a alguien.
- En el menú de partida: repetir el último turno enemigo y rendirse.
- **Campaña** (menú principal): 6 misiones en mapas hechos a mano, que se desbloquean en orden.
  La primera es un tutorial que va diciendo qué hacer; las demás tienen objetivos propios (capturar
  ciudades, aguantar unos días, escoltar un convoy, destruir a todo el enemigo, asalto final).
  Las misiones están en `src/core/missions.ts` y es fácil añadir más.
- **Mover unidades:** se cogen y se arrastran (con el dedo, manteniendo pulsado). El camino sigue al
  puntero como una flecha y un bocadillo dice cuánto movimiento se gasta, la defensa de la casilla,
  el combustible que queda y si allí te pueden atacar. Al soltar pasa lo lógico: sobre un enemigo,
  ataca desde la casilla por la que llegabas; sobre un edificio, captura; sobre una unidad igual, se
  unen; sobre un transporte, sube; en una casilla vacía sin nada más que hacer, espera. Fuera del
  alcance vuelve a su sitio; muy lejos, queda una orden de "ir hacia allí" que la unidad cumple sola
  turno a turno. Mayúsculas + recuadro elige varias para moverlas en grupo. Ctrl+Z deshace el último
  movimiento si no ha descubierto nada.
- **Reglas nuevas de movimiento:** el terreno cuesta (bosque, arena y nieve frenan a los vehículos;
  acantilados y agua poco profunda, a la infantería), se atraviesan las unidades propias y, con
  niebla, el bosque esconde: si tu camino choca con un enemigo escondido, emboscada.
- Opciones dentro de la partida (menú > Opciones): esperar sola al soltar, saltar a la siguiente
  unidad, velocidad de las animaciones propias y del enemigo, música y autoguardado.
- **Veteranía** (reglas nuevas): una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas),
  cada una con +5 % de acierto y de defensa.
- Al empezar cada turno sale un resumen de la ronda (ingresos, unidades reparadas y reabastecidas).
- Al acabar la partida se ven estadisticas de los dos bandos (compras, bajas, capturas, gasto).
- Si el sistema pide reducir el movimiento, se quitan los temblores, parpadeos y paneos de camara.

## Estructura

```
src/
  core/        Logica del juego en TypeScript puro (sin Phaser): se puede probar con tests
               y reutilizar, por ejemplo, en un servidor para partidas online.
    data.ts      Tablas de datos: unidades, edificios, terrenos, dano... (para equilibrar el juego)
    rules.ts     Reglas: movimiento, combate, captura, union, transporte, compra, fin de ronda
    ai.ts        Inteligencia artificial (un generador que va devolviendo cada accion)
    mapgen.ts    Generador de mapas aleatorios
    save.ts      Guardar / cargar en JSON
    geom.ts      Rombos, distancias, numeros aleatorios con semilla
    types.ts     Modelo de datos (GameState, Unit, Building, GameEvent)
  scenes/      Escenas de Phaser: Boot (carga), Logo, Menu, Game (partida), End (victoria/derrota)
  ui/          Dibujo del mapa (mapView: sprites persistentes, zoom entero) y nombres de imagenes (sprites)
  hud/         Interfaz en HTML con Preact encima del lienzo: Hud.tsx (componentes), hud.css
               (estilo "retro pixel") y store.ts (estado que publican las escenas)
  ui/fx.ts     Efectos pixel: explosiones, textos flotantes, destellos
  core/stats.ts Estadisticas de la partida (se guardan con ella)
  display.ts   Lienzo a resolucion fisica de la pantalla (nitido en pantallas de alta densidad)
public/assets/ Graficos y musica originales (la musica, convertida a ogg/mp3)
docs/          Especificacion del juego original sacada del codigo Java
tests/         Tests (vitest)
scripts/       gen-assets.mjs (lista de imagenes) y build-single.mjs (version de un fichero)
```

Si anadis o cambiais imagenes en `public/assets/img`, ejecutad `npm run assets` para
regenerar `src/assetList.ts`.

## Diferencias con el original de 2013

Las reglas son las del juego original salvo los fallos que se han corregido. Todos estan
marcados en el codigo con `[CAMBIO]`. Los principales:

- Tabla de dano: en las filas de Soldier, SSoldier y FSoldier sobraba un numero
  (los soldados hacian x3 de dano al LTank).
- Ya no se cuelga al abrir el menu de un WTank junto a un aliado (faltaba una fila en una tabla).
- Unir unidades y subir a un transporte mueve de verdad a la unidad (antes se hacia a distancia).
- Despues de mover se puede deshacer con "Atras".
- Esc pide confirmacion antes de abandonar la partida; "Borrar unidad" tambien.
- Los aviones que estan en su aeropuerto ya no se estrellan por falta de combustible.
- Mapas: las dos bases siempre existen, estan conectadas por tierra y separadas.
- IA: ataca solo a lo que puede danar y elige el mejor objetivo, vuelve a repararse y
  repostar, avanza hacia la Base del jugador y compra con mas criterio.
- Interfaz nueva de estilo pixel (HTML y CSS sobre el lienzo): mapa a pantalla completa y nitido
  a cualquier tamano (zoom entero), menus emergentes junto a la unidad, fichas de terreno y unidad,
  compra con nombres y estadisticas, camino previsto, prevision de combate, bandeja de unidades
  sin mover (Tab), zona de amenaza enemiga (T), alcance de cualquier unidad, minimapa, ayuda,
  resumen de cada ronda, estadisticas finales, gestos tactiles (pellizcar, mantener pulsado),
  explosiones y efectos pixel, y cartel de cambio de turno. Se conservan los graficos,
  el logo, el fondo del menu y las pantallas de victoria y derrota originales.
- Guardado y configuracion en el navegador (localStorage).
- El original no tenia graficos para las esquinas inferiores de las orillas en los temas
  llanura y bosque: se han generado girando las superiores (`c_0_18/19`, `c_2_18/19`).

## Creditos

Juego original: Ilogic, Fingerprint Games (2013).
