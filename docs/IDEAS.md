# Ideas pendientes

Lista viva de lo que se ha hablado para Ilogic y aún no está hecho (o se descartó, y por qué). Se
actualiza al terminar cada cosa: lo hecho sale de aquí y va a las notas de versión (`CHANGELOG.md`).

Estado a 1 de noviembre de 2026, después de la versión 0.7.1. Ahora el foco es un núcleo PvE bueno;
el PvP, después.

## En marcha

| Qué | Dónde | Estado |
|---|---|---|
| Órdenes con destino estilo RTS (atacar, capturar, defender allí) y escuadras con nombre, también con el dedo | PR #46 | Lista; falta fusionarla |
| Puntos de control: 3 casillas en el centro que dan 1000 por ronda | PR #47 | Lista; falta fusionarla |
| Que la IA enemiga juegue en grupo: fuego concentrado y camino libre entre aliados | PR #51 | Lista (gana el 60 % a la anterior; el atasco baja poco, de 90 % a 88 %) |
| Órdenes con un gesto | PR #49 | Lista |
| Borde de la pantalla y menús por el sistema común de controles | PR #50 | Lista |
| Versión 0.8.0 con todo lo anterior | — | Después de lo anterior |

## Jugabilidad

1. **Romper el atasco IA contra IA.** Con la IA en grupo (#51) sigue ~88 % sin ganador al día 60
   (objetivo: 15-25 días). Pista: con el tope de puntos de mando el dinero se amontona (100.000+ sin
   gastar el día 40), perder unidades sale casi gratis y la Base se defiende sola. Probar junto con
   ejércitos más pequeños (2) y un asalto escoltado a la Base.
2. **Ejércitos más pequeños.** Bajar los puntos de mando de 30 a ~20 para que cada unidad pese más y
   haya menos que mover. Medir antes con `npm run balance`.
3. **Dificultad en «Nueva partida».** Fácil: la IA empieza con menos dinero, sin general y sin
   curarse. Normal: como ahora.
4. **Modo Escaramuza.** Mapa pequeño (12×12), menos dinero, partidas de ~10 días.
5. **Más puntos de control o con otras recompensas.** Ahora dan dinero; podrían dar estrellas al
   general o visión. Ver cómo se juegan primero (PR #47).

## Órdenes y escuadras (después de #46)

6. **Dar órdenes con un gesto:** hecho en la PR #49 (clic derecho, mantener pulsado o tecla F).
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

## Generales con unidades propias

13. **Unidades comunes y exclusivas por general.** Cada general cambia 2-3 unidades del catálogo común
    por variantes suyas, con otro estilo y no más fuertes. Ejemplos: Brisa, un caza explorador (ve
    más, pega menos); Roca, un tanque pesado (lento, muy duro, no entra en bosque); Ámbar, un camión de
    campaña (repara más y lleva infantería). Medir con `npm run generals` que ninguno se aleje del 50 %.

## PvP (más adelante: primero un núcleo PvE bueno)

El juego por turnos le va bien al PvP asíncrono, y el núcleo ya ayuda: es determinista con semilla,
la partida es JSON y se puede repetir un turno. Por fases, para no apostarlo todo de golpe:

14. **Dos jugadores en el mismo dispositivo** (pasarse el móvil): casi gratis de hacer, y sirve para
    probar el equilibrio de los generales entre personas.
15. **Partidas con amigos por enlace o código**, asíncronas, con aviso cuando te toca. Necesita un
    servidor pequeño que guarde la partida y mande a cada uno solo lo que ve (si no, se puede mirar a
    través de la niebla).
16. **Clasificatorias** (emparejamiento, Elo, temporadas): solo si lo anterior consigue jugadores.

Para competir hará falta: equilibrio estricto de generales, mapas simétricos o probados (los de azar
dan algo de ventaja a una salida) y quizá una opción "sin azar" en el daño. El PvE se queda: enseña a
jugar y es lo que hay cuando no hay rival.

## Monetización (si llega)

Sin pagar para ganar, sobre todo con PvP: nada que afecte a la partida se vende suelto.
- **Lo más limpio:** web gratis como demo (parte de la campaña, escaramuza y 3 generales) y pago
  único por la versión completa en itch.io, Steam (aplicación de escritorio) o Google Play (la app
  instalable envuelta). En la web es casi imposible cobrar: el juego es un fichero que se copia.
- **Después:** expansiones de campaña que traen un general nuevo, y cosméticos (aspectos de unidades y
  generales, colores, temas de mapa, el estilo 2013 como pack). Si el juego fuera gratis con PvP, los
  generales se consiguen jugando.
- **Nunca:** cajas de botín o gacha, monedas premium, energía, anuncios que cortan la partida.
- Antes de cobrar: derechos del Ilogic original, facturación e IVA.

## Técnico

11. **Controles.** Pasar al sistema común el borde de la pantalla y los menús: hecho en la PR #50.
    Queda mirar si Tab funciona (en la pantalla final no mueve la selección, ni antes del cambio).
12. **Mando (gamepad).** Un adaptador más en `src/controls`; el hueco queda preparado en la PR #50
    (`docs/ARQUITECTURA.md`, «Mandos»).

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
