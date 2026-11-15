# Modelos 3D con Ashfox (prototipo)

Fuentes `.ashfox` de los modelos animados del prototipo 3D (`3d.html`). [Ashfox](https://ashfox.io)
describe un modelo como datos: cubos colgados de huesos, una textura de pixel art hecha con paleta,
patrones y «stamps», y animaciones por fotogramas clave. Sale un GLB con su textura y sus animaciones,
que carga `src/view3d/glbModels.ts`.

Hay dos maneras de escribirlos:

- **A mano** (las unidades, con huesos y animaciones): cada una en su carpeta (`units/<tipo>/`), ver abajo.
- **Generados** (modelos fijos: el terreno y su decorado, `models/terrain.mjs`, y los edificios, uno por
  lado, `models/buildings.mjs`): cada fichero de `models/` describe cada modelo
  en pocas lineas (cubos y su pintura: rampa de tres tonos y manchas) a semejanza del terreno 2D, y
  `generate.mjs` escribe los `.ashfox` completos en `terrain/` y `buildings/` (calcula y coloca en el atlas el trozo
  de textura de cada cubo, que Ashfox no coloca solo). Un modelo nuevo es una entrada en `MODELS`;
  que terreno lo usa, `TERRAIN_PIECES` en `src/view3d/terrain.ts`.

```sh
node tools/art/ashfox/generate.mjs                                   # escribe los .ashfox
ASHFOX=<carpeta>/node_modules/.bin/ashfox node tools/art/ashfox/generate.mjs --export   # y los GLB
```

Cada unidad hecha a mano va en su carpeta (`units/<tipo>/`):

- `rig.ashfox`: los huesos y las animaciones (`idle`, `drive`, `fire`; las que pide el juego, `UnitClip`).
- `body.ashfox`: los cubos, en unidades de 1/16 de casilla, mirando al norte (-z).
- `surface.ashfox`: la textura, una por equipo (`blue` y `red`).
- `<tipo>_<equipo>.ashfox`: el modelo que se exporta (un fichero por equipo).

## Exportar

Ashfox pide Node 24 (el juego va con Node 22), asi que no esta en el `package.json`: se instala
aparte, por ejemplo en una carpeta fuera del repo:

```sh
npm install --save-dev https://github.com/sigee-min/ashfox/releases/download/v2.0.1/ashfox-cli.tgz node@24
```

Desde la raiz del juego, con esa carpeta en el `PATH` (`<carpeta>/node_modules/.bin`):

```sh
ashfox check tools/art/ashfox/units/tank/tank_blue.ashfox
ashfox export tools/art/ashfox/units/tank/tank_blue.ashfox --output public/assets/models/tank_blue.glb
```

Ashfox no sobrescribe: hay que borrar el `.glb` antes de volver a exportarlo. En una pista de
animacion todas las claves llevan la misma interpolacion (glTF lo pide).

Para que una unidad use su GLB, su entrada en `GLB_UNITS` (`src/view3d/glbModels.ts`); sin entrada
sigue con su modelo de bloques.
