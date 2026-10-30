# Ilogic — Especificación de REGLAS y LÓGICA del juego

Documento de referencia para reimplementar en TypeScript + Phaser 4 la lógica del Ilogic original (Java, 2013) **sin volver a mirar el Java**.
Fuente única de verdad: `/home/claude/rename/final/*.java` (descompilado con nombres y comentarios añadidos; el bytecode es idéntico al original).

Cubre: `Unit.java`, `Building.java`, `Terrain.java`, `Climate.java`, `IA.java`, `RandomMap.java`, `Auxiliar.java` (con `Coordinate` y `LValue`), `IlogicIO.java`, y las reglas que viven en `Ilogic.java` (movimiento, visión, combate, fin de turno, victoria/derrota, compra, menú de acciones). La interfaz y el flujo de pantallas (fases, teclado, ratón, dibujo de menús) los documenta otro agente; aquí solo se recogen en la medida en que condicionan las reglas.

Convención de citas: `Clase.metodo` o `Clase.campo`. "Literal" = tal cual está en el Java, aunque sea un bug. Las propuestas de corrección se marcan como **[REMAKE]**.

---

## 0. Convenciones generales

- **Mapa**: `byte[MAPX][MAPY] map`, indexado `map[x][y]`; `x` = columna (crece a la derecha), `y` = fila (crece hacia abajo, coordenadas de pantalla). `MAPX = MAPY = 32` (`Ilogic`). Cada celda guarda el índice de terreno (0..14).
- **Coordenada vacía**: `(-1,-1)` (`Coordinate()` / `Coordinate.empty`). `isInBounds()` = `0<=x<MAPX && 0<=y<MAPY`.
- **Distancia**: siempre Manhattan, `|dx|+|dy|` (`Auxiliar.getPosDif`). Todos los "rangos" (movimiento, visión, ataque, zonas) son rombos.
- **Aleatoriedad**: `Math.random()` (uniforme en [0,1)). Ninguna semilla. Las comparaciones son siempre `Math.random() < p` (con `p` posiblemente >1, negativo o `Infinity` por división entre 0; ver cada caso).
- **Listas**: `il.units` (Vector<Unit>) admite huecos `null` (unidades muertas); `il.builds` (Vector<Building>) nunca tiene huecos en la práctica. El campo `Unit.index` debe coincidir con la posición de la unidad en `il.units` (se usa para transportes y fusión).
- **Bandos**: jugador humano (bando de unidad 0, propietario de edificio 1) e IA (bando de unidad 1, propietario de edificio 2). Neutral solo existe para edificios (propietario 0). No hay más de 2 bandos.
- **Turnos**: empieza el jugador. "Fin de turno" ejecuta el turno completo de la IA de forma síncrona y a continuación el mantenimiento de ronda (§6.11). Una ronda = turno jugador + turno IA.

### 0.1 Constantes globales relevantes para las reglas (`Ilogic`)

| Constante | Valor | Uso |
|---|---|---|
| `MAPX`, `MAPY` | 32, 32 | tamaño del mapa en casillas (fijo) |
| `MAXHEALTH` | 100 | vida máxima de una unidad |
| `DISPLHEALTH` | 10 | la vida se muestra como `ceil(life*10/100)` (1..10) |
| `maxus` | 30 | máximo de unidades por bando (para comprar/producir) |
| `ifunds` | 5000 | fondos iniciales de cada bando en partida nueva |
| `maxfunds` | 999999 | tope de fondos (se recorta tras cobrar ingresos) |
| `DISPLX`, `DISPLY` | 16, 16 | casillas visibles en pantalla (no afecta a reglas) |
| `ticktime` | 0.1 s | duración de un frame del bucle de juego |
| `Terrain.TILESIZE` | 32 px | tamaño de casilla |
| `Unit.uquan` | 19 | tipos de unidad |
| `Unit.maxts` | 128 | separador tipo/bando en id de unidad |
| `Unit.STDGROUNDMOV` | 0 | tipo de movimiento "a pie" estándar |
| `Building.bquan` | 6 | tipos de edificio |
| `Building.maxts` | 64 | separador tipo/propietario en id de edificio |
| `Building.HQ` | 5 | tipo "Base" = cuartel general |
| `Terrain.tquan` | 15 | tipos de terreno |
| `Climate.clquan` | 1 | climas (solo uno, neutro, sin uso real) |

---

## 1. Codificación de ids (bando / propietario)

### 1.1 Unidades (`Unit.id`, `Unit.maxts = 128`)
- `id = tipo + bando * 128`
- `tipo = id % 128` (índice 0..18 en todas las tablas de `Unit`).
- `bando = id / 128` (división entera): **0 = jugador**, **1 = IA**.
- Ejemplos: Soldier del jugador = 0; Tank de la IA = 129; WTank IA = 146.
- Dos unidades son "iguales" para fusión si `id` coincide (mismo tipo **y** bando).
- Comprobación de enemistad en combate: `atacante.bando + defensor.bando == 1` (`Ilogic.Attack`).

### 1.2 Edificios (`Building.id`, `Building.maxts = 64`)
- `id = tipo + propietario * 64`
- `tipo = id % 64` (0..5), `propietario = id / 64`: **0 = neutral**, **1 = jugador**, **2 = IA**.
- Ejemplos: Base (HQ) del jugador = 69; Factory de la IA = 130; City neutral = 0.
- Relación con unidades: `propietario = bando_unidad + 1`. Un edificio "es de" una unidad si `edificio.id/64 - 1 == unidad.id/128` (`Building.Heal`, `Unit.isHealing`).
- Unidad fabricada por un edificio: `id = tipo + (edificio.id/64 - 1) * 128` (`Building.Spawn`). En un edificio neutral daría un id negativo (no ocurre: solo fabrican edificios con dueño).

### 1.3 Peculiaridades
- `IA.getCaptObjs` divide el id del edificio entre **128** (Unit.maxts) en vez de 64: `id/128 == 0` ⇔ `id < 128` ⇔ propietario 0 ó 1. Resultado: la IA apunta a edificios neutrales y del jugador (que es lo deseado). Es un despiste inocuo.
- La interfaz decide si el botón "Capturar" está activo con `propietario % 2 == 0` (neutral o IA) (`Ilogic.ciclojuego`, fase 5).
- `Auxiliar.countAliveU` usa 128 y `countAliveB` usa 64 literales.

---

## 2. Tablas de datos

Índices de tipos de unidad (`Unit.unames`, también nombre base de su imagen):

`0 Soldier, 1 Tank, 2 Artillery, 3 Car, 4 LTank, 5 Blocker, 6 BSoldier, 7 Transport, 8 SSoldier, 9 Missile_truck, 10 LFighter, 11 Fighter, 12 Bomber, 13 Supplier, 14 Antiair, 15 THelicopter, 16 MSoldier, 17 FSoldier, 18 WTank`

Índices de edificio (`Building.imgs`): `0 City, 1 Oil, 2 Factory, 3 Stronghold, 4 Airport, 5 Base (HQ)`

Índices de terreno (`Terrain.imgs` sin `.png`): `0 Grass, 1 Water, 2 Woods, 3 Sand, 4 Cactus, 5 SandCliff, 6 Flowers, 7 GrassCliff, 8 SWater, 9 DWater, 10 Snow, 11 Frosty, 12 SnowCliff, 13 SnowWood, 14 Ice`

Tipos de movimiento (`Unit.movtype`, fila de `Terrain.canwalk`): `0 a pie, 1 vehículo, 2 aéreo, 3 anfibio (solo WTank)`

### 2.1 Estadísticas por tipo de unidad (`Unit`, arrays 1D indexados por tipo)

| idx | unames | cost | mover | vision | alcance | minalc | movtype | maxfuel | fuelperturn | maxammo | maxcarry | cancapt | canfight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Soldier | 1500 | 3 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | si | si |
| 1 | Tank | 12000 | 5 | 6 | 2 | 0 | 1 | 50 | 0 | 5 | 0 | no | si |
| 2 | Artillery | 8000 | 4 | 6 | 5 | 2 | 1 | 50 | 0 | 5 | 0 | no | si |
| 3 | Car | 5000 | 7 | 7 | 1 | 0 | 1 | 70 | 0 | 0 | 0 | no | si |
| 4 | LTank | 7000 | 6 | 6 | 1 | 0 | 1 | 50 | 0 | 8 | 0 | no | si |
| 5 | Blocker | 5000 | 2 | 0 | 0 | 0 | 1 | 30 | 0 | 0 | 0 | no | no |
| 6 | BSoldier | 2500 | 3 | 4 | 1 | 0 | 0 | 0 | 0 | 5 | 0 | si | si |
| 7 | Transport | 8000 | 6 | 6 | 0 | 0 | 1 | 50 | 0 | 0 | 1 | no | no |
| 8 | SSoldier | 2500 | 3 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | si | si |
| 9 | Missile_truck | 16000 | 3 | 4 | 10 | 4 | 1 | 45 | 0 | 3 | 0 | no | si |
| 10 | LFighter | 12000 | 10 | 10 | 1 | 0 | 2 | 60 | 2 | 0 | 0 | no | si |
| 11 | Fighter | 20000 | 9 | 10 | 2 | 0 | 2 | 80 | 2 | 6 | 0 | no | si |
| 12 | Bomber | 20000 | 7 | 8 | 1 | 0 | 2 | 80 | 3 | 3 | 0 | no | si |
| 13 | Supplier | 6000 | 5 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | no | no |
| 14 | Antiair | 8000 | 6 | 7 | 2 | 0 | 1 | 60 | 0 | 6 | 0 | no | si |
| 15 | THelicopter | 10000 | 7 | 7 | 0 | 0 | 2 | 70 | 2 | 0 | 1 | no | no |
| 16 | MSoldier | 2500 | 3 | 4 | 3 | 1 | 0 | 0 | 0 | 4 | 0 | si | si |
| 17 | FSoldier | 3500 | 5 | 6 | 1 | 0 | 1 | 80 | 0 | 0 | 0 | si | si |
| 18 | WTank | 15000 | 6 | 6 | 1 | 0 | 3 | 60 | 0 | 8 | 0 | no | si |

JSON literal (mismo orden de indices 0..18):

```json
{
  "unames": ["Soldier", "Tank", "Artillery", "Car", "LTank", "Blocker", "BSoldier", "Transport", "SSoldier", "Missile_truck", "LFighter", "Fighter", "Bomber", "Supplier", "Antiair", "THelicopter", "MSoldier", "FSoldier", "WTank"],
  "cost": [1500, 12000, 8000, 5000, 7000, 5000, 2500, 8000, 2500, 16000, 12000, 20000, 20000, 6000, 8000, 10000, 2500, 3500, 15000],
  "mover": [3, 5, 4, 7, 6, 2, 3, 6, 3, 3, 10, 9, 7, 5, 6, 7, 3, 5, 6],
  "vision": [4, 6, 6, 7, 6, 0, 4, 6, 4, 4, 10, 10, 8, 6, 7, 7, 4, 6, 6],
  "alcance": [1, 2, 5, 1, 1, 0, 1, 0, 1, 10, 1, 2, 1, 0, 2, 0, 3, 1, 1],
  "minalc": [0, 0, 2, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  "movtype": [0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 2, 2, 2, 1, 1, 2, 0, 1, 3],
  "maxfuel": [0, 50, 50, 70, 50, 30, 0, 50, 0, 45, 60, 80, 80, 0, 60, 70, 0, 80, 60],
  "fuelperturn": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 3, 0, 0, 2, 0, 0, 0],
  "maxammo": [0, 5, 5, 0, 8, 0, 5, 0, 0, 3, 0, 6, 3, 0, 6, 0, 4, 0, 8],
  "maxcarry": [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  "cancapt": [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, true, false],
  "canfight": [true, true, true, true, true, false, true, false, true, true, true, true, true, false, true, false, true, true, true]
}
```


Notas de semántica:
- `mover`: pasos por turno (cada casilla cuesta 1, sin coste por terreno; §6.2).
- `vision`: radio del rombo de visión (0 = solo su casilla).
- `alcance`/`minalc`: se puede atacar a distancia `d` con `minalc < d <= alcance`. `alcance = 0` ⇒ no puede atacar nunca.
- `maxfuel = 0` ⇒ la unidad no usa combustible (sin límite de movimiento por combustible). `maxammo = 0` ⇒ munición infinita (no se gasta).
- `fuelperturn`: combustible perdido en cada mantenimiento de ronda; solo aéreos (10, 11, 12, 15). Si llega a ≤0 la unidad **muere** (§6.11).
- `canfight = false` para 5 Blocker, 7 Transport, 13 Supplier, 15 THelicopter (y sus filas de `poder` son todo 0).
- `cancapt = true` para 0 Soldier, 6 BSoldier, 8 SSoldier, 16 MSoldier, 17 FSoldier.
- Curiosidades de datos (no son bugs de código, son diseño): FSoldier (17) es infantería con `movtype = 1` (vehículo) y combustible 80, se fabrica en City y repone combustible en Oil; MSoldier (16) es infantería a distancia (2..3) que no puede disparar tras moverse; Missile_truck ataca a distancia 5..10.

