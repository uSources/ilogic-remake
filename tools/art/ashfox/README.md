# Modelos 3D con Ashfox (prototipo)

Fuentes `.ashfox` de los modelos del prototipo 3D (`3d.html`). [Ashfox](https://ashfox.io) describe
un modelo como datos: cubos colgados de huesos, una textura de pixel art hecha con paleta, manchas y
«stamps», y animaciones por fotogramas clave. Sale un GLB con su textura y sus animaciones, que carga
`src/view3d/glbModels.ts`.

Los `.ashfox` no se escriben a mano: los genera `generate.mjs` a partir de descripciones cortas en
`models/` (cada modelo son sus cubos con su pintura y, si se mueve, sus huesos y sus animaciones),
a semejanza del arte 2D del juego. El generador calcula y coloca en el atlas el trozo de textura de
cada cubo, que Ashfox no coloca solo.

| Fichero | Que describe | Salida |
|---|---|---|
| `models/terrain.mjs` | casillas (con variantes de detalles) y decorado | `terrain/` → `public/assets/models/terrain/` |
| `models/buildings.mjs` | los edificios, uno por lado (`blue`, `red`, `neutral`) | `buildings/` → `.../buildings/` |
| `models/units.mjs` | las unidades, una por equipo (`blue`, `red`), con huesos y animaciones `idle`, `drive` y `fire` | `units/` → `.../units/` |

El juego busca el modelo de cada tipo del contenido por su id en minusculas (`units/tank_blue`,
`buildings/city_neutral`); un tipo sin modelo sigue con su modelo de bloques. Que terreno usa que
casilla y decorado, `TERRAIN_PIECES` en `src/view3d/terrain.ts`.

## Generar y exportar

Ashfox pide Node 24 (el juego va con Node 22), asi que no esta en el `package.json`: se instala
aparte, por ejemplo en una carpeta fuera del repo:

```sh
npm install --save-dev https://github.com/sigee-min/ashfox/releases/download/v2.0.1/ashfox-cli.tgz node@24
```

Desde la raiz del juego:

```sh
node tools/art/ashfox/generate.mjs                                                       # escribe los .ashfox
ASHFOX=<carpeta>/node_modules/.bin/ashfox node tools/art/ashfox/generate.mjs --export    # y los GLB
```

Lo que Ashfox exige (el generador ya lo cumple o avisa):

- Toda la geometria cuelga de un hueso, y cada cubo de un hueso que existe.
- En una pista de animacion todas las claves llevan la misma interpolacion, y un bucle acaba como
  empieza (las ruedas y las helices giran a saltos, aprovechando que se ven igual cada 90 o 180 grados).
- Ningun cubo puede quedar tapado del todo por otro.
- Los nombres de exportacion van en minusculas y los numeros sin restos de coma flotante.
- No sobrescribe: el generador borra cada `.glb` antes de exportarlo.
