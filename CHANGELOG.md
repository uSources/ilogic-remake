# Notas de parche

Cada versión empieza con `## [x.y.z] - AAAA-MM-DD` y, si se quiere, un título tras `—`.
Lo que va antes de `<!-- en -->` sale con el juego en español; lo de después, en inglés
(si no hay `<!-- en -->`, se ve lo mismo en los dos idiomas).

Este fichero va dentro del juego (por si no hay conexión) y `npm run release` lo publica como
Release en GitHub. El juego lee las Releases de GitHub para enseñar las notas al día.

## [Sin publicar]

### Interfaz
- **Mover con el dedo en dos toques:** toca tu unidad y luego adónde ir; si no hay nada más que hacer, espera sola (antes eran cuatro toques y el menú). Para atacar, toca el enemigo dos veces: la primera enseña la previsión. También se puede arrastrar la unidad sin mantener pulsado, y tocar una fábrica libre abre la compra al momento.
- En el móvil, las **fichas de unidad y terreno** se pliegan y despliegan tocándolas, para dejar más mapa a la vista.

### Arreglos
- En el móvil, el **desglose del dinero y del día** se cierra al volver a tocarlo, y en horizontal ya no se sale de la pantalla (se desplaza dentro).
- El icono de **visión** ya no se sale de la ficha de la unidad en pantallas estrechas.
- En el móvil, la **ayuda** se lee en lista (cada control con su tecla) y no se corta por la derecha.
- En pantallas táctiles no salen las teclas en los botones (solo el número del paso de una misión).
- En horizontal bajo, las **tarjetas de inicio** van en fila y se deslizan; cada una se desplaza por dentro, sin cortarse.
- Márgenes seguros para la muesca y la barra de gestos del móvil en la barra de arriba y en el inicio.

### Más mapa en el móvil
- En **horizontal**, el dinero, el día, el fin del turno y el menú van en una columna estrecha a la izquierda: el mapa pasa de ocupar la mitad de la pantalla a más de cuatro quintos.
- La **ficha** empieza plegada en una línea (retrato, nombre, movimiento y vida) y solo sale cuando hay algo que mirar: una unidad, un edificio o al elegir destino.
- La bandeja **Sin mover** es un botón con el número: cada toque elige la siguiente unidad.
- La **ficha del terreno** enseña la casilla tal como se ve en el mapa (antes, un cuadrado verde liso).
- El mapa se puede desplazar más allá de sus bordes: cualquier casilla llega al centro, lejos de la interfaz.
- El **zoom inicial** se ajusta a la pantalla: unas 9 casillas en el lado corto, nunca casillas más pequeñas que un dedo.
- Al atacar con el dedo, la previsión trae un botón **Atacar** (tocar otra vez el enemigo también ataca).
- **Vibración** corta al coger, al soltar y al atacar con el dedo; se puede quitar en Opciones.
- El aviso de gestos sale abajo y pequeño, y nunca encima de un menú.

### Menús para el pulgar
- En vertical, los menús de acciones, compra y carga suben desde abajo, con filas más altas.
- **Compra** en cuadrícula de unidades grandes con su precio; con el dedo, tocar una enseña su ficha y el botón **Comprar**.
- Al terminar el turno con unidades sin mover sale un aviso con **Terminar el turno** y **No volver a preguntar** (también en Opciones).
- Botón **Deshacer** a la vista mientras se pueda deshacer el último movimiento.

### Como una app
- En el móvil, **pantalla completa** al empezar a jugar (Android; en iPhone, instalando el juego como app) y **pantalla encendida** durante la partida.
- Opción para **fijar la orientación** en vertical u horizontal (Android) y para quitar la pantalla completa.
- Sin «tirar para recargar», sin seleccionar texto ni el menú del navegador al mantener pulsado.
- Menos batería: sin tocar nada unos segundos, el juego dibuja a 30 fotogramas; y en pantallas táctiles el menú usa el fondo fijo de 2013.
- Al salir de la app se guarda la partida si ya se estaba guardando (guardado automático o guardada a mano).

<!-- en -->

### Interface
- **Move with your finger in two taps:** tap your unit, then where to go; if there is nothing else to do, it waits on its own (it used to take four taps and the menu). To attack, tap the enemy twice: the first tap shows the forecast. You can also drag a unit without holding first, and tapping a free factory opens the shop right away.
- On phones, the **unit and terrain cards** fold and unfold with a tap, leaving more of the map in view.

