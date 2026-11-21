# Informe de equilibrio: ia-fase2

80 partidas (planes vs ai (lados alternos)), semillas 1-80, maximo 60 dias. 2026-11-19 21:58.

## Avisos

- Duracion mediana 39 dias (objetivo 15-25).
- 89 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 6 / 3 (8 % / 4 %) |
| Sin terminar | 71: con ventaja clara 31 / 31, igualadas 9 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 9 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 39 (26-60), 42 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 51 % (70 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 66 % (71 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 77 % (71 partidas) |
| Dia 10: edificios / valor del ejercito | 8.8 vs 9.4 / 39748 vs 40976 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.6 / 13.8 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| planes | 80 | 4 | 38 | 53 % |
| ai | 80 | 5 | 24 | 36 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| planes | 16.6 | 74 % | 3.4 casillas | 28 % | 59 ms / 188 ms |
| ai | 14.7 | 73 % | 3.1 casillas | 27 % | 58 ms / 184 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 1058 | 19.4 | 0.63 | 47 % | 656 | 0 |
| Escudero | 2500 | 513 | 9.4 | 1.23 | 55 % | 273 | 1380 |
| Soldado | 1500 | 473 | 8.7 | 1.38 | 0 % | 175 | 3791 |
| Bazuca | 2500 | 449 | 8.2 | 0.94 | 42 % | 168 | 803 |
| Mortero | 2500 | 446 | 8.2 | 0.65 | 39 % | 84 | 709 |
| Suministros | 6000 | 306 | 5.6 | — | 36 % | 0 | 0 |
| Transporte | 8000 | 299 | 5.5 | — | 32 % | 0 | 0 |
| Artillería | 8000 | 247 | 4.5 | 1.08 | 15 % | 218 | 0 |
| Tanque ligero | 7000 | 242 | 4.4 | 0.79 | 43 % | 253 | 0 |
| Helicóptero | 10000 | 229 | 4.2 | — | 38 % | 0 | 0 |
| Antiaéreo | 8000 | 208 | 3.8 | 1.61 | 42 % | 124 | 0 |
| Barricada | 5000 | 205 | 3.8 | — | 65 % | 0 | 0 |
| Motorizado | 2500 | 164 | 3.0 | 0.46 | 37 % | 29 | 353 |
| Bombardero | 13000 | 148 | 2.7 | 1.56 | 49 % | 488 | 0 |
| Caza ligero | 15000 | 128 | 2.4 | 1.54 | 54 % | 436 | 0 |
| Tanque anfibio | 11000 | 102 | 1.9 | 0.45 | 29 % | 92 | 0 |
| Tanque | 12000 | 101 | 1.9 | 0.91 | 37 % | 220 | 0 |
| Lanzamisiles | 11000 | 86 | 1.6 | 1.22 | 44 % | 123 | 0 |
| Caza | 20000 | 39 | 0.7 | 1.17 | 67 % | 64 | 0 |
