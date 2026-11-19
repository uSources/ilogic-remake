# Informe de equilibrio: ia-base

100 partidas (ai vs ai), semillas 1-100, maximo 60 dias. 2026-11-19 20:14.

## Avisos

- Duracion mediana 45 dias (objetivo 15-25).
- 93 % de partidas sin terminar en 60 dias.
- Tanque: rinde 0.65x la mediana (destruye 0.79 por cada 1 que cuesta).
- Jeep: rinde 0.41x la mediana (destruye 0.51 por cada 1 que cuesta).
- Motorizado: rinde 0.33x la mediana (destruye 0.41 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.35x la mediana (destruye 0.43 por cada 1 que cuesta).

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Tank`: 12000 → **9500** (rinde poco para lo que cuesta)
- `UNIT.cost.Car`: 4000 → **3000** (rinde poco para lo que cuesta)
- `UNIT.cost.FSoldier`: 2500 → **2000** (rinde poco para lo que cuesta)
- `UNIT.cost.WTank`: 11000 → **9000** (rinde poco para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 4 / 3 (4 % / 3 %) |
| Sin terminar | 93: con ventaja clara 37 / 41, igualadas 15 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 7 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 45 (27-52), 42 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 57 % (84 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 74 % (85 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 86 % (85 partidas) |
| Dia 10: edificios / valor del ejercito | 8.7 vs 9.1 / 39883 vs 39972 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.4 / 13.3 |

## IA

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| ai | 19.0 | 67 % | 3.3 casillas | 24 % | 34 ms / 109 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 1585 | 19.4 | 0.51 | 37 % | 867 | 0 |
| Soldado | 1500 | 749 | 9.2 | 1.40 | 0 % | 367 | 4312 |
| Escudero | 2500 | 667 | 8.2 | 1.41 | 46 % | 446 | 1295 |
| Mortero | 2500 | 652 | 8.0 | 0.86 | 34 % | 148 | 684 |
| Bazuca | 2500 | 644 | 7.9 | 1.23 | 35 % | 299 | 895 |
| Transporte | 8000 | 475 | 5.8 | — | 25 % | 0 | 0 |
| Suministros | 6000 | 447 | 5.5 | — | 30 % | 0 | 0 |
| Tanque ligero | 7000 | 359 | 4.4 | 0.83 | 38 % | 416 | 0 |
| Helicóptero | 10000 | 355 | 4.3 | — | 28 % | 0 | 0 |
| Antiaéreo | 8000 | 351 | 4.3 | 1.82 | 39 % | 249 | 0 |
| Artillería | 8000 | 328 | 4.0 | 1.56 | 9 % | 350 | 0 |
| Barricada | 5000 | 276 | 3.4 | — | 60 % | 0 | 0 |
| Motorizado | 2500 | 258 | 3.2 | 0.41 | 26 % | 57 | 305 |
| Bombardero | 13000 | 239 | 2.9 | 1.71 | 41 % | 864 | 0 |
| Caza ligero | 15000 | 222 | 2.7 | 1.33 | 51 % | 709 | 0 |
| Tanque anfibio | 11000 | 182 | 2.2 | 0.43 | 24 % | 134 | 0 |
| Tanque | 12000 | 173 | 2.1 | 0.79 | 34 % | 337 | 0 |
| Lanzamisiles | 11000 | 150 | 1.8 | 1.62 | 45 % | 274 | 0 |
| Caza | 20000 | 69 | 0.8 | 1.16 | 54 % | 115 | 0 |