### 2.2 Matrices unidad × edificio (`Unit.healer`, `Unit.fueler`, `Unit.ammorestorer`, `Unit.spawner`)
Filas = tipo de unidad (0..18), columnas = tipo de edificio (0 City, 1 Oil, 2 Factory, 3 Stronghold, 4 Airport, 5 Base). `X` = true, `.` = false.

#### Unit.healer

healer[tipoUnidad][tipoEdificio]: el edificio cura a la unidad (cantidad = Building.heals del edificio)

| unidad \ edificio | 0 City | 1 Oil | 2 Factory | 3 Stronghold | 4 Airport | 5 Base |
|---|---|---|---|---|---|---|
| 0 Soldier | X | . | . | X | . | X |
| 1 Tank | . | . | X | . | . | . |
| 2 Artillery | . | . | X | . | . | . |
| 3 Car | . | . | X | . | . | . |
| 4 LTank | . | . | X | . | . | . |
| 5 Blocker | . | . | X | . | . | . |
| 6 BSoldier | X | . | . | X | . | X |
| 7 Transport | . | . | X | . | . | . |
| 8 SSoldier | X | . | . | X | . | X |
| 9 Missile_truck | . | . | X | . | . | . |
| 10 LFighter | . | . | . | . | X | . |
| 11 Fighter | . | . | . | . | X | . |
| 12 Bomber | . | . | . | . | X | . |
| 13 Supplier | . | . | X | . | . | . |
| 14 Antiair | . | . | X | . | . | . |
| 15 THelicopter | . | . | . | . | X | . |
| 16 MSoldier | X | . | . | X | . | X |
| 17 FSoldier | X | . | . | X | . | X |
| 18 WTank | . | . | X | . | . | . |

```json
{
  "healer": [
    [true, false, false, true, false, true],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [true, false, false, true, false, true],
    [false, false, true, false, false, false],
    [true, false, false, true, false, true],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [true, false, false, true, false, true],
    [true, false, false, true, false, true],
    [false, false, true, false, false, false]
  ]
}
```

#### Unit.fueler

fueler[tipoUnidad][tipoEdificio]: el edificio rellena el combustible al maximo

| unidad \ edificio | 0 City | 1 Oil | 2 Factory | 3 Stronghold | 4 Airport | 5 Base |
|---|---|---|---|---|---|---|
| 0 Soldier | . | . | . | . | . | . |
| 1 Tank | . | X | . | . | . | . |
| 2 Artillery | . | X | . | . | . | . |
| 3 Car | . | X | . | . | . | . |
| 4 LTank | . | X | . | . | . | . |
| 5 Blocker | . | X | . | . | . | . |
| 6 BSoldier | . | . | . | . | . | . |
| 7 Transport | . | X | . | . | . | . |
| 8 SSoldier | . | . | . | . | . | . |
| 9 Missile_truck | . | X | . | . | . | . |
| 10 LFighter | . | . | . | . | X | . |
| 11 Fighter | . | . | . | . | X | . |
| 12 Bomber | . | . | . | . | X | . |
| 13 Supplier | . | X | . | . | . | . |
| 14 Antiair | . | X | . | . | . | . |
| 15 THelicopter | . | . | . | . | X | . |
| 16 MSoldier | . | . | . | . | . | . |
| 17 FSoldier | . | X | . | . | . | . |
| 18 WTank | . | X | . | . | . | . |

```json
{
  "fueler": [
    [false, false, false, false, false, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false],
    [false, false, false, false, false, false],
    [false, true, false, false, false, false],
    [false, false, false, false, false, false],
    [false, true, false, false, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, false, false],
    [false, true, false, false, false, false],
    [false, true, false, false, false, false]
  ]
}
```

#### Unit.ammorestorer

ammorestorer[tipoUnidad][tipoEdificio]: el edificio rellena la municion al maximo

| unidad \ edificio | 0 City | 1 Oil | 2 Factory | 3 Stronghold | 4 Airport | 5 Base |
|---|---|---|---|---|---|---|
| 0 Soldier | . | . | . | . | . | . |
| 1 Tank | . | . | X | . | . | . |
| 2 Artillery | . | . | X | . | . | . |
| 3 Car | . | . | . | . | . | . |
| 4 LTank | . | . | X | . | . | . |
| 5 Blocker | . | . | . | . | . | . |
| 6 BSoldier | X | . | . | X | . | X |
| 7 Transport | . | . | . | . | . | . |
| 8 SSoldier | . | . | . | . | . | . |
| 9 Missile_truck | . | . | X | . | . | . |
| 10 LFighter | . | . | . | . | X | . |
| 11 Fighter | . | . | . | . | X | . |
| 12 Bomber | . | . | . | . | X | . |
| 13 Supplier | . | . | X | . | . | . |
| 14 Antiair | . | . | X | . | . | . |
| 15 THelicopter | . | . | . | . | X | . |
| 16 MSoldier | X | . | . | X | . | X |
| 17 FSoldier | . | . | . | . | . | . |
| 18 WTank | . | . | X | . | . | . |

```json
{
  "ammorestorer": [
    [false, false, false, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, false, false],
    [true, false, false, true, false, true],
    [false, false, false, false, false, false],
    [false, false, false, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [true, false, false, true, false, true],
    [false, false, false, false, false, false],
    [false, false, true, false, false, false]
  ]
}
```

#### Unit.spawner

spawner[tipoUnidad][tipoEdificio]: el edificio puede fabricar ese tipo

| unidad \ edificio | 0 City | 1 Oil | 2 Factory | 3 Stronghold | 4 Airport | 5 Base |
|---|---|---|---|---|---|---|
| 0 Soldier | X | . | . | . | . | . |
| 1 Tank | . | . | X | . | . | . |
| 2 Artillery | . | . | X | . | . | . |
| 3 Car | . | . | X | . | . | . |
| 4 LTank | . | . | X | . | . | . |
| 5 Blocker | . | . | X | . | . | . |
| 6 BSoldier | X | . | . | . | . | . |
| 7 Transport | . | . | X | . | . | . |
| 8 SSoldier | X | . | . | . | . | . |
| 9 Missile_truck | . | . | X | . | . | . |
| 10 LFighter | . | . | . | . | X | . |
| 11 Fighter | . | . | . | . | X | . |
| 12 Bomber | . | . | . | . | X | . |
| 13 Supplier | . | . | X | . | . | . |
| 14 Antiair | . | . | X | . | . | . |
| 15 THelicopter | . | . | . | . | X | . |
| 16 MSoldier | X | . | . | . | . | . |
| 17 FSoldier | X | . | . | . | . | . |
| 18 WTank | . | . | X | . | . | . |

```json
{
  "spawner": [
    [true, false, false, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [true, false, false, false, false, false],
    [false, false, true, false, false, false],
    [true, false, false, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, true, false, false, false],
    [false, false, true, false, false, false],
    [false, false, false, false, true, false],
    [true, false, false, false, false, false],
    [true, false, false, false, false, false],
    [false, false, true, false, false, false]
  ]
}
```


Resumen legible:
- **Producción** (`spawner`): City → 0 Soldier, 6 BSoldier, 8 SSoldier, 16 MSoldier, 17 FSoldier. Factory → 1 Tank, 2 Artillery, 3 Car, 4 LTank, 5 Blocker, 7 Transport, 9 Missile_truck, 13 Supplier, 14 Antiair, 18 WTank. Airport → 10 LFighter, 11 Fighter, 12 Bomber, 15 THelicopter. Oil, Stronghold y Base **no fabrican nada**.
- **Curación** (`healer`): infantería (0, 6, 8, 16, 17) en City/Stronghold/Base; vehículos (1,2,3,4,5,7,9,13,14,18) en Factory; aéreos (10,11,12,15) en Airport. Oil no cura a nadie (además `Building.heals[Oil]=0`).
- **Combustible** (`fueler`): vehículos 1,2,3,4,5,7,9,13,14,17,18 en Oil; aéreos en Airport.
- **Munición** (`ammorestorer`): 1,2,4,9,13,14,18 en Factory; 6 BSoldier y 16 MSoldier en City/Stronghold/Base; aéreos 10,11,12,15 en Airport. (Algunos con `maxammo=0`: inocuo.)

### 2.3 Matrices unidad × unidad (`Unit.cancarry`, `Unit.ufueler`, `Unit.uammorestorer`)
Filas = tipo que actúa (transporte / abastecedor), columnas = tipo receptor (0..18).

#### Unit.cancarry (literal)

Filas no nulas: fila 7 Transport -> columnas 0 Soldier, 6 BSoldier, 8 SSoldier, 16 MSoldier; fila 15 THelicopter -> columnas 0 Soldier, 6 BSoldier, 8 SSoldier, 16 MSoldier. Todas las demas filas son enteramente false.

```json
{
  "cancarry": [
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
  ]
}
```

#### Unit.ufueler (literal)

Filas no nulas: fila 13 Supplier -> columnas 1 Tank, 2 Artillery, 3 Car, 4 LTank, 5 Blocker, 7 Transport, 9 Missile_truck, 10 LFighter, 11 Fighter, 12 Bomber, 13 Supplier, 14 Antiair, 15 THelicopter, 17 FSoldier, 18 WTank. Todas las demas filas son enteramente false.

```json
{
  "ufueler": [
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, true, true, true, true, true, false, true, false, true, true, true, true, true, true, true, false, true, true],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
  ]
}
```

#### Unit.uammorestorer (literal)

Filas no nulas: fila 13 Supplier -> columnas 1 Tank, 2 Artillery, 4 LTank, 5 Blocker, 7 Transport, 9 Missile_truck, 10 LFighter, 11 Fighter, 12 Bomber, 13 Supplier, 14 Antiair, 15 THelicopter, 16 MSoldier, 18 WTank. Todas las demas filas son enteramente false.

```json
{
  "uammorestorer": [
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, true, true, false, true, true, false, true, false, true, true, true, true, true, true, true, true, false, true],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
  ]
}
```


### 2.4 Tabla de poder / daño (`Unit.poder[atacante][defensor]`)
Probabilidad base de acierto por cada punto de vida del atacante (§6.5). 0 ⇒ no puede atacarle (no aparece en el mapa de ataque del jugador).

**Literal**: 19 filas; las filas **0 Soldier, 8 SSoldier y 17 FSoldier tienen 20 valores**. Java indexa columnas 0..18 y el 20º valor se ignora, así que el valor `3.0` cae en la columna **4 LTank** y todo el resto de la fila queda desplazado una posición a la derecha (Soldier/SSoldier/FSoldier hacen ×3 a LTank: con p ≥ 1 aciertan siempre y matan a un LTank de un golpe con vida completa).

Valores EFECTIVOS tal y como los lee Java (columnas 0..18; en las filas de 20 valores el 20o se ignora):

