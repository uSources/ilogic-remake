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
- **Oyentes en emisores que sobreviven a la escena** (`this.registry.events`, `this.game.events`,
  los `events` de otra escena): se acumulan en cada reinicio. Con `.once(...)` o quitandolos en
  `SHUTDOWN` con la misma funcion (`off(evento, oyente)`), nunca con una flecha nueva.
- **Las ordenes de escena van en cola**: `scene.start/launch/stop...` se aplican al empezar el siguiente
  paso del juego. En la linea siguiente la escena destino aun no ha arrancado: no leer su estado ahi;
  pasarle lo que necesite en `data` (tipado, como `GameStartData`).

## Escenas: que verbo usar

Ilogic pasa de una escena a otra con `scene.start` (Boot → Logo → Menu ⇄ Game) y el HUD es Preact,
no una escena. Si alguna vez hace falta otra escena a la vez, elegir el verbo a proposito:

| Verbo | Escena destino | Escena que llama |
|---|---|---|
| `start(key, data)` | arranca (o reinicia) | **se para** |
| `launch(key, data)` | arranca en paralelo; **la reinicia** si ya iba | sigue |
| `run(key, data)` | despierta si dormia, reanuda si estaba en pausa, si no arranca | sigue |
| `switch(key)` | despierta o arranca | **se duerme** |
| `pause()` / `resume()` | deja de actualizar, sigue dibujando (modal) | — |
| `sleep()` / `wake()` | ni actualiza ni dibuja; guarda su estado | — |

- Una escena superpuesta se lanza una vez (`if (!this.scene.isActive(key))`); se dibuja en el orden
  de la lista de escenas, asi que puede hacer falta `bringToTop(key)`.
- Una clave de escena no se reutiliza hasta que la anterior se ha destruido (`scene.remove(key)`).

## Teclas que se quedan pulsadas (Phaser 4.2.1)

El gestor de teclado de Phaser ignora los eventos que ya llegan con `defaultPrevented`. Si algo
cancela un `keyup` antes que Phaser, la tecla se queda `isDown` (las direcciones opuestas se anulan y
las pulsaciones siguientes no dan flanco de bajada). Por eso Phaser escucha en `document` y el
guardian de Tab va en `window` en fase de burbuja (`src/controls/browserKeys.ts`).

- Nunca `preventDefault()` de una tecla del juego en fase de captura ni en `document` antes que
  Phaser; un campo de texto que corte la propagacion tiene que ocuparse el de sus teclas.
- Phaser reparte la misma pulsacion varias veces: con cada evento nuevo vuelve a repartir la cola
  entera del fotograma (solo se salta la repetida justo antes). Mayusculas+Tab en un fotograma da
  el Tab tres veces. Quien escucha `keydown` en una escena lo envuelve en `onceEachKey`
  (`src/controls/browserKeys.ts`).
- Si aparece el fallo: mirar `keydown`/`keyup` en captura de `window` y en `document`, comparando
  `event.code`, `event.defaultPrevented` y el estado de la tecla; probar sin extensiones del
  navegador. Quitar o acotar el oyente que cancela la soltada y llamar **una vez**
  `this.input.keyboard.resetKeys()` en la escena afectada (cada fotograma romperia mantener pulsado).
- Antes de aplicar este diagnostico en otra version de Phaser, mirar su `KeyboardManager`.

## Codigo de Phaser 3 que engaña en Phaser 4

Funciona pero se ve mal, o solo deja un error en la consola:

- `setTintFill(c)` → `setTint(c).setTintMode(Phaser.TintModes.FILL)` (ver `hitFlash` en `ui/combatFx.ts`).
- `preFX`/`postFX` y `BitmapMask` → filtros (`obj.enableFilters()` y `obj.filters.internal`/`.external`).
- `setPipeline('Light2D')` → `setLighting(true)`. Los pipelines y shaders propios de v3 no se copian:
  se rehacen con la guia de migracion.
- `Phaser.Math.TAU` ahora es 2π (donde v3 queria π/2, `Phaser.Math.PI_OVER_2`); `Geom.Point` ya no
  existe (`Phaser.Math.Vector2`).
- `roundPixels` es `false` por defecto; `pixelArt: true` lo activa (ya esta en `src/main.ts`).
- Dos lienzos tras recargar en caliente: solo puede vivir un `Phaser.Game`; el anterior se cierra con
  `game.destroy(true)`.

Si algo de esta lista discrepa de las skills oficiales de `node_modules/phaser/skills/`, mandan las
oficiales: van con la version instalada.
