---
name: nueva-unidad
description: Use when adding a new unit or building type to Ilogic or changing what one is (stats, damage, who builds it, who it can attack). Units and buildings live in JSON config files; checklist across content, art, AI, balance and tests.
---

# Añadir o cambiar una unidad (o un edificio)

Todo lo de una unidad esta en **`src/core/content/units.json`** (edificios: `buildings.json`). No hay que
tocar codigo: `src/core/content/index.ts` lo valida y `src/core/data.ts` lo convierte en las tablas por
indice (`UNIT`, `POWER`, `SPAWNER`...). Guia completa con ejemplo: `docs/CONTENIDO.md`.

**El orden de la lista es el numero de tipo** que guardan las partidas: la nueva va **al final**. Nunca
insertar en medio, reordenar ni borrar (`tests/content.test.ts` lo vigila). El `id` de una existente
tampoco se cambia (misiones e imagenes lo usan).

1. `units.json`: copiar una unidad parecida al final de `units` y cambiar `id`, `name` (es y en), precio,
   movimiento... El editor autocompleta y avisa con `units.schema.json`.
   - **Daño**: `attack.hitChance` = probabilidad de acierto contra cada unidad (0..1). Añadir tambien la
     entrada de la nueva en el `hitChance` de las que puedan atacarla.
   - Relaciones por nombre: `builtAt`/`repairedAt`/`refueledAt`/`rearmedAt` (edificios),
     `transport.carries` y `supplies` (unidades: si un transporte debe llevarla, añadirla a su `carries`).
   - Si no combate: `"ai": { "support": true }` (la IA tiene como mucho una).
   - Si algo esta mal, `npm test` (y el juego al arrancar) dice que y donde.
2. Graficos: skill `arte-retro-diffusion` (32x32, magenta, fondo blanco) → `units32/<id>.png` →
   `npm run assets`. `tests/assets.test.ts` exige `u/b_`, `u/i_` y `u/r_`. Sin dibujo de 2013 se ve
   el nuevo tambien con la opcion "2013" (o `classicSprite` si lo hay).
3. IA (`src/core/ai.ts`): revisar `produce()` si la unidad hace algo nuevo.
4. Equilibrio: skill `equilibrar` (`npm run balance -- duel` contra cada unidad y una tanda de partidas).
5. `tests/aiGolden.test.ts` cambiara (la IA compra distinto): actualizar con
   `npx vitest run -u tests/aiGolden.test.ts` solo tras revisar el equilibrio.
6. Ayuda o tutorial si hace falta (`src/hud/helpText.ts`, `src/campaign.ts`).
7. CHANGELOG.md (apartado `[Sin publicar]`) y `npm run check`, `npm run shots`.

Una regla nueva (curar al lado, volar sobre agua...) que el JSON no sabe expresar si es codigo: campo
nuevo en `UnitDef` + validacion + tabla en `buildTables` + esquema + test, y la regla en `core/rules.ts`.

Probar rapido sin navegador: `npm run play -- --seed 7 -e "buy <x> <y> <id>; unit <id>; end; map"`.