| atac \ def | 0 Soldie | 1 Tank | 2 Artill | 3 Car | 4 LTank | 5 Blocke | 6 BSoldi | 7 Transp | 8 SSoldi | 9 Missil | 10 LFight | 11 Fighte | 12 Bomber | 13 Suppli | 14 Antiai | 15 THelic | 16 MSoldi | 17 FSoldi | 18 WTank |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 Soldier | 0.5 | 0.1 | 0.1 | 0.0 | 3.0 | 0.15 | 0.05 | 0.5 | 0.2 | 0.3 | 0.2 | 0.0 | 0.0 | 0.0 | 0.2 | 0.15 | 0.0 | 0.5 | 0.5 |
| 1 Tank | 0.3 | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | 0.3 | 0.7 | 0.3 | 0.7 | 0.0 | 0.0 | 0.0 | 0.7 | 0.5 | 0.0 | 0.3 | 0.3 | 0.7 |
| 2 Artillery | 0.3 | 0.4 | 0.4 | 0.6 | 0.5 | 0.25 | 0.25 | 0.6 | 0.3 | 0.6 | 0.0 | 0.0 | 0.0 | 0.6 | 0.5 | 0.0 | 0.3 | 0.3 | 0.5 |
| 3 Car | 0.6 | 0.1 | 0.1 | 0.3 | 0.15 | 0.05 | 0.6 | 0.3 | 0.15 | 0.3 | 0.0 | 0.0 | 0.0 | 0.3 | 0.15 | 0.0 | 0.6 | 0.6 | 0.15 |
| 4 LTank | 0.4 | 0.4 | 0.4 | 0.6 | 0.5 | 0.2 | 0.4 | 0.6 | 0.4 | 0.6 | 0.0 | 0.0 | 0.0 | 0.6 | 0.5 | 0.0 | 0.4 | 0.4 | 0.5 |
| 5 Blocker | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 6 BSoldier | 0.4 | 0.4 | 0.4 | 0.6 | 0.5 | 0.2 | 0.4 | 0.6 | 0.4 | 0.6 | 0.0 | 0.0 | 0.0 | 0.6 | 0.5 | 0.0 | 0.4 | 0.4 | 0.5 |
| 7 Transport | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 8 SSoldier | 0.5 | 0.1 | 0.1 | 0.0 | 3.0 | 0.15 | 0.05 | 0.5 | 0.3 | 0.15 | 0.3 | 0.0 | 0.0 | 0.0 | 0.3 | 0.15 | 0.0 | 0.5 | 0.5 |
| 9 Missile_truck | 0.3 | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | 0.3 | 0.7 | 0.3 | 0.7 | 0.0 | 0.0 | 0.0 | 0.7 | 0.5 | 0.0 | 0.3 | 0.3 | 0.5 |
| 10 LFighter | 0.6 | 0.1 | 0.1 | 0.3 | 0.15 | 0.05 | 0.6 | 0.3 | 0.15 | 0.3 | 0.3 | 0.3 | 0.3 | 0.3 | 0.15 | 0.4 | 0.6 | 0.6 | 0.15 |
| 11 Fighter | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.6 | 0.6 | 0.6 | 0.0 | 0.0 | 0.8 | 0.0 | 0.0 | 0.0 |
| 12 Bomber | 0.3 | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | 0.3 | 0.7 | 0.3 | 0.7 | 0.0 | 0.0 | 0.0 | 0.7 | 0.5 | 0.0 | 0.3 | 0.3 | 0.5 |
| 13 Supplier | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 14 Antiair | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.8 | 0.8 | 0.8 | 0.0 | 0.0 | 0.9 | 0.0 | 0.0 | 0.0 |
| 15 THelicopter | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 16 MSoldier | 0.4 | 0.4 | 0.4 | 0.6 | 0.5 | 0.2 | 0.4 | 0.6 | 0.4 | 0.6 | 0.0 | 0.0 | 0.0 | 0.6 | 0.5 | 0.0 | 0.4 | 0.4 | 0.5 |
| 17 FSoldier | 0.5 | 0.1 | 0.1 | 0.0 | 3.0 | 0.15 | 0.05 | 0.5 | 0.2 | 0.3 | 0.2 | 0.0 | 0.0 | 0.0 | 0.2 | 0.15 | 0.0 | 0.5 | 0.5 |
| 18 WTank | 0.4 | 0.4 | 0.4 | 0.6 | 0.5 | 0.2 | 0.4 | 0.6 | 0.4 | 0.6 | 0.0 | 0.0 | 0.0 | 0.6 | 0.5 | 0.0 | 0.4 | 0.4 | 0.5 |

```json
{
  "poder_literal": [
    [0.5, 0.1, 0.1, 0.0, 3.0, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.7],
    [0.3, 0.4, 0.4, 0.6, 0.5, 0.25, 0.25, 0.6, 0.3, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.6, 0.6, 0.15],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.5, 0.1, 0.1, 0.0, 3.0, 0.15, 0.05, 0.5, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.3, 0.3, 0.3, 0.3, 0.15, 0.4, 0.6, 0.6, 0.15],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6, 0.6, 0.6, 0.0, 0.0, 0.8, 0.0, 0.0, 0.0],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 0.8, 0.8, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.5, 0.1, 0.1, 0.0, 3.0, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5]
  ]
}
```


**Corrección propuesta [REMAKE]** (solo cambian las filas 0, 8 y 17). Al comparar con la fila 3 (Car), que tiene el mismo "patrón" de valores, resulta evidente que sobra un elemento entre las posiciones 3 y 4 (`..., 0.0, 3.0, ...`). Hay dos lecturas posibles:
- **Opción A** (la de NOTAS-BUGS: borrar el `3.0`): queda `Car = 0.0` (un soldado no podría atacar a un Car).
- **Opción B (recomendada)**: `0.0, 3.0` es un `0.3` mal tecleado ⇒ se fusionan en un único `0.3` en la columna Car. El resto de la fila es idéntico a la opción A.

Con la opción B, las filas corregidas son:
- 0 Soldier: `[0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15]`
- 8 SSoldier: `[0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.5, 0.5, 0.15]`
- 17 FSoldier: igual que 0 Soldier.

(La opción A es la misma con `0.0` en la columna 3.) Tabla completa corregida (opción B), lista para copiar:

```json
{
  "poder": [
    [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.7],
    [0.3, 0.4, 0.4, 0.6, 0.5, 0.25, 0.25, 0.6, 0.3, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.6, 0.6, 0.15],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.3, 0.3, 0.3, 0.3, 0.15, 0.4, 0.6, 0.6, 0.15],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6, 0.6, 0.6, 0.0, 0.0, 0.8, 0.0, 0.0, 0.0],
    [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 0.8, 0.8, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
    [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
    [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5]
  ]
}
```


Recomendación: que `poder` y el resto de tablas sean datos configurables; dejar un flag `legacyPoder` que reproduzca la tabla literal si se quiere jugar "como en 2013".

### 2.5 Curación entre unidades (`Unit.heals[curador][curado]`)
**Literal**: 18 filas (falta la fila 18 WTank), todas a 0 (ninguna unidad cura a otra). Columnas 0..18.

```json
{
  "heals_literal_18_filas": [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
}
```


Consecuencia: acceder a `heals[18][...]` lanza `ArrayIndexOutOfBoundsException`. Ocurre **de verdad**: al abrir el menú de acciones (fase 5) de un **WTank del jugador con una unidad aliada adyacente**, `ciclojuego` evalúa `heals[18][otro]` para decidir si activar "Abastecer" ⇒ excepción en el hilo principal ⇒ el juego se congela. **[REMAKE]** añadir la fila 18 de ceros:

```json
{
  "heals": [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
}
```


### 2.6 Prefijos de imagen por terreno (`Unit.tprefs[tipo][terreno]`, `Building.tprefs[tipo][terreno]`)
`-` = cadena vacía. Ver §10 para cómo se usan.

| unidad \ terreno | 0 Grass | 1 Water | 2 Woods | 3 Sand | 4 Cactus | 5 SandCliff | 6 Flowers | 7 GrassCliff | 8 SWater | 9 DWater | 10 Snow | 11 Frosty | 12 SnowCliff | 13 SnowWood | 14 Ice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 Soldier | - | - | - | - | - | - | - | - | 1_ | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 1 Tank | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 2 Artillery | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 3 Car | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 4 LTank | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 5 Blocker | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 6 BSoldier | - | - | - | - | - | - | - | - | 1_ | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 7 Transport | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 8 SSoldier | - | - | - | - | - | - | - | - | 1_ | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 9 Missile_truck | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 10 LFighter | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| 11 Fighter | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| 12 Bomber | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| 13 Supplier | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 14 Antiair | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 15 THelicopter | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| 16 MSoldier | - | - | - | - | - | - | - | - | 1_ | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 17 FSoldier | - | - | - | - | - | - | - | - | - | - | 2_ | 2_ | 2_ | 2_ | 2_ |
| 18 WTank | - | 1_ | - | - | - | - | - | - | 1_ | 1_ | 2_ | 2_ | 2_ | 2_ | - |

```json
{
  "unit_tprefs": [
    ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
    ["", "1_", "", "", "", "", "", "", "1_", "1_", "2_", "2_", "2_", "2_", ""]
  ],
  "building_tprefs": [
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""]
  ]
}
```


Resumen: infantería a pie (0, 6, 8, 16) lleva `1_` en SWater (vadeando) y `2_` en terrenos nevados 10..14; vehículos terrestres (1,2,3,4,5,7,9,13,14,17) `2_` en 10..14; aéreos (10,11,12,15) nunca prefijo; WTank `1_` en Water/SWater/DWater (nadando), `2_` en 10..13 y nada en Ice. Edificios: `2_` solo sobre Snow (10).

### 2.7 Edificios (`Building`)

| idx | imgs | earning (por ronda) | heals (vida curada) | protection (multiplicador de daño recibido) | vision | fabrica |
|---|---|---|---|---|---|---|
| 0 | City | 1000 | 30 | 0.8 | 0 | infantería |
| 1 | Oil | 500 | 0 | 0.9 | 0 | nada |
| 2 | Factory | 1000 | 25 | 0.8 | 0 | vehículos |
| 3 | Stronghold | 1500 | 20 | 0.7 | 0 | nada |
| 4 | Airport | 1000 | 25 | 0.85 | 0 | aéreos |
| 5 | Base (HQ) | 1000 | 30 | 0.7 | 0 | nada |

```json
{
  "imgs": ["City", "Oil", "Factory", "Stronghold", "Airport", "Base"],
  "earning": [1000, 500, 1000, 1500, 1000, 1000],
  "heals": [30, 0, 25, 20, 25, 30],
  "vision": [0, 0, 0, 0, 0, 0],
  "protection": [0.8, 0.9, 0.8, 0.7, 0.85, 0.7],
  "HQ": 5
}
```
- Los edificios **no tienen vida ni puntos de captura**: la captura es instantánea (§6.6). `Building.alive` existe pero no se usa.
- `vision = 0` ⇒ cada edificio propio revela solo su propia casilla (rombo de radio 0).
- `heals` solo se aplica si `Unit.healer[tipoUnidad][tipoEdificio]` es true.

### 2.8 Terrenos (`Terrain`)

| idx | imgs | canbuild | iswater | protection | canwalk[0] a pie | canwalk[1] vehiculo | canwalk[2] aereo | canwalk[3] WTank |
|---|---|---|---|---|---|---|---|---|
| 0 | Grass.png | si | no | 1.0 | 1 | 1 | 1 | 1 |
| 1 | Water.png | no | si | 1.0 | 0 | 0 | 1 | 1 |
| 2 | Woods.png | no | no | 0.85 | 1 | 1 | 1 | 1 |
| 3 | Sand.png | si | no | 1.0 | 1 | 1 | 1 | 1 |
| 4 | Cactus.png | no | no | 0.9 | 1 | 1 | 1 | 1 |
| 5 | SandCliff.png | no | no | 0.8 | 1 | 0 | 1 | 0 |
| 6 | Flowers.png | no | no | 1.0 | 1 | 1 | 1 | 1 |
| 7 | GrassCliff.png | no | no | 0.8 | 1 | 0 | 1 | 0 |
| 8 | SWater.png | no | si | 1.0 | 1 | 0 | 1 | 1 |
| 9 | DWater.png | no | si | 1.0 | 0 | 0 | 1 | 1 |
| 10 | Snow.png | si | no | 1.0 | 1 | 1 | 1 | 1 |
| 11 | Frosty.png | no | no | 1.0 | 1 | 1 | 1 | 1 |
| 12 | SnowCliff.png | no | no | 0.8 | 1 | 0 | 1 | 0 |
| 13 | SnowWood.png | no | no | 0.85 | 1 | 1 | 1 | 1 |
| 14 | Ice.png | no | no | 1.0 | 1 | 0 | 1 | 0 |

```json
{
  "imgs": ["Grass.png", "Water.png", "Woods.png", "Sand.png", "Cactus.png", "SandCliff.png", "Flowers.png", "GrassCliff.png", "SWater.png", "DWater.png", "Snow.png", "Frosty.png", "SnowCliff.png", "SnowWood.png", "Ice.png"],
  "canbuild": [true, false, false, true, false, false, false, false, false, false, true, false, false, false, false],
  "iswater": [false, true, false, false, false, false, false, false, true, true, false, false, false, false, false],
  "protection": [1.0, 1.0, 0.85, 1.0, 0.9, 0.8, 1.0, 0.8, 1.0, 1.0, 1.0, 1.0, 0.8, 0.85, 1.0],
  "canwalk": [
    [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0]
  ]
}
```


- `canbuild`: solo Grass, Sand y Snow admiten edificios (generador de mapas).
- `iswater`: Water, SWater y DWater (dibujo de costas y generador). **Ice no cuenta como agua.**
- `protection`: multiplica la probabilidad de acierto contra la unidad que está en esa casilla (menor = más defensa). No hay "estrellas" de defensa: es este multiplicador.
- No hay coste de movimiento por terreno: todas las casillas transitables cuestan 1.

