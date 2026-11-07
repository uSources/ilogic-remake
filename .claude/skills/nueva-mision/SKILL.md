---
name: nueva-mision
description: Use when adding or editing a campaign mission in Ilogic (map, units, objective, briefing, rules) and testing that it is winnable.
---

# Añadir una mision

Las misiones son contenido: `src/core/content/missions.json` (con su esquema, `missions.schema.json`,
para el editor), en el orden de la campaña: cada una se desbloquea al pasar la anterior. Al cargar el
contenido se comprueba lo que dice el fichero (content/missions.ts: ids, textos, tema, tipos, equipos);
el juego las lee del contenido (`content.missions`, `missionById(contenido, id)`; la lista de la campaña,
`campaignMissions()` en src/campaign.ts). Una mision es un `MissionDef` (de solo lectura, `Mission`):

- `id` (unico, no cambiarlo despues: el progreso guardado lo usa), `title` y `brief` en `{ es, en }`.
- `theme`: id de un tema de `src/core/content/themes.json` (`'Plains'`, `'Desert'`, `'Forest'`,
  `'Swamp'`, `'Snowy'`).
- `map`: lineas de texto, cuadrado. Las letras que dependen del tema las da su `mapLetters`
  (themes.json: `.` suelo, `T` bosque, `M` montaña/acantilado, `*` decorado); las demas, el
  `mapLetter` de cada terreno (terrain.json: `~` agua, `,` poco profunda, `=` profunda, `i` hielo,
  `P` pinos nevados, `N` roca nevada). Lo resuelve `terrainOf` (src/core/missions/build.ts).
- `teams`: los equipos en orden, `{ controller: 'human' | 'ai', funds, objective? }`; su puesto es el
  numero de equipo de `buildings` y `units`, y cada uno empieza con su dinero. Cada equipo lleva su
  objetivo o ninguno (sin objetivo gana o pierde por las reglas de siempre), asi que caben misiones
  con varias personas o con un objetivo para la IA; las de la campaña son una persona (el 0) contra la IA.
- `buildings`: `[tipo, dueño (numero de equipo o null neutral), x, y]`. Cada equipo necesita su `Base`.
- `units`: `[tipo, equipo, x, y, vida?]`. `rules`: cambios a los ajustes de la partida
  (`MatchSettings`: niebla, limite de dias, clima...). Los interruptores enchufan o quitan modulos de
  reglas enteros (sin clima no hay clima ni pronostico; sin `ambush` los enemigos escondidos cortan el
  paso): ver `docs/ARQUITECTURA.md`, "Modulos de reglas".
- `objective` de un equipo (su `owner` en la partida, `s.mission.objectives`; si lo cumple gana su alianza y si falla, sus enemigos; con varios, decide el primero que se cumple o falla): `hq` | `survive` (dias) | `capture` (cuantos, tipo o null, dias) | `destroy` (dias) |
  `escort` (indice de la unidad en `units`, destino, dias). Un tipo de objetivo nuevo es una entrada en
  `OBJECTIVES` (`src/core/objectives.ts`): como se escribe y queda en la partida, sus problemas en el
  mapa, cuando se cumple o falla (`status`), el progreso y `isValid` (sus campos en una partida guardada).
  Si cambia lo que se guarda (un objetivo con campos nuevos), se sube `SAVE_VERSION`
  (core/saveVersion.ts): mientras el juego no ha salido no hay migraciones, las partidas de antes se descartan.
- La partida de una mision la crea `buildMission(mision, contenido, semillaDeLosDados)`: cada vez que
  se juega, sus combates tiran con la semilla que da quien la empieza (`GameState.dice`).

Comprobar:
1. `npx vitest run tests/missions.test.ts`: el fichero valido, el mapa (`checkMission`,
   src/core/missions/check.ts: edificios sobre suelo, unidades donde pueden estar, una Base por
   equipo, el objetivo en su sitio), bases conectadas, guardar/cargar.
2. Jugarla por texto: `npm run play -- --mission <id>` (o `-e "map; ai; ai; status"` para ver a la IA).
3. En el navegador: `window.ilogicDebug.startGame({ mission: '<id>' })` y añadir una escena en
   `tests/visual/shots.mjs` si es importante que no cambie.
4. Textos de objetivo y estado: `src/campaign.ts` (`objectiveText`, `objectiveStatusText`).
5. CHANGELOG.md y `npm run check`.
