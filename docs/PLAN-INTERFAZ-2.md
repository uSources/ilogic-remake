# Plan: interfaz de partida 2, «mesa de juego»

Fecha: 16-11-2026. Es solo el plan: cada fase se implementa en su propia PR desde `main`.

## Contexto

La 0.12.0 dejó la partida con una interfaz «caja de juguete» y solo cuatro piezas fijas: dinero, día
con su clima, menú y «Fin del turno». Después se quitó también la bandeja y se añadieron el cielo y el
mar. Está limpia, pero al usuario todavía no le convence. Mirándola en `/?seed=2013` (`main`,
a5145c83) se ve esto:

- **Alcance poco visible.** Al elegir una unidad sale un aro amarillo y un tinte cian muy flojo en
  las casillas a las que puede ir. No se ve hasta dónde ataca, y sobre la hierba con flores casi no
  se distingue.
- **Compra que no parece de juguete.** Es una tarjeta grande, «Fábrica / Fondos», con 10 retratos
  grises sin nombre. El nombre y los datos solo salen en una línea de texto al pasar el ratón, y la
  tarjeta tapa medio tablero.
- **Previsión de combate escrita.** Es una tarjeta con filas de texto: daño, vida y contraataque.
- **Ficha de la casilla bien encaminada.** Es pequeña y sale junto a la casilla, por ejemplo
  «Artillería 100 / Aeropuerto ★★ / Alt: más datos».
- **El día y el clima son una lista.** El cambio de día se anuncia con un cartel que entra desde
  arriba; los avisos (ingresos, capturas) salen como líneas de texto.

El usuario quiere reimaginarla tomando ideas de juegos parecidos, y ha elegido la dirección
**A · Mesa de juego**. La idea es que casi no haya marcos y que el propio tablero cuente lo que pasa,
con piezas de juguete.

## Referentes (qué hace bien cada uno)

| Juego | Qué copiar |
|---|---|
| **Into the Breach** | Lo que va a pasar se dibuja sobre el tablero, no en paneles: flechas, casillas de impacto, el empuje y la muerte. Prefiere la claridad a las ideas bonitas. En móvil rehicieron cada ventana para el dedo y la interfaz se puede escalar. |
| **Wargroove 1-2** | La previsión va encima del objetivo, en % de vida, y pasar del 100 % es matarlo. Muestra un número de vida solo en las unidades heridas. Casillas de colores para mover, atacar y reclutar. La defensa de la casilla son escudos que se cuentan. Tiene una vista aérea para ver la partida entera. |
| **Advance Wars Re-Boot Camp** | Azul para mover y rojo para atacar. El cartel «Día N» ocupa la pantalla, en el color del bando y con el clima. Para la defensa usa estrellas, no texto. |
| **Fire Emblem Engage** | Unas líneas indican qué enemigo puede atacar a qué aliado. Con un botón se ve la zona de peligro de todos los enemigos. Si el golpe mata, sale una calavera. |
| **Mario + Rabbids** | El porcentaje es un icono grande y redondo (0, 50 o 100) que se lee de un vistazo. La cobertura está en el propio tablero, como bloques. |
| **Polytopia** | Pensado para el dedo: al tocar algo salen sus iconos grandes con el precio, y lo que no puedes pagar sale apagado. Un único botón gordo de «siguiente turno». |
| **Tactics Ogre Reborn** | Un visor de trayectoria para los disparos a distancia (en Ilogic, la artillería). |
| **Unicorn Overlord** | Una previsión por bandos: cuánto pierdes tú y cuánto pierde él. |
| **Tiny Metal** (lección en contra) | En un tablero 3D, la casilla elegida tiene que verse sin ninguna duda. |

Patrones que comparten casi todos:
- Fijo en pantalla solo dinero, turno o día y fin del turno.
- Mover en azul y atacar en rojo.
- La previsión sale al apuntar, nunca en un menú.
- La muerte se marca siempre (calavera, más del 100 % o barra vacía).
- Comprar es una rejilla o fila de retratos con su precio, con lo que no se puede pagar apagado.
- Un cartel corto anuncia el cambio de turno.

Las direcciones B («Bandeja de juguetes», al estilo Polytopia) y C («Cuartel del general», al estilo
Advance Wars y Fire Emblem) se descartaron. B mete una pieza más que sube y baja, y C vuelve a poner
información fija en pantalla.

## La dirección: «mesa de juego»

Reglas que valen para todas las fases:

1. **Fijo en pantalla, lo mismo que hoy y nada más.** Las cuatro piezas, con un solo cambio: el
   número de «Fin del turno» hace saltar a las unidades sin mover (fase 6).
