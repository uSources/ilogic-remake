# Informe de equilibrio: f2-precios

120 partidas (ai vs ai), semillas 1-120, maximo 60 dias. 2026-10-27 14:00.

**Cambios de esta variante:**

- `UNIT.cost.Soldier`: 1500 → 2500
- `UNIT.cost.Artillery`: 8000 → 10000
- `UNIT.cost.BSoldier`: 2500 → 4000
- `UNIT.cost.SSoldier`: 2500 → 4000
- `UNIT.cost.Missile_truck`: 16000 → 13000
- `UNIT.cost.Bomber`: 20000 → 13000
- `UNIT.cost.Antiair`: 8000 → 12500
- `UNIT.cost.MSoldier`: 2500 → 3000
- `UNIT.cost.WTank`: 15000 → 12000

## Avisos

- Duracion mediana 40 dias (objetivo 15-25).
- 98 % de partidas sin terminar en 60 dias.
- Soldado: rinde 2.25x la mediana (destruye 1.50 por cada 1 que cuesta).
- Escudero: rinde 1.64x la mediana (destruye 1.10 por cada 1 que cuesta).
- Caza: rinde 0.66x la mediana (destruye 0.44 por cada 1 que cuesta).
- Mortero: rinde 1.65x la mediana (destruye 1.10 por cada 1 que cuesta).

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Soldier`: 2500 → **3000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.SSoldier`: 4000 → **5000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Fighter`: 20000 → **16500** (rinde poco para lo que cuesta)
- `UNIT.cost.MSoldier`: 3000 → **4000** (rinde demasiado para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 1 / 1 (1 % / 1 %) |
| Sin terminar | 118: con ventaja clara 46 / 57, igualadas 15 |
| Por Base / por quedarse sin nada | 2 / 0 |
| Dias (mediana, p10-p90, media) | 40 (25-40), 32.5 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 58 % (103 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 70 % (105 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 82 % (105 partidas) |
| Dia 10: edificios / valor del ejercito | 9.8 vs 10.2 / 64450 vs 66102 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bazuca | 4000 | 3045 | 12.8 | 0.97 | 35 % | 1417 | 1623 |
| Soldado | 2500 | 3018 | 12.7 | 1.50 | 23 % | 1945 | 4110 |
| Escudero | 4000 | 2940 | 12.3 | 1.10 | 45 % | 2147 | 2034 |
| Mortero | 3000 | 2912 | 12.2 | 1.10 | 39 % | 1074 | 1093 |
| Motorizado | 3500 | 2885 | 12.1 | 0.74 | 41 % | 1624 | 1924 |
| Jeep | 5000 | 1776 | 7.5 | 0.63 | 33 % | 1305 | 0 |
| Tanque ligero | 7000 | 1224 | 5.1 | 0.88 | 37 % | 1140 | 0 |
| Artillería | 10000 | 775 | 3.3 | 0.78 | 36 % | 670 | 0 |
| Tanque anfibio | 12000 | 617 | 2.6 | 0.47 | 31 % | 559 | 0 |
| Tanque | 12000 | 585 | 2.5 | 0.57 | 44 % | 556 | 0 |
| Antiaéreo | 12500 | 577 | 2.4 | 0.67 | 40 % | 176 | 0 |
| Lanzamisiles | 13000 | 519 | 2.2 | 0.46 | 51 % | 440 | 0 |
| Suministros | 6000 | 504 | 2.1 | — | 30 % | 0 | 0 |
| Bombardero | 13000 | 476 | 2.0 | 0.53 | 31 % | 438 | 0 |
| Caza ligero | 12000 | 463 | 1.9 | 0.61 | 21 % | 760 | 0 |
| Transporte | 8000 | 455 | 1.9 | — | 33 % | 0 | 0 |
| Caza | 20000 | 429 | 1.8 | 0.44 | 26 % | 213 | 0 |
| Helicóptero | 10000 | 320 | 1.3 | — | 15 % | 0 | 0 |
| Barricada | 5000 | 308 | 1.3 | — | 65 % | 0 | 0 |

## Duelos (terreno Grass)

Entre unidades iguales, daño hecho / daño devuelto al atacar primero: 2.0. En un duelo a muerte gana quien empieza el 98 % de las veces.

Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):

| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |
|---|---|---:|---:|---:|---:|
| MSoldier | Missile_truck | 60.1 | 0.0 | 0 % | 2602 |
| MSoldier | Antiair | 49.9 | 0.0 | 0 % | 2079 |
| MSoldier | WTank | 50.2 | 0.0 | 0 % | 2008 |
| BSoldier | Missile_truck | 59.7 | 0.0 | 0 % | 1942 |
| MSoldier | Tank | 40.3 | 0.0 | 0 % | 1612 |
| MSoldier | Transport | 59.9 | 0.0 | 0 % | 1597 |
| BSoldier | Antiair | 50.1 | 0.0 | 0 % | 1564 |
| BSoldier | WTank | 50.3 | 19.9 | 0 % | 1508 |
