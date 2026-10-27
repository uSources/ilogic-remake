# Informe de equilibrio: mov-ia

100 partidas (ai vs ai), semillas 1-100, maximo 60 dias. 2026-10-27 15:11.

## Avisos

- Duracion mediana 28 dias (objetivo 15-25).
- 99 % de partidas sin terminar en 60 dias.
- Soldado: rinde 3.51x la mediana (destruye 2.21 por cada 1 que cuesta).
- Jeep: rinde 0.65x la mediana (destruye 0.41 por cada 1 que cuesta).
- Bazuca: rinde 2.39x la mediana (destruye 1.51 por cada 1 que cuesta).
- Escudero: rinde 2.37x la mediana (destruye 1.49 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.34x la mediana (destruye 0.21 por cada 1 que cuesta).
- Bombardero: rinde 0.45x la mediana (destruye 0.28 por cada 1 que cuesta).
- Antiaéreo: rinde 1.59x la mediana (destruye 1.00 por cada 1 que cuesta).
- Mortero: rinde 1.85x la mediana (destruye 1.16 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.37x la mediana (destruye 0.23 por cada 1 que cuesta).

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Soldier`: 1500 → **2000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Car`: 5000 → **4000** (rinde poco para lo que cuesta)
- `UNIT.cost.BSoldier`: 2500 → **3000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.SSoldier`: 2500 → **3000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Missile_truck`: 16000 → **13000** (rinde poco para lo que cuesta)
- `UNIT.cost.Bomber`: 20000 → **16000** (rinde poco para lo que cuesta)
- `UNIT.cost.Antiair`: 8000 → **10000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.MSoldier`: 2500 → **3000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.WTank`: 15000 → **12000** (rinde poco para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 1 / 0 (1 % / 0 %) |
| Sin terminar | 99: con ventaja clara 36 / 46, igualadas 17 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 1 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 28 (28-28), 28 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 60 % (81 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 69 % (83 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 82 % (83 partidas) |
| Dia 10: edificios / valor del ejercito | 9.4 vs 9.9 / 62201 vs 64023 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 2411 | 14.2 | 0.43 | 49 % | 805 | 1064 |
| Mortero | 2500 | 2075 | 12.2 | 1.16 | 41 % | 904 | 1382 |
| Bazuca | 2500 | 2073 | 12.2 | 1.51 | 36 % | 1161 | 1764 |
| Escudero | 2500 | 2072 | 12.2 | 1.49 | 47 % | 1626 | 1978 |
| Soldado | 1500 | 2012 | 11.8 | 2.21 | 20 % | 1435 | 3712 |
| Jeep | 5000 | 1134 | 6.7 | 0.41 | 41 % | 632 | 0 |
| Tanque ligero | 7000 | 687 | 4.0 | 0.56 | 45 % | 446 | 0 |
| Artillería | 8000 | 594 | 3.5 | 0.78 | 47 % | 483 | 0 |
| Antiaéreo | 8000 | 570 | 3.4 | 1.00 | 55 % | 165 | 0 |
| Tanque | 12000 | 476 | 2.8 | 0.43 | 58 % | 379 | 0 |
| Lanzamisiles | 16000 | 444 | 2.6 | 0.21 | 74 % | 262 | 0 |
| Tanque anfibio | 15000 | 436 | 2.6 | 0.23 | 37 % | 303 | 0 |
| Caza ligero | 12000 | 351 | 2.1 | 0.63 | 17 % | 443 | 0 |
| Suministros | 6000 | 330 | 1.9 | — | 39 % | 0 | 0 |
| Caza | 20000 | 321 | 1.9 | 0.67 | 25 % | 202 | 0 |
| Bombardero | 20000 | 306 | 1.8 | 0.28 | 23 % | 245 | 0 |
| Transporte | 8000 | 280 | 1.6 | — | 47 % | 0 | 0 |
| Helicóptero | 10000 | 225 | 1.3 | — | 15 % | 0 | 0 |
| Barricada | 5000 | 207 | 1.2 | — | 87 % | 0 | 0 |