### 2.9 Climas (`Climate`)
```json
{ "clquan": 1, "slow": [0], "blind": [0], "imgq": [1], "timeperimg": [1], "protection": [1.0], "img": [""], "prefix": [""] }
```
- `Climate(game, id)` guarda `id % clquan`. `getImage(frame)` devolvería `imgsfolder + img[id] + "_" + (frame % imgq[id]) + ".png"` (= `"_0.png"`).
- **No se usa en ninguna regla**: `Ilogic` nunca crea un `Climate`; `slow` (penalización de movimiento), `blind` (penalización de visión) y `protection` (multiplicador de daño) no se aplican en ningún sitio. **[REMAKE]** si se quieren climas, la semántica deducible es: `mover_efectivo = mover - slow`, `vision_efectiva = vision - blind`, `hitChance *= Climate.protection`; mantener todo neutro por defecto.
- Los "temas" de mapa (Plains, Desert, Forest, Swamp, Snowy; §7) no son climas: solo cambian el generador y las imágenes de costa.
- **[REMAKE, hecho]** regla `weather`: climas en `src/core/content/weather.json` con esa semántica (por tipo de movimiento, mínimo 1), que cambian cada pocos días según el tema del mapa (`src/core/weather.ts`).

---

## 3. Modelo de estado

### 3.1 Unidad (`Unit`)
| campo | significado | valor inicial (constructor) |
|---|---|---|
| `id` | tipo + bando*128 | parámetro |
| `index` | posición en `il.units` | parámetro (-1 si aún no tiene) |
| `active` | puede actuar este turno | true |
| `canmove` | aún no se ha movido este turno | true |
| `canfire` | puede disparar este turno | true |
| `life` | 0..100 | 100 |
| `fuel` | combustible | `maxfuel[tipo]` |
| `ammo` | munición | `maxammo[tipo]` |
| `xy` | casilla (se copia) | parámetro |
| `carrier` | índice del transporte que la lleva o -1 | -1 |
| `carries[maxcarry]` | índices de las unidades transportadas, -1 = libre | todo -1 |
| `alive`, `offx`, `offy` | sin uso real (offx/offy = 0 siempre) | true, 0, 0 |

Una unidad **transportada** (`carrier != -1`) no ocupa casilla: `unitOn`, `getUnitMap`, la visión y los objetivos de la IA la ignoran. Su `xy` **no se actualiza** mientras va dentro (queda la posición donde se subió) hasta que se descarga.

### 3.2 Edificio (`Building`)
`id` (tipo + propietario*64), `xy`, `alive` (sin uso).

### 3.3 Partida (`Ilogic`)
`map`, `theme` (0..4, tema del mapa), `funds` (jugador), `efunds` (IA), `units`, `builds`, `gameid`, `autosave`, `music`, `lang`, `phase`, `cursor`, `focus`, `selent`, `selbut` (estos últimos son de interfaz). `selent` es un `byte` (índice de la unidad/edificio seleccionado) — **[REMAKE]** usar entero normal.

---

## 4. Utilidades geométricas (`Auxiliar`, `Coordinate`, `LValue`)

### 4.1 `getPosDif(a, b)` = `|b.x-a.x| + |b.y-a.y|` (Manhattan).
### 4.2 `isInBounds(x, y)` = dentro de `[0,MAPX)×[0,MAPY)`.
### 4.3 `getRangeSize(r)` = número de casillas a distancia Manhattan ≤ r = `2*r*(r+1) + 1` (0 si r<0).
Valores: r=0→1, 1→5, 2→13, 3→25, 4→41, 5→61, 6→85, 7→113, 8→145, 9→181, 10→221.
Uso típico: `for i in [getRangeSize(a), getRangeSize(b))` recorre exactamente las casillas con distancia `a < d <= b`; `for i in [1, getRangeSize(r))` recorre distancias 1..r (sin el centro).

### 4.4 `getRangePos(center, index)` — enumeración del rombo anillo a anillo
- Si `index < 0` o `center` fuera del mapa ⇒ `Coordinate.empty`.
- `index == 0` ⇒ devuelve **el propio objeto `center`** (alias, no copia).
- Si no: anillo `r` = menor r con `getRangeSize(r) > index`; `k = index - getRangeSize(r-1)` (0 ≤ k < 4r); `lado = k / r`, `o = k % r`:
  - lado 0: `(cx + o, cy + r - o)` — empieza abajo y va hacia la derecha
  - lado 1: `(cx + r - o, cy - o)` — empieza a la derecha y sube
  - lado 2: `(cx - o, cy + o - r)` — empieza arriba y va a la izquierda
  - lado 3: `(cx - r + o, cy + o)` — empieza a la izquierda y baja
- Si la casilla resultante cae fuera del mapa ⇒ `Coordinate.empty` (pero el índice cuenta igual, así que los bucles siguen funcionando).
- Orden resultante (y hacia abajo): sentido antihorario en pantalla empezando por abajo. Anillo 1: índices 1..4 = abajo `(x,y+1)`, derecha `(x+1,y)`, arriba `(x,y-1)`, izquierda `(x-1,y)`. Anillo 2: índices 5..12 = `(x,y+2)`, `(x+1,y+1)`, `(x+2,y)`, `(x+1,y-1)`, `(x,y-2)`, `(x-1,y-1)`, `(x-2,y)`, `(x-1,y+1)`.
- **Importante**: el orden importa para reproducir la IA y el generador (se elige "el primero que cumple"). Los "vecinos 4-direcciones" en todo el código son `getRangePos(p, 1..4)`.
- **[REMAKE]** devolver siempre copias / `null` en vez de un singleton mutable (`Coordinate.empty` es un `static final` mutable que nadie modifica en la práctica, y el índice 0 devuelve el centro por referencia).

### 4.5 `countTiles(bool[][])` = nº de casillas a true.

### 4.6 `getGroundRange(game, unit)` / `getGroundRange(game, coord)` — distancia por "tierra" sin límite
BFS (relleno por inundación en anillos) desde la casilla de origen:
- Se calcula `unitMap = game.getUnitMap()` **una vez** al principio (unidades no transportadas de cualquier bando bloquean).
- Tipo de movimiento: `movtype[unit.tipo]` en la versión con unidad; `STDGROUNDMOV = 0` (a pie) en la versión con coordenada.
- `range[origen] = 1`; en el paso `s = 1, 2, ...`: para cada casilla con `range != 0` y `getPosDif(origen, c) <= s`, cada vecina 4-dir dentro del mapa con `range == 0` y `isWalkable(vecina, movtype, unitMap)` recibe `s`. Las nuevas se vuelcan al final del paso. Termina cuando un paso no añade ninguna.
- Al final `range[origen] = 0`.
- Resultado: `range[c]` = distancia BFS (en pasos) desde el origen; **0 = inalcanzable o es el propio origen**. El origen no necesita ser transitable (la versión con coordenada se usa con casillas ocupadas o edificios como origen).
- Sin límite de pasos ni de combustible.

### 4.7 `countAliveU(units, enemy)`: nº de unidades no nulas con `id/128 == (enemy?1:0)` (incluye transportadas y unidades con vida 0 aún no limpiadas). `countAliveB(builds, enemy)`: nº de edificios con `id/64 == (enemy?2:1)`.

### 4.8 `getIsland(...)` (3 sobrecargas) — sin uso
Calcularían la región 4-conexa de casillas con un terreno dado. Solo la versión `(byte[][] map, Coordinate start, byte[] terrains)` está bien escrita (relleno iterativo hasta que no hay cambios); las versiones `(map, start, byte)` y `(map, start)` tienen índices mezclados y no funcionan. Ninguna se llama. **[REMAKE]** si se necesita, implementar un flood-fill correcto.

### 4.9 `Coordinate`
`x, y`; `Coordinate()` = (-1,-1); `rand()` = `(floor(random*MAPX), floor(random*MAPY))`; `set(...)`, `eq(o)` (false si o es null), `isInBounds()`, `write()` = `"(x;y)"` (constantes `LDELIMITER "("`, `SEPARATOR ";"`, `RDELIMITER ")"`).

### 4.10 `LValue`
Envoltorio mutable de un boolean (`v`) para pasar opciones por referencia (autosave, música). En TS basta un objeto `{v: boolean}`.

---

## 5. Consultas de estado (`Ilogic`)

- `isWalkable(pos, moveType, unitMap)`: `pos` dentro del mapa **y** `Terrain.canwalk[moveType][map[pos]] != 0` **y** no hay ninguna unidad no transportada (de ningún bando) en `pos`. Si `unitMap` es null lo recalcula.
- `unitOn(pos)`: índice de la primera unidad no nula, no transportada, en `pos`, o -1.
- `buildOn(pos)`: índice del edificio en `pos`, o -1.
- `getUnitMap()`: matriz con el índice de la unidad no transportada de cada casilla o -1.
- `getBuildMap()`: matriz con el índice de edificio de cada casilla o -1.

---

## 6. Reglas de juego

### 6.1 Transitabilidad
Una unidad puede entrar en una casilla si su `movtype` lo permite según `Terrain.canwalk` y la casilla está libre de unidades (**amigas o enemigas**: no se puede atravesar a nadie). No hay zonas de control ni bloqueo especial; el "Blocker" solo es una unidad lenta sin ataque.

### 6.2 Mapa de movimiento (`Ilogic.getMoveMap(unit)`)
BFS limitado:
- `maxSteps = (maxfuel[tipo] != 0) ? min(mover[tipo], fuel) : mover[tipo]`.
- `moveMap[unit.xy] = 1`; para `step = 1..maxSteps` mientras el paso anterior añadiera algo: para cada casilla del rombo de radio `step` alrededor de la unidad con `moveMap != 0`, cada vecina 4-dir dentro del mapa con `moveMap == 0` e `isWalkable(vecina, movtype, null)` recibe `step` (se vuelcan al final del paso).
- Al final `moveMap[unit.xy] = 0`.
- Resultado: `moveMap[c] = n` (1..maxSteps) = nº de pasos para llegar; 0 = no alcanzable (o la propia casilla).
- Coste uniforme 1 por casilla (sin coste por terreno; ver bug B8).
- Una unidad sin combustible (`fuel = 0` y `maxfuel != 0`) no puede moverse.

### 6.3 Mover (`Ilogic.Move(unit, dest, enemy)`)
Se mueve si: unidad no nula, `dest != unit.xy`, `unit.active`, `unit.canmove`, `unit.bando == (enemy?1:0)`, `dest` dentro del mapa y `moveMap[dest] != 0`. Efectos:
- `fuel -= moveMap[dest]` (pasos). Se aplica también a unidades sin combustible (`maxfuel=0`): su `fuel` se vuelve negativo y la limpieza del frame lo pone a 0 (inocuo; **[REMAKE]** no descontar si `maxfuel == 0`).
- `xy = dest`, `canmove = false`.
- Si `minalc[tipo] != 0` (2 Artillery, 9 Missile_truck, 16 MSoldier) ⇒ `canfire = false` (las unidades a distancia **no pueden mover y disparar** en el mismo turno).
- `active` no cambia (tras mover, la unidad aún debe elegir acción).
- Movimiento instantáneo (sin animación ni camino; la unidad "salta" a destino).
- Devuelve `dest` o `Coordinate.empty`.
- Jugador (fase 7): solo si `moveMap[cursor] != 0 && moveMap[cursor] <= mover`.

### 6.4 Visión y niebla de guerra (`Ilogic.getVisMap(enemy)`)
- Visible = unión de los rombos de radio `Unit.vision[tipo]` alrededor de cada unidad **no transportada** del bando, más el rombo de radio `Building.vision[tipo]` (= 0, solo su casilla) de cada edificio del bando (propietario 1 jugador / 2 IA).
- No hay línea de visión ni bloqueo por terreno. No hay memoria: se recalcula siempre desde cero (lo que dejas de ver vuelve a estar en niebla).
- Efectos para el jugador (dibujo): el terreno siempre se ve; en casillas no visibles se pinta `fogtile`, no se dibujan unidades, y los edificios se dibujan sin color de propietario (§10).
- Efectos en reglas: el jugador solo puede atacar unidades en casillas visibles (`getAtkMap`); la IA solo persigue/ataca/captura cosas visibles para ella (`getVisMap(true)`).
- `Climate.blind` no se aplica.

### 6.5 Combate (`Ilogic.Attack(atk, def)` y `Ilogic.getAtkMap(atk, enemy)`)
**Validez** (`Attack`): ambos no nulos; bandos opuestos (`atk.bando + def.bando == 1`); `atk.canfire`; `canfight[atk.tipo]`; `maxammo[atk.tipo] == 0 || atk.ammo != 0`; `minalc < d <= alcance` con `d = getPosDif(atk.xy, def.xy)`. `Attack` **no** comprueba `poder`, ni visibilidad, ni `active` (eso lo hacen `getAtkMap` / la interfaz).

