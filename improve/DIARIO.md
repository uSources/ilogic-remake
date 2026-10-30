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
