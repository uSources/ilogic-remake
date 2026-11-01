# Diario de automejora

Cada experimento, aceptado o descartado, con sus numeros. Los agentes lo leen antes de proponer
nada para no repetir lo que ya se probo. Lo mas nuevo arriba.

Formato:

```
## AAAA-MM-DD · area · ACEPTADO | DESCARTADO
Cambio: que se toco (fichero y valores).
Hipotesis: por que deberia mejorar.
Resultado: nota antes → despues (por partes si cambia), arena, fuzz.
Conclusion: que se aprende (tambien de lo descartado).
```

## 2026-11-01 · IA (juego en grupo) · ACEPTADO

Cambio: `src/core/ai.ts`, solo en `aiTurn` (bandera `GROUP`; `commandTurn` igual que antes):
(1) `planFire`: plan de fuego concentrado del turno (enemigos visibles que se destruyen sumando el dano
esperado de 2 o mas unidades, flanqueo incluido; las del plan juegan primero, las de distancia antes;
peso nuevo `AI.FOCUSFIRE` 100 por cada 1000 de precio del objetivo); (2) `occupancyWithout`: con
`passAllies`, las propias (y las enemigas que no se ven) no cortan el camino al medir distancias.
Hipotesis: la IA llegaba de una en una; ademas el 13 % de los turnos de unidad eran paseos al azar en
casa porque una columna propia tapaba el unico camino (puente, salida de la Fabrica).
Resultado: arena (referencia = IA de la rama antes del cambio; la guardada del 29-10 ya no compilaba)
**60 % (95 %: 53-67 %)** en 200, 56 % (52-60 %) en 600. Balance 80 partidas: sin terminar 90 % → 89 %
(160: 92,5 % → 90 %), mediana 46 → 40 dias, ventaja 23/44 → 24/43. Nota **67,7 → 76,2** (duracion
34 → 29 dias, +7,5; precios +1,0; lados 25 → 25).
Descartados (arena 200 / sin terminar en 80):
- Preferir objetivos tocados (`FOCUSFIRE` sobre la vida que falta) + orden: 46 % / 92 %.
- Solo orden de juego (distancia primero): 48 % / 94 %.
- Las que no capturan marchan a la Base enemiga en vez de perseguir: 47 % / 95 %.
- Asalto: las 2 que capturan mas cerca van derechas a la Base: 33 % / 86 % (termina mas, pierde edificios).
- Asalto solo con masa (1,5x el valor enemigo visible a 8 de la Base): 48 % / 92 %.
- No avanzar a casillas donde el enemigo visible trae mas que lo propio a 3: 47 % / 97 % (demasiado pasiva).
- Camino libre + Suministros que acompanan y reparan (la IA nunca usaba `supply`): 53 % (600: 50 %) / 86 %.
- Camino libre + plan + asalto con masa y marcha a la Base: 51 % (600: 50 %) / 84 % en 160. Con ratio 3: igual
  (50 % / 84 %). Sin la marcha ni el esperar: 48 % (600) / 87,5 % (160).
Conclusion: la arena entre IAs parecidas es muy ruidosa (±7 % en 200; el mismo cambio dio 58 % y 53 %
en 200 y 600): confirmar con 600 antes de fiarse. Todo lo que manda a las que capturan a la Base baja
de verdad el atasco (84-86 %) pero pierde en la arena (que decide casi todo por edificios y dinero).
Detras del atasco: con puntos de mando el dinero se amontona (100.000-270.000 el dia 40) y perder
unidades sale gratis; la Base se defiende sola. Siguiente idea: asalto escoltado de cerca o solo con
las unidades que sobran, sin dejar de capturar; y que la IA gaste el dinero en calidad (probado de
pasada: pesos de compra cost^2 en vez de sqrt, 45 % en la arena, no sirve asi). Tabla en docs/BALANCE.md.

## 2026-10-30 · equilibrio (Tanque e infanteria) + compras de la IA · ACEPTADO (PR del usuario)

