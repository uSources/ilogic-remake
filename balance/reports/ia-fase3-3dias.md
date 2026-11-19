# Informe de equilibrio: ia-fase3-3dias (memoria de 3 dias)

60 partidas (memoria vs ai (lados alternos)), semillas 1-60, maximo 60 dias. 2026-11-19 22:46.

## Avisos

- Duracion mediana 53 dias (objetivo 15-25).
- 92 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 2 / 3 (3 % / 5 %) |
| Sin terminar | 55: con ventaja clara 24 / 21, igualadas 10 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 5 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 53 (30-55), 47.4 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 55 % (49 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 58 % (50 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 70 % (50 partidas) |
| Dia 10: edificios / valor del ejercito | 9.1 vs 9.5 / 40607 vs 40556 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.6 / 13.9 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| memoria | 60 | 1 | 23 | 40 % |
| ai | 60 | 4 | 22 | 43 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| memoria | 16.8 | 73 % | 3.5 casillas | 29 % | 66 ms / 210 ms |
| ai | 16.7 | 71 % | 3.4 casillas | 27 % | 67 ms / 209 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 841 | 19.6 | 0.62 | 44 % | 492 | 0 |
| Soldado | 1500 | 380 | 8.9 | 1.41 | 0 % | 164 | 3258 |
| Bazuca | 2500 | 376 | 8.8 | 0.98 | 39 % | 176 | 705 |
| Mortero | 2500 | 369 | 8.6 | 0.63 | 36 % | 75 | 665 |
| Escudero | 2500 | 333 | 7.8 | 1.25 | 50 % | 167 | 1061 |
| Transporte | 8000 | 263 | 6.1 | — | 31 % | 0 | 0 |
| Suministros | 6000 | 246 | 5.7 | — | 32 % | 0 | 0 |
| Artillería | 8000 | 188 | 4.4 | 0.90 | 6 % | 133 | 0 |
| Tanque ligero | 7000 | 186 | 4.3 | 0.76 | 42 % | 180 | 0 |
| Antiaéreo | 8000 | 183 | 4.3 | 1.38 | 50 % | 92 | 0 |
| Helicóptero | 10000 | 172 | 4.0 | — | 43 % | 0 | 0 |
| Barricada | 5000 | 157 | 3.7 | — | 59 % | 0 | 0 |
| Bombardero | 13000 | 122 | 2.8 | 1.90 | 36 % | 468 | 0 |
| Motorizado | 2500 | 105 | 2.4 | 0.69 | 32 % | 34 | 265 |
| Caza ligero | 15000 | 94 | 2.2 | 1.65 | 62 % | 363 | 0 |
| Tanque anfibio | 11000 | 86 | 2.0 | 0.44 | 30 % | 84 | 0 |
| Tanque | 12000 | 83 | 1.9 | 0.88 | 49 % | 182 | 0 |
| Lanzamisiles | 11000 | 82 | 1.9 | 1.39 | 46 % | 135 | 0 |
| Caza | 20000 | 22 | 0.5 | 1.58 | 68 % | 49 | 0 |