**Mapa de objetivos del jugador** (`getAtkMap`): casillas del rombo con `minalc < d <= alcance` (índices `[getRangeSize(minalc), getRangeSize(alcance))`), visibles para el bando atacante, con una unidad no transportada del bando contrario y `poder[atk.tipo][def.tipo] != 0`.

**Fórmula**:
```
p = poder[atk.tipo][def.tipo] * Terrain.protection[map[def.xy]]
si hay edificio en def.xy: p *= Building.protection[tipoEdificio]   (de cualquier propietario)
repetir atk.life veces (mientras atk.life > 0 y def.life > 0):
    si random() < p: def.life -= 1; dano += 1
si maxammo[atk.tipo] != 0: atk.ammo -= 1
devolver dano
```
- Es un proceso binomial: daño esperado = `atk.life * p` (cortado en `def.life`). Una unidad dañada pega menos. Con `p >= 1` acierta siempre.
- **Sin contraataque**, sin daño al atacante, sin experiencia.
- La protección del atacante no influye; solo la casilla del defensor.
- Gasta 1 de munición por ataque (no por acierto).
- La unidad defensora con `life <= 0` se elimina en la limpieza del frame (§6.12); si era un transporte, sus pasajeros también.
- Tras atacar, la interfaz pone `atk.active = false` (fase 8); la IA también.
- `Climate.protection` no se aplica.

### 6.6 Captura (`Unit.Capture(building)`)
Condiciones: `building.xy == unit.xy`, `unit.active`, `cancapt[unit.tipo]`. Efecto **instantáneo** (una sola acción, sin puntos de captura):
- Edificio **neutral** (propietario 0) ⇒ pasa al bando de la unidad (`propietario = unit.bando + 1`).
- Edificio **con dueño (cualquiera, incluso propio)** ⇒ pasa a **neutral**.
- `unit.active = false`. Devuelve true.

Por tanto quitar un edificio enemigo requiere **dos capturas** (enemigo → neutral → propio), en turnos distintos (la unidad queda inactiva). Capturar la Base (HQ) enemiga una vez la vuelve neutral ⇒ **victoria inmediata** (§6.13).
Interfaz: el botón "Capturar" solo se activa si hay edificio bajo la unidad, `cancapt` y propietario neutral o IA (`propietario % 2 == 0`), así el jugador nunca neutraliza los suyos. Se puede capturar después de mover (mover no desactiva).

### 6.7 Fusión (`Unit.Merge(target)` y `Ilogic.getMergeMap(unit)`)
- `getMergeMap(unit)`: `moveMap = getMoveMap(unit)` con `moveMap[unit.xy] = 1`; para cada otra unidad `o` no transportada con `o.id == unit.id` (mismo tipo y bando) e índice `!= unit.index`: si alguna vecina 4-dir de `o` cumple `moveMap != 0 && moveMap < mover[unit.tipo]` ⇒ marca la casilla de `o`. (Es decir: `o` está a ≤ `mover` pasos si su casilla estuviera libre.)
- `Merge(target)`: si `target` no nulo, `this.id == target.id` y `this.active`: `target.life = min(target.life + this.life, 100)`; `this.life = 0` (se elimina en la limpieza); `target.active = false`.
- La unidad que se fusiona **no se mueve ni gasta combustible**; el combustible y la munición del destino no cambian (no se suman).
- Jugador: en fase 7 tiene prioridad sobre cargar y mover. Sin tope adicional (la vida sobrante se pierde).
- IA: solo si `life_a + life_b <= MAXMERGELIFE (130)` (§8).

### 6.8 Transporte (`Unit.Load`, `Unit.Unload`, `Ilogic.getLoadMap`)
- Transportes: 7 Transport y 15 THelicopter, `maxcarry = 1`; solo llevan 0 Soldier, 6 BSoldier, 8 SSoldier, 16 MSoldier (**no** FSoldier 17).
- `getLoadMap(unit)`: `moveMap` de la unidad con `moveMap[unit.xy]=1`; para cada unidad `t` no nula con `cancarry[t.tipo][unit.tipo]`, mismo bando y `getFreeSlot() != -1`: si alguna vecina 4-dir de `t` cumple `moveMap != 0 && moveMap < mover[t.tipo]` ⇒ marca la casilla de `t`. **Ojo: usa el `mover` del transporte, no el del pasajero** (bug B22). No comprueba que `t` no vaya a su vez transportado.
- `Load(passenger)` (llamado sobre el transporte): `passenger` no nulo, `passenger.active`, mismo bando, `cancarry`, hueco libre y `passenger.carrier == -1` ⇒ `passenger.carrier = this.index`, `passenger.active = false`, `carries[hueco] = passenger.index`. El pasajero **no se mueve ni gasta combustible**; su `xy` se queda donde estaba.
- `Unload(passenger, target)`: `passenger` va en este transporte, `getPosDif(this.xy, target) == 1` y `isWalkable(target, movtype[passenger.tipo])` ⇒ `passenger.carrier = -1`, `passenger.xy = target`, `passenger.active = false`, `carries[hueco] = -1`. La interfaz además pone el transporte `active = false`. Se puede descargar tras mover el transporte.
- Si el transporte muere, sus pasajeros mueren (limpieza §6.12).
- Las unidades transportadas se reactivan cada ronda (inocuo), no curan, no ven, no pueden ser atacadas.
- `makeCarries()`: reconstruye `carries[]` a partir de las unidades cuyo `carrier == this.index` (tras cargar partida).
- `countCarried()`, `getFreeSlot()`, `isCarried(u)`: utilidades obvias (ver bug B13 sobre `countCarried`).

### 6.9 Abastecimiento entre unidades (`Unit.Heal(target)`, botón "Abastecer")
- Botón activo si alguna de las 4 casillas adyacentes tiene una unidad del mismo bando con `heals[sel][otro] != 0 || ufueler[sel][otro] || uammorestorer[sel][otro]` (en la práctica: el seleccionado es un **Supplier (13)** y el vecino es de un tipo de su fila).
- Acción: para cada vecina 4-dir con unidad (`unitOn`), `sel.Heal(vecino)`: si mismo bando ⇒ `life += heals[sel][vecino]` (siempre 0, tope 100); si `ufueler` ⇒ `fuel = maxfuel`; si `uammorestorer` ⇒ `ammo = maxammo`. Después `sel.active = false`.
- Abastece a **todas** las vecinas aliadas válidas a la vez, sin coste. La IA nunca lo usa.

### 6.10 Compra y producción (`Building.Spawn`, `countSpawned`, `getSpawned`, `canSpawn`)
- Jugador: en su turno, cursor sobre un edificio propio (propietario 1) **sin unidad encima** ⇒ menú de compra con todos los tipos que `spawner` permite (los no pagables se muestran en gris). Comprar el tipo `t` exige `cost[t] <= funds` y `countAliveU(jugador) < 30`.
- `Spawn(t)`: crea `Unit(t + (propietario-1)*128, xy del edificio)`; si `spawner[t][tipoEdificio]` y `isWalkable(xy, movtype[t])` (terreno apto y casilla libre): descuenta `cost[t]` de `funds` (bando 0) o `efunds` (bando 1), la unidad nace con `active = false` (no actúa hasta la ronda siguiente), vida/combustible/munición al máximo; se inserta en el **primer hueco null** de `units` (con `index` = ese hueco) o al final. Si no, devuelve null sin cobrar.
- Sin límite de compras por edificio y turno salvo que la casilla queda ocupada por la unidad recién creada (⇒ en la práctica 1 por edificio y turno).
- `countSpawned(enemy)` / `getSpawned(enemy)`: tipos fabricables por el edificio con `cost <= fondos` del bando indicado (en orden de tipo). `canSpawn(t, enemy)` (sin uso): propietario correcto, `spawner`, casilla sin unidad y fondos.

### 6.11 Fin de turno / mantenimiento de ronda (`Ilogic.ciclojuego`, `phase == 2`)
Cuando el jugador pulsa "Fin de turno", en este orden exacto:
1. `ia.run()` — turno completo de la IA (síncrono, §8), incluida su producción.
2. Para cada unidad no nula (**ambos bandos**, incluidas transportadas): `active = canmove = canfire = true`; si `fuelperturn[tipo] != 0`: `fuel -= fuelperturn`; si entonces `fuel <= 0` ⇒ la unidad se elimina (`units[i] = null`).
3. Para cada edificio, en orden de lista: `u = unitOn(edificio.xy)`; si propietario 1 ⇒ `funds += earning[tipo]`; si propietario 2 ⇒ `efunds += earning[tipo]`; si hay `u`: `edificio.Heal(u)`:
   - solo si `propietario - 1 == u.bando` (edificio propio);
   - si `healer[u.tipo][tipoEdif]`: `life = min(life + Building.heals[tipoEdif], 100)`;
   - si `fueler[u.tipo][tipoEdif]`: `fuel = maxfuel`;
   - si `ammorestorer[u.tipo][tipoEdif]`: `ammo = maxammo`.
   Curar es gratis. Se aplica haya actuado o no la unidad.
4. `funds = min(funds, 999999)`, `efunds = min(efunds, 999999)`.
5. Si `autosave`: `IlogicIO.saveMap(save)`.
6. Comienza el turno del jugador (`phase = 3`).

Consecuencias:
- Ingresos y curación de **ambos** bandos ocurren en el mismo instante (tras el turno de la IA). El jugador no cobra antes de su primer turno; la IA juega su primer turno con 5000.
- El consumo de combustible va **antes** del repostaje: un aéreo sobre su Airport con `fuel <= fuelperturn` muere antes de repostar (bug B24).
- Unidades terrestres sin combustible no mueren; simplemente no se mueven.

### 6.12 Limpieza en cada frame (`ciclojuego`, cada 0,1 s)
1. `fuel < 0 ⇒ 0`; `ammo < 0 ⇒ 0`; `life <= 0 ⇒ units[i] = null`.
2. Después: toda unidad con `carrier != -1` cuyo `units[carrier]` es null ⇒ null (los pasajeros mueren con su transporte).
**[REMAKE]** hacer esta limpieza de forma explícita inmediatamente después de cada acción (ataque, fusión, fin de turno) y no por frames; ojo a que la IA, que corre sin frames intermedios, sigue viendo unidades con vida 0 durante todo su turno (bug B21).

### 6.13 Victoria y derrota (`ciclojuego`, comprobado en cada frame, también durante el turno del jugador)
- **Victoria** (fase 9) si `(IA sin unidades Y sin edificios)` **o** no existe ningún edificio con propietario 2 y tipo 5 (Base/HQ).
- **Derrota** (fase 10) si `(jugador sin unidades Y sin edificios)` **o** no existe ningún edificio con propietario 1 y tipo 5.
- Se evalúa victoria y luego derrota: si se cumplen ambas, gana la derrota.
- En la práctica la condición decisiva es la HQ: basta con **neutralizar** (una captura) la Base enemiga. Destruir todas las unidades no basta si conserva la HQ. Perder todas las unidades no es derrota si conservas tu HQ.
- `countAliveU` cuenta unidades transportadas y con vida 0 no limpiadas.
- Si la partida se cargó desde fichero (`loadmap`), al terminar se borra el guardado.
- Si el generador no pudo colocar a un bando (sin HQ), la partida termina en el primer frame (§7.8).

### 6.14 Acciones del jugador que afectan a reglas (menú de unidad, fase 5)
Botones (`unitbuttonimgs`): 0 Atacar, 1 Capturar, 2 Descargar, 3 Abastecer, 4 Esperar, 5 Atrás, 6 Borrar. Activación:
- 0 Atacar: `canfire && canfight && getAtkMap no vacío && (ammo != 0 || maxammo == 0)`.
- 1 Capturar: edificio bajo la unidad, `cancapt`, propietario neutral o IA.
- 2 Descargar: `maxcarry != 0 && countCarried() != 0`.
- 3 Abastecer: §6.9.
- 4 Esperar: siempre ⇒ `active = false`.
- 5 Atrás: solo si `canmove` (no se puede deshacer un movimiento).
- 6 Borrar: siempre ⇒ la unidad se elimina sin reembolso.
Flujo de selección (fase 7, Enter/2º clic en casilla): si la casilla está en `getMergeMap` y tiene unidad ⇒ fusionar; si no, si está en `getLoadMap` y tiene unidad ⇒ subir al transporte; si no, si `0 < moveMap <= mover` ⇒ mover y abrir menú; si no, si es la propia unidad ⇒ menú sin mover; si no ⇒ cancelar. Solo se seleccionan unidades propias activas no transportadas; solo se compra en edificios propios sin unidad encima.

---

## 7. Generador de mapas aleatorios (`RandomMap`)