### Fixes
- On phones, the **money and day breakdown** closes when tapped again, and in landscape it no longer runs off the screen (it scrolls inside).
- The **vision** icon no longer sticks out of the unit card on narrow screens.
- On phones, the **help** reads as a list (each control with its key) and no longer gets cut on the right.
- On touch screens the keys on buttons are hidden (only the mission step number stays).
- In short landscape, the **start cards** sit in a row you can slide; each one scrolls inside, nothing is cut.
- Safe margins for the notch and the gesture bar on phones, in the top bar and on the start screen.

### More map on phones
- In **landscape**, money, day, end turn and menu sit in a narrow column on the left: the map goes from half the screen to more than four fifths.
- The **card** starts folded to one line (portrait, name, movement and health) and only shows when there is something to look at: a unit, a building or while choosing a destination.
- The **Unmoved** tray is a button with the count: each tap selects the next unit.
- The **terrain card** shows the tile as it looks on the map (it used to be a plain green square).
- The map scrolls past its edges: any tile can reach the centre, away from the interface.
- The **starting zoom** fits the screen: about 9 tiles on the short side, never tiles smaller than a finger.
- When attacking with your finger, the forecast has an **Attack** button (tapping the enemy again also attacks).
- Short **vibration** when picking up, dropping and attacking with your finger; it can be turned off in Options.
- The gestures tip shows small at the bottom, and never on top of a menu.

### Menus for your thumb
- In portrait, the action, shop and cargo menus slide up from the bottom, with taller rows.
- The **shop** is a grid of big units with their price; with your finger, tapping one shows its card and the **Buy** button.
- Ending the turn with unmoved units shows a warning with **End turn** and **Don't ask again** (also in Options).
- An **Undo** button is visible while the last move can be undone.

### Like an app
- On phones, **fullscreen** when you start playing (Android; on iPhone, by installing the game as an app) and the **screen stays on** during the match.
- Options to **lock the orientation** to portrait or landscape (Android) and to turn fullscreen off.
- No pull-to-refresh, no text selection and no browser menu on long press.
- Less battery: after a few seconds without touching, the game draws at 30 frames; and on touch screens the menu uses the fixed 2013 background.
- Leaving the app saves the match if it was already being saved (autosave or saved by hand).

## [0.4.0] - 2026-10-30 — En el bolsillo

Ilogic se instala como una app más y se juega sin conexión.

### Novedades
- **Se puede instalar como app** desde el navegador (móvil u ordenador) y **jugar sin conexión**. Se actualiza sola con cada versión.

### Gráficos
- Nuevo icono del juego con el Soldado nuevo.

<!-- en -->

Ilogic installs like any other app and plays offline.

### New
- **Install it as an app** from the browser (phone or computer) and **play offline**. It updates itself with each version.

### Graphics
- New game icon with the new Soldier.

## [0.3.0] - 2026-10-30 — Cielo y acero

Ejércitos más pequeños, combates que se entienden, unidades con habilidades y un tiempo que cambia.

### Novedades
- **Clima.** Cada pocos días cambia el tiempo, igual para los dos bandos: la **lluvia** frena a los vehículos, la **nevada** a todo lo que va por tierra, la **tormenta** a los aviones y la **tormenta de arena** (solo en el desierto) a la infantería y los aviones. El mal tiempo también quita visión con niebla y puntería. Arriba, junto al día, se ve el clima de hoy, sus efectos y el de mañana cuando va a cambiar. Se puede quitar en Nueva partida → Personalizada; la campaña no lo usa.
- **Habilidades de las unidades**, explicadas en su ficha y en el menú de compra:
  - **Escudero — Escudo:** los ataques a distancia le aciertan la mitad.
  - **Barricada — Zona de control:** los enemigos por tierra que llegan a su lado se tienen que parar.
  - **Suministros — Apoyo:** a las unidades propias de al lado les aciertan un 10 % menos.
  - **Mortero — Perforante:** ignora la protección del terreno y de los edificios.
- **Combate más visible**, tuyo y del enemigo: una mira se cierra sobre el objetivo, el disparo sale del atacante, la barra de vida baja a saltos y se avisa del contraataque («FALLO» si no hace daño). Abajo, un **panel de combate** enseña las dos unidades, su acierto y cuánta vida pierden. Lo que dispara desde la niebla sale como «???».
- **Desglose del dinero y del día** al pasar por encima (o tocar): ingresos por edificio, mantenimiento por unidad, con cuánto empiezas el próximo turno, puntos de mando y, con límite de días, cuántos quedan y los puntos de cada bando.

