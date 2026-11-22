# AGENTS.md

Instrucciones para agentes de IA (Codex, Cursor, Copilot, Gemini, Claude...). Mismo contenido que
`CLAUDE.md`, con enlaces a la documentacion completa.

## Proyecto

Remake en 3D de *Ilogic* (estrategia por turnos, 2013) en TypeScript + three.js + Preact (sin 2D:
de aquel juego solo quedan las imagenes). Identificadores
en ingles; comentarios, textos y commits en español (sin tildes en el codigo; con tildes en los textos
del juego). Ver `docs/ESTILO.md`, regla 11.

## Comandos

```bash
npm install                 # y: python3 -m pip install -r tools/art/requirements.txt (graficos)
npm run check               # tipos + ESLint + Prettier + tests: obligatorio antes de terminar
npm run format              # arreglar el formato
npm run play -- --seed 7    # partida por texto (reglas sin graficos)
npm run dev                 # el juego en http://localhost:5173 (/?seed=2013: partida directa; /units3d.html: modelos)
npm run build:single        # juego en dist-single/ilogic.html (un solo fichero)
npm run assets              # recompilar graficos
npm run balance -- run ...  # equilibrio (IA contra IA)
npm run fuzz                # cazador de fallos (invariantes con jugadas al azar)
npm run huella              # huella del comportamiento: igual antes y despues de un refactor
```

## Normas

- **Estilo (obligatorio en todo codigo nuevo o tocado): `docs/ESTILO.md`.** Nombres completos, una funcion por
  idea, salir pronto, nada magico, piezas comunes (`core/util/`) en vez de bucles a mano, lo que crece como lista
  de datos, comentarios del porque. Al reescribir, `npm run huella` tiene que dar lo mismo.
- **Vista 3D: sistemas agnosticos al motor.** Solo la capa del motor importa three.js (ESLint,
  `ENGINE_FILES`); los sistemas deciden sin el y hablan con el por interfaces pequeñas; SOLID.
  Ver `docs/ARQUITECTURA.md`, "Vista 3D", y el plan `docs/PLAN-VISTA3D.md`.
- `src/core` es logica pura: sin three.js, DOM ni interfaz (lo comprueba ESLint). La vista 3D, en `src/view3d`. Logica nueva → core + test.
- La partida solo cambia con acciones: `dispatch(s, team, action)` (`src/core/actions.ts`; una accion
  nueva, una entrada en `ACTIONS`). Las reglas (`core/rules`) preguntan y calculan; sus pasos que
  cambian la partida solo los usan las acciones, las fases y las `INVARIANTS` (ESLint, `APPLY_STEPS`).
- Unidades, edificios, terreno, reglas e IA en `src/core/content/*.json` (`docs/CONTENIDO.md`); generador de mapas en `src/core/mapgen/` (fachada `mapgen.ts`: terreno, salidas, edificios, puntos de control y los pasos en orden), con sus numeros en `mapgen.json` y `themes.json` (el contenido se lee de cada partida, ya resuelto: `s.content`, `unitTypeOf(s, unit)`, `terrainAt(s, pos)`); textos en `src/i18n/es/` y `src/i18n/en/`, un fichero por tema (`t('clave')`, `src/settings.ts`); colores del HUD en `src/hud/hud.css` y `src/ui/sides.ts`.
- No editar a mano lo generado: `public/assets/atlas/`, `src/assetList.ts`, `src/atlasPages.ts` → `npm run assets`;
  modelos 3D (`tools/art/ashfox/{units,buildings,terrain}/`, `public/assets/models/`) → skill `ashfox`.
- Modelos 3D: como tienen que verse, `docs/ESTETICA.md` (skill `estetica`).
- Probar en el navegador con `npm run dev` (ver `docs/AGENTES.md`); nunca `vite preview`.
- Retro Diffusion y cualquier servicio de pago: nunca sin permiso explicito; claves nunca en el repo.
- Cambios de reglas/IA: revisar `tests/aiGolden.test.ts`; cambios visuales: mirarlos en el navegador.
- `main` solo cambia por PR (ruleset): tienen que pasar `check` (`npm run check`) y `commitlint`; nada de force push. Las etiquetas `v*` no se mueven ni se borran.
- Commits pequeños con gitmoji (`✨ Asunto`, ver `docs/COMMITS.md`), en español, explicando el porque.

## Documentacion

- `docs/ARQUITECTURA.md`: capas, flujo de un turno, decisiones. `docs/RED.md`: la partida por la red de punta a punta.
- `docs/ESTILO.md`: como escribir codigo que se lea a la primera (con ejemplo de antes y despues).
- `docs/IDEAS.md`: ideas pendientes y descartadas (con el porque); quitar de ahi lo que se haga.
- `docs/ESTETICA.md`: la estetica del juego (como se ven los modelos 3D, decidida con el usuario):
  obligatoria al hacer o revisar un modelo; lo nuevo que se decida se apunta ahi.
- `docs/AGENTES.md`: como comprobar el trabajo (partida por texto, `window.ilogic3d`, playground de modelos).
- `.claude/skills/*/SKILL.md`: guias por tarea (codigo, estetica, graficos con Retro Diffusion,
  modelos 3D con Ashfox, sonidos con IA local, nueva unidad, nueva mision, sacar version, equilibrar). Sirven para
  cualquier agente, no solo Claude.
