# Informe de equilibrio: ia-fase4-tortuga

40 partidas (tortuga vs ai (lados alternos)), semillas 1-40, maximo 60 dias. 2026-11-20 00:13.

## Avisos

- Duracion mediana 36 dias (objetivo 15-25).
- 88 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 4 / 1 (10 % / 3 %) |
| Sin terminar | 35: con ventaja clara 16 / 15, igualadas 4 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 5 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 36 (28-42), 35.2 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 61 % (36 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 64 % (36 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 72 % (36 partidas) |
| Dia 10: edificios / valor del ejercito | 9.1 vs 9.4 / 39987 vs 41667 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.5 / 13.7 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| tortuga | 40 | 1 | 17 | 45 % |
| ai | 40 | 4 | 14 | 45 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| tortuga | 16.4 | 77 % | 3.3 casillas | 29 % | 66 ms / 202 ms |
| ai | 15.7 | 73 % | 3.5 casillas | 27 % | 67 ms / 200 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 509 | 18.9 | 0.55 | 45 % | 304 | 0 |
| Soldado | 1500 | 232 | 8.6 | 1.36 | 0 % | 116 | 2167 |
| Escudero | 2500 | 229 | 8.5 | 1.11 | 55 % | 95 | 690 |
| Bazuca | 2500 | 224 | 8.3 | 0.90 | 38 % | 70 | 427 |
| Mortero | 2500 | 213 | 7.9 | 0.54 | 43 % | 31 | 396 |
| Transporte | 8000 | 166 | 6.2 | — | 30 % | 0 | 0 |
| Suministros | 6000 | 161 | 6.0 | — | 32 % | 0 | 0 |
| Tanque ligero | 7000 | 119 | 4.4 | 0.68 | 36 % | 113 | 0 |
| Artillería | 8000 | 117 | 4.3 | 0.93 | 7 % | 69 | 0 |
| Helicóptero | 10000 | 116 | 4.3 | — | 36 % | 0 | 0 |
| Antiaéreo | 8000 | 110 | 4.1 | 1.63 | 48 % | 67 | 0 |
| Barricada | 5000 | 105 | 3.9 | — | 64 % | 0 | 0 |
| Bombardero | 13000 | 98 | 3.6 | 1.99 | 48 % | 406 | 0 |
| Caza ligero | 15000 | 70 | 2.6 | 1.56 | 56 % | 223 | 0 |
| Motorizado | 2500 | 61 | 2.3 | 0.59 | 34 % | 23 | 193 |
| Tanque anfibio | 11000 | 52 | 1.9 | 0.32 | 27 % | 44 | 0 |
| Tanque | 12000 | 49 | 1.8 | 0.62 | 43 % | 69 | 0 |
| Lanzamisiles | 11000 | 49 | 1.8 | 1.35 | 47 % | 57 | 0 |
| Caza | 20000 | 19 | 0.7 | 1.28 | 89 % | 32 | 0 |
