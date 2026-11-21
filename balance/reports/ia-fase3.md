# Informe de equilibrio: ia-fase3 (memoria de 1 dia)

60 partidas (memoria vs ai (lados alternos)), semillas 1-60, maximo 60 dias. 2026-11-19 22:54.

## Avisos

- Duracion mediana 49 dias (objetivo 15-25).
- 85 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 3 / 6 (5 % / 10 %) |
| Sin terminar | 51: con ventaja clara 22 / 22, igualadas 7 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 9 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 49 (30-60), 49.1 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 52 % (52 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 55 % (53 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 66 % (53 partidas) |
| Dia 10: edificios / valor del ejercito | 9.1 vs 9.5 / 40607 vs 40556 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.6 / 13.9 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| memoria | 60 | 3 | 24 | 45 % |
| ai | 60 | 6 | 20 | 43 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| memoria | 16.3 | 73 % | 3.5 casillas | 28 % | 64 ms / 199 ms |
| ai | 16.3 | 72 % | 3.4 casillas | 28 % | 65 ms / 200 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 793 | 18.9 | 0.60 | 44 % | 459 | 0 |
| Soldado | 1500 | 387 | 9.2 | 1.47 | 0 % | 182 | 3289 |
| Bazuca | 2500 | 356 | 8.5 | 1.11 | 41 % | 172 | 680 |
| Mortero | 2500 | 355 | 8.4 | 0.63 | 39 % | 63 | 676 |
| Escudero | 2500 | 354 | 8.4 | 1.20 | 51 % | 177 | 924 |
| Transporte | 8000 | 251 | 6.0 | — | 29 % | 0 | 0 |
| Suministros | 6000 | 222 | 5.3 | — | 32 % | 0 | 0 |
| Tanque ligero | 7000 | 209 | 5.0 | 0.69 | 39 % | 181 | 0 |
| Artillería | 8000 | 180 | 4.3 | 0.94 | 3 % | 128 | 0 |
| Antiaéreo | 8000 | 167 | 4.0 | 1.51 | 50 % | 91 | 0 |
| Helicóptero | 10000 | 166 | 3.9 | — | 42 % | 0 | 0 |
| Barricada | 5000 | 163 | 3.9 | — | 59 % | 0 | 0 |
| Bombardero | 13000 | 136 | 3.2 | 1.75 | 49 % | 478 | 0 |
| Motorizado | 2500 | 100 | 2.4 | 0.70 | 36 % | 39 | 239 |
| Lanzamisiles | 11000 | 87 | 2.1 | 1.09 | 41 % | 110 | 0 |
| Tanque anfibio | 11000 | 86 | 2.0 | 0.47 | 28 % | 72 | 0 |
| Tanque | 12000 | 84 | 2.0 | 0.85 | 52 % | 193 | 0 |
| Caza ligero | 15000 | 82 | 1.9 | 1.79 | 59 % | 316 | 0 |
| Caza | 20000 | 28 | 0.7 | 1.32 | 71 % | 46 | 0 |
