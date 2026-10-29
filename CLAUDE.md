# Ilogic (remake)

Remake del juego de estrategia por turnos de 2013 en TypeScript + Phaser 4 + Preact. Ver README.md.

- Codigo: skill `ilogic-code` (capas, convenciones y comprobaciones). Arquitectura: `docs/ARQUITECTURA.md`.
- Comprobar el trabajo sin ayuda (API `window.ilogicDebug`, `npm run play`, `npm run shots`): `docs/AGENTES.md`.
- Tareas: skills `arte-retro-diffusion`, `nueva-unidad`, `nueva-mision`, `sacar-version`, `equilibrar`.
- Automejora (solo si el usuario lo pide): skill `automejora` + subagentes de `.claude/agents/`; diario en `improve/DIARIO.md`.
- Otras IAs: `AGENTS.md` (mismo contenido).
- Phaser: skill `phaser4` → skills oficiales en `node_modules/phaser/skills/` (version exacta instalada).
- Graficos: `npm run assets` (README, "Graficos"). Versiones y notas: README, "Notas de parche".
- Antes de terminar: `npm run check` (y `npm run shots` si cambia algo visual). Web: se publica sola con cada push a `main`.
- Probar en el navegador con `dist-single/ilogic.html` por `file://`; nunca `vite preview`.
- Commits en español, explicando el porque.
