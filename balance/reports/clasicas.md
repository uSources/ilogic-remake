# Informe de equilibrio: clasicas

200 partidas (ai vs ai), semillas 1-200, maximo 60 dias. 2026-10-26 21:40.

## Avisos

- Duracion mediana 26 dias (objetivo 15-25).
- 99 % de partidas sin terminar en 60 dias.
- Soldado: rinde 3.99x la mediana (destruye 2.81 por cada 1 que cuesta).
- Jeep: rinde 0.60x la mediana (destruye 0.43 por cada 1 que cuesta).
- Bazuca: rinde 2.13x la mediana (destruye 1.50 por cada 1 que cuesta).
- Escudero: rinde 2.36x la mediana (destruye 1.67 por cada 1 que cuesta).
- Lanzamisiles: rinde 0.50x la mediana (destruye 0.35 por cada 1 que cuesta).
- Bombardero: rinde 0.43x la mediana (destruye 0.31 por cada 1 que cuesta).
- Antiaéreo: rinde 2.04x la mediana (destruye 1.44 por cada 1 que cuesta).
- Mortero: rinde 1.83x la mediana (destruye 1.29 por cada 1 que cuesta).
- Motorizado: rinde 0.64x la mediana (destruye 0.45 por cada 1 que cuesta).
- Tanque anfibio: rinde 0.38x la mediana (destruye 0.27 por cada 1 que cuesta).
- Atacar primero sale muy a cuenta: entre unidades iguales se hace todo el daño del que se recibe.

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
- `UNIT.cost.FSoldier`: 3500 → **3000** (rinde poco para lo que cuesta)
- `UNIT.cost.WTank`: 15000 → **12000** (rinde poco para lo que cuesta)

## Resultado

| | |
|---|---|
| Victorias bando 0 / bando 1 | 1 / 1 (1 % / 1 %) |
| Sin terminar | 198: con ventaja clara 77 / 98, igualadas 23 |
| Por Base / por quedarse sin nada | 2 / 0 |
| Dias (mediana, p10-p90, media) | 26 (20-26), 23 |
| Gana (o va ganando al final) quien iba por delante el dia 5 | 60 % (177 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 10 | 72 % (177 partidas) |
| Gana (o va ganando al final) quien iba por delante el dia 20 | 84 % (176 partidas) |
| Dia 10: edificios / valor del ejercito | 12.2 vs 12.5 / 67707 vs 70646 |

## Unidades

Eficiencia = valor destruido / dinero gastado en esa unidad (los dos bandos juntos).

| Unidad | Coste | Compradas | % compras | Eficiencia | Sobreviven | Bajas causadas | Capturas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Motorizado | 3500 | 5625 | 13.4 | 0.45 | 42 % | 2312 | 1844 |
| Escudero | 2500 | 5130 | 12.2 | 1.67 | 44 % | 4126 | 2000 |
| Soldado | 1500 | 5102 | 12.1 | 2.81 | 22 % | 4409 | 4194 |
| Mortero | 2500 | 5089 | 12.1 | 1.29 | 39 % | 2188 | 1575 |
| Bazuca | 2500 | 4865 | 11.6 | 1.50 | 33 % | 2644 | 1817 |
| Jeep | 5000 | 2364 | 5.6 | 0.43 | 31 % | 1384 | 0 |
| Tanque ligero | 7000 | 1815 | 4.3 | 0.71 | 34 % | 1475 | 0 |
| Artillería | 8000 | 1450 | 3.4 | 0.97 | 37 % | 1383 | 0 |
| Antiaéreo | 8000 | 1430 | 3.4 | 1.44 | 42 % | 642 | 0 |
| Tanque | 12000 | 1175 | 2.8 | 0.48 | 43 % | 1042 | 0 |
| Tanque anfibio | 15000 | 1135 | 2.7 | 0.27 | 30 % | 794 | 0 |
| Lanzamisiles | 16000 | 1074 | 2.6 | 0.35 | 50 % | 962 | 0 |
| Caza ligero | 12000 | 1059 | 2.5 | 0.75 | 18 % | 1161 | 0 |
| Caza | 20000 | 988 | 2.3 | 0.62 | 25 % | 641 | 0 |
| Bombardero | 20000 | 917 | 2.2 | 0.31 | 25 % | 746 | 0 |
| Suministros | 6000 | 848 | 2.0 | — | 29 % | 0 | 0 |
| Helicóptero | 10000 | 751 | 1.8 | — | 15 % | 0 | 0 |
| Transporte | 8000 | 734 | 1.7 | — | 30 % | 0 | 0 |
| Barricada | 5000 | 512 | 1.2 | — | 63 % | 0 | 0 |

## Duelos (terreno Grass)

Entre unidades iguales, daño hecho / daño devuelto al atacar primero: sin respuesta. En un duelo a muerte gana quien empieza el 98 % de las veces.

Los cruces mas rentables para el atacante (valor quitado por cada 1000 de coste, en un ataque):

| Atacante | Defensor | Daño | Contraataque | Destruye | Valor/1000 |
|---|---|---:|---:|---:|---:|
| BSoldier | Missile_truck | 59.9 | 0.0 | 0 % | 3830 |
| MSoldier | Missile_truck | 59.5 | 0.0 | 0 % | 3811 |
| MSoldier | WTank | 50.5 | 0.0 | 0 % | 3027 |
| BSoldier | WTank | 49.8 | 0.0 | 0 % | 2987 |
| Soldier | Missile_truck | 20.1 | 0.0 | 0 % | 2142 |
| Antiair | Bomber | 80.5 | 0.0 | 0 % | 2013 |
| Antiair | Fighter | 80.1 | 0.0 | 0 % | 2002 |
| BSoldier | Tank | 40.7 | 0.0 | 0 % | 1953 |
