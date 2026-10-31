# Contenido del juego (ficheros de configuracion)

Los numeros del juego estan en ficheros JSON, sin tocar codigo:

| Fichero | Que hay |
|---|---|
| `src/core/content/units.json` | Las 19 unidades: precio, movimiento, vision, **ataque y daño contra cada unidad**, quien las fabrica y repara, transportes |
| `src/core/content/buildings.json` | Los 6 edificios: ingresos, curacion, proteccion, vision y cual es el cuartel general |
| `src/core/content/terrain.json` | Los 15 terrenos: nombre, defensa, si esconde, y por donde pasa y cuanto cuesta a cada tipo de movimiento |
| `src/core/content/weather.json` | Los climas: cuanto quitan de movimiento, vision y punteria, cuantos dias duran y en que terreno salen |
| `src/core/content/generals.json` | Los generales: ventaja fija, barra de carga y habilidades (ataque aereo, reconocimiento...) |
| `src/core/content/rules.json` | Reglas por defecto de una partida (dinero inicial, contraataque, niebla, captura...) |
| `src/core/content/ai.json` | Pesos de la IA (cuanto valora matar, capturar, defender la Base...) |

Cada fichero tiene su esquema (`units.schema.json`, `buildings.schema.json`): VS Code y otros editores
autocompletan los campos, explican cada uno al pasar el raton y marcan los errores mientras escribes.

Al arrancar, el juego (y los tests) comprueba el contenido con `src/core/content/index.ts` y, si algo
esta mal, dice que y donde, por ejemplo:

```
Contenido del juego no valido (src/core/content):
- unidad Sniper: attack.hitChance nombra "Soldado", que no existe
- unidad Sniper: builtAt nombra "Castle", que no existe
```

Despues `src/core/data.ts` lo convierte en las tablas por numero que usan las reglas (`UNIT`, `POWER`,
`SPAWNER`...), las mismas que habia antes: el resto del codigo no cambia.

## Cambiar una unidad

Editar sus numeros en `units.json` y `npm test`. Ejemplo: el tanque mas barato y que haga mas daño a la
artilleria:

```jsonc
{
  "id": "Tank",
  "cost": 10000,                      // antes 12000
  "attack": {
    "range": [1, 2],
    "hitChance": { "Artillery": 0.7 /* antes 0.5 */, "Soldier": 0.3, ... }
  },
  ...
}
```

Si el cambio es de equilibrio, medirlo antes (skill `equilibrar`): se puede probar sin tocar el fichero
con `npm run balance -- run --set UNIT.cost.Tank=10000 --set POWER.Tank.Artillery=0.7`.

## Añadir una unidad

El atajo es partir de una parecida:

```
npm run unit -- new Sniper --like Soldier
```

Eso la añade **al final** de `units.json` como copia de la otra: mismos numeros, y **las demas la atacan
con el mismo acierto que a la original** (se copia su columna de daño), la llevan los mismos transportes
y la repara Suministros si reparaba a la original. Se pinta con el dibujo de la original (`"art": "Soldier"`) para
poder probarla y equilibrarla antes de dibujarla. Despues:

1. `name` en español e ingles, precio, movimiento... y su `attack.hitChance` (a quien ataca y con
   cuanto acierto). Ajustar el acierto de las demas contra ella si no debe ser igual que contra la
   original.
2. Graficos: `u/b_<id>`, `u/i_<id>` y `u/r_<id>` (skill `arte-retro-diffusion` y `npm run assets`), y
   quitar `"art"`.
3. `npm test`: dice lo que falte (nombres, referencias que no existen, graficos).

A mano es lo mismo: copiar una unidad al final de la lista, cambiarle el `id`, y añadir su `id` en el
`hitChance` de cada unidad que deba poder atacarla (y en `transport.carries` o en el `heals` de Suministros si toca).

Lista completa de pasos (IA, equilibrio, tests de referencia, notas de parche): skill
`.claude/skills/nueva-unidad/SKILL.md`.

> **El orden importa.** El puesto en la lista es el numero de tipo que guardan las partidas y los codigos
> de mapa. Las unidades nuevas van siempre al final; no se reordena, no se borra y no se cambia el `id`
> de las que ya existen (`tests/content.test.ts` lo comprueba).

## Campos de una unidad

