# Unidades y edificios (ficheros de configuracion)

Todo lo que define una unidad o un edificio esta en dos ficheros JSON, sin tocar codigo:

| Fichero | Que hay |
|---|---|
| `src/core/content/units.json` | Las 19 unidades: precio, movimiento, vision, combustible, municion, **ataque y daño contra cada unidad**, quien las fabrica, repara y recarga, transportes |
| `src/core/content/buildings.json` | Los 6 edificios: ingresos, curacion, proteccion, vision y cual es el cuartel general |

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

1. Copiar una unidad parecida **al final** de la lista `units` y cambiarle el `id` (nombre interno en
   ingles, sin espacios), el `name` en español e ingles y sus numeros.
2. Decir a quien ataca y con cuanto acierto (`attack.hitChance`) y, en las demas unidades, con cuanto
   acierto la atacan a ella (añadir su `id` en el `hitChance` de cada una que pueda).
3. Si un transporte debe poder llevarla, añadirla a su `transport.carries`; si el camion de suministros
   debe recargarla, a su `supplies`.
4. Graficos: `public/assets/u/b_<id>.png`, `r_<id>.png` e `i_<id>.png` (skill `arte-retro-diffusion` y
   `npm run assets`).
5. `npm test`: dice lo que falte (graficos, nombres, tablas).

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
| `move` | Casillas por turno |
| `vision` | Radio de vision |
| `movement` | `foot` (a pie), `vehicle`, `air` o `amphibious`: por donde pasa y cuanto cuesta cada terreno |
| `fuel` | `{ "max", "perTurn" }`: deposito (0 = no usa) y gasto por ronda (aviones: sin combustible caen) |
| `ammo` | Disparos antes de recargar (0 = infinitos) |
| `captures` | Puede capturar edificios |
| `attack` | `null` si no ataca; si no, `range: [desde, hasta]` y `hitChance` |
| `attack.range` | Distancias a las que dispara: `[1, 1]` cuerpo a cuerpo, `[3, 5]` artilleria |
| `attack.hitChance` | **Daño**: probabilidad (0..1) de quitar cada punto de vida que le queda al atacante. Con 100 de vida y 0.5 quita unos 50 (menos si el defensor esta en un edificio, ver `protection`). Una unidad que no aparece no se puede atacar |
| `transport` | `{ "slots", "carries" }`: plazas y unidades que lleva |
| `builtAt` | Edificios que la fabrican |
| `repairedAt`, `refueledAt`, `rearmedAt` | Edificios propios que la curan, le dan combustible, le dan municion |
| `supplies` | `{ "fuel": [...], "ammo": [...] }`: a que unidades recarga al lado |
| `heals` | Vida que cura cada ronda a las unidades propias al lado (`{ "Soldier": 10 }`) |
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