### 7.1 Constantes
```json
{
  "MINNB": 24, "MAXNB": 30,
  "MAXSPAWNDIST": 2,
  "MINUCAP": 9, "MINBCAP": 6,
  "THEMES": 5,
  "MINTILENUM": 200,
  "MINNBS": [8, 5, 3, 3, 1, 0],
  "MAXNBS": [11, 9, 5, 6, 3, 0],
  "INITUS": [0, 0, 2],
  "INITBS": [5, 0, 2, 1, 4],
  "SWaterID": 8, "DWaterID": 9, "IceID": 14,
  "isSWater": [true, true, true, true, false],
  "isIce": [false, false, false, false, true]
}
```
- `MINNBS/MAXNBS` por tipo de edificio (City, Oil, Factory, Stronghold, Airport, Base): rango de edificios **neutrales** de cada tipo; nunca hay Bases neutrales.
- `INITUS`: unidades iniciales de cada bando = Soldier, Soldier, Artillery.
- `INITBS`: edificios iniciales de cada bando = Base (HQ), City, Factory, Oil, Airport.
- Tamaño del mapa fijo 32×32.

### 7.2 Temas y probabilidades de terreno
Fila = tema (`THEMENAMES`), columna = terreno. `base` = `TILEBASEPROBS`, `adj` = `PROBSPERADJ` (lo que se suma por cada vecino ortogonal ya generado del mismo terreno).

| tema \ terreno | 0 Grass | 1 Water | 2 Woods | 3 Sand | 4 Cactus | 5 SandCliff | 6 Flowers | 7 GrassCliff | 8 SWater | 9 DWater | 10 Snow | 11 Frosty | 12 SnowCliff | 13 SnowWood | 14 Ice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 Plains base | 0.05 | 0.005 | 0.05 | 0.0 | 0.0 | 0.0 | 0.03 | 0.02 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 0 Plains adj | 0.2 | 0.3 | 0.03 | 0.0 | 0.0 | 0.0 | 0.01 | -0.05 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 1 Desert base | 0.0 | 0.005 | 0.0 | 0.05 | 0.03 | 0.03 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 1 Desert adj | 0.0 | 0.3 | 0.0 | 0.2 | -0.05 | -0.05 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 2 Forest base | 0.05 | 0.005 | 0.1 | 0.0 | 0.0 | 0.0 | 0.01 | 0.02 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 2 Forest adj | 0.1 | 0.3 | 0.15 | 0.0 | 0.0 | 0.0 | 0.005 | -0.05 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 3 Swamp base | 0.05 | 0.03 | 0.05 | 0.0 | 0.0 | 0.0 | 0.0 | 0.01 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 3 Swamp adj | 0.05 | 0.12 | 0.02 | 0.0 | 0.0 | 0.0 | 0.0 | -0.05 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 4 Snowy base | 0.0 | 0.005 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.05 | 0.015 | 0.02 | 0.05 | 0.0 |
| 4 Snowy adj | 0.0 | 0.3 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.2 | -0.05 | -0.05 | 0.03 | 0.0 |

```json
{
  "THEMENAMES": ["Plains", "Desert", "Forest", "Swamp", "Snowy"],
  "TILEBASEPROBS": [
    [0.05, 0.005, 0.05, 0.0, 0.0, 0.0, 0.03, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.005, 0.0, 0.05, 0.03, 0.03, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.05, 0.005, 0.1, 0.0, 0.0, 0.0, 0.01, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.05, 0.03, 0.05, 0.0, 0.0, 0.0, 0.0, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.005, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.015, 0.02, 0.05, 0.0]
  ],
  "PROBSPERADJ_literal": [
    [0.2, 0.3, 0.03, 0.0, 0.0, 0.0, 0.01, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.3, 0.0, 0.2, -0.05, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.1, 0.3, 0.15, 0.0, 0.0, 0.0, 0.005, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.05, 0.12, 0.02, 0.0, 0.0, 0.0, 0.0, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, -0.05, -0.05, 0.03, 0.0]
  ]
}
```


La fila 2 (Forest) de `PROBSPERADJ` tiene **16** valores; el 16º (`0.0`) nunca se usa. **[REMAKE]** quitarlo (fila de 15).

### 7.3 `getTileProb(pos, map, generated, tile, theme)`
```
p = TILEBASEPROBS[theme][tile]
para cada vecino ortogonal v de pos dentro del mapa (orden: x-1, y-1, x+1, y+1):
    si (generated == null o generated[v]) y map[v] == tile: p += PROBSPERADJ[theme][tile]
devolver p          (-1 si map/pos nulos o pos fuera del mapa)
```
`p` puede ser negativo (acantilados con vecinos iguales: nunca salen juntos) o > 1 (salen seguro).

### 7.4 `generateTerrain(game, origin, theme)` — crecimiento en anillos
1. `generated[][] = false`; `map` ya está todo a 0.
2. **Casilla origen**: `tile = 0, 1, 2, ..., 14, 0, 1, ...` (cíclico); para cada candidato, si `random() < TILEBASEPROBS[theme][tile]` ⇒ se asigna y para (solo probabilidad base).
3. **Anillos** `ring = 1, 2, ...`: para `i` en `[getRangeSize(ring-1), getRangeSize(ring))` (orden de §4.4): `pos = getRangePos(origin, i)`; si está en el mapa: probar `tile = 0, 1, ..., 14, 0, ...` (cíclico, empezando siempre en 0) hasta que `random() < getTileProb(pos, map, generated, tile, theme)` ⇒ `map[pos] = tile`, `generated[pos] = true`, contar en el anillo; si `canwalk[0][tile] != 0` ⇒ `walkable++`.
4. Para cuando un anillo entero cae fuera del mapa (0 casillas generadas).
5. Devuelve `walkable` (casillas transitables a pie, **sin contar el origen**).
Nota: el orden de prueba 0→14 favorece a los terrenos de índice bajo; para reproducir la distribución hay que respetarlo.

### 7.5 Post-procesos de agua
- `addShallowWater(map)` (temas 0..3): recorrido `x` exterior, `y` interior; cada `Water (1)` cuyos dos vecinos horizontales (ambos dentro del mapa) no son agua **o** cuyos dos vecinos verticales (ambos dentro) no son agua ⇒ `SWater (8)`. Devuelve nº de conversiones. (SWater cuenta como agua para las siguientes, no hay cascada.)
- `addIce(map)` (tema 4): cada casilla de agua con algún vecino del cuadrado 3×3 (recortado al mapa, incluidas diagonales) que no es agua ni Ice ⇒ `Ice (14)`. El contador suma **una vez por vecino de tierra** (sobrecuenta). Como Ice no es agua pero se excluye como "tierra", no hay cascada.
- `addDeepWater(map)` (todos los temas): cada casilla cuyo 3×3 recortado (incluida ella misma) es todo agua (1/8/9) ⇒ `DWater (9)`. Devuelve nº de conversiones (no se usa).
- `noIslands(game, from)` (**sin uso**): convertiría en Water toda casilla transitable a pie no alcanzable por tierra desde `from`.

### 7.6 `getSpawn(reverse, linkedTo, game)` — zona de inicio
- Recorre el mapa: `reverse=false` ⇒ `x = 0..31` (exterior), `y = 0..31` (interior); `reverse=true` ⇒ `x = 31..0`, `y = 31..0`.
- Candidata = casilla transitable a pie. Cuenta en su rombo de radio `MAXSPAWNDIST = 2` (13 casillas, las de fuera del mapa no cuentan) las `canbuild` (`buildable`) y las transitables a pie (`walkable`).
- Devuelve la **primera** con `buildable >= 6 && walkable >= 9` (y, si `linkedTo != null`, `getGroundRange(linkedTo)[x][y] != 0`). Si no hay ⇒ `Coordinate.empty`.
- Siempre se llama con `linkedTo = null` ⇒ **no se garantiza conexión por tierra** entre bases. Jugador: primera zona válida empezando por la esquina superior izquierda; IA: primera empezando por la inferior derecha. Pueden solaparse o coincidir.

### 7.7 `generateMap(game)` — algoritmo completo
```
origin = Coordinate.rand()                 // UNA vez, fuera del bucle
repetir:
    theme = floor(random()*5); game.theme = theme
    units.clear(); builds.clear(); map = todo 0
    tileCount = generateTerrain(game, origin, theme)
    playerSpawn = getSpawn(false, null)    // ANTES de los post-procesos de agua
    enemySpawn  = getSpawn(true, null)
    si isSWater[theme]: tileCount += addShallowWater(map)
    si isIce[theme]:    tileCount += addIce(map)
    addDeepWater(map)
mientras tileCount < 200
si playerSpawn en mapa: generateUnits(player, false); generateBuilds(player, false)
si enemySpawn en mapa:  generateUnits(enemy, true);   generateBuilds(enemy, true)
generateNeutral(game, playerSpawn)         // el 2º parámetro no se usa
```
Las zonas se buscan antes del agua poco profunda/hielo/profunda. Esos post-procesos solo convierten agua en otra agua o en hielo, así que no reducen las casillas edificables/transitables a pie de la zona, pero sí pueden convertir casillas en SWater/Ice (no transitables por vehículos), lo que afecta a la Artillery inicial.

### 7.8 `generateUnits(game, spawn, enemy)`
```
freeTiles = nº de casillas del rombo radio 2 de spawn transitables A PIE
para u en 0..2 (INITUS = Soldier, Soldier, Artillery):
    tried = 0
    para j en 0..12 mientras tried < freeTiles:          // UNA sola pasada, sin dar la vuelta
        pos = getRangePos(spawn, j)
        si pos en mapa y canwalk[movtype[INITUS[u]]][map[pos]]:
            si alguna unidad ya ocupa pos: siguiente j (sin contar)
            tried += 1
            si random() < (INITBS.length - u) / (freeTiles - tried):   // ¡INITBS.length = 5! (bug B3)
                units.add(new Unit(INITUS[u] + (enemy?128:0), pos, index = u + (enemy?3:0)))
                freeTiles -= 1
                break
```
- La división por 0 da `Infinity` ⇒ se coloca seguro. Con el 5 en vez de 3 las unidades se agrupan más cerca del centro (índices bajos del rombo).
- Si una unidad no encuentra hueco, no se coloca, y los `index` de las siguientes ya no coinciden con su posición en la lista (bug B4).
- Las unidades iniciales nacen `active = true`.
- **[REMAKE]** usar `INITUS.length`, asignar `index` = posición real, y usar el contador de casillas aptas para el `movtype` de cada unidad.

### 7.9 `generateBuilds(game, spawn, enemy)`
```
freeTiles = nº de casillas del rombo radio 2 de spawn con canbuild
para b en 0..4 (INITBS = Base, City, Factory, Oil, Airport):
    j = 0; tried = 0
    mientras tried < freeTiles:                          // j da la vuelta: j = (j+1) % 13
        pos = getRangePos(spawn, j)
        si pos en mapa y canbuild[map[pos]]:
            si ya hay un edificio en pos: siguiente j (sin contar)
            tried += 1
            si random() < (5 - b) / (freeTiles - tried):
                builds.add(new Building(INITBS[b] + (enemy ? 128 : 64), pos))
                freeTiles -= 1
                break
        j = (j+1) % 13
```
- Siempre coloca los 5 si hay casillas edificables libres (la probabilidad llega a ≥1). No comprueba unidades: un edificio puede quedar bajo una unidad inicial.
- Si las zonas de ambos bandos se solapan y no queda **ninguna** casilla edificable libre, `tried` nunca avanza ⇒ **bucle infinito** (bug B20, muy improbable).
- La Base (HQ) es el primer edificio colocado, con probabilidad alta en la casilla central o primeras del rombo.

### 7.10 `generateNeutral(game, spawn)`
```
repetir:
    para cada tipo t en 0..5: toPlace[t] = MINNBS[t] + floor(random()*(MAXNBS[t]-MINNBS[t]+1))
    total = suma(toPlace)
mientras total < 24 o total > 30
available[x][y] = canbuild[map] && sin edificio;  availableCount = nº de available
para t en 0..5:
    remaining = availableCount
    recorrer x = 0..31 (exterior), y = 0..31 (interior):
        si available[x][y]:
            si random() < toPlace[t] / remaining:
                builds.add(new Building(t, (x,y)))   // propietario 0
                available = false; toPlace[t]--; availableCount--
                si toPlace[t] == 0: pasar al siguiente tipo
            remaining--
```
- Es muestreo por selección (algoritmo S de Knuth): reparte uniformemente `toPlace[t]` edificios sobre las casillas libres. Base neutrales: 0. Total neutrales: 24..30.
- No evita casillas con unidades ni la cercanía a las bases.

---

## 8. Inteligencia artificial (`IA`)

