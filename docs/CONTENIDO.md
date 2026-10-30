# Contenido del juego (ficheros de configuracion)

Los numeros del juego estan en ficheros JSON, sin tocar codigo:

| Fichero | Que hay |
|---|---|
| `src/core/content/units.json` | Las 19 unidades: precio, movimiento, vision, **ataque y daño contra cada unidad**, quien las fabrica y repara, transportes |
| `src/core/content/buildings.json` | Los 6 edificios: ingresos, curacion, proteccion, vision y cual es el cuartel general |
| `src/core/content/terrain.json` | Los 15 terrenos: nombre, defensa, si esconde, y por donde pasa y cuanto cuesta a cada tipo de movimiento |
| `src/core/content/weather.json` | Los climas: cuanto quitan de movimiento, vision y punteria, cuantos dias duran y en que terreno salen |
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
| `ai.support` | No combate: la IA tiene como mucho una |
| `notes` | Comentario libre |

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

## Reglas e IA

- `rules.json`: `defaults` son las reglas con las que empieza una partida nueva (la pantalla de nueva
  partida y las misiones cambian algunas) y `maxFunds` el dinero maximo. Cada regla esta explicada en el
  esquema (pasar el raton por encima en el editor).
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