Cambio: (1) `src/core/ai.ts` `produce`: Fabrica y Aeropuerto en orden al azar (antes el Aeropuerto siempre
primero); (2) `POWER` Tanque → infanteria 0.3 → 0.6 (Bazuca 0.45), infanteria ligera → Tanque 0.1 → 0.05,
Mortero → Tanque 0.4 → 0.2; (3) `POWER` Soldado → vehiculos a 0.1-0.2 (Artilleria 0.05). En `units.json`.
Hipotesis: con puntos de mando el Tanque casi no se compraba (0.3 %) y en cuerpo a cuerpo perdia contra
la infanteria barata.
Resultado (120 partidas 32x32; la linea base de 66.4 era de antes de los puntos de mando, sobre `main`
la nota real era **61.8**): 61.8 → 65.6 (compras) → 65.7 (Tanque) → **66.4** (Soldado). Precios 6.8 → 11.4
(ajuste 45 % → 76 %), lados 58/42 → 55/45 (ruido), remontadas y variedad enteras. Tanques 21 → 129,
Tanque 0.87 por cada 1 (en la banda), Soldado 3.20x → 2.22x, aviones 36 % → 12 % de las compras.
Descartado: ahorrar dos turnos (`funds + 2 x ingresos`): 65.1, ahorra para aviones (Tanques 38).
Conclusion: el "Tanque rinde poco" de antes era sobre todo de la IA (no lo compraba), no del precio.
Siguiente: Soldado aun 2.2x; Escudero/Motorizado contra vehiculos o la infanteria barata junta.
Detalle: `balance/reports/tanques-vs-infanteria.md`.

## 2026-10-30 · reglas (combustible y municion) · ACEPTADO (por el usuario)

Cambio: fuera combustible, municion, repostaje y aviones que caen; Suministros pasa a reparar 20 a los
vehiculos y aviones de al lado (`src/core/content/units.json`, `rules.ts`, `ai.ts`).
Hipotesis: en 60 partidas IA contra IA el 14 % de los turnos de unidades con combustible estaban a 0
(paradas), el 7 % de las que usan municion no podian disparar y caian 171 aviones: estorbaban y quizas
eran parte de que las partidas no terminen.
Resultado (120 partidas 32x32): **66.2 → 66.4** (+0.2, ruido). Lados 53/47, remontadas 47 %, variedad
88 %, precios 11.4. Siguen **100 % sin terminar**.
Conclusion: quitarlos no estropea el equilibrio (lo pidio el usuario por diseño, no por la nota). Las
partidas que no acaban NO eran por la logistica: es la IA (no remata ni avanza a la Base). Ese es el
siguiente objetivo (entrenador de la IA, 30 puntos de margen en "duracion" y "decididas").
Rendimiento: Soldado 2.55x la mediana, Artilleria 1.70x, Bazuca 1.63x; Tanque 0.39x, Jeep 0.56x,
Motorizado 0.46x, Tanque anfibio 0.23x.

## 2026-10-30 · equilibrio (precios) · ACEPTADO (por el usuario, +0.9)

Cambio: `UNIT.cost.Bomber` 20000 → 13000 y `UNIT.cost.Missile_truck` 16000 → 11000, juntos (`src/core/data.ts`).
Hipotesis: por separado daban +0.7 cada uno (consistente en 80 y 120 partidas); juntos deberian sumar.
Resultado (120 partidas 32x32): **65.3 → 66.2** (+0.9). Precios 10.3 → 11.2 (ajuste 69 % → 75 %, 7 → 8 en la
banda); el resto igual (lados 48/52, remontadas 49 %).
- Rendimiento respecto a la mediana: Bombardero 0.45x → 0.76x (entra), Lanzamisiles 0.30x → 0.50x,
  Antiaereo 1.47x → 1.26x (entra); la infanteria barata sube algo (Soldado 3.68x → 3.84x, Escudero
  2.13x → 2.36x, Mortero 1.71x → 1.94x) porque la mediana cambia.
Conclusion: no llega al +1.0 del criterio, pero la mejora es real y en la direccion buena; el usuario
decidio aceptarlo. Con 15 unidades, cambios de precio sueltos dan menos de 1 punto: medir paquetes.
Siguiente en precios: la infanteria de 1500-2500 (Soldado, Bazuca, Escudero, Mortero) junta o su `POWER`
contra infanteria; Tanque anfibio (0.41x) sigue lejos.

## 2026-10-30 · equilibrio (precios), segunda ronda · DESCARTADO (3 intentos)

Con la nota corregida (linea base 65.3: lados 25, duracion 0, terminan 0, remontadas 15, variedad 15,
precios 10.3, ajuste 69 %). Pruebas rapidas de 80 partidas contra `base-80` (65.4, precios 10.4, ajuste 69 %).
Cambios en `UNIT.cost` (`src/core/data.ts`), uno cada vez y deshechos.

