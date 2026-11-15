# Ilogic (remake)

Remake en 3D del juego de estrategia por turnos de 2013: TypeScript + three.js + Preact. Ver README.md.
En la rama `3d` ya no hay 2D: de aquel juego solo quedan las imagenes (iconos del HUD y referencia de los modelos).

- Codigo: skill `ilogic-code` (capas, convenciones y comprobaciones). Arquitectura: `docs/ARQUITECTURA.md`.
- Estilo (obligatorio en todo codigo nuevo o tocado): `docs/ESTILO.md`. Nombres claros, funciones cortas,
  piezas comunes en vez de bucles a mano. Al reescribir, `npm run huella` igual antes y despues.
- La partida solo cambia con acciones (`dispatch`, `src/core/actions.ts`): ver `docs/ARQUITECTURA.md`, "Acciones".
- Ideas pendientes y descartadas (con el porque): `docs/IDEAS.md`; quitar de ahi lo que se haga.
- Comprobar el trabajo sin ayuda (`npm run play`, `window.ilogic3d`, playground `units3d.html`): `docs/AGENTES.md`.
- Tareas: skills `arte-retro-diffusion`, `nueva-unidad`, `nueva-mision`, `sacar-version`, `equilibrar`, `ashfox` (modelos 3D).
- Automejora (solo si el usuario lo pide): skill `automejora` + subagentes de `.claude/agents/`; diario en `improve/DIARIO.md`.
- Otras IAs: `AGENTS.md` (mismo contenido).
- Graficos: `npm run assets` (README, "Graficos"). Versiones y notas: README, "Notas de parche".
- Antes de terminar: `npm run check`, y si cambia algo que se ve, mirarlo en el navegador. Web: se publica sola con cada push a `main` (la rama `3d` no se publica).
- Probar en el navegador con `npm run dev`: `/` (menu), `/?seed=2013` (partida directa), `/units3d.html` (modelos); nunca `vite preview`.
- `main` solo cambia por PR (ruleset): tienen que pasar `check` (`npm run check`) y `commitlint`; nada de force push. Las etiquetas `v*` no se mueven ni se borran.
- Commits con gitmoji: `✨ Asunto` en español y el porque debajo (`docs/COMMITS.md`, lo comprueba commitlint).
