---
name: ashfox
description: Use when creating, changing or reviewing the 3D models of Ilogic (units, buildings, terrain tiles and decor for the 3D view, 3d.html) with Ashfox, or when touching tools/art/ashfox or src/view3d/glbModels.ts. Covers how models are described and generated, how to export them, how to check them visually (capture, replay) and the Ashfox rules that break exports.
---

# Modelos 3D con Ashfox

[Ashfox](https://ashfox.io) hace modelos de juego como codigo: cubos colgados de huesos, una textura
de pixel art hecha con paleta, manchas y «stamps», y animaciones por fotogramas clave; exporta un GLB
con todo eso. Es gratis, de codigo abierto (MIT) y sin cuenta. Esta skill junta la oficial de
Ashfox (`skills/ashfox` en https://github.com/sigee-min/ashfox) con la forma de trabajar de Ilogic.

## Lo que se edita (y lo que no)

En Ilogic los `.ashfox` **no se escriben a mano**: los escribe `tools/art/ashfox/generate.mjs` a
partir de descripciones cortas en `tools/art/ashfox/models/`. Se edita eso:

| Fichero | Que describe |
|---|---|
| `models/units.mjs` | las 19 unidades, una por equipo (`blue`, `red`), con huesos y animaciones |
| `models/buildings.mjs` | los 6 edificios, uno por lado (`blue`, `red`, `neutral`) |
| `models/terrain.mjs` | casillas (con variantes de detalles) y decorado |

Cada modelo es una lista de cubos (`name`, `origin`, `size`, `paint`, y si hace falta `bone`,
`rotation` + `pivot` y `stamps`); los que se mueven, ademas `bones` y `motions`. Las pinturas son
rampas de tres tonos (sombra, medio, luz) con manchas opcionales (`blotch`) y borde claro opcional
(`rim`: la fila de arriba de cada lado, como el brillo del pixel art). Rampas de tonos cercanos: el
grano de Ashfox reparte los tres por la cara y, muy separados, la dejan moteada (el 2D es liso). Los
nombres de pintura son de todos los grupos a la vez: el generador falla si dos grupos usan el mismo
nombre con colores distintos. Hay piezas comunes que se reutilizan (el muñeco `chibi`, `tracks`,
`wheel`/`axles`, `truckCab`, `goggles`, `band`, `land`, `tree`, `mountain`...): mirar el fichero antes
de escribir cubos sueltos. Los detalles pequeños (ojos, gafas, ventanas, faros, remaches) van como
`stamps`, no como cubos.

**Nunca** se tocan a mano los `.ashfox` generados (`tools/art/ashfox/{units,buildings,terrain}/`)
ni los GLB (`public/assets/models/`): se regeneran.

## Antes de empezar

1. **Referencia 2D**: los modelos se parecen al arte del juego. Unidades en `public/assets/img/u/`
   (`b_` azul, `r_` rojo), edificios en `public/assets/img/flat/bld_*`, terreno en
   `public/assets/img/wang/` y montañas en `flat/mount_*`. Para verlas, una hoja de contacto
   ampliada con Pillow (vecino mas cercano) y leerla como imagen.
2. **CLI de Ashfox**: pide **Node 24** (el juego va con 22), asi que no esta en el `package.json`.
   Se instala fuera del repo (el scratchpad vale):
   `npm install --save-dev https://github.com/sigee-min/ashfox/releases/download/v2.0.1/ashfox-cli.tgz node@24`
   y se usa `<carpeta>/node_modules/.bin/ashfox`. Comprobar con `ashfox --version` y `ashfox doctor`.
3. **Ver los modelos** (`capture`, `replay`) necesita Chrome o Chromium. Sin Chrome, Brave vale:
   `export ASHFOX_CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"`.
4. Lenguaje que no conozcas: la referencia oficial (https://ashfox.io/docs/language/syntax/,
   `.../language/textures/`, `.../guides/animation/`, y https://ashfox.io/agent.md). Si algo no
   esta documentado, probarlo con un `.ashfox` pequeño y `ashfox check`.

## El flujo

```sh
node tools/art/ashfox/generate.mjs                       # escribe los .ashfox de todos los grupos
ashfox check tools/art/ashfox/units/tank_blue.ashfox     # valida (rapido; da la linea del fallo)
ashfox capture tools/art/ashfox/units/tank_blue.ashfox --azimuth 20 --elevation 25 --output <scratchpad>/tank.png
ashfox replay tools/art/ashfox/units/tank_blue.ashfox --clip drive --output <scratchpad>/tank_drive.gif
ASHFOX=<carpeta>/node_modules/.bin/ashfox node tools/art/ashfox/generate.mjs --export   # todos los GLB
```

- **Que compile no basta** (regla de la skill oficial): mirar cada modelo cambiado con `capture`
  (de frente `--azimuth 20`; de espaldas `--azimuth 200`) y cada animacion cambiada con `replay`,
  antes de darlo por bueno. Las imagenes, al scratchpad, no al repo (`capture` no sobrescribe: borrar
  antes la imagen).
- **Compararlo con el 2D**: de lado, `--azimuth 90 --elevation 18` deja la unidad mirando a la derecha,
  como los sprites; en una hoja con Pillow, el sprite ampliado (vecino mas cercano) junto a la captura.
- Exportar todo tarda unos minutos (82 modelos); para probar uno, `ashfox export <fuente> --output
  public/assets/models/<grupo>/<nombre>.glb` (borrando antes el `.glb`: Ashfox no sobrescribe).
- **Playground de modelos** (`npm run dev` y `/units3d.html`, codigo en `src/view3d/playground/`):
  todas las unidades o edificios, o uno (`?model=Tank&side=enemy`), con la luz del juego y la de
  cada clima; sus animaciones (velocidad, pausa, fotograma a fotograma, disparo en bucle), la
  torreta y lo que mide cada modelo. Tras exportar, «Recargar modelos» (o R) los trae sin perder lo
  elegido. Desde la consola, `window.ilogicPlayground`.
- Despues, **en el juego**: `npm run dev` y `/3d.html` (`?seed=` para elegir mapa, `?seed=2` es
  desierto y `?seed=7` nevado). Desde la consola, `GlbLibrary.load(...)` de
  `/src/view3d/glbModels.ts` y `lib.unit(id, 'own')` sirven para poner modelos en fila y mirarlos.
- Al acabar, `npm run check`. Ashfox no entra en los tests: lo que se comprueba a ojo, se dice.

## Convenciones de Ilogic

- **Medidas**: 16 unidades de Ashfox = una casilla. Las casillas van de -8 a 8 en x y z; el
  decorado, los edificios y las unidades se apoyan en y = 0.
- **Miran al norte (-z)**: delante van caras, puertas, ventanas y cañones. El juego los gira.
- **Nombres**: `<id del contenido en minusculas>_<lado>` (`missile_truck_red`, `city_neutral`). El
  juego busca el modelo de cada tipo del contenido de la partida y uno sin modelo sigue con su
  modelo de bloques (`src/view3d/models/`).
- **Lados**: unidades `blue`/`red` (lo propio y aliado / lo enemigo); edificios turquesa, rojo y gris
  (`neutral`), como en 2D. Los colores de equipo son pinturas `team_<lado>`, `dark_<lado>`...
- **Huesos con nombre que usa el juego**: `turret` (lo gira para apuntar), `rotor` (lo hace girar
  siempre). **Animaciones** que pide el juego (`UnitClip` en `glbModels.ts`): `idle` (en bucle),
  `drive` (en bucle, al moverse) y `fire` (una vez, al disparar; despues vuelve a `idle`).
- **Aviones**: todo cuelga del hueso `body`, subido `FLYING_HEIGHT`; la barra de vida se pone sola
  encima de lo mas alto del modelo.
- **Terreno**: que casilla y que decorado lleva cada terreno, `TERRAIN_PIECES` en
  `src/view3d/terrain.ts` (con `summit` en las montañas: ahi se pone quien esta en ellas). El agua y
  la cara de arriba de la arena los dibujan shaders (`water.ts`, `sand.ts`), no la textura.

## Lo que hace fallar a Ashfox (aprendido)

- Toda la geometria cuelga de un hueso, y cada cubo de un hueso que existe (el generador avisa).
- Tamaños de cubo enteros (el trozo de textura de una caja mide `2·ancho + 2·fondo` × `alto + fondo`);
  las posiciones pueden llevar `.5`.
- Ningun cubo tapado del todo por otro (`cube.fully_occluded`): ojos, ventanas y rayas van como
  `stamps` en una cara, no como cubos dentro de otros. Las piezas repartidas al azar, con separacion.
- Un `stamp` tiene que caber entero en su cara.
- En una pista de animacion, todas las claves con la misma interpolacion; un bucle acaba como empieza
  (las ruedas y las helices giran a saltos con `spin`, aprovechando su simetria).
- Patrones: solo `blotch`, y su `phase` no puede ser negativa.
- Nombres de exportacion en minusculas; numeros sin restos de coma flotante (el generador los redondea).

## Lo que no hacer

- No ejecutar `scripts/sync.py` de la skill oficial ni instalarla encima de esta.
- No meter Ashfox ni Node 24 en el `package.json` sin hablarlo: el juego y su CI van con Node 22.
- Ashfox tambien hace sonidos (`sound`), pero el juego aun no los usa; si se empieza, leer antes la
  referencia de sonido oficial (tiene reglas propias de bucles y volumen).
