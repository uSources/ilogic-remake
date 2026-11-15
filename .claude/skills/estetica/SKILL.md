---
name: estetica
description: Use when creating, redoing or reviewing how a 3D model of Ilogic looks (units, infantry, vehicles, buildings, decor): proportions, face, pose, detail, materials and colors. The game's visual style (chibi toy voxel with pixel-art textures and lots of detail), decided with the user; read it before touching tools/art/ashfox/models or judging a model. The technical side (generate, export, Ashfox rules) is the ashfox skill.
---

# Estetica del juego

La guia completa esta en **`docs/ESTETICA.md`**: leerla entera antes de hacer o revisar un modelo.
Ahi esta lo decidido con el usuario (y lo que se probo y no gusto). El modelo de referencia es el
soldado (`trooper` en `tools/art/ashfox/models/units.mjs`).

Lo imprescindible, por si hay prisa:

- Juguete de bloques chibi con textura de pixel art, del color de su equipo, que se lea desde arriba.
- `detail: 2` (32 unidades por casilla) y el detalle **dibujado**: lo pequeño pintado (`stamps`), lo
  que sobresale en 3D (gafas, hebilla, cartucheras, solapas, cantimplora).
- Caras serias: ojos oscuros 2×2 y boca recta; **sin coloretes, sin cejas, sin brillo en los ojos**.
- El arma en las dos manos, en guardia; las animaciones no la sueltan. Brazos finos (hombro y
  antebrazo), manos pequeñas.
- Usar las pinturas compartidas de la tabla de materiales antes de inventar colores.
- Comprobarlo con capturas (tambien desde arriba, como la camara del juego), `replay` y el
  playground (skill `ashfox`).

Si el usuario decide algo nuevo sobre el aspecto (o descarta algo), apuntarlo en `docs/ESTETICA.md`
en el momento: es la memoria del estilo para todos los agentes.
