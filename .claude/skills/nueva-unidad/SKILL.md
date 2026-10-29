---
name: nueva-unidad
description: Use when adding a new unit type to Ilogic or changing what a unit is (stats, who builds it, who it can attack). Checklist across data tables, texts, art, AI, balance and tests.
---

# Añadir una unidad

Las tablas van **por indice**: la unidad nueva es la ultima (indice `UNIT_TYPES`). Nunca insertar en
medio: las partidas guardadas guardan el indice.

1. `src/core/data.ts`
   - `UNIT_NAMES`: añadir el nombre interno (en ingles, sin espacios).
   - `UNIT.*`: un valor mas en cada lista (precio, movimiento, vision, alcance, `minalc`, `movtype`,
     combustible, municion, carga, `cancapt`, `canfight`).
   - Matrices por unidad (fila nueva) y por unidad x unidad (fila y columna nuevas): `HEALER`,
     `FUELER`, `AMMO_RESTORER`, `SPAWNER` (quien la fabrica), `CAN_CARRY`, `UNIT_FUELER`,
     `UNIT_AMMO_RESTORER`, `POWER` (acierto contra cada una y de cada una contra ella), `UNIT_HEALS`,
     `UNIT_TERRAIN_PREFIX`.
   - `tests/dataShape.test.ts` dice que tabla falta.
2. Textos en `src/settings.ts`: `UNIT_LABELS` en es y en.
3. Graficos: skill `arte-retro-diffusion` (32x32, magenta, fondo blanco) → `units32/<Nombre>.png` →
   `npm run assets`. `tests/assets.test.ts` exige `u/b_`, `u/i_` y `u/r_`. Sin dibujo de 2013 se ve
   el nuevo tambien con la opcion "2013".
4. IA (`src/core/ai.ts`): si no combate, añadirla a `SUPPORT_TYPES`; revisar `produce()`.
5. Equilibrio: skill `equilibrar` (`npm run balance -- duel` contra cada unidad y una tanda de partidas).
6. `tests/aiGolden.test.ts` cambiara (la IA compra distinto): actualizar con
   `npx vitest run -u tests/aiGolden.test.ts` solo tras revisar el equilibrio.
7. Ayuda o tutorial si hace falta (`src/hud/helpText.ts`, `src/campaign.ts`).
8. CHANGELOG.md (apartado de la proxima version) y `npm run check`, `npm run shots`.

Probar rapido sin navegador: `npm run play -- --seed 7 -e "buy <x> <y> <Nombre>; unit <id>; end; map"`.
