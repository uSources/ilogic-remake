# Notas de parche

Cada versión empieza con `## [x.y.z] - AAAA-MM-DD` y, si se quiere, un título tras `—`.
Lo que va antes de `<!-- en -->` sale con el juego en español; lo de después, en inglés
(si no hay `<!-- en -->`, se ve lo mismo en los dos idiomas).

Este fichero va dentro del juego (por si no hay conexión) y `npm run release` lo publica como
Release en GitHub. El juego lee las Releases de GitHub para enseñar las notas al día.

## [Sin publicar]

### Novedades
- **Clima.** Cada pocos días cambia el tiempo, igual para los dos bandos: la **lluvia** frena a los vehículos, la **nevada** a todo lo que va por tierra, la **tormenta** a los aviones y la **tormenta de arena** (solo en el desierto) a la infantería y los aviones. El mal tiempo también quita visión con niebla y puntería. Arriba, junto al día, se ve el clima de hoy, sus efectos y el de mañana cuando va a cambiar. Se puede quitar en Nueva partida → Personalizada; la campaña no lo usa.
- **Se puede instalar como app** desde el navegador (móvil u ordenador) y **jugar sin conexión**. Se actualiza sola con cada versión.

### Gráficos
- Nuevo icono del juego con el Soldado nuevo.

### Para quien modifica el juego
- Los climas están en `src/core/content/weather.json` (efectos, duración y probabilidad en cada terreno).

### Equilibrio
- El **Tanque** ya rinde lo que cuesta: acierta el doble a la infantería (0,6 en vez de 0,3; 0,45 a la Bazuca), y el Soldado, el Escudero y el Motorizado le aciertan la mitad (0,05). El Mortero, 0,2 en vez de 0,4. La Bazuca sigue siendo el antitanque.
- El **Soldado** acierta menos a los vehículos (Jeep 0,2; Tanque ligero, Transporte, Lanzamisiles, Suministros, Antiaéreo y Tanque anfibio 0,1; Artillería 0,05): con 1500 dominaba la partida.
- La IA ya no se gasta casi todo en aviones: reparte las compras entre la Fábrica y el Aeropuerto, y vuelve a sacar Tanques.

<!-- en -->

### New
- **Weather.** Every few days the weather changes, the same for both sides: **rain** slows vehicles, **snowfall** slows everything on the ground, **storms** slow aircraft and **sandstorms** (desert only) slow infantry and aircraft. Bad weather also costs vision under fog and aim. Next to the day at the top you can see today's weather, its effects and tomorrow's when it is about to change. It can be turned off in New game → Custom; the campaign doesn't use it.
- **Install it as an app** from the browser (phone or computer) and **play offline**. It updates itself with each version.

### Graphics
- New game icon with the new Soldier.

### For modders
- Weather lives in `src/core/content/weather.json` (effects, duration and chance on each terrain).

### Balance
- The **Tank** is now worth its price: it hits infantry twice as often (0.6 instead of 0.3; 0.45 against the Bazooka), and the Soldier, Shield trooper and Motor trooper hit it half as often (0.05). The Mortar, 0.2 instead of 0.4. The Bazooka is still the anti-tank unit.
- The **Soldier** hits vehicles less often (Jeep 0.2; Light tank, Transport, Missile truck, Supplier, Anti-air and Amphibious tank 0.1; Artillery 0.05): at 1500 it dominated the game.
- The AI no longer spends almost everything on aircraft: it splits purchases between the Factory and the Airport, and builds Tanks again.

## [0.2.0] - 2026-10-30 — Sin repostar

Menos logística y más batalla: fuera el combustible y la munición, y precios ajustados.

### Cambios de juego
- **Fuera el combustible y la munición.** Casi solo estorbaban: unidades paradas sin combustible, aviones que caían y unidades que no podían disparar. Ya no hay que volver a repostar ni a recargar.
- El **camión de suministros** ahora **repara** 20 de vida a los vehículos y aviones de al lado (orden «Reparar»).

### Equilibrio
- El **Bombardero** cuesta 13000 en vez de 20000 y el **Lanzamisiles** 11000 en vez de 16000: rendían mucho menos de lo que costaban.

### Arreglos
- Una captura a medias ya no se conserva si la unidad que capturaba se va y vuelve (la IA podía aprovecharlo).

### Interfaz
- El enlace a la web del juego de 2013 del menú pasa a ser «GitHub» y lleva al repositorio del remake.

### Para quien modifica el juego
- Unidades, edificios, terreno, reglas por defecto y pesos de la IA están en ficheros de configuración (`src/core/content/*.json`): se pueden cambiar o añadir sin tocar código. Una unidad nueva se crea con `npm run unit -- new Sniper --like Soldier` (copia del soldado). Guía: `docs/CONTENIDO.md`.

<!-- en -->

Less logistics, more battle: fuel and ammo are gone, and prices have been tuned.

### Gameplay
- **Fuel and ammo are gone.** They mostly got in the way: units stuck without fuel, aircraft crashing and units unable to fire. No more trips back to refuel or rearm.
- The **supply truck** now **repairs** 20 health to adjacent vehicles and aircraft ("Repair" order).

### Balance
- The **Bomber** now costs 13000 instead of 20000 and the **Missile truck** 11000 instead of 16000: they were worth much less than their price.

### Fixes
- A half-finished capture is no longer kept when the capturing unit leaves and comes back (the AI could exploit it).

### Interface
- The menu link to the 2013 game's website is now "GitHub" and goes to the remake's repository.

### For modders
- Units, buildings, terrain, default rules and AI weights live in config files (`src/core/content/*.json`): they can be changed or added without touching code. A new unit is created with `npm run unit -- new Sniper --like Soldier` (a copy of the soldier). Guide: `docs/CONTENIDO.md`.

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
