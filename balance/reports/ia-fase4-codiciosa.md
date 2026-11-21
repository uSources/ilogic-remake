# Informe de equilibrio: ia-fase4-codiciosa

40 partidas (codiciosa vs ai (lados alternos)), semillas 1-40, maximo 60 dias. 2026-11-20 00:07.

## Avisos

- Duracion mediana 41 dias (objetivo 15-25).
- 90 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 2 / 2 (5 % / 5 %) |
| Sin terminar | 36: con ventaja clara 19 / 13, igualadas 4 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 4 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 41 (34-55), 42.3 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 43 % (35 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 61 % (36 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 72 % (36 partidas) |
| Dia 10: edificios / valor del ejercito | 9.1 vs 9.5 / 40171 vs 41271 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.7 / 14.1 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| codiciosa | 40 | 3 | 19 | 55 % |
| ai | 40 | 1 | 13 | 35 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| codiciosa | 15.4 | 73 % | 3.3 casillas | 28 % | 64 ms / 196 ms |
| ai | 15.9 | 72 % | 3.4 casillas | 27 % | 65 ms / 201 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 509 | 18.5 | 0.65 | 46 % | 342 | 0 |
| Soldado | 1500 | 267 | 9.7 | 1.38 | 0 % | 120 | 2205 |
| Mortero | 2500 | 238 | 8.6 | 0.61 | 41 % | 39 | 464 |
| Escudero | 2500 | 237 | 8.6 | 1.20 | 57 % | 89 | 662 |
| Bazuca | 2500 | 221 | 8.0 | 0.99 | 43 % | 87 | 386 |
| Suministros | 6000 | 164 | 6.0 | — | 31 % | 0 | 0 |
| Transporte | 8000 | 161 | 5.8 | — | 29 % | 0 | 0 |
| Artillería | 8000 | 122 | 4.4 | 0.86 | 5 % | 71 | 0 |
| Tanque ligero | 7000 | 121 | 4.4 | 0.79 | 40 % | 135 | 0 |
| Barricada | 5000 | 114 | 4.1 | — | 59 % | 0 | 0 |
| Antiaéreo | 8000 | 108 | 3.9 | 1.46 | 56 % | 53 | 0 |
| Helicóptero | 10000 | 105 | 3.8 | — | 44 % | 0 | 0 |
| Bombardero | 13000 | 85 | 3.1 | 1.81 | 35 % | 310 | 0 |
| Motorizado | 2500 | 71 | 2.6 | 0.57 | 35 % | 20 | 172 |
| Caza ligero | 15000 | 68 | 2.5 | 1.46 | 63 % | 220 | 0 |
| Tanque anfibio | 11000 | 57 | 2.1 | 0.47 | 35 % | 56 | 0 |
| Lanzamisiles | 11000 | 47 | 1.7 | 1.31 | 60 % | 75 | 0 |
| Tanque | 12000 | 41 | 1.5 | 0.79 | 46 % | 84 | 0 |
| Caza | 20000 | 19 | 0.7 | 1.58 | 84 % | 36 | 0 |
