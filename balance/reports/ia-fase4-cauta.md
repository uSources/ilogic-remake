# Informe de equilibrio: ia-fase4-cauta

40 partidas (cauta vs ai (lados alternos)), semillas 1-40, maximo 60 dias. 2026-11-20 00:02.

## Avisos

- Duracion mediana 49 dias (objetivo 15-25).
- 90 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 2 / 2 (5 % / 5 %) |
| Sin terminar | 36: con ventaja clara 16 / 16, igualadas 4 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 4 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 49 (38-49), 43.8 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 64 % (36 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 64 % (36 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 81 % (36 partidas) |
| Dia 10: edificios / valor del ejercito | 9.0 vs 9.4 / 39337 vs 40861 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.6 / 14.1 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| cauta | 40 | 1 | 14 | 38 % |
| ai | 40 | 3 | 18 | 53 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| cauta | 15.4 | 77 % | 3.2 casillas | 29 % | 67 ms / 209 ms |
| ai | 15.4 | 74 % | 3.6 casillas | 28 % | 68 ms / 206 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 512 | 19.5 | 0.68 | 48 % | 347 | 0 |
| Escudero | 2500 | 232 | 8.8 | 1.24 | 54 % | 102 | 728 |
| Soldado | 1500 | 230 | 8.8 | 1.47 | 0 % | 97 | 2073 |
| Bazuca | 2500 | 228 | 8.7 | 0.90 | 33 % | 67 | 435 |
| Mortero | 2500 | 212 | 8.1 | 0.46 | 39 % | 26 | 405 |
| Transporte | 8000 | 152 | 5.8 | — | 30 % | 0 | 0 |
| Suministros | 6000 | 137 | 5.2 | — | 31 % | 0 | 0 |
| Helicóptero | 10000 | 120 | 4.6 | — | 42 % | 0 | 0 |
| Artillería | 8000 | 117 | 4.5 | 0.81 | 12 % | 81 | 0 |
| Tanque ligero | 7000 | 113 | 4.3 | 0.84 | 47 % | 125 | 0 |
| Antiaéreo | 8000 | 108 | 4.1 | 1.40 | 53 % | 49 | 0 |
| Barricada | 5000 | 103 | 3.9 | — | 62 % | 0 | 0 |
| Motorizado | 2500 | 70 | 2.7 | 0.42 | 36 % | 14 | 189 |
| Bombardero | 13000 | 67 | 2.6 | 1.93 | 48 % | 244 | 0 |
| Caza ligero | 15000 | 63 | 2.4 | 1.83 | 75 % | 255 | 0 |
| Tanque | 12000 | 58 | 2.2 | 0.83 | 53 % | 117 | 0 |
| Lanzamisiles | 11000 | 54 | 2.1 | 1.16 | 31 % | 66 | 0 |
| Tanque anfibio | 11000 | 36 | 1.4 | 0.31 | 47 % | 19 | 0 |
| Caza | 20000 | 13 | 0.5 | 1.13 | 54 % | 23 | 0 |