| Campo | Que es |
|---|---|
| `id` | Nombre interno; tambien el de sus imagenes |
| `name` | `{ "es": ..., "en": ... }`, lo que ve el jugador |
| `cost` | Precio |
| `command` | Puntos de mando que ocupa (regla `commandPoints`): 1 la infanteria, hasta 5 lo mas grande |
| `move` | Casillas por turno |
| `vision` | Radio de vision |
| `movement` | `foot` (a pie), `vehicle`, `air` o `amphibious`: por donde pasa y cuanto cuesta cada terreno |
| `captures` | Puede capturar edificios |
| `attack` | `null` si no ataca; si no, `range: [desde, hasta]` y `hitChance` |
| `attack.range` | Distancias a las que dispara: `[1, 1]` cuerpo a cuerpo, `[3, 5]` artilleria |
| `attack.hitChance` | **Daño**: probabilidad (0..1) de quitar cada punto de vida que le queda al atacante. Con 100 de vida y 0.5 quita unos 50 (menos si el defensor esta en un edificio, ver `protection`). Una unidad que no aparece no se puede atacar |
| `transport` | `{ "slots", "carries" }`: plazas y unidades que lleva |
| `builtAt` | Edificios que la fabrican |
| `repairedAt` | Edificios propios que la curan al empezar la ronda |
| `heals` | Vida que cura a cada unidad propia de al lado con la orden "Reparar" (Suministros: `{ "Tank": 20, ... }`) |
| `classicSprite` | Graficos de 2013: prefijo de imagen segun el terreno |
| `abilities` | Habilidades pasivas (regla `abilities`), ver abajo |
| `ai.support` | No combate: la IA tiene como mucho una |
| `notes` | Comentario libre |

### Habilidades (`abilities`)

Lista de habilidades pasivas: siempre estan activas, no son ordenes. Cada una es una clase (`kind`)
con sus numeros, asi que se pueden dar a cualquier unidad sin tocar codigo. Solo cuentan con la regla
`abilities` (activada por defecto; las partidas guardadas antes de existir no la tienen). La IA y la
prevision de combate las tienen en cuenta solas, porque pasan por las mismas reglas (`core/abilities.ts`).

| `kind` | Numeros | Que hace | Ahora la tiene |
|---|---|---|---|
| `guard` | `factor` (0..1) | Escudo: los ataques a distancia (alcance minimo > 1) le aciertan `factor` veces | Escudero (0.5) |
| `zoneOfControl` | `stops`: movimientos | Zona de control: un enemigo con ese movimiento que entra en una casilla de al lado se para ahi (sale el turno siguiente). Con niebla, solo si la ve | Barricada (a pie, vehiculos, anfibios) |
| `aura` | `radius`, `defense` (0..1) | Apoyo: a las unidades propias a `radius` casillas o menos les aciertan `defense` veces. No se suma con otras auras; a ella misma no | Suministros (1, 0.9) |
| `piercing` | `ignoreCover` (0..1) | Perforante: ignora esa parte de la proteccion del terreno y del edificio del objetivo | Mortero (1) |

```json
"abilities": [{ "kind": "guard", "factor": 0.5 }]
```

Una clase nueva: añadirla a `ABILITY_KINDS` y `AbilityDef` (`core/content/types.ts`), su validacion
(`content/units.ts`), su efecto (`core/abilities.ts`, llamado desde `rules.ts`), sus textos
(`ability_<kind>` en `settings.ts`, y `abilityVM` en `ui/hudModels.ts`), el esquema y un test en
`tests/abilities.test.ts`.

## Campos de un edificio

| Campo | Que es |
|---|---|
| `id`, `name` | Como en las unidades |
| `hq` | Cuartel general: si lo capturan, ese bando pierde (exactamente uno) |
| `earning` | Dinero por ronda |
| `heals` | Vida que cura a las unidades que repara |
| `protection` | Multiplica el acierto contra quien esta encima: `0.7` = un 30 % menos de daño |
| `vision` | Radio de vision |

Un edificio nuevo necesita ademas graficos (`public/assets/b/`) y que el generador de mapas sepa
colocarlo (`MAPGEN` en `data.ts`).

Un campo mas de unidad: `art` (id de otra unidad) = se pinta con su dibujo mientras no tenga el propio.

## Terreno

`terrain.json` tiene los 15 terrenos en un orden fijo (lo usan el arte, el generador de mapas y las
misiones): se cambian sus numeros, no se añaden ni se quitan.

| Campo | Que es |
|---|---|
| `protection` | Multiplica el acierto contra quien esta encima: `0.85` = un 15 % menos de daño |
| `hides` | Con niebla (regla `forestHides`), quien esta dentro solo se ve desde al lado |
| `buildable`, `water` | Para el generador de mapas: se puede poner un edificio, cuenta como agua |
| `movement` | Coste de entrar por tipo: `{ "foot": 1, "vehicle": 2, "air": 1, "amphibious": null }`; `null` = no se puede pasar |

En el codigo se consulta con tipos legibles: `Movement.of(u.type)` (tipo de una unidad),
`Movement.canWalk(MoveType.VEHICLE, TerrainType.WOODS)`, `Movement.cost(mt, terreno)`.

## Clima

`weather.json` tiene los climas de la regla `weather` (la clase `Climate` de 2013, que no se usaba).
El **primero es el neutro** (despejado): con el empiezan las partidas. Los nuevos van al final (las
partidas guardan el numero).

