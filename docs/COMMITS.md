# Commits (gitmoji)

Cada commit empieza por **un emoji de la lista y un espacio**, y un asunto corto en español (como
mucho 100 letras, sin punto al final). Debajo, separado por una linea en blanco, el porque:

```
⚖️ Bombardero 20000 → 13000 y Lanzamisiles 16000 → 11000

Rendian 0.45x y 0.30x la mediana; juntos suben la nota 65.3 → 66.2 (120 partidas).
```

La lista esta en `tools/git/gitmoji.json` (una sola fuente para la comprobacion y para las notas de
parche). Lo comprueba [commitlint](https://commitlint.js.org) al hacer commit (hook
`.githooks/commit-msg`, se activa solo con `npm install`) y en cada PR (`.github/workflows/commits.yml`).
Para probar un mensaje: `echo "✨ Algo" | npx commitlint`.

## Para el jugador (salen en las notas de parche)

| Emoji | Cuando | Apartado de las notas |
|---|---|---|
| ✨ | Novedad que el jugador ve | Novedades / New |
| 🎮 | Cambio de reglas o de como se juega | Cambios de juego / Gameplay |
| ⚖️ | Equilibrio: precios, daño, terreno, pesos de la IA | Equilibrio / Balance |
| 🐛 | Arreglo de un fallo | Arreglos / Fixes |
| 💄 | Interfaz: menus, HUD, textos de pantalla | Interfaz / Interface |
| 🍱 | Graficos, sonido u otros recursos | Gráficos / Graphics |
| ⚡️ | Rendimiento | Rendimiento / Performance |
| 🌐 | Traducciones | Idiomas / Languages |

## Internos (no salen)

🎉 comienzo · 🔖 version nueva · ♻️ refactor · 🏗️ arquitectura · 🔥 quitar codigo · 🚚 mover ficheros ·
🎨 formato · 🚨 lint · 🏷️ tipos · 💡 comentarios · 📝 docs, planes y diario · ✅ tests · 📸 capturas y
partidas de referencia · 🔨 herramientas · 📈 medidas · 👷 CI · 🚀 publicacion · 🔧 configuracion ·
🙈 .gitignore · ➕ ➖ ⬆️ dependencias · 🚧 a medias · ⏪ deshacer · 🔀 fusionar

⚖️ y 🎮 no son de [gitmoji](https://gitmoji.dev): son del proyecto, porque el equilibrio y las reglas
son lo que mas cambia y el jugador lo quiere saber aparte.

Si un commit hace dos cosas de apartados distintos, mejor dos commits.

## Notas de parche desde los commits

```
npm run notes             enseña el borrador de la version en curso
npm run notes -- --write  lo mete en CHANGELOG.md, apartado [Sin publicar] (es y en)
```

Agrupa por apartado los commits desde la ultima version (su etiqueta, o el commit equivalente si la
historia se reescribio). Es un **borrador**: los asuntos estan escritos para programadores y en
español, asi que hay que reescribirlos para el jugador, traducirlos (van marcados `(traducir)`) y
borrar las marcas `<!-- borrador ... -->`. Si quedan marcas, la Release no se publica
(`scripts/release-notes.mjs` falla). Lo que ya estaba escrito a mano en `[Sin publicar]` se respeta.

El historial anterior al 30-10-2026 se reescribio a este formato; la version sin emojis esta en la
rama `backup/historial-antes-gitmoji`.