### 8.1 Constantes
```json
{ "MAXMERGELIFE": 130, "MAXCAPTDIST": 8, "LIFETOBACK": 40,
  "MAXDMG_sin_uso": [0.7, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }
```
La IA controla el bando de unidades 1 / edificios 2 y usa `efunds`. `IA extends Thread` pero se invoca `run()` directamente (síncrono). No hay planificación global: cada unidad decide sola, en orden de índice de `il.units`.

### 8.2 Funciones auxiliares
- **`getAtkObjs`**: casillas con unidades del jugador (bando 0), no transportadas, visibles para la IA. **No comprueba vida** (incluye unidades con vida 0 aún no limpiadas).
- **`getCaptObjs`**: casillas de edificios con `id < 128` (neutrales o del jugador) visibles para la IA.
- **`getVisObjs`**: casillas de edificios (de cualquiera) **no** visibles para la IA.
- **`getMoveforAtk(atk, target)`**: si `minalc < d(atk, target) <= alcance` ⇒ devuelve `atk.xy` (alias). Si no: `gr = getGroundRange(atk)` (su movtype, sin límite); entre las casillas del rombo de radio `mover` alrededor del atacante (índices `0..getRangeSize(mover)-1`) con `gr != 0` y `minalc < d(c, target) <= alcance`, elige la de menor `gr` (en empate, la primera en orden de rombo). Puede devolver una casilla del rombo que no sea alcanzable este turno (si hay que rodear). Vacía si no hay.
- **`getMoveforVis(target, unit)`**: si `target` fuera ⇒ vacía; si `d(unit, target) < vision` ⇒ `unit.xy`; si no, entre índices `0..getRangeSize(mover)` (**incluido**: una casilla de más del anillo `mover+1`) con `gr != 0` y `d(c, target) <= vision`, la de menor `gr`.
- **`getBestMove(unit, dest)`**: `mm = getMoveMap(unit)`. Si `dest` fuera del mapa, o `dest == unit.xy`, o `mm[dest] != 0` (alcanzable este turno) ⇒ devuelve `dest`. Si no: `dd = getGroundRange(game, dest)` (**a pie** desde `dest`, unidades bloquean); recorre el cuadrado `[x-mover, x+mover]×[y-mover, y+mover]` (recortado; `x` exterior, `y` interior) y elige la casilla con `mm != 0 && dd != 0` y menor `dd` (empate: la primera). Vacía si no hay. (Para aéreos/anfibios la cercanía se mide "a pie": no se acercan por encima del agua.)
- **`getNearHeal(unit)`**: `gr = getGroundRange(unit)`; entre los edificios de propietario 2 con `healer[tipo][tipoEdif]` y `gr[edif] != 0`, el de menor `gr` (empate: **el último** en la lista, usa `<=`). Excluye el edificio en el que ya está (porque `gr[origen] = 0`) y los ocupados.
- **`getRandMove(unit)`**: `mm = getMoveMap(unit)`; `n` = nº de casillas del rombo radio `mover` con `mm != 0`; recorre de nuevo y para cada válida: `count = count - 1; si random() < 1/count ⇒ devolverla`. Distribución resultante: 1ª con prob `1/(n-1)`, …; la **penúltima siempre** (1/1) si se llega; la última **nunca** si n≥2 (si n=1, 1/0=∞ ⇒ la única). Si n=0 ⇒ `Coordinate.empty` (no se mueve). Bug B7.
- `getFullAtk`, `getExpDmg` (siempre 0) y `MAXDMG`: **sin uso**.

### 8.3 `run()` — turno de la IA, paso a paso
```
unitMap  = il.getUnitMap()     // UNA vez: no se actualiza durante el turno (bug B6)
buildMap = il.getBuildMap()    // idem
para idx en 0..units.size()-1:          // u = units[idx]
  ── 1) RETIRADA (u no nulo, activo, life < 40, bando 1)
     mergeMap = getMergeMap(u)
     para i en 1..getRangeSize(mover)-1:          // rombo radio mover, sin centro, orden §4.4
        pos = getRangePos(u.xy, i)
        si pos en mapa, mergeMap[pos], unitMap[pos] != -1, units[unitMap[pos]] != u,
           y u.life + units[unitMap[pos]].life <= 130:
             u.Merge(units[unitMap[pos]]);  siguiente unidad
     si u.life > 0 y (dest = getBestMove(u, getNearHeal(u))) en mapa:
        il.Move(u, dest, true); u.active = false; siguiente unidad
     (si no, sigue a los pasos 2..5, que exigen life > 40 ⇒ en la práctica no hace nada)
  ── 2) ATAQUE (u no nulo, activo, (ammo != 0 o maxammo == 0), bando 1, life > 40)
     visMap = getVisMap(true); objs = getAtkObjs()
     para i en 1..getRangeSize(mover)-1:
        pos = getRangePos(u.xy, i)
        si pos en mapa, visMap[pos], objs[pos]:
           target = units[unitMap[pos]]
           dest = getBestMove(u, getMoveforAtk(u, target))
           si dest en mapa y u.active:
              il.Move(u, dest, true)               // falla sin efecto si dest == u.xy
              si u.canfire: il.Attack(u, target)   // falla sin efecto si no está a tiro
              u.active = false; siguiente unidad
  ── 3) CAPTURA (u no nulo, activo, bando 1, life > 40, cancapt)
     visMap = getVisMap(true); objs = getCaptObjs(); gr = getGroundRange(u)
     para i en 0..getRangeSize(8)-1 mientras u.active:  // rombo radio 8 (145 casillas)
        pos = getRangePos(u.xy, i)
        si pos en mapa, objs[pos], visMap[pos], gr[pos] != 0:
           il.Move(u, getBestMove(u, pos), true)
           u.Capture(builds[buildMap[pos]])        // solo surte efecto si ha llegado
           u.active = false; siguiente unidad
  ── 4) EXPLORACIÓN (u no nulo, activo, bando 1, life > 40)
     objs = getVisObjs()
     para i en 1..getRangeSize(mover)-1:
        pos = getRangePos(u.xy, i)
        si pos en mapa, objs[pos] y (dest = getBestMove(u, getMoveforVis(pos, u))) en mapa:
           il.Move(u, dest, true); u.active = false; siguiente unidad
  ── 5) PASEO ALEATORIO (u no nulo, activo, bando 1, life > 40)
     il.Move(u, getRandMove(u), true); u.active = false

── PRODUCCIÓN
para cada edificio b en orden de lista:
   si b.propietario == 2, countAliveU(IA) < 30, b.countSpawned(true) != 0
      y unitMap[b.xy] == -1 (mapa del INICIO del turno):
        tipos = b.getSpawned(true)                  // fabricables y pagables con efunds actuales
        b.Spawn(tipos[floor(random()*len(tipos))])  // uniforme
```
Observaciones de comportamiento (todas literales):
- **Selección de objetivo**: la primera casilla que cumple en el orden del rombo (más cercana por Manhattan, desempate por orden antihorario empezando abajo). No evalúa daño, poder ni amenaza.
- **Radio de búsqueda de ataque** = `mover` (no `mover + alcance`). Unidades a distancia (Artillery, Missile_truck, MSoldier) solo disparan si ya estaban a tiro; si se mueven, `canfire = false`.
- **No comprueba `canfight` ni `poder`**: Transport, Supplier, Blocker y THelicopter (munición "infinita") también "persiguen" enemigos y gastan el turno sin atacar; y una unidad puede atacar a un tipo con `poder = 0` (p.ej. Fighter vs tierra), gastando munición sin daño. Tampoco descarta objetivos con vida 0 (bug B21).
- **Unidad con life == 40**: no entra en ningún paso ⇒ no hace nada (bug B5). Unidad con life < 40 que no puede fusionarse ni ir a curarse: tampoco hace nada (se queda quieta, lo que equivale a esperar).
- **Retirada**: una unidad débil que ya está sobre un edificio curativo propio lo abandona si existe otro curativo alcanzable (bug B25); si es el único, se queda (bien).
- **Fusión IA**: sin movimiento (igual que el jugador), con tope 130 de suma.
- **Captura**: se compromete con el primer edificio objetivo del rombo radio 8 alcanzable por tierra (con su movtype); se acerca con `getBestMove` y captura si llega en ese mismo turno. Un edificio del jugador queda neutral y en un turno posterior lo vuelve a capturar para sí.
- **Exploración** (paso 4): prácticamente nunca se ejecuta, porque para todas las unidades salvo Blocker `vision >= mover` y cualquier edificio dentro del rombo de radio `mover` ya es visible (bug B26). En la práctica, sin enemigos ni edificios cerca, la IA **pasea al azar**.
- **Combustible**: la IA no lo gestiona; sus aéreos repostan solo si casualmente acaban el turno en un Airport propio ⇒ suelen estrellarse.
- **Producción**: un intento por edificio propio (City/Factory/Airport) y turno, tipo uniforme entre los pagables en ese momento (los edificios anteriores de la lista ya han gastado). La comprobación de casilla libre usa el `unitMap` del inicio del turno (si una unidad IA se movió encima, `Spawn` falla sin cobrar; si se fue, no produce).
- La IA nunca carga/descarga transportes, ni abastece, ni borra unidades.

---

## 9. Persistencia (`IlogicIO`)

Formato binario Java `DataOutputStream` (big-endian; `int` = 4 bytes, `long` = 8, `byte`/`boolean` = 1).

### 9.1 Configuración (`../data/config`)
`long gameid, byte lang, boolean autosave, boolean music`.
`loadConfig`: si el fichero no existe, genera `gameid` = `Random.nextLong()` distinto de 0 y no lee nada más (lang=0, autosave=false, music=false por defecto). `saveConfig`: escribe lo mismo (al cerrar la ventana).

### 9.2 Partida (`../data/save`)
```
long   gameid            // NOID = 0 => cargable en cualquier instalación
int    funds
int    efunds
byte   theme
byte[MAPX*MAPY] terreno  // orden: x exterior (0..31), y interior (0..31); al cargar se aplica % 15
int    nUnidades
  por unidad: int id, int x, int y,
              byte flags (bit2 = active, bit1 = canmove, bit0 = canfire),
              int life, int fuel, int ammo, int carrier
int    nEdificios
  por edificio: int id, int x, int y
```
- `saveMap`: compacta quitando nulos y traduce `carrier` al índice de la lista compactada **modificando las unidades en memoria** (bug B12).
- `loadMap`: si `gameid` del fichero ≠ el de la instalación y ≠ 0 ⇒ imprime `falsesavemsg` y `System.exit(-1)` (bug B11). Crea cada unidad con `index = i` (vida/combustible/munición se sobrescriben con lo leído) y después `makeCarries()` en todas. No guarda `phase`, `tick`, ni a quién le toca (siempre se reanuda en el turno del jugador).
- Se guarda manualmente (menú de partida) o automáticamente al final de cada ronda si `autosave`.
- **[REMAKE]** JSON versionado (en `localStorage`/IndexedDB), con unidades por id estable en vez de índice, sin comprobación de `gameid` (o como aviso), y sin mutar el estado al serializar. Si se quiere importar partidas antiguas, este es el formato exacto.

---

## 10. Convenciones de nombres de sprites (dependientes de la lógica)

Todas las rutas son `imgsfolder ("../Imagenes/") + nombre`.