2. **Lo que pasa en el tablero se dibuja en el tablero**, con piezas del motor sobre el suelo:
   - el alcance de mover y de atacar;
   - el camino;
   - quién te puede atacar;
   - la defensa de la casilla.
3. **Los números van en chapas.** Son fichas de juguete pequeñas en HTML, ancladas a una casilla o
   a una unidad con `scene.anchorOf`, como las fichas y la rueda de ahora. Las chapas llevan cifras
   grandes e iconos, y casi nada de texto. La letra se queda en HTML para que se lea nítida y para no
   meter textos en three.js.
4. **El detalle, solo si se pide**: con Alt o una pulsación larga, como hoy.
5. **Capas como siempre.** Qué se marca y qué dice cada chapa lo decide `src/view3d/systems/` (puro y
   con tests). Lo pinta el motor (`engine/fx`, `engine/pieces`) o el HUD (`src/hud/game`), por puertos.
   Nada de lógica en los componentes.

Boceto (escritorio):

```
 ┌──────────────────────────────────────────────────────────┐
 │ (●5000)            ( DÍA 3 ☂ )                      (≡)  │
 │                                                          │
 │          ▢▢▢        chapa sobre el enemigo:              │
 │        ▢▢[S]▢▣ ←── ( −45  ☠40% )   ↩ (−10) en tu unidad   │
 │          ▢▢▢▣      ▢ mover: losas azules con borde        │
 │            ▣       ▣ atacar: borde rojo                   │
 │   ★★ ← estrellas de bloque al señalar una casilla         │
 │   T ┄┄➜ S   línea roja: ese enemigo te alcanza            │
 │                                                          │
 │                                   ( Fin del turno  ③ )   │
 └──────────────────────────────────────────────────────────┘
```

## Fases (cada una, su PR desde `main`, jugable al acabar)

El móvil se deja de momento (decidido con el usuario): las fases se piensan para ratón y teclado, sin
romper lo táctil que ya hay (pulsación larga = rueda o detalle). Adaptarlo será otro plan.

### Fase 1. El tablero se lee: mover, atacar y camino
- **Alcance de mover**: losas azules con borde claro en el contorno del área, no un tinte. Se tienen
  que distinguir sobre hierba, nieve, arena y agua. Va en `engine/fx/highlights.ts`.
- **Alcance de ataque**: un borde rojo en las casillas a las que podría disparar desde cualquier
  sitio al que llega. Los enemigos atacables llevan una diana de juguete encima, que es lo que hoy
  hace `showTargets`.
  - Al puerto `TileMarks` (`ports/turn.ts`) se le añade `showAttackReach(tiles)`.
  - Las casillas las calcula `systems/turn` con `attackPlan.ts` y `movePreview.ts`.
- **Camino**: flecha de bloques hasta el fantasma, reutilizando `engine/fx/arrowParts.ts`.
- **Artillería**: al apuntar, un arco de puntitos hasta el objetivo (como el visor de Tactics Ogre),
  reutilizando `pixelPoints.ts`.
- **Casilla señalada**: un cursor de esquinas que no deje dudas (la lección de Tiny Metal).
- Tests: `tests/turnControls.test.ts` y uno nuevo para las casillas de ataque, con puertos falsos que
  apuntan lo que se pide.

### Fase 2. Chapas de combate (la previsión) (hecha)
- `game/Forecast.tsx` pasa a ser **dos chapas**:
  - sobre el enemigo, el daño esperado en grande («−45»), con una calavera y el % si puede morir, en
    dorado si es probable (`LIKELY_KILL`);
  - sobre tu unidad, la chapa del contraataque («↩ −10»), en rojo si puede caer (`RISKY_COUNTER`);
    si no hay contraataque, no sale.
- Con Alt sale la tarjeta de ahora, con el rango, la vida antes y después, el flanqueo y el botín:
  `ForecastVM` ya lo trae todo, así que no cambia nada debajo.
- Mientras la chapa está visible, la barra de vida del enemigo muestra lo que perdería.
  - Esto lo decide `systems/board` (`UnitLook`) y lo dibuja `engine/pieces/badges.ts`.
- Una pieza `Badge` en `src/hud/common/toy.tsx`, junto a `Pill` y `Chip`, sirve para todas las chapas.

### Fase 3. Casilla y unidad sin tarjeta (hecha)
- **Defensa**: al señalar una casilla, salen sobre ella sus estrellas como bloquecitos amarillos
  (pieza del motor, como la letra de la orden en `badges.ts`).
