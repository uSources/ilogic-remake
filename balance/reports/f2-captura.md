# Informe de equilibrio: f2-captura

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-27 13:55.

## Avisos

- Duracion mediana 29 dias (objetivo 15-25).
- 100 % de partidas sin terminar en 60 dias.
- Soldado: rinde 3.49x la mediana (destruye 2.31 por cada 1 que cuesta).
- Bazuca: rinde 2.57x la mediana (destruye 1.70 por cada 1 que cuesta).
- Escudero: rinde 2.33x la mediana (destruye 1.54 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.52x la mediana (destruye 0.34 por cada 1 que cuesta).
- Bombardero: rinde 0.41x la mediana (destruye 0.27 por cada 1 que cuesta).
- Antiaéreo: rinde 2.22x la mediana (destruye 1.47 por cada 1 que cuesta).
- Mortero: rinde 1.70x la mediana (destruye 1.13 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.45x la mediana (destruye 0.29 por cada 1 que cuesta).

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
| Victorias bando 0 / bando 1 | 1 / 0 (1 % / 0 %) |
| Sin terminar | 199: con ventaja clara 82 / 85, igualadas 32 |
| Por Base / por quedarse sin nada | 1 / 0 |
| Dias (mediana, p10-p90, media) | 29 (29-29), 29 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 56 % (163 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 70 % (166 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 83 % (168 partidas) |
| Dia 10: edificios / valor del ejercito | 9.9 vs 10.2 / 60399 vs 62021 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 5645 | 13.5 | 0.54 | 42 % | 2738 | 3578 |
| Mortero | 2500 | 5126 | 12.2 | 1.13 | 39 % | 1839 | 2123 |
| Soldado | 1500 | 4976 | 11.9 | 2.31 | 21 % | 3686 | 6905 |
| Bazuca | 2500 | 4964 | 11.8 | 1.70 | 33 % | 2860 | 2970 |
| Escudero | 2500 | 4904 | 11.7 | 1.54 | 44 % | 3694 | 3388 |
| Jeep | 5000 | 2568 | 6.1 | 0.55 | 33 % | 1811 | 0 |
| Tanque ligero | 7000 | 1702 | 4.1 | 0.75 | 34 % | 1449 | 0 |
| Artillería | 8000 | 1398 | 3.3 | 0.95 | 37 % | 1347 | 0 |
| Antiaéreo | 8000 | 1383 | 3.3 | 1.47 | 42 % | 571 | 0 |
| Tanque | 12000 | 1189 | 2.8 | 0.54 | 42 % | 1088 | 0 |
| Caza ligero | 12000 | 1157 | 2.8 | 0.66 | 20 % | 1435 | 0 |
| Tanque anfibio | 15000 | 1143 | 2.7 | 0.29 | 33 % | 910 | 0 |
| Lanzamisiles | 16000 | 1092 | 2.6 | 0.34 | 54 % | 913 | 0 |
| Caza | 20000 | 923 | 2.2 | 0.66 | 27 % | 637 | 0 |
| Bombardero | 20000 | 886 | 2.1 | 0.27 | 30 % | 670 | 0 |
| Suministros | 6000 | 859 | 2.1 | — | 28 % | 0 | 0 |
| Transporte | 8000 | 765 | 1.8 | — | 30 % | 0 | 0 |
| Helicóptero | 10000 | 686 | 1.6 | — | 14 % | 0 | 0 |
| Barricada | 5000 | 527 | 1.3 | — | 64 % | 0 | 0 |

## Duelos (terreno Grass)

Entre unidades iguales, daño hecho / daño devuelto al atacar primero: 2.0. En un duelo a muerte gana quien empieza el 98 % de las veces.

Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):

| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |
|---|---|---:|---:|---:|---:|
| MSoldier | Missile_truck | 60.1 | 0.0 | 0 % | 3844 |
| BSoldier | Missile_truck | 59.7 | 0.0 | 0 % | 3824 |
| BSoldier | WTank | 50.3 | 19.9 | 0 % | 3016 |
| MSoldier | WTank | 50.2 | 0.0 | 0 % | 3012 |
| Soldier | Missile_truck | 19.9 | 0.0 | 0 % | 2125 |
| Antiair | Bomber | 80.3 | 9.8 | 0 % | 2008 |
| Antiair | Fighter | 80.1 | 0.0 | 0 % | 2003 |
| MSoldier | Tank | 40.3 | 0.0 | 0 % | 1935 |