Medidas completas (120 partidas), los tres con las demas partes iguales (lados 25, remontadas 15, variedad 15):
- Lanzamisiles 16000 → 10000: **65.3 → 66.0** (+0.7). Precios 10.3 → 11.0 (ajuste 69 → 74 %, en la banda
  7 → 5). El Lanzamisiles pasa de 0.30x a 0.62x la mediana, pero el Antiaereo y el Motorizado salen por los bordes.
- Bombardero 20000 → 13000: **65.3 → 66.0** (+0.7). Precios 10.3 → 11.0 (ajuste 73 %, en la banda 8). Bombardero
  0.45x → dentro de la banda; lados 49/51.
- Lanzamisiles 16000 → 11000: **65.3 → 66.0** (+0.7). Precios 10.3 → 11.0 (ajuste 73 %). Lanzamisiles 0.52x.
Solo pruebas rapidas (80 partidas; base-80 precios 10.4):
- Soldado 1500 → 2000 (repetido con la nota nueva): lados 52/48, ya no resta (25/25), pero precios 10.4 → 10.4.
  El Soldado baja a 2.77x, y la Bazuca (2.02 → 2.33x) y el Escudero (1.96 → 2.40x) suben.
- Soldado 1500 → 3000: lados 50/50, precios 10.7. El Soldado **entra** en la banda (1.59x), pero Bazuca 2.55x,
  Escudero 2.61x y Mortero 2.02x se alejan.
- Lanzamisiles 8000: precios 10.9 (8 en la banda, pero Tanque y Tanque anfibio bajan). Tanque anfibio 10000: 10.6.
Conclusion:
- Ninguno llega al +1.0: con 15 unidades, arreglar una sola vale como mucho 1 punto de precios, y al moverla
  las vecinas en el borde de la banda se mueven tambien. Tres precios distintos dieron exactamente +0.7: la
  ganancia es real (sale igual en 80 y 120 partidas) pero pequeña. Con el criterio actual (+1.0 por cambio)
  un solo precio no basta; o se baja el umbral para precios, o se acepta un paquete de dos precios medido junto.
- Mejores candidatos si se aflojara: Bombardero 13000 (8 en la banda, sin efectos raros) y Lanzamisiles 10000-11000.
- El Soldado ya no desequilibra los bandos con la nota nueva (52/48 a 2000, 50/50 a 3000): el aviso del
  intento viejo era ruido. Pero encarecerlo pasa su ventaja a la Bazuca, el Escudero y el Mortero, que rinden
  tanto porque matan Soldados: si el Soldado vale mas, matarlo vale mas. Hay que mover la infanteria de 2500
  junto con el Soldado (o tocar su `POWER` contra infanteria), no el Soldado solo.

## 2026-10-30 · revision de la medida · ACEPTADO (herramienta) / Tanque RETIRADO

Cambio: la nota (`tools/improve/metrics.ts`) media mal dos cosas, y el Tanque a 9500 se retira.
- "Ningun bando con ventaja": 1 % de diferencia restaba 2.5 puntos, pero con 120 partidas el azar solo ya
  mueve el reparto unos ±10 %. Ahora puntua entero dentro del ruido (2/sqrt(partidas decididas)) y baja
  despues. Asi la nota no sube ni baja por suerte.
- "Unidades que rinden lo que cuestan": contaba unidades dentro de la banda (una que roza el borde
  entraba o salia por azar). Ahora es un ajuste continuo: dentro de la banda entera, fuera cada vez menos
  (escala logaritmica). Acercar una unidad a la banda suma aunque aun no entre.
Resultado con la nota nueva (mismas 120 partidas): Tanque 12000 **65.3** · Tanque 9500 **65.2**.
- Lados 25 → 25 (48/52 → 49/51, ruido ±10 %); precios 10.3 → 10.2 (ajuste 69 % → 68 %).
Conclusion: el +2.5 del Tanque era ruido. Se retira y se vuelve a 12000 (el test de `tests/setup.test.ts`
que lee el precio de `UNIT.cost` se queda: es mejor asi). Linea base nueva: **65.3** (Tanque 12000).
Ojo: con la nota nueva, el intento del Soldado a 2000 (lados 58/42) quizas no era tan malo: 58 % entra
casi en el ruido. Volver a medirlo con la nota nueva antes de descartarlo del todo.

## 2026-10-30 · equilibrio (precios) · DESCARTADO