- **Ficha de la casilla** (`TileTip.tsx`): se queda solo con el nombre y la vida de la unidad. La
  defensa ya se ve en las estrellas, y Alt sigue dando la tarjeta entera.
- **Vida en las unidades**: un número en una chapa solo cuando están heridas, como en Wargroove. Hoy
  hay una barra; se prueba el número frente a la barra en el navegador y se apunta en `ESTETICA.md`
  lo que se quede.
- **Captura**: en un edificio que se está capturando, una chapa con lo que le falta.

### Fase 4. Quién te puede atacar
- Al señalar o elegir una unidad propia, salen **líneas rojas** desde cada enemigo visible que
  podría atacarla en su turno, como en Fire Emblem Engage.
  - Lo calcula `systems/threat/threatZone.ts`, que ya sabe qué alcanza cada enemigo.
  - Al puerto `ThreatMarks` se le añade `showThreatLines(from, to)`.
  - Se dibujan con `engine/fx/intentArrows.ts` y `arrowParts.ts`.
- **La zona de amenaza** (T y menú) se ve como un borde rojo con relleno suave. No es un tinte
  naranja que se confunda con el mover.
- No se intenta adivinar qué hará la IA. Ilogic tiene azar y su IA no es determinista, así que lo
  que se enseña es lo que **podría** pasar, nunca lo que pasará.

### Fase 5. Comprar en abanico
- Al tocar una fábrica propia, sus retratos salen **en abanico alrededor de ella**, anclados como la
  rueda (`RadialMenu.tsx`). Cada ficha lleva el retrato, el nombre corto y el precio.
- Lo que no se puede pagar sale apagado y dice cuánto falta («−2000»). El motivo ya lo da
  `buyItem` (`systems/turn/menuItems.ts`).
- Al pasar el ratón o mantener pulsado, una chapa con lo esencial en iconos: mover, alcance y contra
  qué es buena.
- Un toque compra, como hoy. Tocar fuera o Esc cierra.
- Si el abanico se sale de la pantalla, se gira hacia dentro, como hoy `placeBeside`.
- Sale `BuyGrid.tsx` y entra `BuyFan.tsx`. Sus posiciones las calcula una función pura en
  `src/hud/common/placement.ts`, que se prueba con tests.

### Fase 6. Fin del turno, día y clima
- **«Fin del turno»** se queda donde está.
  - El primer toque, con unidades sin mover, hace **saltar a esas unidades** en el tablero y pone
    «¿Terminar?» (hoy solo cambia el texto).
  - El salto se pide con un puerto de `stages` (`stages.pieces`).
- **El cartel del día** es una **banderola** de tela de juguete en el color del bando. Cae sobre el
  tablero y dice «Día 4», con el icono grande del clima si cambia. Sustituye a la ficha que entra desde
  arriba (`overlays/Notices.tsx`).
- **Los avisos del día van sobre el tablero.** «+1000» sale y sube sobre cada edificio que cobra, y
  las capturas y pérdidas llevan una chapa en su edificio.
  - Los pasos los decide `systems/events/eventSteps.ts`, como los demás sucesos.
  - La lista de texto de hoy queda solo para el desglose del dinero.
- **Turno enemigo**: la cámara sigue a la IA, como ahora, y las chapas de daño salen en cada golpe.

### Fase 7. Escala y documentación
- Chapas y abanico que no tapen la unidad. Comprobarlo con `settings.uiScale` a 0,75 y a 1,5.
- Documentación:
  - `docs/ESTETICA.md` («Interfaz»): chapas, banderola, losas y bordes, y estrellas de bloque;
  - `docs/SPEC-INTERFAZ.md` y `src/i18n/*/help.ts`: lo nuevo;
  - `docs/ARQUITECTURA.md`: los puertos nuevos;
  - `docs/IDEAS.md`: quitar lo que se haga y apuntar lo descartado (direcciones B y C) con el porqué.
- `docs/PLAN-INTERFAZ.md` queda como historia y enlaza a este plan.

## Cómo se comprueba (cada fase)
- `npm run check`, con tests puros en `tests/` de lo que decida `systems/`: casillas de ataque,
  líneas de amenaza, posiciones del abanico y pasos de los avisos del día.
- En el navegador (`npm run dev`, `/?seed=2013` y `?seed=7`), con capturas de antes y después:
  - elegir, mover y atacar, con una previsión que mate y otra que no;
  - artillería, comprar con y sin dinero, terminar el turno con unidades sin mover;
  - el turno de la IA y el cambio de día con lluvia;
  - sin errores en la consola.
- `npm run huella` igual antes y después cuando una fase solo reescribe.
