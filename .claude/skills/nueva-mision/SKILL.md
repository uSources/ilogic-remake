---
name: nueva-mision
description: Use when adding or editing a campaign mission in Ilogic (map, units, objective, briefing, rules) and testing that it is winnable.
---

# Añadir una mision

Las misiones estan en `src/core/missions.ts` (`MISSIONS`, en orden: cada una se desbloquea al pasar la
anterior). Una mision es un `MissionDef`:

- `id` (unico, no cambiarlo despues: el progreso guardado lo usa), `title` y `brief` en `{ es, en }`.
- `theme` 0..4 (llanura, desierto, bosque, pantano, nieve).
- `map`: lineas de texto, cuadrado. Caracteres: `.` suelo, `T` bosque, `M` montaña/acantilado,
  `*` decorado (flores, cactus, muñeco segun tema), `~` agua, `,` agua poco profunda, `=` profunda,
  `i` hielo, `P` pinos nevados, `N` roca nevada. (`GENERIC`/`FIXED` en el mismo fichero.)
- `buildings`: `[tipo, dueño (0 tu, 1 enemigo, null neutral), x, y]`. Cada bando necesita su `Base`.
- `units`: `[tipo, bando, x, y, vida?]`.
- `funds`: `[tuyo, enemigo]`. `rules`: cambios a las reglas (niebla, limite de dias...).
- `objective`: `hq` | `survive` (dias) | `capture` (cuantos, tipo o null, dias) | `destroy` (dias) |
  `escort` (indice de la unidad en `units`, destino, dias).

Comprobar:
1. `npx vitest run tests/missions.test.ts`: mapa valido, bases conectadas, guardar/cargar.
2. Jugarla por texto: `npm run play -- --mission <id>` (o `-e "map; ai; ai; status"` para ver a la IA).
3. En el navegador: `window.ilogicDebug.startGame({ mission: '<id>' })` y añadir una escena en
   `tests/visual/shots.mjs` si es importante que no cambie.
4. Textos de objetivo y estado: `src/campaign.ts` (`objectiveText`, `objectiveStatus`).
5. CHANGELOG.md y `npm run check`.
