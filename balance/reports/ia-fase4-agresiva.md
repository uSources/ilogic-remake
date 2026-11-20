# Informe de equilibrio: ia-fase4-agresiva

40 partidas (agresiva vs ai (lados alternos)), semillas 1-40, maximo 60 dias. 2026-11-19 23:57.

## Avisos

- Duracion mediana 49 dias (objetivo 15-25).
- 88 % de partidas sin terminar en 60 dias.

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 3 / 2 (8 % / 5 %) |
| Sin terminar | 35: con ventaja clara 12 / 18, igualadas 5 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 5 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 49 (36-59), 46.4 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 47 % (34 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 63 % (35 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 74 % (35 partidas) |
| Dia 10: edificios / valor del ejercito | 9.1 vs 9.5 / 40121 vs 40923 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 9.6 / 13.6 |

## IA

| Perfil | Partidas | Gana | Con ventaja al final | Total |
|---|---:|---:|---:|---:|
| agresiva | 40 | 2 | 16 | 45 % |
| ai | 40 | 3 | 14 | 43 % |

| Perfil | Regaladas por partida | Regaladas / bajas | Al aliado más cercano | Vaivenes | Turno (media / p95) |
|---|---:|---:|---:|---:|---:|
| agresiva | 19.4 | 69 % | 3.6 casillas | 25 % | 63 ms / 201 ms |
| ai | 14.2 | 66 % | 3.4 casillas | 28 % | 69 ms / 213 ms |

Regaladas: unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno. Vaivenes: movimientos que van en contra del anterior de la misma unidad. Menos es más humano en las dos.

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jeep | 4000 | 515 | 17.4 | 0.59 | 39 % | 296 | 0 |
| Escudero | 2500 | 271 | 9.2 | 1.43 | 50 % | 144 | 705 |
| Bazuca | 2500 | 264 | 8.9 | 1.21 | 34 % | 123 | 420 |
| Soldado | 1500 | 256 | 8.7 | 1.56 | 0 % | 131 | 2069 |
| Mortero | 2500 | 230 | 7.8 | 0.68 | 34 % | 52 | 392 |
| Transporte | 8000 | 179 | 6.1 | — | 26 % | 0 | 0 |
| Suministros | 6000 | 164 | 5.5 | — | 32 % | 0 | 0 |
| Tanque ligero | 7000 | 148 | 5.0 | 0.77 | 40 % | 166 | 0 |
| Artillería | 8000 | 146 | 4.9 | 0.96 | 8 % | 123 | 0 |
| Antiaéreo | 8000 | 132 | 4.5 | 1.46 | 47 % | 77 | 0 |
| Helicóptero | 10000 | 125 | 4.2 | — | 42 % | 0 | 0 |
| Barricada | 5000 | 113 | 3.8 | — | 57 % | 0 | 0 |
| Bombardero | 13000 | 86 | 2.9 | 1.74 | 36 % | 300 | 0 |
| Caza ligero | 15000 | 72 | 2.4 | 1.61 | 56 % | 259 | 0 |
| Motorizado | 2500 | 65 | 2.2 | 0.57 | 29 % | 24 | 154 |
| Tanque | 12000 | 60 | 2.0 | 0.85 | 42 % | 121 | 0 |
| Lanzamisiles | 11000 | 60 | 2.0 | 1.20 | 47 % | 101 | 0 |
| Tanque anfibio | 11000 | 56 | 1.9 | 0.46 | 21 % | 44 | 0 |
| Caza | 20000 | 16 | 0.5 | 1.06 | 88 % | 26 | 0 |
