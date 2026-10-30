# Informe de equilibrio: ejercito

100 partidas (ai vs ai), semillas 1-100, maximo 60 dias. 2026-10-30 13:29.

## Avisos

- Duracion mediana 46 dias (objetivo 15-25).
- 83 % de partidas sin terminar en 60 dias.
- Soldado: rinde 2.44x la mediana (destruye 1.91 por cada 1 que cuesta).
- Tanque: rinde 0.28x la mediana (destruye 0.22 por cada 1 que cuesta).
- Tanque: casi nadie la compra (0.3 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Artillería: rinde 1.73x la mediana (destruye 1.35 por cada 1 que cuesta).
- Jeep: rinde 0.34x la mediana (destruye 0.27 por cada 1 que cuesta).
- Tanque ligero: rinde 0.54x la mediana (destruye 0.42 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.18x la mediana (destruye 0.14 por cada 1 que cuesta).
- Lanzamisiles: casi nadie la compra (0.4 % de las compras). Ojo: la IA elige compras con sus propias reglas.
- Caza ligero: rinde 2.19x la mediana (destruye 1.71 por cada 1 que cuesta).
- Caza: rinde 2.51x la mediana (destruye 1.96 por cada 1 que cuesta).
- Bombardero: rinde 0.59x la mediana (destruye 0.46 por cada 1 que cuesta).
- Antiaéreo: rinde 6.62x la mediana (destruye 5.18 por cada 1 que cuesta).
- Mortero: rinde 0.53x la mediana (destruye 0.41 por cada 1 que cuesta).
- Motorizado: rinde 0.18x la mediana (destruye 0.14 por cada 1 que cuesta).
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
| Victorias bando 0 / bando 1 | 7 / 10 (7 % / 10 %) |
| Sin terminar | 83: con ventaja clara 35 / 43, igualadas 5 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 17 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 46 (35-60), 45.4 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 55 % (93 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 64 % (94 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 79 % (95 partidas) |
| Dia 10: edificios / valor del ejercito | 8.8 vs 9.1 / 36766 vs 38756 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 8.7 / 10.9 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Caza ligero | 12000 | 928 | 13.1 | 1.71 | 49 % | 1781 | 0 |
| Bombardero | 13000 | 820 | 11.6 | 0.46 | 31 % | 822 | 0 |
| Helicóptero | 10000 | 789 | 11.2 | — | 14 % | 0 | 0 |
| Soldado | 1500 | 680 | 9.6 | 1.91 | 0 % | 407 | 5033 |
| Jeep | 5000 | 597 | 8.5 | 0.27 | 32 % | 198 | 0 |
| Bazuca | 2500 | 542 | 7.7 | 0.78 | 36 % | 180 | 1040 |
| Mortero | 2500 | 541 | 7.7 | 0.41 | 35 % | 98 | 739 |
| Escudero | 2500 | 512 | 7.3 | 0.96 | 50 % | 248 | 1537 |
| Caza | 20000 | 270 | 3.8 | 1.96 | 47 % | 676 | 0 |
| Suministros | 6000 | 245 | 3.5 | — | 33 % | 0 | 0 |
| Barricada | 5000 | 244 | 3.5 | — | 53 % | 0 | 0 |
| Transporte | 8000 | 222 | 3.1 | — | 29 % | 0 | 0 |
| Motorizado | 3500 | 186 | 2.6 | 0.14 | 23 % | 18 | 319 |
| Tanque ligero | 7000 | 162 | 2.3 | 0.42 | 38 % | 98 | 0 |
| Artillería | 8000 | 139 | 2.0 | 1.35 | 0 % | 175 | 0 |
| Antiaéreo | 8000 | 119 | 1.7 | 5.18 | 54 % | 261 | 0 |
| Lanzamisiles | 11000 | 26 | 0.4 | 0.14 | 27 % | 5 | 0 |
| Tanque | 12000 | 23 | 0.3 | 0.22 | 26 % | 8 | 0 |
| Tanque anfibio | 15000 | 15 | 0.2 | — | 47 % | 3 | 0 |

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
