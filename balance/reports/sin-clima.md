# Informe de equilibrio: sin-clima

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-30 15:51.

**Cambios de esta variante:**

- `RULES.weather`: true → false

## Avisos

- Duracion mediana 46 dias (objetivo 15-25).
- 89 % de partidas sin terminar en 60 dias.
- Soldado: rinde 2.61x la mediana (destruye 1.90 por cada 1 que cuesta).
- Tanque: rinde 0.34x la mediana (destruye 0.25 por cada 1 que cuesta).
- Tanque: casi nadie la compra (0.4 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Artillería: rinde 1.84x la mediana (destruye 1.34 por cada 1 que cuesta).
- Jeep: rinde 0.38x la mediana (destruye 0.28 por cada 1 que cuesta).
- Tanque ligero: rinde 0.65x la mediana (destruye 0.47 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.26x la mediana (destruye 0.19 por cada 1 que cuesta).
- Lanzamisiles: casi nadie la compra (0.5 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Caza ligero: rinde 2.28x la mediana (destruye 1.66 por cada 1 que cuesta).
- Caza: rinde 2.81x la mediana (destruye 2.04 por cada 1 que cuesta).
- Bombardero: rinde 0.65x la mediana (destruye 0.47 por cada 1 que cuesta).
- Antiaéreo: rinde 7.50x la mediana (destruye 5.45 por cada 1 que cuesta).
- Mortero: rinde 0.62x la mediana (destruye 0.45 por cada 1 que cuesta).
- Motorizado: rinde 0.22x la mediana (destruye 0.16 por cada 1 que cuesta).
- Tanque anfibio: casi nadie la compra (0.2 % de las compras). Ojo: la IA elige compras con sus propias reglas.

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Soldier`: 1500 → **2000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Tank`: 12000 → **9500** (rinde poco para lo que cuesta)
- `UNIT.cost.Artillery`: 8000 → **10000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Car`: 5000 → **4000** (rinde poco para lo que cuesta)
- `UNIT.cost.LTank`: 7000 → **5500** (rinde poco para lo que cuesta)
- `UNIT.cost.Missile_truck`: 11000 → **9000** (rinde poco para lo que cuesta)
- `UNIT.cost.LFighter`: 12000 → **15000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Fighter`: 20000 → **25000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Bomber`: 13000 → **10500** (rinde poco para lo que cuesta)
- `UNIT.cost.Antiair`: 8000 → **10000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.MSoldier`: 2500 → **2000** (rinde poco para lo que cuesta)
- `UNIT.cost.FSoldier`: 3500 → **3000** (rinde poco para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 9 / 13 (5 % / 7 %) |
| Sin terminar | 178: con ventaja clara 78 / 89, igualadas 11 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 22 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 46 (35-59), 45.5 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 53 % (187 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 62 % (188 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 76 % (189 partidas) |
| Dia 10: edificios / valor del ejercito | 8.9 vs 9.2 / 37420 vs 38689 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 8.7 / 11.1 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Caza ligero | 12000 | 1972 | 13.5 | 1.66 | 49 % | 3623 | 0 |
| Bombardero | 13000 | 1778 | 12.2 | 0.47 | 30 % | 1803 | 0 |
| Helicóptero | 10000 | 1606 | 11.0 | — | 14 % | 0 | 0 |
| Soldado | 1500 | 1297 | 8.9 | 1.90 | 0 % | 760 | 10002 |
| Jeep | 5000 | 1248 | 8.6 | 0.28 | 34 % | 422 | 0 |
| Bazuca | 2500 | 1109 | 7.6 | 0.73 | 36 % | 351 | 2094 |
| Mortero | 2500 | 1103 | 7.6 | 0.45 | 35 % | 220 | 1771 |
| Escudero | 2500 | 1034 | 7.1 | 1.00 | 50 % | 476 | 3196 |
| Caza | 20000 | 556 | 3.8 | 2.04 | 44 % | 1440 | 0 |
| Suministros | 6000 | 515 | 3.5 | — | 31 % | 0 | 0 |
| Barricada | 5000 | 485 | 3.3 | — | 55 % | 0 | 0 |
| Transporte | 8000 | 472 | 3.2 | — | 29 % | 0 | 0 |
| Motorizado | 3500 | 366 | 2.5 | 0.16 | 20 % | 39 | 498 |
| Tanque ligero | 7000 | 355 | 2.4 | 0.47 | 36 % | 200 | 0 |
| Artillería | 8000 | 267 | 1.8 | 1.34 | 0 % | 312 | 0 |
| Antiaéreo | 8000 | 249 | 1.7 | 5.45 | 53 % | 599 | 0 |
| Lanzamisiles | 11000 | 70 | 0.5 | 0.19 | 24 % | 19 | 0 |
| Tanque | 12000 | 55 | 0.4 | 0.25 | 38 % | 21 | 0 |
| Tanque anfibio | 15000 | 35 | 0.2 | — | 40 % | 16 | 0 |

## Duelos (terreno Grass)

Entre unidades iguales, daño hecho / daño devuelto al atacar primero: 2.0. En un duelo a muerte gana quien empieza el 98 % de las veces.

Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):

| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |
|---|---|---:|---:|---:|---:|
| MSoldier | WTank | 50.1 | 0.0 | 0 % | 3007 |
| BSoldier | WTank | 50.0 | 20.2 | 0 % | 3003 |
| MSoldier | Missile_truck | 59.8 | 0.0 | 0 % | 2630 |
| BSoldier | Missile_truck | 59.4 | 0.0 | 0 % | 2614 |
| Antiair | Fighter | 80.3 | 0.0 | 0 % | 2009 |
| BSoldier | Transport | 60.5 | 0.0 | 0 % | 1936 |
| MSoldier | Transport | 60.0 | 0.0 | 0 % | 1921 |
| MSoldier | Tank | 40.0 | 0.0 | 0 % | 1920 |
