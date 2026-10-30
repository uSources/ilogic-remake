---
name: sacar-version
description: Use when the user wants to release a new version of Ilogic, write patch notes, or fix notes of a published version.
---

# Sacar una version

La web (GitHub Pages) se publica sola con cada push a `main`. Una **version** ademas crea una Release
en GitHub con notas y el juego en un fichero (`ilogic.html`); el juego las enseña en "Novedades" y
avisa a quien tenga una version anterior.

1. Elegir numero (semver): arreglos → 0.1.1; novedades → 0.2.0.
2. `package.json` → `version`.
3. `CHANGELOG.md`: `npm run notes -- --write` mete en `## [Sin publicar]` un borrador con los commits
   desde la version anterior, agrupados por emoji (✨ Novedades, 🎮 Cambios de juego, ⚖️ Equilibrio,
   🐛 Arreglos...; ver `docs/COMMITS.md`). Reescribirlo para el jugador (no para programadores),
   juntando lo que sea lo mismo y quitando lo que ya este escrito a mano, traducir lo marcado
   `(traducir)` (ingles despues de `<!-- en -->`) y **borrar las marcas** `<!-- borrador ... -->` (si
   quedan, la Release no sale). Despues convertir `[Sin publicar]` en `## [x.y.z] - AAAA-MM-DD — Titulo corto`.
4. `npm run release` enseña las notas tal como saldran. `npm run check`.
5. Commit (`🔖 Version x.y.z`) y push a `main`. La Action `.github/workflows/release.yml` pasa los tests,
   compila y publica la Release. Ver en Actions que termina en verde.
6. Corregir notas ya publicadas: cambiar el CHANGELOG y hacer push (la Action pone al dia la Release).

Desde algunas sesiones de Claude no se pueden crear Releases ni etiquetas a mano: no hace falta, lo
hace la Action. Si hay que relanzarla: `gh api --method POST
repos/uSources/ilogic-remake/actions/workflows/release.yml/dispatches -f ref=main`.
