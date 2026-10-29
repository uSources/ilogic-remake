---
name: phaser4
description: Use when writing or reviewing Phaser code in Ilogic (scenes, input, textures, atlas, tweens, timers, cameras, Graphics, filters, sound). Routes to the official Phaser 4 skills that ship with the installed Phaser version in node_modules/phaser/skills.
---

# Phaser 4 en Ilogic

Las skills oficiales de Phaser vienen dentro del paquete instalado y coinciden con su version
exacta (ver `node_modules/phaser/package.json`). **Leer la skill del tema antes de escribir codigo de
Phaser**: `node_modules/phaser/skills/<tema>/SKILL.md` y, si hace falta detalle, su carpeta `references/`.
No copiar APIs de memoria ni de ejemplos de Phaser 3: muchas cambiaron (ver `v3-to-v4-migration`).

| Tarea en Ilogic | Skill oficial |
|---|---|
| Escenas Boot/Logo/Menu/Game, `init`/`create`/`shutdown`, reinicios | `scenes`, `events-system` |
| Teclado, raton, tactil, arrastrar unidades, pellizco | `input-keyboard-mouse-touch` |
| Atlas, carga, texturas de lienzo (`terrainBake`, `fogBake`) | `loading-assets`, `sprites-and-images`, `render-textures` |
| Mapa, cursor, capas, contenedores | `groups-and-containers`, `game-object-components` |
| Rangos, flechas, marcos (Graphics) | `graphics-and-shapes` |
| Animaciones de movimiento, golpes, textos flotantes | `tweens`, `time-and-timers` |
| Explosiones, confeti, humo | `particles` |
| Camara, zoom entero, seguir la accion | `cameras`, `scale-and-responsive` |
| Gris del final, efectos de pantalla | `filters-and-postfx` |
| Musica | `audio-and-sound` |
| Configuracion del juego (`src/main.ts`) | `game-setup-and-config` |
| Dudas de API v3 → v4 | `v3-to-v4-migration`, `v4-new-features` |

## Reglas que ya nos han mordido

- **El objeto escena se reutiliza al reiniciar**: los inicializadores de campos solo corren una vez.
  Todo el estado de una partida se crea en `init()` (ver `scenes`, "Safely Restarting Scenes").
- **Todo lo que vive fuera de la escena se suelta en `SHUTDOWN`**: oyentes de `scale`, `game`,
  `sound`, `window`/`document`, acciones registradas en `ui.actions` y texturas creadas a mano
  (`textures.remove`). Los oyentes de `this.input` y el reloj/tweens de la escena se limpian solos.
- **Esperas asincronas** (`await wait(...)`, promesas de tweens): al cerrar la escena sus callbacks no
  llegan nunca. Comprobar un "token" de partida despues de cada `await` y salir si ha cambiado.
- **Imagenes del juego**: van en el atlas `'atlas'` (multiatlas, `npm run assets`). Se piden como
  `add.image(x, y, 'atlas', clave)`; para dibujar a mano en un lienzo usar el marco
  (`textures.getFrame('atlas', clave)` y su `cutX/cutY`), nunca la imagen entera de la pagina.
- **Pixel art**: `pixelArt: true` en la configuracion; zoom de camara entero; no escalar sprites con
  factores no enteros si se quiere el pixel nitido.
- Nada de crear objetos ni texturas en `update()` por fotograma; reutilizar o usar emisores.