Cambio: `UNIT.cost.Antiair` 8000 → 9500 (solo prueba rapida, sobre el Tanque a 9500 ya aceptado).
Hipotesis: el Antiaereo rinde 1.66x la mediana, justo por encima de la banda; un poco mas caro deberia
volver a entrar.
Resultado: prueba rapida (80 partidas, 40 dias, bandos cambiados): nota 56.2 → 37.0. El Antiaereo entra
en la banda (0.83 → 0.68), pero precios sigue en 7 de 15 (sale el Motorizado por el borde de abajo:
0.33 con la mediana mas alta) y **lados 52 % → 61 %** (19.2 → 0).
Conclusion: con 80-120 partidas la parte de lados manda: cualquier cambio de precio la mueve varios
puntos y tapa lo que se gana en precios (1 unidad = 1 punto). Antes de seguir afinando precios
convendria que la nota de lados fuera menos ruidosa (mas partidas o un margen) o que las partidas
terminen. Unidades en el borde de la banda (Tanque, Antiaereo, Mortero, Motorizado) entran y salen con el ruido.

## 2026-10-30 · equilibrio (precios) · ACEPTADO

Cambio: `UNIT.cost.Tank` 12000 → 9500 (`src/core/data.ts`).
Hipotesis: el Tanque rinde 0.61x la mediana (0.34 por cada 1); a 9500 deberia entrar en la banda
(0.67x-1.5x) sin tocar a los demas, como propone la herramienta de equilibrio.
Resultado: prueba rapida (80 partidas, 40 dias, bandos cambiados): precios 5 → 7 de 15, lados 51 % → 52 %.
Medida completa: **56.8 → 59.3** (+2.5).
- Ningun bando con ventaja 19.8 → 22.3 (48/52 → 49/51); duracion 0 → 0; terminan 0 → 0;
  remontadas 15 → 15 (47 % → 51 %); variedad 15 → 15; precios 7 → 7.
- El Tanque entra en la banda, pero el Antiaereo sale (estaba justo en el borde: 0.80 → 0.85, 1.66x).
Conclusion: la subida viene de "Ningun bando con ventaja", que se mueve mucho con 120 partidas (1 % = 2.5
puntos): tomarla con cautela. Lo que si es del precio: el Tanque ya rinde lo que cuesta. Siguiente idea:
Antiaereo 8000 → 9000 (justo encima del borde) o Mortero 2500 → 3000 (1.66x). El test de puntos por dias
de `tests/setup.test.ts` tenia el precio del Tanque escrito a mano: ahora lo lee de `UNIT.cost`.

## 2026-10-30 · equilibrio (precios) · DESCARTADO

Cambio: `UNIT.cost.Soldier` 1500 → 2000 (solo prueba rapida, sin tocar ficheros).
Hipotesis: el Soldado rinde 3.7x la mediana; mas caro, rinde menos y lo que lo mata vale mas.
Resultado: prueba rapida (80 partidas): nota 58.1 → 41.1. Precios 5 → 6 de 15, pero **lados 51 % → 58 %**
(23.1 → 5.1). El Soldado baja a 1.49 por cada 1, sigue fuera de la banda.
Conclusion: encarecer la infanteria barata desequilibra los bandos (quien mueve primero captura antes).
No volver a subir el Soldado sin mirar tambien el dinero inicial.

## 2026-10-29 · arranque · ACEPTADO

Cambio: herramientas del sistema (npm run metrics, arena, fuzz) y linea base.
Resultado:
- Nota del juego: **56.8 / 100** (120 partidas IA contra IA de 32x32, 40 dias).
  - Ningun bando con ventaja 19.8/25 (48 % / 52 %), variedad 15/15, remontadas 15/15.
  - **Duracion 0/15 y partidas que terminan 0/15: la IA contra la IA no termina ninguna partida en 40 dias.**
  - Precios 7/15: el Soldado rinde 3.7x la mediana; Tanque, Lanzamisiles, Bombardero y Tanque anfibio
    rinden menos de la mitad.
- Fuzz: primer fallo encontrado y arreglado (una captura a medias no se perdia al irse la unidad si
  nadie la consultaba). Despues, 200 partidas 20x20 (semillas 1-200) y 120 de 32x32 (1000-1119) sin fallos.
- Arena: IA de referencia guardada (improve/ai-baseline/ai.ts).

Conclusion / ideas para los siguientes ciclos:
- Lo que mas nota da: que la IA cierre partidas (30 puntos). Hipotesis: es demasiado defensiva o no
  ataca la Base enemiga; revisar `ai.ts` (objetivos, cuando avanzar) con la arena.
- Precios: abaratar las unidades que rinden poco o encarecer el Soldado (una cosa cada vez).
- Fuzz: seguir desde la semilla 1120 (32x32) y 201 (20x20).
