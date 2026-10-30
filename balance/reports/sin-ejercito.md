# Informe de equilibrio: sin-ejercito

100 partidas (ai vs ai), semillas 1-100, maximo 60 dias. 2026-10-30 13:32.

**Cambios de esta variante:**

- `RULES.commandPoints`: 30 → null
- `RULES.upkeep`: 0.1 → 0

## Avisos

- Duracion mediana 32 dias (objetivo 15-25).
- 99 % de partidas sin terminar en 60 dias.
- Soldado: rinde 1.89x la mediana (destruye 1.89 por cada 1 que cuesta).
- Tanque: rinde 0.36x la mediana (destruye 0.36 por cada 1 que cuesta).
- Jeep: rinde 0.37x la mediana (destruye 0.37 por cada 1 que cuesta).
- Tanque ligero: rinde 0.53x la mediana (destruye 0.53 por cada 1 que cuesta).
- Antiaéreo: rinde 1.68x la mediana (destruye 1.68 por cada 1 que cuesta).
- Motorizado: rinde 0.35x la mediana (destruye 0.35 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.16x la mediana (destruye 0.16 por cada 1 que cuesta).

## Ajustes propuestos

Para probarlos: `npm run balance -- tune` o una variante con estos valores.

- `UNIT.cost.Soldier`: 1500 → **2000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.Tank`: 12000 → **9500** (rinde poco para lo que cuesta)
- `UNIT.cost.Car`: 5000 → **4000** (rinde poco para lo que cuesta)
- `UNIT.cost.LTank`: 7000 → **5500** (rinde poco para lo que cuesta)
- `UNIT.cost.Antiair`: 8000 → **10000** (rinde demasiado para lo que cuesta)
- `UNIT.cost.FSoldier`: 3500 → **3000** (rinde poco para lo que cuesta)
- `UNIT.cost.WTank`: 15000 → **12000** (rinde poco para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 1 / 0 (1 % / 0 %) |
| Sin terminar | 99: con ventaja clara 40 / 46, igualadas 13 |
| Por Base / por quedarse sin nada / por puntos al limite de dias | 1 / 0 / 0 |
| Dias (mediana, p10-p90, media) | 32 (32-32), 32 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 58 % (86 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 68 % (87 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 83 % (87 partidas) |
| Dia 10: edificios / valor del ejercito | 9.4 vs 9.9 / 62161 vs 64059 |
| Unidades en el mapa por bando (dia 10 / dia 20) | 18.1 / 28.7 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 2562 | 13.7 | 0.35 | 44 % | 758 | 1062 |
| Mortero | 2500 | 2288 | 12.3 | 1.00 | 43 % | 857 | 1091 |
| Escudero | 2500 | 2240 | 12.0 | 1.13 | 41 % | 1384 | 2052 |
| Bazuca | 2500 | 2224 | 11.9 | 1.27 | 34 % | 1111 | 1649 |
| Soldado | 1500 | 2223 | 11.9 | 1.89 | 22 % | 1455 | 3669 |
| Jeep | 5000 | 1236 | 6.6 | 0.37 | 33 % | 668 | 0 |
| Tanque ligero | 7000 | 707 | 3.8 | 0.53 | 34 % | 488 | 0 |
| Antiaéreo | 8000 | 646 | 3.5 | 1.68 | 49 % | 400 | 0 |
| Artillería | 8000 | 634 | 3.4 | 1.41 | 43 % | 948 | 0 |
| Tanque anfibio | 15000 | 525 | 2.8 | 0.16 | 30 % | 303 | 0 |
| Tanque | 12000 | 513 | 2.8 | 0.36 | 48 % | 362 | 0 |
| Lanzamisiles | 11000 | 492 | 2.6 | 1.14 | 77 % | 930 | 0 |
| Caza | 20000 | 414 | 2.2 | 0.79 | 42 % | 418 | 0 |
| Caza ligero | 12000 | 397 | 2.1 | 1.03 | 37 % | 813 | 0 |
| Bombardero | 13000 | 379 | 2.0 | 0.83 | 31 % | 586 | 0 |
| Suministros | 6000 | 359 | 1.9 | — | 35 % | 0 | 0 |
| Transporte | 8000 | 296 | 1.6 | — | 35 % | 0 | 0 |
| Helicóptero | 10000 | 265 | 1.4 | — | 17 % | 0 | 0 |
| Barricada | 5000 | 247 | 1.3 | — | 67 % | 0 | 0 |

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
