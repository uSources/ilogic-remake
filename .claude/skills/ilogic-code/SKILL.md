---
name: ilogic-code
description: Use when writing, refactoring or reviewing TypeScript in Ilogic (game rules, AI, scenes, HUD, tests). Project architecture, layering rules, conventions and the checks every change must pass.
---

# Codigo de Ilogic

Juego de estrategia por turnos: TypeScript estricto + Phaser 4 (dibujo) + Preact (interfaz HTML).
Para cualquier cosa de Phaser, ademas, la skill `phaser4`.

## Capas (de dentro afuera)

| Carpeta | Que va | Puede importar |
|---|---|---|
| `src/core/` | Reglas, IA, mapas, misiones, guardado, estadisticas. **TypeScript puro.** | solo `src/core` |
| `src/ui/` | Dibujo del mapa con Phaser (`mapView`, `fx`, `terrainArt`), datos para el HUD (`hudModels`) | core, settings, atlas |
| `src/hud/` | Componentes Preact y `store` (estado de la interfaz) | settings, assets, patchNotes, tipos de core |
| `src/scenes/` | Escenas de Phaser: orquestan core + ui + hud | todo |
| `src/menu/`, `src/patchNotes/` | Pantallas del menu, fondo vivo, notas de parche | core, ui, hud |

- `src/core` **no** importa Phaser, Preact, DOM, `localStorage` ni `settings` (lo impide ESLint).
  Si una regla se escribe dentro de una escena, no se puede probar: va a core (ver `core/orders.ts`).
- Las escenas no calculan lo que enseña la interfaz a mano: usan funciones puras de `ui/hudModels.ts`
  y publican con `ui.set(...)`. Los componentes solo pintan lo que hay en el store.
- La aleatoriedad pasa siempre por un `Rng` con semilla (`seededRng`); nada de `Math.random` en core
  salvo como valor por defecto. La IA y la generacion de mapas son deterministas con la misma semilla.

## Convenciones

- **Datos, no numeros sueltos**: unidades, edificios, terreno, reglas por defecto y pesos de la IA en
  `core/content/*.json` (ver `docs/CONTENIDO.md`); `core/data.ts` los convierte en las tablas (`UNIT`,
  `POWER`, `BUILDING`, `TERRAIN`, `Movement`, `DEFAULT_RULES`, `AI`). El codigo no compara nombres de
  unidades (`'Tank'`): si necesita saber algo de una, es un campo del JSON.
- **Tipos con nombre, no indices sueltos**: `MoveType.FOOT`, `TerrainType.WOODS`, `Movement.of(u.type)`,
  `Movement.canWalk(mt, t)`, `Movement.cost(mt, t)` (nada de `UNIT.movtype[...]` ni `0` para "a pie").
- **SOLID en pequeño**: un modulo por responsabilidad (`core/content/units.ts` valida y construye solo
  unidades; `index.ts` solo compone). Funciones puras que reciben lo que necesitan (`ContentContext`) en
  vez de leer globales; las herramientas separan la logica (pura, con test) de la linea de comandos. Colores de Phaser en `ui/palette.ts` (iguales que
  las variables de `hud/hud.css`). Textos de pantalla en `settings.ts` (`t('clave')`, es/en).
- **Una sola forma por cosa**: eventos con `moveEvent`/`captureEvent`, proteccion con
  `tileProtection`, casillas alcanzables con `reachableTiles`, numeros con `fmtNum`. Antes de
  escribir un bucle o un literal, buscar si ya existe la ayuda.
- Tipos estrictos con `noUncheckedIndexedAccess`: los `!` de indexar rejillas son normales; un `!`
  sobre algo que puede no existir (unidad por uid, seleccion) es un fallo esperando a pasar.
- `switch` sobre uniones: con todos los casos o con `default:` explicito (lo pide el lint).
- Las reglas cambiadas respecto al juego de 2013 llevan `[CAMBIO]` en un comentario con el porque.
- Comentarios y nombres de cara al jugador en español, sin tildes en el codigo (si en los textos).
- Escenas: estado de partida en `resetMatch()` (lo llama `init()`); limpieza en `SHUTDOWN`
  (ver skill `phaser4`). Esperas asincronas: comprobar `this.match` despues de cada `await` largo.

## Antes de dar algo por terminado

```bash
npm run check        # tipos + ESLint + Prettier + tests (lo mismo que pasa GitHub antes de publicar)
npm run format       # si Prettier se queja
npm run build:single # y abrir dist-single/ilogic.html (file://) para probarlo jugando
```

- Cambios de reglas o IA: `tests/aiGolden.test.ts` compara partidas IA contra IA con semilla fija.
  Si falla sin querer cambiar el comportamiento, es un fallo del refactor. Si el cambio es a
  proposito, actualizar con `npx vitest run -u tests/aiGolden.test.ts` y comprobar el equilibrio con
  `npm run balance`.
- Logica nueva en core o en `hudModels`: con su test en `tests/`.
- Graficos: nunca a mano en `public/assets/atlas`; se compilan con `npm run assets` (README, "Graficos").
- Nunca `vite preview` ni servidores: el juego se prueba con el fichero unico por `file://`.
