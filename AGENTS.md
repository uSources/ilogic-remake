# AGENTS.md

Instrucciones para agentes de IA (Codex, Cursor, Copilot, Gemini, Claude...). Mismo contenido que
`CLAUDE.md`, con enlaces a la documentacion completa.

## Proyecto

Remake de *Ilogic* (estrategia por turnos, 2013) en TypeScript + Phaser 4 + Preact. Identificadores
en ingles; comentarios, textos y commits en español (sin tildes en el codigo; con tildes en los textos
del juego). Ver `docs/ESTILO.md`, regla 11.

## Comandos

```bash
npm install                 # y: python3 -m pip install -r tools/art/requirements.txt (graficos)
npm run check               # tipos + ESLint + Prettier + tests: obligatorio antes de terminar
npm run format              # arreglar el formato
npm run play -- --seed 7    # partida por texto (reglas sin graficos)
npm run shots               # capturas comparadas con tests/visual/ref
npm run build:single        # juego en dist-single/ilogic.html (probar por file://)
npm run assets              # recompilar graficos
npm run balance -- run ...  # equilibrio (IA contra IA)
npm run metrics             # nota del juego 0-100 (compara con improve/baseline.json)
npm run arena               # IA actual contra la guardada
npm run fuzz                # cazador de fallos (invariantes con jugadas al azar)
npm run huella              # huella del comportamiento: igual antes y despues de un refactor
```

## Normas

- **Estilo (obligatorio en todo codigo nuevo o tocado): `docs/ESTILO.md`.** Nombres completos, una funcion por
  idea, salir pronto, nada magico, piezas comunes (`core/util/`) en vez de bucles a mano, lo que crece como lista
  de datos, comentarios del porque. Al reescribir, `npm run huella` tiene que dar lo mismo.
- `src/core` es logica pura: sin Phaser, DOM ni interfaz (lo comprueba ESLint). Logica nueva → core + test.
- La partida solo cambia con acciones: `dispatch(s, team, action)` (`src/core/actions.ts`; una accion
  nueva, una entrada en `ACTIONS`). Las reglas (`core/rules`) preguntan y calculan; sus pasos que
  cambian la partida solo los usan las acciones, las fases y las `INVARIANTS` (ESLint, `APPLY_STEPS`).
- Unidades, edificios, terreno, reglas e IA en `src/core/content/*.json` (`docs/CONTENIDO.md`); generador de mapas en `src/core/mapgen/` (fachada `mapgen.ts`: terreno, salidas, edificios, puntos de control y los pasos en orden), con sus numeros en `mapgen.json` y `themes.json` (el contenido se lee de cada partida, ya resuelto: `s.content`, `unitTypeOf(s, unit)`, `terrainAt(s, pos)`); textos en `src/i18n/es/` y `src/i18n/en/`, un fichero por tema (`t('clave')`, `src/settings.ts`); colores en `src/ui/palette.ts`.
- No editar a mano lo generado: `public/assets/atlas/`, `src/assetList.ts`, `src/atlasPages.ts`,
  `src/ui/{wangSets,blobSets,sheets}.ts` → `npm run assets`.
- Probar en el navegador solo por `file://` (`dist-single/ilogic.html`); nunca `vite preview` ni servidores.
- Retro Diffusion y cualquier servicio de pago: nunca sin permiso explicito; claves nunca en el repo.
- Cambios de reglas/IA: revisar `tests/aiGolden.test.ts`; cambios visuales: `npm run shots`.
- `main` solo cambia por PR (ruleset): tienen que pasar `check` (`npm run check`) y `commitlint`; nada de force push. Las etiquetas `v*` no se mueven ni se borran.
- Commits pequeños con gitmoji (`✨ Asunto`, ver `docs/COMMITS.md`), en español, explicando el porque.

## Documentacion

- `docs/ARQUITECTURA.md`: capas, flujo de un turno, decisiones.
- `docs/ESTILO.md`: como escribir codigo que se lea a la primera (con ejemplo de antes y despues).
- `docs/IDEAS.md`: ideas pendientes y descartadas (con el porque); quitar de ahi lo que se haga.
- `docs/AGENTES.md`: como comprobar el trabajo (API `window.ilogicDebug`, partida por texto, capturas).
- `improve/DIARIO.md`: experimentos de mejora (leer antes de proponer cambios de equilibrio o IA).
- `.claude/agents/*.md`: subagentes (equilibrador, entrenador-ia, cazador-fallos, revisor).
- `.claude/skills/*/SKILL.md`: guias por tarea (codigo, Phaser 4, graficos con Retro Diffusion, nueva
  unidad, nueva mision, sacar version, equilibrar). Sirven para cualquier agente, no solo Claude.
- Skills oficiales de Phaser 4: `node_modules/phaser/skills/<tema>/SKILL.md`.
