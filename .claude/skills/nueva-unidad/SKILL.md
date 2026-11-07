---
name: nueva-unidad
description: Use when adding a new unit or building type to Ilogic or changing what one is (stats, damage, who builds it, who it can attack). Units and buildings live in JSON config files; checklist across content, art, AI, balance and tests.
---

# Añadir o cambiar una unidad (o un edificio)

Todo lo de una unidad esta en **`src/core/content/units.json`** (edificios: `buildings.json`). No hay que
tocar codigo: `src/core/content/index.ts` lo valida y lo resuelve en un `UnitType` con sus campos con
nombre (`BuildingType` los edificios), que el codigo lee de cada partida con `unitTypeOf(s, unit)`.
Guia completa con ejemplo: `docs/CONTENIDO.md`.

**El `id` es lo que guardan las partidas** (`"type": "Tank"`): el de una existente no se cambia ni se
borra la unidad (misiones, imagenes y partidas guardadas lo usan). La nueva va **al final**: el orden es
el de los menus y el de los empates de la IA, asi que tampoco se reordena (`tests/content.test.ts` lo
vigila).

1. `npm run unit -- new <Id> --like <Parecida>`: la añade al final de `units.json` copiando la parecida
   (numeros, columna de daño = quien la ataca y con cuanto acierto, transportes, quien la repara) y con
   `"art": "<Parecida>"` (se pinta con su dibujo). Despues cambiar `name` (es y en), precio,
   movimiento... El editor autocompleta y avisa con `units.schema.json`.
   - **Daño**: `attack.hitChance` = probabilidad de acierto contra cada unidad (0..1). El comando ya
     puso la nueva en el `hitChance` de las demas con el valor de la parecida: ajustarlo si no es igual.
   - **Disparo**: `attack.range` (`[desde, hasta]`) y `attack.firesAfterMove` (si puede moverse y
     disparar en el mismo turno: la artilleria no). Son cosas distintas: una de alcance corto puede
     no poder moverse y disparar, y al reves.
   - Relaciones por nombre: `builtAt`/`repairedAt` (edificios), `transport.carries` y el `heals` de
     Suministros (unidades: si un transporte debe llevarla, añadirla a su `carries`).
   - Si no combate: `"ai": { "support": true }` (la IA tiene como mucho una).
   - Si algo esta mal, `npm test` (y el juego al arrancar) dice que y donde.
2. Graficos: skill `arte-retro-diffusion` (32x32, magenta, fondo blanco) → `units32/<id>.png` →
   `npm run assets`, y quitar `"art"`. `tests/assets.test.ts` exige `u/b_`, `u/i_` y `u/r_` (los de
   `art` mientras lo tenga) y avisa de las unidades que aun usan dibujo prestado. Sin dibujo de 2013 se ve
   el nuevo tambien con la opcion "2013" (o `classicSprite` si lo hay).
3. IA (`src/core/ai/production.ts`): revisar `produce()` si la unidad hace algo nuevo.
4. Equilibrio: skill `equilibrar` (`npm run balance -- duel` contra cada unidad y una tanda de partidas).
5. `tests/aiGolden.test.ts` cambiara (la IA compra distinto): actualizar con
   `npx vitest run -u tests/aiGolden.test.ts` solo tras revisar el equilibrio.
6. Ayuda o tutorial si hace falta (`src/hud/helpText.ts`, `src/campaign.ts`).
7. CHANGELOG.md (apartado `[Sin publicar]`) y `npm run check`, `npm run shots`.

Una regla nueva (curar al lado, volar sobre agua...) que el JSON no sabe expresar si es codigo: campo
nuevo en `UnitDef` + validacion + su campo en `UnitType` (`buildUnitTypes`, content/units.ts) + esquema + test, y la regla en su modulo de `core/rules/`. Una habilidad pasiva nueva: su forma en `AbilityDef`, su validacion en `ABILITY_SHAPES` (`content/abilities.ts`) y lo que aporta a las listas de las reglas en `ABILITY_HOOKS` y su sitio en `ABILITY_ORDER` (`core/abilities.ts`). Si depende de un ajuste de la partida, es un modulo de reglas (`core/ruleModules/`, `docs/ARQUITECTURA.md`, "Modulos de reglas").

Probar rapido sin navegador: `npm run play -- --seed 7 -e "buy <x> <y> <id>; unit <id>; end; map"`.
