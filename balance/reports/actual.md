# Informe de equilibrio: actual

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-26 21:07.

## Avisos

- Un bando gana mas (contando ventaja al final): 39 % el que mueve primero frente a 61 %.
- 100 % de partidas sin terminar en 60 dias.
- Soldado: rinde 4.18x la mediana (destruye 2.87 por cada 1 que cuesta).
- Bazuca: rinde 2.19x la mediana (destruye 1.50 por cada 1 que cuesta).
- Escudero: rinde 2.39x la mediana (destruye 1.64 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.51x la mediana (destruye 0.35 por cada 1 que cuesta).
- Bombardero: rinde 0.40x la mediana (destruye 0.27 por cada 1 que cuesta).
- Antiaéreo: rinde 2.14x la mediana (destruye 1.47 por cada 1 que cuesta).
- Mortero: rinde 1.82x la mediana (destruye 1.25 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.37x la mediana (destruye 0.25 por cada 1 que cuesta).
- En duelos entre unidades iguales, quien ataca primero gana el 98 % de las veces.

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
| Victorias bando 0 / bando 1 | 0 / 0 (0 % / 0 %) |
| Sin terminar | 200: con ventaja clara 66 / 105, igualadas 29 |
| Por Base / por quedarse sin nada | 0 / 0 |
| Dias (mediana, p10-p90, media) | 0 (0-0), 0 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 60 % (168 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 75 % (171 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 87 % (171 partidas) |
| Dia 10: edificios / valor del ejercito | 12.4 vs 12.5 / 69793 vs 70205 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 5646 | 13.5 | 0.46 | 43 % | 2363 | 1945 |
| Soldado | 1500 | 5074 | 12.1 | 2.87 | 21 % | 4467 | 4073 |
| Bazuca | 2500 | 5043 | 12.1 | 1.50 | 33 % | 2659 | 1875 |
| Mortero | 2500 | 5011 | 12.0 | 1.25 | 39 % | 2046 | 1420 |
| Escudero | 2500 | 4923 | 11.8 | 1.64 | 42 % | 3929 | 1768 |
| Jeep | 5000 | 2353 | 5.6 | 0.46 | 32 % | 1422 | 0 |
| Tanque ligero | 7000 | 1700 | 4.1 | 0.69 | 38 % | 1299 | 0 |
| Artillería | 8000 | 1492 | 3.6 | 0.92 | 38 % | 1357 | 0 |
| Antiaéreo | 8000 | 1457 | 3.5 | 1.47 | 41 % | 676 | 0 |
| Tanque | 12000 | 1198 | 2.9 | 0.47 | 45 % | 1079 | 0 |
| Lanzamisiles | 16000 | 1137 | 2.7 | 0.35 | 53 % | 1030 | 0 |
| Caza ligero | 12000 | 1078 | 2.6 | 0.72 | 19 % | 1296 | 0 |
| Tanque anfibio | 15000 | 1015 | 2.4 | 0.25 | 30 % | 701 | 0 |
| Caza | 20000 | 954 | 2.3 | 0.59 | 25 % | 564 | 0 |
| Bombardero | 20000 | 943 | 2.3 | 0.27 | 28 % | 743 | 0 |
| Suministros | 6000 | 828 | 2.0 | — | 29 % | 0 | 0 |
| Transporte | 8000 | 723 | 1.7 | — | 34 % | 0 | 0 |
| Helicóptero | 10000 | 690 | 1.7 | — | 16 % | 0 | 0 |
| Barricada | 5000 | 534 | 1.3 | — | 60 % | 0 | 0 |

## Duelos (terreno Grass)

Quien ataca primero entre unidades iguales gana: 98 %.

Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):

| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |
|---|---|---:|---:|---:|---:|
| MSoldier | Missile_truck | 59.9 | 0.0 | 0 % | 3836 |
| BSoldier | Missile_truck | 59.9 | 0.0 | 0 % | 3830 |
| MSoldier | WTank | 50.1 | 0.0 | 0 % | 3007 |
| BSoldier | WTank | 49.9 | 0.0 | 0 % | 2992 |
| Soldier | Missile_truck | 20.1 | 0.0 | 0 % | 2142 |
| Antiair | Bomber | 80.0 | 0.0 | 0 % | 2001 |
| Antiair | Fighter | 79.3 | 0.0 | 0 % | 1982 |
| BSoldier | Tank | 40.1 | 0.0 | 0 % | 1923 |
