# AGENTS.md

Instrucciones para agentes de IA (Codex, Cursor, Copilot, Gemini, Claude...). Mismo contenido que
`CLAUDE.md`, con enlaces a la documentacion completa.

## Proyecto

Remake de *Ilogic* (estrategia por turnos, 2013) en TypeScript + Phaser 4 + Preact. Español en
codigo, comentarios y commits (sin tildes en el codigo; con tildes en los textos del juego).

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
```

## Normas

- `src/core` es logica pura: sin Phaser, DOM ni interfaz (lo comprueba ESLint). Logica nueva → core + test.
- Numeros del juego en `src/core/data.ts`; textos en `src/settings.ts` (es y en); colores en `src/ui/palette.ts`.
- No editar a mano lo generado: `public/assets/atlas/`, `src/assetList.ts`, `src/atlasPages.ts`,
  `src/ui/{wangSets,blobSets,sheets}.ts` → `npm run assets`.
- Probar en el navegador solo por `file://` (`dist-single/ilogic.html`); nunca `vite preview` ni servidores.
- Retro Diffusion y cualquier servicio de pago: nunca sin permiso explicito; claves nunca en el repo.
- Cambios de reglas/IA: revisar `tests/aiGolden.test.ts`; cambios visuales: `npm run shots`.
- Commits pequeños, en español, explicando el porque.

## Documentacion

- `docs/ARQUITECTURA.md`: capas, flujo de un turno, decisiones.
- `docs/AGENTES.md`: como comprobar el trabajo (API `window.ilogicDebug`, partida por texto, capturas).
- `.claude/skills/*/SKILL.md`: guias por tarea (codigo, Phaser 4, graficos con Retro Diffusion, nueva
  unidad, nueva mision, sacar version, equilibrar). Sirven para cualquier agente, no solo Claude.
- Skills oficiales de Phaser 4: `node_modules/phaser/skills/<tema>/SKILL.md`.
