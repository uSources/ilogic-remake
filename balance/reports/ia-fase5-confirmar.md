# Informe de equilibrio: ia-fase5-confirmar

80 partidas (actual vs ai (lados alternos)), semillas 101-180, maximo 60 dias. 2026-11-20 01:21.

**Cambios de esta variante:**

- `AI.minCapturers`: 4 → 5
- `AI.maxCaptureDistance`: 8 → 6

## Avisos

- Duracion mediana 38 dias (objetivo 15-25).
- 93 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 4 / 2 (5 % / 3 %) |
| Sin terminar | 74: con ventaja clara 31 / 30, igualadas 13 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 6 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 38 (28-54), 37.8 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 61 % (67 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 64 % (67 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 73 % (67 partidas) |
| Dia 10: edificios / valor del ejercito | 9.0 vs 9.2 / 39818 vs 41548 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.7 / 14.0 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| actual | 80 | 3 | 27 | 38 % |
| ai | 80 | 3 | 34 | 46 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| actual | 15.6 | 73 % | 3.4 casillas | 29 % | 55 ms / 168 ms |
| ai | 14.2 | 71 % | 3.6 casillas | 27 % | 56 ms / 171 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 1070 | 20.1 | 0.59 | 48 % | 610 | 0 |
| Bazuca | 2500 | 476 | 8.9 | 0.96 | 38 % | 185 | 1063 |
| Soldado | 1500 | 470 | 8.8 | 1.73 | 0 % | 233 | 4509 |
| Escudero | 2500 | 460 | 8.6 | 1.25 | 54 % | 236 | 1423 |
| Mortero | 2500 | 440 | 8.3 | 0.52 | 38 % | 55 | 975 |
| Transporte | 8000 | 317 | 5.9 | — | 36 % | 0 | 0 |
| Suministros | 6000 | 290 | 5.4 | — | 34 % | 0 | 0 |
| Antiaéreo | 8000 | 233 | 4.4 | 1.28 | 54 % | 99 | 0 |
| Artillería | 8000 | 223 | 4.2 | 1.03 | 10 % | 151 | 0 |
| Tanque ligero | 7000 | 220 | 4.1 | 0.73 | 45 % | 221 | 0 |
| Helicóptero | 10000 | 220 | 4.1 | — | 43 % | 0 | 0 |
| Barricada | 5000 | 205 | 3.8 | — | 68 % | 0 | 0 |
| Bombardero | 13000 | 146 | 2.7 | 2.02 | 49 % | 609 | 0 |
| Caza ligero | 15000 | 132 | 2.5 | 1.67 | 61 % | 509 | 0 |
| Motorizado | 2500 | 120 | 2.3 | 0.55 | 32 % | 32 | 230 |
| Tanque anfibio | 11000 | 96 | 1.8 | 0.48 | 30 % | 73 | 0 |
| Tanque | 12000 | 93 | 1.7 | 0.83 | 42 % | 174 | 0 |
| Lanzamisiles | 11000 | 79 | 1.5 | 0.75 | 48 % | 80 | 0 |
| Caza | 20000 | 41 | 0.8 | 0.99 | 68 % | 50 | 0 |