| Campo | Que es |
|---|---|
| `vision` | Cambio del radio de vision de las unidades: `-1` = ven una casilla menos (nunca baja de 1) |
| `move` | Cambio del movimiento por tipo: `{ "vehicle": -1 }` (nunca baja de 1) |
| `hitChance` | Multiplica el acierto de todos los ataques: `0.9` = un 10 % menos |
| `days` | Cuantos dias dura: `[minimo, maximo]` |
| `chance` | Peso de que salga en cada tema de mapa: `{ "Plains": 3, "Desert": 0, ... }` (0 = nunca) |

El tiempo de cada dia sale de la semilla del mapa (la misma partida tiene siempre el mismo clima) y el
siguiente ya esta decidido: es el pronostico que se ve arriba. Reglas en `src/core/weather.ts`.
Para probar sin el: `--set RULES.weather=false`.

## Generales

`generals.json` tiene los generales que se pueden elegir en "Nueva partida". Cada uno tiene:

| Campo | Que es |
|---|---|
| `id`, `name`, `title`, `description` | Nombre interno (lo guardan las partidas), nombre, cargo y lo que ve el jugador al elegirlo |
| `passive` | Ventajas fijas: `{ "kind": "attack", "movement": ["air"], "factor": 1.1 }` = sus aviones aciertan un 10 % mas. `defense` con `factor` 0.9 = los enemigos le hacen un 10 % menos. Se filtran por `movement` y/o `units` (sin nada, a todas) |
| `charge` | Barra: `max` estrellas; gana una por cada `per` de valor (precio × vida quitada / 100) que hace **o** recibe en combate |
| `abilities` | Habilidades: `cost` (estrellas que gastan) y `effect`. Una por turno |

Efectos que hay (`effect.kind`):

| Efecto | Que hace |
|---|---|
| `reveal` | Ve todo el mapa hasta que acaba la ronda |
| `areaDamage` | Quita `damage` de vida a los enemigos en un cuadrado de lado `2 × radius + 1` alrededor de la casilla elegida; nunca los deja por debajo de `minLife` (no mata) |
| `heal` | Sus unidades recuperan `amount` de vida (hasta 100). Con `movement` y/o `units`, solo esas (como en `passive`) |
| `funds` | Consigue `amount` de dinero al momento |

Un general nuevo con efectos que ya existen es solo JSON. Un efecto nuevo es codigo: su forma en
`content/generals.ts` (tipo y validacion), su regla en `core/generals.ts` (`useAbility`) y su
animacion en `GameScene.playAbility`.

La IA usa a su general sin saber cual es (`core/aiGenerals.ts`): al empezar su turno valora cada
habilidad que puede pagar (el daño en area, en el mejor cuadrado sobre los enemigos que ve; el
reconocimiento, un valor fijo con niebla; curar, por la vida que recuperan sus unidades; el dinero,
por lo que es) y usa la mejor si vale al menos `GENERALMINVALUE`
(`ai.json`); con la barra llena, cualquiera que valga algo. Un efecto nuevo necesita su valoracion ahi.

Para medir un general: `npm run generals -- --a Roca` (la IA con Roca contra la IA sin general, 80
partidas en 40 mapas con los bandos cambiados; al dia 60 gana quien tenga mas puntos). `--b Brisa`
los enfrenta. Al hacerlo, los tres rondaban el 60-68 % contra la IA sin general.

## Reglas e IA

- `rules.json`: `defaults` son las reglas con las que empieza una partida nueva (la pantalla de nueva
  partida y las misiones cambian algunas) y `maxFunds` el dinero maximo. Cada regla esta explicada en el
  esquema (pasar el raton por encima en el editor). Las que premian atacar: `bounty` (botin al
  destruir), `flankBonus` (acierto extra contra quien ya recibio un ataque ese dia), `noHealUnderFire`
  (quien recibe un ataque no se cura esa noche) y `vetBonus` (acierto por rango de veterania); ver
  `docs/BALANCE.md`.
- `ai.json`: pesos de la IA. Cambiarlos cambia como juega: medir con `npm run arena` y
  `npm run balance` (skill `equilibrar`).

Para probar sin tocar ficheros, las variantes de equilibrio aceptan las mismas tablas por nombre:
`--set MOVE_COST.vehicle.Woods=3 --set TERRAIN.protection.Woods=0.8 --set AI.KILLBONUS=60
--set RULES.initialFunds=8000`.

## Como esta hecho

`src/core/content/` tiene un modulo por parte (`units.ts`, `buildings.ts`, `terrain.ts`, `rules.ts`,
`ai.ts`), cada uno con su `validate*` y su `build*`; comparten `check.ts` (mensajes de error) y
`types.ts` (`UnitDef`, `MoveType`, `TerrainType`...). `index.ts` solo los junta: lee los JSON, valida
todo a la vez y construye las tablas que reexporta `data.ts` (`UNIT`, `POWER`, `TERRAIN`, `Movement`,
`DEFAULT_RULES`, `AI`...). Una parte nueva = un JSON, su esquema y su modulo, sin tocar las demas.