### Cambios de juego
- **Puntos de mando:** cada unidad ocupa de 1 (infantería) a 5 (lo más grande), con un máximo de 30 por bando. El menú de compra dice cuánto ocupa cada una.
- **Mantenimiento:** cada día se paga el 10 % del precio de tu ejército (si no llega, se paga lo que haya).
- Las dos se cambian o se quitan en Nueva partida → Personalizada → Ejército. La campaña no las usa.

### Equilibrio
- El **Tanque** ya rinde lo que cuesta: acierta el doble a la infantería (0,6 en vez de 0,3; 0,45 a la Bazuca), y el Soldado, el Escudero y el Motorizado le aciertan la mitad (0,05). El Mortero, 0,2 en vez de 0,4. La Bazuca sigue siendo el antitanque.
- El **Soldado** acierta menos a los vehículos (Jeep 0,2; Tanque ligero, Transporte, Lanzamisiles, Suministros, Antiaéreo y Tanque anfibio 0,1; Artillería 0,05): con 1500 dominaba la partida.
- La IA ahorra para unidades grandes y ya no se gasta casi todo en aviones: reparte las compras entre la Fábrica y el Aeropuerto y vuelve a sacar Tanques.

### Interfaz
- **Letra propia** de píxeles para títulos y botones, y **iconos nuevos** de vida, dinero, mando, defensa, visión, alcance, captura y movimiento en las fichas y la barra de arriba.
- **Puntero del ratón** nuevo (dorado sobre lo que se puede pulsar) y un **marco de esquinas** animado en la casilla señalada, que se pone rojo al elegir objetivo.

### Para quien modifica el juego
- Los climas están en `src/core/content/weather.json` (efectos, duración y probabilidad en cada terreno).
- Las habilidades se ponen en `units.json` (`"abilities"`); la guía para añadir una clase nueva está en `docs/CONTENIDO.md`.

<!-- en -->

Smaller armies, battles you can follow, units with abilities and changing weather.

### New
- **Weather.** Every few days the weather changes, the same for both sides: **rain** slows vehicles, **snowfall** slows everything on the ground, **storms** slow aircraft and **sandstorms** (desert only) slow infantry and aircraft. Bad weather also costs vision under fog and aim. Next to the day at the top you can see today's weather, its effects and tomorrow's when it is about to change. It can be turned off in New game → Custom; the campaign doesn't use it.
- **Unit abilities**, explained on the unit card and in the buy menu:
  - **Shield trooper — Shield:** ranged attacks hit it half as often.
  - **Barricade — Zone of control:** enemy ground units that move next to it have to stop.
  - **Supplier — Support:** adjacent friendly units are hit 10 % less often.
  - **Mortar — Piercing:** ignores the cover from terrain and buildings.
- **Clearer combat**, yours and the enemy's: a reticle closes on the target, the shot leaves the attacker, the health bar drops step by step and counterattacks are announced ("MISS" when no damage is done). A **combat panel** at the bottom shows both units, their hit chance and how much health they lose. Anything firing from the fog shows as "???".
- **Money and day breakdown** on hover (or tap): income per building, upkeep per unit, what you start your next turn with, command points and, with a day limit, the days left and each side's score.

### Gameplay
- **Command points:** each unit takes from 1 (infantry) to 5 (the biggest), up to 30 per side. The buy menu shows how many each one takes.
- **Upkeep:** every day you pay 10 % of your army's price (if you can't, you pay what you have).
- Both can be changed or turned off in New game → Custom → Army. The campaign doesn't use them.

### Balance
- The **Tank** is now worth its price: it hits infantry twice as often (0.6 instead of 0.3; 0.45 against the Bazooka), and the Soldier, Shield trooper and Motor trooper hit it half as often (0.05). The Mortar, 0.2 instead of 0.4. The Bazooka is still the anti-tank unit.
- The **Soldier** hits vehicles less often (Jeep 0.2; Light tank, Transport, Missile truck, Supplier, Anti-air and Amphibious tank 0.1; Artillery 0.05): at 1500 it dominated the game.
- The AI saves up for big units and no longer spends almost everything on aircraft: it splits purchases between the Factory and the Airport and builds Tanks again.

### Interface
- A **custom pixel font** for titles and buttons, and **new icons** for health, money, command, defense, vision, range, capture and movement on the cards and the top bar.
- A new **mouse pointer** (gold over anything clickable) and an animated **corner frame** on the highlighted tile, which turns red when picking a target.

### For modders
- Weather lives in `src/core/content/weather.json` (effects, duration and chance on each terrain).
- Abilities go in `units.json` (`"abilities"`); the guide to adding a new kind is in `docs/CONTENIDO.md`.

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
