# Ideas pendientes

Lista viva de lo que se ha hablado para Ilogic y aún no está hecho (o se descartó, y por qué). Se
actualiza al terminar cada cosa: lo hecho sale de aquí y va a las notas de versión (`CHANGELOG.md`).

Estado a 1 de noviembre de 2026, después de la versión 0.7.1.

## En marcha

| Qué | Dónde | Estado |
|---|---|---|
| Órdenes con destino estilo RTS (atacar, capturar, defender allí) y escuadras con nombre, también con el dedo | PR #46 | Lista; falta fusionarla |
| Puntos de control: 3 casillas en el centro que dan 1000 por ronda | PR #47 | Lista; falta fusionarla |
| Que la IA enemiga juegue en grupo (fuego concentrado, avanzar en oleada, objetivo común) | rama `ia/ataque-en-grupo` | En curso |
| Versión 0.8.0 con todo lo anterior | — | Después de lo anterior |

## Jugabilidad

1. **IA que ataque en grupo.** Lo que más falta: con todas las reglas nuevas, ~90 % de las partidas
   IA contra IA siguen sin ganador al día 60 (objetivo: 15-25 días). Ninguna regla lo arregla; es
   cómo juega la IA (ver `docs/BALANCE.md`, "Que atacar salga a cuenta").
2. **Ejércitos más pequeños.** Bajar los puntos de mando de 30 a ~20 para que cada unidad pese más y
   haya menos que mover. Medir antes con `npm run balance`.
3. **Dificultad en «Nueva partida».** Fácil: la IA empieza con menos dinero, sin general y sin
   curarse. Normal: como ahora.
4. **Modo Escaramuza.** Mapa pequeño (12×12), menos dinero, partidas de ~10 días.
5. **Más puntos de control o con otras recompensas.** Ahora dan dinero; podrían dar estrellas al
   general o visión. Ver cómo se juegan primero (PR #47).

## Órdenes y escuadras (después de #46)

6. **Dar órdenes con un gesto.** Con una unidad o escuadra elegida, clic derecho (o mantener pulsado
   en el móvil) en el mapa abre «Atacar / Capturar / Defender allí» sin pasar por el menú de la
   unidad.
7. **Flechas de intención.** Al empezar el turno, cada unidad con orden enseña qué va a hacer (mover
   ahí, atacar a esa). Con las banderas y líneas de #46 quizá ya no haga falta: decidir jugando.
8. **Las escuadras se mueven en formación.** Hoy cada unidad de una escuadra cumple la orden por su
   cuenta; podrían esperar a la más lenta para llegar juntas.

## Equilibrio

9. **Generales.** Con las reglas de ataque de la 0.7.0, Brisa pasó del 60 % al 71 % de victorias
   contra la IA sin general y Ámbar bajó del 60 % al 50 % (margen ±10). Retocar sus números con
   `npm run generals`.
10. **Unidades.** `npm run balance` dice que el Soldado (1,6×) y el Caza ligero (2×) rinden demasiado
    para lo que cuestan, y el Jeep (0,4×) y el Motorizado (0,3×) muy poco. Propuestas de la
    herramienta: Soldado 1500 → 2000, Jeep 5000 → 4000, Caza ligero 12000 → 15000.

## Técnico

11. **Controles.** Terminar de pasar al sistema común (`src/controls`) lo que aún lee teclas o el
    ratón a mano: desplazar el mapa por el borde de la pantalla y los menús de fin de partida y de
    opciones.
12. **Mando (gamepad).** Un adaptador más en `src/controls` cuando lo anterior esté hecho.

## Descartado (y por qué)

- **Fábrica automática** (comprar sola al terminar el turno, con posturas, reserva y resumen): llenaba
  el mapa de unidades que luego había que mover y se gastaba el dinero. Saber qué comprar es parte
  del juego: si compras mal, lo pagas.
- **«Comprar otra vez»** (repetir la última compra a un toque): comprar no es un problema que haya que
  resolver.
- **Consejero** (botón «¿Qué hago?» que marca la mejor jugada): no gustó.
- **Piloto automático** (la IA juega tu turno entero): sería ver a la IA jugar contra sí misma.
- **«Auto» sin destino y «defender aquí» suelto:** sustituidos por las órdenes con destino de #46;
  costaba entender qué hacían.
- **Curar cuesta dinero:** se entiende mal que te quiten dinero sin hacer nada; en su lugar, «bajo
  fuego» (quien recibe un ataque no se cura esa noche).
- **Rediseño del móvil V1-V5:** en un móvil real se veía peor que antes (márgenes negros, textos
  montados). Solo se quedaron dos arreglos (letra 5/8 y la ayuda cortada).
- **Barra de vida en las unidades:** con las cifras nuevas de la letra del juego se lee bien; no hace
  falta.
