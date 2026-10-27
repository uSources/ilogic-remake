# Plan: rehacer los menús con tarjetas

## Estado (27-10-2026)

Hechas las seis fases:
- **Inicio:** tarjetas Continuar (con miniatura de la partida guardada, solo tus unidades), Nueva partida (Rápida / Personalizar) y Campaña (progreso y casillas por misión). Abajo: Cómo se juega, Opciones, Créditos y Web original.
- **Opciones:** pantalla propia por grupos, la misma desde el menú y desde la partida (tecla O). Añade tamaño de la interfaz, reducir movimiento, ver siempre la amenaza y el fondo del menú.
- **Nueva partida:** vista previa del mapa que se va a jugar, "Otro mapa" (R), código, y los ajustes Normal / Rápida / Clásica 2013 / Personalizada con botones de segmento.
- **Campaña:** tarjetas con miniatura, tipo de objetivo, estado y mejor marca en días.
- **Pausa:** panel centrado con el día, el código del mapa y el objetivo de la misión.
- **Fondo vivo:** partida IA contra IA sin niebla detrás del menú; se puede volver a la imagen de 2013 en Opciones (y no se usa con "reducir el movimiento").

## Cómo estaban

- **Menú principal:** una lista vertical de 8 botones iguales: Jugar, Campaña, Continuar, Cómo se juega, Música, Autoguardado, Idioma y Web original. Encima, el logo y el fondo original oscurecido.
  - Todo pesa lo mismo: "Continuar" una partida a medias queda en tercer lugar y no dice nada de esa partida.
  - Las opciones (música, idioma...) se mezclan con las acciones.
- **Nueva partida:** 8 filas con flechas ◄ ►. No se ve el mapa hasta que empieza la partida.
- **Campaña:** una lista de texto con el resumen al lado.
- **Menú de partida (pausa):** un menú emergente pegado al cursor, como el de acciones.

## Fase 1: pantalla de inicio con tarjetas

Tres tarjetas grandes y una fila pequeña debajo.

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ [minimapa]   │ │ [tanques]    │ │ [mapa 2/6]   │
│ CONTINUAR    │ │ NUEVA        │ │ CAMPAÑA      │
│ Día 12 · 32² │ │ PARTIDA      │ │ 2 de 6       │
│ 14.500 €     │ │ Rápida ▸     │ │ Siguiente:   │
│ reglas nuevas│ │ Personalizar │ │ Resistir     │
└──────────────┘ └──────────────┘ └──────────────┘
   Cómo se juega · Opciones · Créditos · Web original
```

- **Continuar:**
  - Solo aparece si hay una partida guardada, y entonces es la primera y la más grande.
  - Enseña un minimapa de esa partida, el día, el dinero, el tamaño del mapa, las reglas y, si es una misión, cuál.
- **Nueva partida:** dos botones dentro de la tarjeta.
  - "Rápida": empieza ya con las últimas opciones usadas.
  - "Personalizar": abre la fase 2.
- **Campaña:** progreso ("2 de 6"), la siguiente misión con su minimapa y una fila de casillas ✓ / · / 🔒 por misión.
- **Fila pequeña:**
  - Cómo se juega: abre la ayuda, o propone el tutorial si no se ha jugado.
  - Opciones: pantalla propia, ver más abajo.
  - Créditos (Fingerprint Games, 2013, y el remake).
  - Web original.
- **Estilo de la interfaz actual:** paneles con bisel pixel.
  - La tarjeta elegida se levanta 2 píxeles con un paso, el borde se pone dorado y los sprites de su dibujo se mueven.
- **Teclado y mando:**
  - Las flechas se mueven entre tarjetas (izquierda/derecha) y entre los botones de dentro (arriba/abajo).
  - Enter elige y Esc vuelve.
- **Móvil:** las tarjetas van una debajo de otra, Continuar arriba, y se desplaza con el dedo.

## Fase 2: opciones en su propia pantalla

Tarjetas por grupo, cada una con sus interruptores:

- **Sonido:** música (y efectos, cuando los haya).
- **Partida:**
  - autoguardado;
  - esperar sola al soltar;
  - saltar a la siguiente unidad;
  - velocidad de tus animaciones y de las del enemigo.
- **Pantalla y accesibilidad:**
  - tamaño de la interfaz (90 / 100 / 125 %);
  - reducir el movimiento (además de lo que pida el sistema);
  - ver siempre la zona de amenaza.
- **Idioma:** español / English.

Son las mismas opciones que hay ahora en el menú de partida, que tendrá un atajo a esta pantalla.

## Fase 3: nueva partida con vista previa del mapa

- **Izquierda, el mapa que va a tocar, dibujado como un minimapa grande:**
  - con las dos bases marcadas;
  - con su código debajo;
  - con un botón **"Otro mapa"** para sortear uno nuevo.

  Cambiar el tamaño o el terreno lo redibuja al momento. Escribir un código enseña ese mapa.
- **Derecha, tarjetas de modo de juego (ajustes ya hechos):**
  - **Normal:** reglas nuevas, 32×32, sin límite.
  - **Rápida:** 20×20, límite de 20 días, más ingresos.
  - **Clásica 2013:** las reglas originales.
  - **Personalizada:** se despliegan las opciones de ahora, en grupos (Reglas · Mapa · Economía), con botones de segmento (`20 | 32 | 40`) en lugar de flechas.
- Botón grande **EMPEZAR** abajo.

## Fase 4: campaña como fila de tarjetas

- **Una tarjeta por misión:**
  - número, título y minimapa;
  - un icono del tipo de objetivo: Base, aguantar, capturar, escoltar o destruir;
  - su estado: hecha ✓, disponible o bloqueada (en gris).
- **La elegida se amplía** con el resumen, el objetivo y el botón Jugar.
- **En las hechas, la mejor marca:** en cuántos días se completó, para tener algo que mejorar.
- **Móvil:** las tarjetas se deslizan en horizontal.

## Fase 5: menú de pausa

- **Al pulsar Esc o ☰**, el mapa se oscurece y sale un panel centrado (no pegado al cursor):
  - arriba, el día, el código del mapa y el objetivo si es una misión;
  - debajo, tarjetas pequeñas con icono: Continuar · Guardar · Repetir turno enemigo · Opciones · Ayuda;
  - aparte, en rojo: Rendirse · Salir al menú.
- **El menú de acciones de las unidades no cambia**: es emergente porque va junto a la unidad.

## Fase 6 (opcional): fondo vivo

En lugar de la imagen fija, detrás del menú se ve una partida IA contra IA en un mapa al azar, oscurecida y con la cámara moviéndose despacio. La herramienta de equilibrio ya juega esas partidas, así que es barato, y enseña el juego antes de jugarlo. Si se prefiere, se puede elegir en Opciones entre el fondo original de 2013 y el vivo.

## Orden

1 → 2 → 3 → 4 → 5, y la 6 al final si apetece.

- **Fase 1:** es la que más cambia la primera impresión.
- **Fase 3:** la vista previa del mapa es lo más útil para jugar.

Cada fase se prueba con ratón, teclado y dedo en escritorio y móvil, igual que hasta ahora.
