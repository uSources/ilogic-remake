# Informe de equilibrio: con-clima

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-30 15:52.

## Avisos

- Duracion mediana 49 dias (objetivo 15-25).
- 89 % de partidas sin terminar en 60 dias.
- Soldado: rinde 2.52x la mediana (destruye 1.89 por cada 1 que cuesta).
- Tanque: rinde 0.18x la mediana (destruye 0.14 por cada 1 que cuesta).
- Tanque: casi nadie la compra (0.3 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Artillería: rinde 1.81x la mediana (destruye 1.35 por cada 1 que cuesta).
- Jeep: rinde 0.37x la mediana (destruye 0.28 por cada 1 que cuesta).
- Tanque ligero: rinde 0.56x la mediana (destruye 0.42 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.34x la mediana (destruye 0.25 por cada 1 que cuesta).
- Lanzamisiles: casi nadie la compra (0.4 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Caza ligero: rinde 2.21x la mediana (destruye 1.66 por cada 1 que cuesta).
- Caza: rinde 2.75x la mediana (destruye 2.07 por cada 1 que cuesta).
- Bombardero: rinde 0.62x la mediana (destruye 0.47 por cada 1 que cuesta).
- Antiaéreo: rinde 6.91x la mediana (destruye 5.19 por cada 1 que cuesta).
- Mortero: rinde 0.61x la mediana (destruye 0.46 por cada 1 que cuesta).
- Motorizado: rinde 0.26x la mediana (destruye 0.20 por cada 1 que cuesta).
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
| Victorias bando 0 / bando 1 | 13 / 9 (7 % / 5 %) |
| Sin terminar | 178: con ventaja clara 84 / 83, igualadas 11 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 22 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 49 (37-58), 47.9 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 53 % (187 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 61 % (188 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 70 % (189 partidas) |
| Dia 10: edificios / valor del ejercito | 8.9 vs 9.2 / 37420 vs 38689 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 8.7 / 11.5 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Caza ligero | 12000 | 1894 | 13.2 | 1.66 | 49 % | 3680 | 0 |
| Bombardero | 13000 | 1718 | 11.9 | 0.47 | 29 % | 1729 | 0 |
| Helicóptero | 10000 | 1555 | 10.8 | — | 16 % | 0 | 0 |
| Soldado | 1500 | 1370 | 9.5 | 1.89 | 0 % | 728 | 10035 |
| Jeep | 5000 | 1216 | 8.4 | 0.28 | 33 % | 428 | 0 |
| Mortero | 2500 | 1122 | 7.8 | 0.46 | 32 % | 235 | 1862 |
| Escudero | 2500 | 1052 | 7.3 | 1.00 | 50 % | 479 | 3182 |
| Bazuca | 2500 | 1048 | 7.3 | 0.75 | 33 % | 366 | 2051 |
| Caza | 20000 | 541 | 3.8 | 2.07 | 43 % | 1368 | 0 |
| Suministros | 6000 | 509 | 3.5 | — | 28 % | 0 | 0 |
| Transporte | 8000 | 479 | 3.3 | — | 30 % | 0 | 0 |
| Barricada | 5000 | 469 | 3.3 | — | 60 % | 0 | 0 |
| Motorizado | 3500 | 400 | 2.8 | 0.20 | 23 % | 66 | 543 |
| Tanque ligero | 7000 | 351 | 2.4 | 0.42 | 38 % | 197 | 0 |
| Artillería | 8000 | 274 | 1.9 | 1.35 | 0 % | 343 | 0 |
| Antiaéreo | 8000 | 254 | 1.8 | 5.19 | 60 % | 551 | 0 |
| Lanzamisiles | 11000 | 64 | 0.4 | 0.25 | 23 % | 24 | 0 |
| Tanque | 12000 | 48 | 0.3 | 0.14 | 33 % | 19 | 0 |
| Tanque anfibio | 15000 | 31 | 0.2 | — | 35 % | 4 | 0 |

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
