# Notas de parche

Cada versión empieza con `## [x.y.z] - AAAA-MM-DD` y, si se quiere, un título tras `—`.
Lo que va antes de `<!-- en -->` sale con el juego en español; lo de después, en inglés
(si no hay `<!-- en -->`, se ve lo mismo en los dos idiomas).

Este fichero va dentro del juego (por si no hay conexión) y `npm run release` lo publica como
Release en GitHub. El juego lee las Releases de GitHub para enseñar las notas al día.

## [Sin publicar]

### Equilibrio
- El **Tanque** cuesta 9500 en vez de 12000: rendia mucho menos de lo que costaba.

## [0.1.0] - 2026-10-29 — El remake

Primera versión del remake de **Ilogic** (2013), rehecho en TypeScript y Phaser 4.

### Novedades
- **Campaña** de 6 misiones con tutorial guiado, objetivos y progreso guardado.
- **Nueva partida a tu gusto**: tamaño 20, 32 o 40, terreno, niebla, dinero, ingresos, límite de días y código de mapa para compartirlo.
- **Movimiento nuevo**: arrastrar y soltar, camino con flecha, órdenes de varios turnos, mover en grupo y Ctrl+Z.
- **Veteranía**: las unidades ganan estrellas al derrotar enemigos.
- Captura por puntos, victoria por puntos, rendirse y repetir el turno enemigo.
- Minimapa, resumen de ronda, ayuda y controles táctiles.

### Gráficos
- Terreno, costas, agua animada, niebla de guerra y las 19 unidades redibujadas.
- Opción para jugar con los gráficos originales de 2013.
- Los gráficos van en un atlas: el juego carga más rápido y ocupa la mitad.

### Arreglos
- Corregidos los fallos de la tabla de daño del original (los soldados hacían x3 al tanque ligero, entre otros).

<!-- en -->

First version of the **Ilogic** (2013) remake, rebuilt in TypeScript and Phaser 4.

### New
- **Campaign** with 6 missions, a guided tutorial, objectives and saved progress.
- **Custom games**: map size 20, 32 or 40, terrain, fog, funds, income, day limit and shareable map codes.
- **New movement**: drag and drop, arrow path, multi-turn orders, group moves and Ctrl+Z.
- **Veterancy**: units earn stars by defeating enemies.
- Capture points, victory on points, surrender and replay of the enemy turn.
- Minimap, round summary, help and touch controls.

### Graphics
- Terrain, coasts, animated water, fog of war and all 19 units redrawn.
- Option to play with the original 2013 graphics.
- Graphics are packed in an atlas: faster loading and half the size.

### Fixes
- Fixed the bugs in the original damage table (soldiers dealt x3 to the light tank, among others).
