# Informe de equilibrio: ia-fase4-facil

40 partidas (facil vs ai (lados alternos)), semillas 1-40, maximo 60 dias. 2026-11-19 23:52.

## Avisos

- Duracion mediana 32 dias (objetivo 15-25).
- 83 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 2 / 5 (5 % / 13 %) |
| Sin terminar | 33: con ventaja clara 17 / 11, igualadas 5 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 7 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 32 (25-60), 36.3 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 69 % (35 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 77 % (35 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 80 % (35 partidas) |
| Dia 10: edificios / valor del ejercito | 8.8 vs 9.1 / 37376 vs 38218 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 8.0 / 11.8 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| facil | 40 | 0 | 10 | 25 % |
| ai | 40 | 7 | 18 | 63 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| facil | 14.7 | 71 % | 4.1 casillas | 28 % | 52 ms / 179 ms |
| ai | 15.7 | 78 % | 3.5 casillas | 27 % | 64 ms / 197 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 404 | 15.8 | 0.52 | 49 % | 182 | 0 |
| Mortero | 2500 | 216 | 8.4 | 0.75 | 39 % | 27 | 335 |
| Soldado | 1500 | 191 | 7.5 | 1.23 | 0 % | 69 | 2014 |
| Bazuca | 2500 | 186 | 7.3 | 1.33 | 46 % | 95 | 297 |
| Escudero | 2500 | 183 | 7.2 | 0.99 | 54 % | 76 | 505 |
| Artillería | 8000 | 154 | 6.0 | 0.80 | 12 % | 97 | 0 |
| Transporte | 8000 | 150 | 5.9 | — | 32 % | 0 | 0 |
| Suministros | 6000 | 148 | 5.8 | — | 30 % | 0 | 0 |
| Tanque ligero | 7000 | 141 | 5.5 | 0.90 | 35 % | 159 | 0 |
| Antiaéreo | 8000 | 135 | 5.3 | 1.59 | 36 % | 82 | 0 |
| Bombardero | 13000 | 115 | 4.5 | 1.61 | 43 % | 348 | 0 |
| Helicóptero | 10000 | 105 | 4.1 | — | 46 % | 0 | 0 |
| Barricada | 5000 | 93 | 3.6 | — | 63 % | 0 | 0 |
| Caza ligero | 15000 | 80 | 3.1 | 1.57 | 60 % | 224 | 0 |
| Tanque | 12000 | 71 | 2.8 | 0.71 | 37 % | 120 | 0 |
| Tanque anfibio | 11000 | 59 | 2.3 | 0.50 | 24 % | 48 | 0 |
| Lanzamisiles | 11000 | 57 | 2.2 | 1.15 | 39 % | 75 | 0 |
| Motorizado | 2500 | 48 | 1.9 | 0.47 | 38 % | 4 | 95 |
| Caza | 20000 | 23 | 0.9 | 1.03 | 61 % | 30 | 0 |
