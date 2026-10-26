# Informe de equilibrio: f1-combate

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-26 21:42.

## Avisos

- Un bando gana mas (contando ventaja al final): bando 0 (el jugador) 40 %, bando 1 (la IA) 60 %.
- Duracion mediana 55 dias (objetivo 15-25).
- 97 % de partidas sin terminar en 60 dias.
- Soldado: rinde 3.25x la mediana (destruye 2.26 por cada 1 que cuesta).
- Bazuca: rinde 2.28x la mediana (destruye 1.59 por cada 1 que cuesta).
- Escudero: rinde 2.18x la mediana (destruye 1.52 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.51x la mediana (destruye 0.35 por cada 1 que cuesta).
- Bombardero: rinde 0.45x la mediana (destruye 0.32 por cada 1 que cuesta).
- Antiaéreo: rinde 2.17x la mediana (destruye 1.51 por cada 1 que cuesta).
- Mortero: rinde 1.91x la mediana (destruye 1.33 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.46x la mediana (destruye 0.32 por cada 1 que cuesta).

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
| Victorias bando 0 / bando 1 | 3 / 3 (2 % / 2 %) |
| Sin terminar | 194: con ventaja clara 63 / 94, igualadas 37 |
| Por Base / por quedarse sin nada | 6 / 0 |
| Dias (mediana, p10-p90, media) | 55 (19-59), 49 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 60 % (163 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 72 % (163 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 82 % (162 partidas) |
| Dia 10: edificios / valor del ejercito | 12.2 vs 12.5 / 67499 vs 70080 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 5770 | 13.4 | 0.55 | 41 % | 2525 | 1866 |
| Soldado | 1500 | 5287 | 12.3 | 2.26 | 22 % | 4009 | 4043 |
| Mortero | 2500 | 5283 | 12.3 | 1.33 | 38 % | 2439 | 1677 |
| Escudero | 2500 | 5156 | 12.0 | 1.52 | 45 % | 4098 | 1891 |
| Bazuca | 2500 | 4927 | 11.5 | 1.59 | 32 % | 2649 | 1599 |
| Jeep | 5000 | 2398 | 5.6 | 0.53 | 31 % | 1527 | 0 |
| Tanque ligero | 7000 | 1690 | 3.9 | 0.76 | 36 % | 1382 | 0 |
| Antiaéreo | 8000 | 1499 | 3.5 | 1.51 | 43 % | 701 | 0 |
| Artillería | 8000 | 1446 | 3.4 | 0.99 | 37 % | 1421 | 0 |
| Tanque | 12000 | 1255 | 2.9 | 0.53 | 41 % | 1117 | 0 |
| Lanzamisiles | 16000 | 1164 | 2.7 | 0.35 | 56 % | 1054 | 0 |
| Tanque anfibio | 15000 | 1119 | 2.6 | 0.32 | 29 % | 846 | 0 |
| Caza ligero | 12000 | 1101 | 2.6 | 0.70 | 21 % | 1308 | 0 |
| Caza | 20000 | 982 | 2.3 | 0.63 | 26 % | 622 | 0 |
| Bombardero | 20000 | 943 | 2.2 | 0.32 | 27 % | 784 | 0 |
| Suministros | 6000 | 902 | 2.1 | — | 27 % | 0 | 0 |
| Transporte | 8000 | 783 | 1.8 | — | 31 % | 0 | 0 |
| Helicóptero | 10000 | 741 | 1.7 | — | 14 % | 0 | 0 |
| Barricada | 5000 | 538 | 1.3 | — | 64 % | 0 | 0 |

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