| Elemento | Construcción del nombre (origen) |
|---|---|
| Terreno | `Terrain.imgs[map[x][y]]` p.ej. `Grass.png`. Se dibuja alineado por abajo con su altura real (puede sobresalir hacia arriba). (`Ilogic.paint`) |
| Costa (casilla de agua) | `"c_" + theme + "_" + mask + ".png"` con `mask` = 8 (abajo es tierra) + 4 (izquierda) + 2 (arriba) + 1 (derecha), contando solo vecinos dentro del mapa y con `!iswater` (Ice cuenta como tierra). Solo si `mask != 0`. Valores 1..15. |
| Esquinas de costa | Además, sobre la misma casilla de agua: `c_<theme>_16.png` si la diagonal arriba-izquierda es tierra y ni arriba ni izquierda lo son (`mask & 6 == 0`); `_17` arriba-derecha (`mask & 3 == 0`); `_18` abajo-derecha (`mask & 9 == 0`); `_19` abajo-izquierda (`mask & 12 == 0`). `theme` = 0 Plains, 1 Desert, 2 Forest, 3 Swamp, 4 Snowy. |
| Edificio | `prefBando + Building.tprefs[tipo][terreno] + Building.imgs[tipo] + ".png"`, con `prefBando` = `"b_"` si propietario 1 **y casilla visible**, `"r_"` si propietario 2 **y visible**, `""` si neutral o en niebla (la niebla oculta el dueño). Ej.: `b_City.png`, `r_2_Factory.png`, `Base.png`. |
| Unidad en mapa | `prefBando + Unit.tprefs[tipo][terreno] + Unit.unames[tipo] + ".png"`, `prefBando` = `"b_"` jugador activa, `"i_"` jugador inactiva (ya actuó), `"r_"` IA. Solo si visible y no transportada. Ej.: `b_Soldier.png`, `i_1_Soldier.png` (vadeando), `r_2_Tank.png` (en nieve), `b_1_WTank.png` (nadando). |
| Vida | `"n_" + ceil(life*10/100) + ".png"` (1..9) en la esquina inferior derecha de la unidad, solo si `0 < life < 100`. |
| Números (fondos, coste, vida, fuel, ammo) | una imagen por cifra `n_<0..9>.png` (`Ilogic.getNumImg`). |
| Menú de compra | `Botonunit.png` / `l_Botonunit.png` (seleccionado) como fondo; icono `"b_" + unames[t] + ".png"` si pagable y < 30 unidades, si no `"i_" + unames[t]`. |
| Menú de descarga | `"b_" + unames[tipoPasajero] + ".png"`. |
| Niebla / resaltados | `fogtile.png` (no visible), `seltile.png` (movimiento / descarga), `mergetile.png` (fusión), `entertile.png` (subir a transporte), `atktile.png` (objetivo). |
| Nubes (decorativas) | `"cl_" + img + ".png"`, `img` = `floor(random()*5)` (0..4); constantes `Cloud`: 64×128 px, máx 8, prob. de aparición 5e-4 por hueco y frame (máx 1 por frame), caen 0,5 px/frame, `x = floor(random()*(32*16-64))`, `y` inicial -128, desaparecen al llegar a `y >= 512`. |
| Clima (sin uso) | `Climate.img[id] + "_" + frame % imgq + ".png"`. |
| Botones (UI, otro agente) | `"Botones/" + ("es_"|"en_") + ("l_" seleccionado | "" | "i_" inactivo) + ("d_" si la opción ligada está activa) + nombre`. |
| Otros | `health.png`, `fuel.png`, `ammo.png`, `minus.png`, `currency.png`, `cursor.png`, `mouse.png`, `fondoacciones.png`, `menubackground.png`, `logoilogic.png`, `logoFP.png`, `<lang>victmsg.png`, `<lang>deftmsg.png`. |

Nota: el directorio `/mnt/user-data/uploads/IlogicAlpha6/Ilogic/Imagenes` es de una versión alpha y solo contiene una parte (Grass, Water, Woods, Sand, Snow, SWater, DWater, City, Factory, `b_`/`r_` de Base, City, Factory, Soldier, Tank, `cl_0..4`, etc.). El código final referencia muchas más (todas las combinaciones de arriba); habrá que producirlas o generar sustitutos.

---

## 11. Bugs y rarezas: comportamiento original vs propuesta [REMAKE]

Leyenda de impacto: **J** = afecta al juego; **P** = podría fallar; **U** = código sin uso / a medias.

| # | Imp. | Origen | Comportamiento original | Propuesta remake |
|---|---|---|---|---|
| B1 | J | `Unit.poder` filas 0, 8, 17 | 20 valores; el `3.0` cae en LTank y el resto se desplaza (soldados matan LTank de un golpe; valores de Car..WTank corridos). | Usar tabla corregida §2.4 (opción B recomendada; A como alternativa). Flag `legacyPoder`. |
| B2 | J (crash) | `Unit.heals` | 18 filas; WTank del jugador con aliado adyacente ⇒ `ArrayIndexOutOfBounds` al abrir su menú ⇒ juego congelado. | Añadir fila 18 de ceros (§2.5). Validar dimensiones de todas las tablas al arrancar. |
| B3 | J | `RandomMap.generateUnits` | Probabilidad `(INITBS.length - u)/(...)` (5 en vez de 3): unidades más pegadas al centro. | Usar `INITUS.length`. (Opcional: flag para el sesgo original.) |
| B4 | J | `RandomMap.generateUnits` | `index = u + (enemy?3:0)` aunque alguna no se haya colocado ⇒ `index` ≠ posición; puede permitir fusionarse consigo mismo (y morir) o transportes apuntando a otra unidad. | `index` = posición real (mejor: id estable). |
| B5 | J | `IA.run` | `life == 40` exacto: la unidad no hace nada (`< 40` retirada, `> 40` resto). | Usar `<= 40` en retirada o `>= 40` en el resto (decidir; recomiendo retirada `< 40` y resto `>= 40`). |
| B6 | J | `IA.run` | `unitMap`/`buildMap` calculados al empezar el turno: fusiones con unidades ya movidas fallan, producción con casilla ocupada/libre desactualizada. | Recalcular tras cada acción. |
| B7 | J | `IA.getRandMove` | `random() < 1/--count`: penúltima casilla siempre, última nunca (n≥2); muy sesgado a las primeras del rombo. | Elegir uniforme: `casillas[floor(random()*n)]`. |
| B8 | diseño | `getMoveMap` / `getGroundRange` | Coste 1 por casilla sin importar terreno (bosque = llanura). | Mantener (fidelidad) o añadir tabla de costes opcional. |
| B9 | P | `Ilogic` bucles | Esperas activas (CPU al 100%). | Usar el bucle de Phaser. |
| B10 | J (UI) | `Accion_ESC` | ESC abandona la partida sin guardar. | Pedir confirmación. |
| B11 | J | `IlogicIO.loadMap` | `gameid` distinto ⇒ `System.exit(-1)`. | Ignorar o avisar. |
| B12 | J | `IlogicIO.saveMap` | Reescribe `carrier` en las unidades vivas con índices compactados; si hay huecos `null` antes del transporte, tras guardar (incluido autosave cada ronda) el pasajero apunta a otra unidad o a un hueco ⇒ puede desaparecer en la siguiente limpieza. | Serializar sobre una copia; usar ids estables. |
| B13 | P | varios | Índices con el id sin `% 128`: `Unit.mover[id]` (fase 7), `Unit.maxcarry[id]` (`countCarried`, dibujo descarga), `Unit.movtype[id]` (dibujo fase 12), `heals/ufueler/uammorestorer[id][id]` (botón Abastecer). Solo funcionan porque se usan con unidades del jugador (id < 19). | Siempre `tipo = id % 128` (o separar `type` y `team` en campos). |
| B14 | diseño | `Unit.heals` | Todo ceros: ninguna unidad cura a otra (el Supplier solo da combustible/munición). | Mantener (o dar valores si se desea). |
| B15 | P | `getMoveMap`, `IA.getFullAtk` | Comprueban `unit != null` después de usar `unit.xy`. | Comprobar antes. |
| B16 | P | `Unit.Capture` | Neutraliza cualquier edificio con dueño, también el propio, si no se filtra antes (UI e IA sí filtran). | Ignorar captura de edificios propios dentro de la propia regla. |
| B17 | U | `Auxiliar.getIsland` (2 de 3) | Índices mezclados; no se llaman. | No portar o implementar flood-fill correcto. |
| B18 | U | `IA.getExpDmg`, `getFullAtk`, `MAXDMG`, `RandomMap.noIslands`, `Climate` entero, `Building.vision` (todo 0), `Building.canSpawn`, `Unit.isHealing`, `Unit.write`, `Building.alive`, `Unit.alive/offx/offy` | Sin uso. | Portar solo si se necesitan. |
| B19 | U | `RandomMap.PROBSPERADJ` fila 2 | 16 valores (el último no se usa). | Quitar el sobrante. |
| B20 | J | `RandomMap.generateMap/getSpawn/generateBuilds` | Zonas de inicio sin garantía de conexión por tierra (`linkedTo = null`), pueden solaparse o no existir (⇒ victoria/derrota inmediata por falta de HQ); bucle infinito en `generateBuilds` si no queda casilla edificable libre; se buscan antes de los post-procesos de agua. | Usar `getSpawn(true, playerSpawn)` (conexión), exigir distancia mínima entre zonas y que ambas existan, si no regenerar; limitar iteraciones. |
| B21 | J | `IA.run`, `getAtkObjs` | No comprueba `canfight`, `poder` ni vida del objetivo: unidades no combatientes persiguen enemigos, ataques con `poder=0` gastan munición, varias unidades atacan a una ya muerta (vida 0 hasta la limpieza del frame). | Filtrar por `canfight`, `poder > 0` y `life > 0`; limpiar muertos tras cada ataque. |
| B22 | J | `Ilogic.getLoadMap` | Compara con `mover` del **transporte** en vez del pasajero. | Usar `mover[pasajero]`. |
| B23 | diseño | `Merge`/`Load` | Fusión y carga sin mover a la unidad ni gastar combustible (a distancia ≤ mover). | Mantener o mover realmente la unidad hasta la casilla adyacente y gastar combustible. Recomendado: mover y cobrar pasos (más coherente). |
| B24 | J | `ciclojuego` fase 2 | Consumo de combustible antes de repostar: aéreo sobre su Airport con `fuel <= fuelperturn` muere. | Repostar/curar antes del consumo, o no consumir si está sobre un edificio que lo reposta. |
| B25 | J | `IA.getNearHeal` | Excluye la casilla actual: una unidad débil que ya se cura se marcha a otro edificio curativo. | Si ya está en un edificio que la cura, quedarse. |
| B26 | J | `IA.run` paso 4 | Exploración casi nunca se activa (vision ≥ mover); la IA pasea al azar. | Buscar edificios no vistos en todo el mapa (o radio mayor) y acercarse con `getBestMove`. |
| B27 | P | `IA.getMoveforVis` | `<` vs `<=` en la visión y bucle `<= getRangeSize(mover)` (una casilla de más). | Usar `<=` y `<` coherentes. |
| B28 | U | `IA.getCaptObjs` | `id / Unit.maxts` en vez de `Building.maxts`; casualmente correcto. | Escribir `propietario != 2`. |
| B29 | J | `IA.getBestMove` | Mide la cercanía al destino "a pie" para cualquier unidad (aéreos y WTank no se acercan por agua). | Usar el `movtype` de la unidad. |
| B30 | P | `Auxiliar.getRangePos`, `Coordinate.empty` | Índice 0 devuelve el centro por referencia; `empty` es un singleton mutable. | Devolver copias/valores inmutables. |
| B31 | P | `Unit.Load` | La posición del pasajero no se actualiza mientras va dentro. | Sincronizar `xy` con el transporte. |
| B32 | J | `ciclojuego` victoria/derrota | Basta neutralizar la HQ; si se cumplen ambas, gana la derrota; se comprueba cada frame. | Mantener (es la regla), quizá desempatar explícitamente. |
| B33 | P | `Ilogic.selent` (byte) | Índices > 127 desbordarían (no ocurre con 30+30 unidades). | Entero normal. |
| B34 | J | `Ilogic.Move` | Resta combustible también a unidades sin combustible (queda negativo → 0). | No restar si `maxfuel == 0`. |
| B35 | P | `RandomMap.addIce` | El contador suma por vecino, inflando `tileCount` en el tema Snowy (acepta mapas con menos terreno útil). | Contar una vez por casilla (cambia la aceptación; decidir). |
| B36 | P | `Ilogic.paint` fase 12 | Bucle hasta `min(MAPX, x+1)` (podría salirse si la unidad está en el borde; `isWalkable` lo salva). | Recortar a `MAPX-1`. |
| B37 | J (UI) | menús de compra | `Accion_RIGHT/DOWN` calculan un tipo de unidad que no usan. | Ignorar. |

---

## 12. Ambigüedades y decisiones abiertas

1. **`poder` filas 0/8/17**: opción A (Car = 0.0, como dice NOTAS-BUGS) u opción B (Car = 0.3, recomendada). Solo difiere esa celda en las tres filas.
2. **Fusión/carga a distancia** sin mover (B23): fidelidad vs coherencia.
3. **Umbral de 40** de la IA (B5): qué rama incluye el 40.
4. **Orden del mantenimiento de ronda** (B24): si se corrige, curación/repostaje antes que el consumo.
5. **Momento de ingresos**: en el original ambos bandos cobran tras el turno de la IA (el jugador no cobra antes del primer turno). Mantener.
6. **Climas**: no hay ninguno funcional; si se añaden, la semántica de `slow`/`blind`/`protection` es deducida, no comprobada.
7. **Sprites**: la carpeta alpha disponible no contiene todas las imágenes que el código final pide (`c_*`, `i_*`, `1_`/`2_`, `n_*`, resaltados…).
8. **Reproducibilidad**: el original no usa semilla. Para tests conviene un PRNG con semilla inyectable, respetando el orden exacto de llamadas a `random()` descrito en §6.5, §7 y §8 si se quiere fidelidad estadística.
