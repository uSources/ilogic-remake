# Informe de equilibrio: ia-fase1

80 partidas (influencia vs ai (lados alternos)), semillas 1-80, maximo 60 dias. 2026-11-19 21:01.

## Avisos

- Duracion mediana 50 dias (objetivo 15-25).
- 93 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 3 / 3 (4 % / 4 %) |
| Sin terminar | 74: con ventaja clara 30 / 31, igualadas 13 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 6 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 50 (31-58), 44 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 49 % (67 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 55 % (67 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 79 % (67 partidas) |
| Dia 10: edificios / valor del ejercito | 8.6 vs 9.0 / 39479 vs 40407 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.5 / 13.7 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| influencia | 80 | 5 | 27 | 40 % |
| ai | 80 | 1 | 34 | 44 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| influencia | 16.5 | 71 % | 3.1 casillas | 28 % | 59 ms / 191 ms |
| ai | 19.2 | 67 % | 3.5 casillas | 24 % | 36 ms / 116 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 1213 | 19.7 | 0.50 | 40 % | 696 | 0 |
| Soldado | 1500 | 613 | 9.9 | 1.34 | 0 % | 273 | 3422 |
| Escudero | 2500 | 535 | 8.7 | 1.18 | 47 % | 265 | 1077 |
| Mortero | 2500 | 528 | 8.6 | 0.70 | 33 % | 98 | 606 |
| Bazuca | 2500 | 499 | 8.1 | 1.14 | 33 % | 243 | 723 |
| Transporte | 8000 | 361 | 5.9 | — | 25 % | 0 | 0 |
| Suministros | 6000 | 318 | 5.2 | — | 31 % | 0 | 0 |
| Antiaéreo | 8000 | 271 | 4.4 | 1.43 | 41 % | 134 | 0 |
| Tanque ligero | 7000 | 258 | 4.2 | 0.88 | 34 % | 276 | 0 |
| Artillería | 8000 | 257 | 4.2 | 1.27 | 12 % | 238 | 0 |
| Helicóptero | 10000 | 240 | 3.9 | — | 38 % | 0 | 0 |
| Barricada | 5000 | 209 | 3.4 | — | 65 % | 0 | 0 |
| Motorizado | 2500 | 181 | 2.9 | 0.46 | 33 % | 34 | 316 |
| Bombardero | 13000 | 171 | 2.8 | 2.07 | 51 % | 762 | 0 |
| Caza ligero | 15000 | 152 | 2.5 | 1.76 | 63 % | 648 | 0 |
| Tanque | 12000 | 120 | 1.9 | 0.79 | 38 % | 227 | 0 |
| Lanzamisiles | 11000 | 110 | 1.8 | 1.11 | 35 % | 128 | 0 |
| Tanque anfibio | 11000 | 89 | 1.4 | 0.46 | 21 % | 85 | 0 |
| Caza | 20000 | 41 | 0.7 | 0.78 | 51 % | 45 | 0 |
