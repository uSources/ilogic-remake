# Informe de equilibrio: f1-orden

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-26 21:45.

## Avisos

- Duracion mediana 38 dias (objetivo 15-25).
- 98 % de partidas sin terminar en 60 dias.
- Soldado: rinde 3.29x la mediana (destruye 2.26 por cada 1 que cuesta).
- Bazuca: rinde 2.27x la mediana (destruye 1.55 por cada 1 que cuesta).
- Escudero: rinde 2.22x la mediana (destruye 1.52 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.50x la mediana (destruye 0.35 por cada 1 que cuesta).
- Bombardero: rinde 0.45x la mediana (destruye 0.31 por cada 1 que cuesta).
- Antiaéreo: rinde 2.19x la mediana (destruye 1.50 por cada 1 que cuesta).
- Mortero: rinde 1.95x la mediana (destruye 1.34 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.48x la mediana (destruye 0.33 por cada 1 que cuesta).

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Soldier`: 1500 → **2000** (rinde demasiado para lo que cuesta)
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
| Victorias bando 0 / bando 1 | 2 / 3 (1 % / 2 %) |
| Sin terminar | 195: con ventaja clara 77 / 83, igualadas 35 |
| Por Base / por quedarse sin nada | 5 / 0 |
| Dias (mediana, p10-p90, media) | 38 (14-58), 37 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 61 % (159 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 76 % (164 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 82 % (164 partidas) |
| Dia 10: edificios / valor del ejercito | 12.0 vs 12.8 / 68041 vs 69506 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 5785 | 13.5 | 0.55 | 41 % | 2516 | 1847 |
| Soldado | 1500 | 5207 | 12.2 | 2.26 | 21 % | 3993 | 3941 |
| Mortero | 2500 | 5074 | 11.9 | 1.34 | 39 % | 2442 | 1471 |
| Bazuca | 2500 | 5069 | 11.9 | 1.55 | 33 % | 2743 | 1898 |
| Escudero | 2500 | 5058 | 11.8 | 1.52 | 45 % | 3886 | 1896 |
| Jeep | 5000 | 2605 | 6.1 | 0.52 | 30 % | 1684 | 0 |
| Tanque ligero | 7000 | 1786 | 4.2 | 0.75 | 35 % | 1371 | 0 |
| Artillería | 8000 | 1541 | 3.6 | 0.98 | 40 % | 1511 | 0 |
| Antiaéreo | 8000 | 1514 | 3.5 | 1.50 | 44 % | 739 | 0 |
| Tanque | 12000 | 1173 | 2.7 | 0.53 | 44 % | 1081 | 0 |
| Caza ligero | 12000 | 1129 | 2.6 | 0.69 | 20 % | 1343 | 0 |
| Tanque anfibio | 15000 | 1075 | 2.5 | 0.33 | 30 % | 819 | 0 |
| Lanzamisiles | 16000 | 1071 | 2.5 | 0.35 | 54 % | 1000 | 0 |
| Caza | 20000 | 906 | 2.1 | 0.63 | 26 % | 573 | 0 |
| Bombardero | 20000 | 900 | 2.1 | 0.31 | 26 % | 682 | 0 |
| Suministros | 6000 | 859 | 2.0 | — | 27 % | 0 | 0 |
| Transporte | 8000 | 781 | 1.8 | — | 30 % | 0 | 0 |
| Helicóptero | 10000 | 718 | 1.7 | — | 13 % | 0 | 0 |
| Barricada | 5000 | 518 | 1.2 | — | 66 % | 0 | 0 |
