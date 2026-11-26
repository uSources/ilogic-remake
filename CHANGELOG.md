# Notas de parche

Cada versión empieza con `## [x.y.z] - AAAA-MM-DD` y, si se quiere, un título tras `—`.
Lo que va antes de `<!-- en -->` sale con el juego en español; lo de después, en inglés
(si no hay `<!-- en -->`, se ve lo mismo en los dos idiomas).

Este fichero va dentro del juego (por si no hay conexión) y `npm run release` lo publica como
Release en GitHub. El juego lee las Releases de GitHub para enseñar las notas al día.

## [Sin publicar]

### Arreglos
- **El autoguardado vuelve a funcionar**: con él activado en Opciones, la partida se guarda al empezar cada turno tuyo, así no se pierde si el navegador se cierra sin avisar (pasa en el móvil). Desde que el juego es 3D, la opción no hacía nada.

<!-- en -->

### Fixes
- **Autosave works again**: with it on in Options, the game is saved at the start of each of your turns, so it isn't lost if the browser closes without warning (it happens on phones). Since the game went 3D, the option did nothing.

## [0.18.0] - 2026-11-26 — Buscar rival y un menú nuevo

### Novedades
- **«Buscar rival»**: te empareja con otra persona, 1 contra 1, con las reglas de siempre y un mapa al azar. Puede ser **por turnos** (un día por turno: cada uno juega cuando puede, y puedes cerrar el juego mientras esperas) o **en vivo** (2 minutos por turno, con los dos conectados a la vez). Mientras llega alguien puedes jugar contra la IA o cancelar la búsqueda.
- **El reloj del turno**: en las partidas en línea con tiempo por turno, bajo el día sale lo que queda, con un anillo que se vacía. Los últimos 15 segundos se pone en rojo, hace tic y «Fin del turno» parpadea; mientras juega otro, se ve el tiempo que le queda a él. Con lector de pantalla, avisa de los últimos segundos.
- Suena subir y bajar del transporte: botas sobre un suelo de metal y un pestillo, en el camión y en el helicóptero.
- Los animales ya no se oyen desde lejos: solo al acercar la cámara, más flojos cuanto más lejos y cada vez un poco distintos.
- La artillería es más pequeña, del tamaño de un tanque.

### Interfaz
- **Nuevo menú de inicio**: una lista de texto a la izquierda (Continuar, Campaña, Escaramuza y En línea, cada una con lo que hay detrás: el día de tu partida guardada, la misión por la que vas, en cuántas partidas en línea te toca) y, detrás, el juego en 3D: la cámara da vueltas despacio alrededor de la base de una partida de la IA. Novedades, Aprender y Opciones, arriba a la derecha.
- **Novedades, Aprender y Opciones con el mismo diseño**, en pantalla entera y con las pestañas del menú arriba. Novedades se lee como un texto: las notas de la versión elegida en grande y las demás versiones al lado. Aprender va por temas (objetivo y reglas, colores del mapa, controles y, nuevo, las unidades con su precio, movimiento, alcance y visión). Opciones, con las pestañas en una barra y cada grupo en su ficha.
- **«Jugar en línea», rediseñado**: tres tarjetas (Buscar rival, Con amigos y Mis partidas) y, arriba, si el servidor contesta, también la primera vez, sin partidas apuntadas. La sala enseña el código en teclas, con «Copiar código», y los equipos frente a frente. En el móvil, una cosa encima de otra y lo que te toca, arriba.
- Cuando «Buscar rival» te empareja, la partida carga detrás de «¡Rival encontrado!»: los dos ejércitos frente a frente, quién empieza, el mapa y el tiempo por turno.

### Cambios de juego
- **Fuera los puntos de control**: las zonas de 3×3 que daban dinero repetían lo que ya hacen las ciudades, y se tomaban solo con dejar una unidad dentro. Para ganar dinero, a capturar edificios.

### Arreglos
- El menú de la partida (☰ o Esc) también se abre mientras juegan los demás, para salir o rendirte: antes no hacía nada hasta tu turno.
- Al matar en tu turno, o al caer tu unidad en el contraataque, vuelven a verse el disparo, la explosión y la caída: antes la unidad desaparecía sin más.
- Con Alt pulsado, la ficha sale entera también al pasar a otra casilla: antes (sobre todo en Mac) la nueva salía normal hasta soltar Alt y volver a pulsarlo.

<!-- en -->

### New
- **“Find an opponent”**: matches you with another person, 1 vs 1, with the usual rules and a random map. It can be **Daily** (a day per turn: each plays when they can, and you can close the game while you wait) or **Live** (2 minutes per turn, with both online at the same time). While you wait you can play against the AI or cancel the search.
- **Turn clock**: in online games with a time per turn, the time left shows under the day, with a ring that empties. In the last 15 seconds it turns red, ticks and “End turn” blinks; while someone else plays, you see the time they have left. With a screen reader, it announces the last seconds.
- Getting on and off a transport makes a sound: boots on a metal floor and a latch, on the truck and the helicopter.
- Animals no longer sound from afar: only when you zoom the camera in, quieter the farther away, and a little different each time.
- The artillery is smaller, about the size of a tank.

### Interface
- **New start menu**: a text list on the left (Continue, Campaign, Skirmish and Online, each with what's behind it: the day of your saved game, the mission you're on, how many online games are waiting for you) and, behind it, the game in 3D: the camera slowly circles the base of an AI game. What's new, Learn and Options, top right.
- **What's new, Learn and Options share the same look**, full screen with the menu tabs on top. What's new reads like a text: the notes of the chosen version in large type and the other versions beside them. Learn goes by topic (goal and rules, map colors, controls and, new, the units with their price, movement, range and vision). Options has its tabs in a bar and each group on its own card.
- **“Play online”, redesigned**: three cards (Find an opponent, With friends and My games) and, on top, whether the server answers, even the first time, with no games saved. The room shows the code as keys, with “Copy code”, and the teams face to face. On a phone, one thing above the other, and what's waiting for you on top.
- When “Find an opponent” pairs you up, the game loads behind an “Opponent found!” screen: both armies face to face, who goes first, the map and the time per turn.

### Gameplay
- **Control points are gone**: the 3×3 areas that paid money did the same job as cities, and you took them just by leaving a unit inside. To earn money, capture buildings.

### Fixes
- The game menu (☰ or Esc) also opens while others are playing, so you can leave or surrender: before, it did nothing until your turn.
- When you kill a unit on your turn, or yours falls in the counterattack, the shot, the explosion and the fall show again: before, the unit just vanished.
- Holding Alt shows the full card also when you move to another tile: before (mostly on Mac) the new one showed the short card until you released Alt and pressed it again.

## [0.17.0] - 2026-11-24 — Cada bioma, vivo, y el juego en línea vuelve

### Novedades
- **Jugar en línea vuelve, ya en 3D**: crea una partida, pasa el código o el enlace a tus amigos y jugad cada uno desde su casa. Para unirse vale pegar el código o el enlace, y recargar la página te devuelve a la sala.
- **«Mis partidas»** dice cómo va cada sala sin entrar: si te toca (con el día y el tiempo que queda de turno), a quién le toca, si espera jugadores o si ya acabó. Lo que te pide jugar sale arriba.
- **El desierto tiene vida**: remolinos de polvo, lagartijas que toman el sol y hacen flexiones, bolas rodadoras que cruzan con el viento y buitres dando vueltas en lo alto.
- **La nieve tiene vida**: copos que destellan al sol, pingüinos que se tiran de barriga al agua y focas que miran alrededor.
- **La llanura tiene vida**: mariposas sobre las flores, conejos que asoman de su madriguera, peces que saltan y bandadas de gansos en V.
- **El campo suena**: los animalitos del tablero dicen lo suyo cuando hacen algo cerca de la cámara (la rana croa al saltar, el pájaro pía al salir de la copa, los gansos graznan al pasar, el pingüino chapotea al tirarse al agua, y la ardilla, el ciervo, el buitre y la foca también), uno cada poco y casi nunca con la cámara alta. Con lluvia o nieve se oyen mucho menos, y con tormenta o tormenta de arena se callan, igual que sus ambientes.
- Las tormentas tienen trueno: un chasquido y un retumbar que se aleja después de cada relámpago.
- El jeep y los camiones (transporte, suministros y lanzamisiles) tienen cada uno su motor: arrancan al moverse y tocan la bocina al elegirlos.
- Las voces de las unidades son otras: un balbuceo de juguete menos chillón, y el piloto contesta por radio.
- **Los puntos de control se ven en el tablero**: un borde dorado, una cinta del color del dueño y sus banderines en las esquinas. Si está disputado, el borde late en rojo (solo cuentan las unidades que ves), y al cobrar sale su chapa de dinero.

### Interfaz
- En Novedades ya se leen el código, que salía como un recuadro oscuro vacío, la negrita, que salía blanca sobre la crema, y los enlaces.

### Arreglos
- Las marcas del suelo ya no se entierran en las dunas ni en las laderas.
- En línea, la pantalla ya no deshace una acción tuya al volver a conectar, y la sala enseña los asientos aunque los datos lleguen desordenados.
- Si montas tu propio servidor: tiene tope de salas y de conexiones, y una conexión rota ya no lo tumba.

<!-- en -->

### New
- **Online play is back, now in 3D**: create a game, send the code or link to your friends and each of you plays from home. To join, paste the code or the link; reloading the page takes you back to the room.
- **“My games”** shows how each room is going without opening it: whether it's your turn (with the day and the time left), whose turn it is, whether it's waiting for players or already over. The ones waiting for you come first.
- **The desert comes alive**: little dust devils, lizards sunbathing and doing push-ups, tumbleweeds rolling along with the wind and vultures circling high above.
- **The snow comes alive**: snowflakes that glint in the sun, penguins belly-flopping into the water and seals looking around.
- **The plains come alive**: butterflies over the flowers, rabbits peeking out of their burrows, leaping fish and flocks of geese flying in a V.
- **The countryside comes alive with sound**: the little animals on the board call out when they do something near the camera (the frog croaks as it hops, the bird chirps as it leaves a treetop, geese honk as they fly by, the penguin splashes as it dives, and the squirrel, deer, vulture and seal have their own calls), one every so often and hardly ever with the camera up high. In rain or snow they're much quieter, and in a storm or sandstorm they fall silent, like their ambiences.
- Storms have thunder: a crack and a rumble rolling away after each lightning flash.
- The jeep and the trucks (transport, supplier and missile truck) each have their own engine: they start up when they move and honk when selected.
- Unit voices are new: a less squeaky toy babble, and the pilot answers over the radio.
- **Control points show on the board**: a golden border, a ribbon in the owner's color and their pennants at the corners. When contested, the border pulses red (only units you can see count), and a money badge pops up when it pays out.

### Interface
- In “What's new”, code no longer shows as an empty dark box, and bold text and links no longer fade into the cream background.

### Fixes
- Ground markers no longer sink into dunes and slopes.
- Online, the screen no longer undoes one of your actions when reconnecting, and the room shows its seats even if the data arrives out of order.
- If you run your own server: it now caps rooms and connections, and a broken connection no longer brings it down.

## [0.16.0] - 2026-11-22 — El bosque cobra vida

### Novedades
- **El bosque cobra vida**: en los mapas de bosque caen de las copas hojas verdes y ocres, meciéndose y girando; en lo alto de los árboles hay ardillas que de vez en cuando dan unos saltitos y se giran; algún ciervo asoma en el borde del bosque, mirando al prado; y cada poco un pájaro sale de una copa y vuela batiendo las alas hasta otro árbol. Con «Reducir el movimiento» no caen hojas ni vuelan pájaros, y las ardillas y los ciervos se quedan quietos.

### Arreglos
- El mar helado que rodea los mapas nevados ya no sale con rectángulos ni escalones donde pasa del agua con trozos de hielo a los témpanos o a la banquisa: las placas salen enteras.

<!-- en -->

### New
- **The forest comes alive**: on forest maps, green and ochre leaves fall from the treetops, swaying and spinning; squirrels sit high in the trees and now and then hop about and turn; the odd deer peeks out at the edge of the woods, looking out over the meadow; and every so often a bird leaves a treetop and flies, flapping its wings, to another tree. With “Reduce motion”, no leaves fall and no birds fly, and squirrels and deer stay still.

### Fixes
- The frozen sea around snowy maps no longer shows rectangles or steps where it changes from water with ice chunks to floes or pack ice: the plates come out whole.

## [0.15.0] - 2026-11-22 — Cada sonido a su volumen

### Novedades
- **Volumen de cada sonido**: en Opciones, «General», «Música», «Efectos del tablero», «Ambiente», «Voces de las unidades» e «Interfaz y menús» tienen cada uno un deslizador de 0 a 100 y un altavoz que lo silencia sin perder el volumen. Al moverlo suena una muestra. Con «Silenciar en segundo plano», todo se calla mientras la pestaña está escondida. Al máximo suena como hasta ahora.

### Arreglos
- El agua que llega al borde del mapa acaba en la tierra del tema (tierra, barro, roca helada o arena), y no en una pared azul delante del mar, las dunas o el hielo.
- En la partida, Opciones y la Ayuda se quedan con el teclado mientras están abiertas: la E ya no acaba el turno al cambiar de pestaña, las flechas recorren las filas en vez de mover la cámara y en Controles se puede elegir otra tecla. Además, O y H abren Opciones y la Ayuda.
- Con la pausa abierta solo valen sus teclas: ya no se mueve la cámara ni se dan órdenes por detrás, las flechas recorren sus opciones y sus atajos son las teclas que tengas en Controles.
- El juego en un solo fichero (`ilogic.html`) tiene música en la partida aunque la pista de su tema no vaya dentro.

<!-- en -->

### New
- **A volume for each sound**: in Options, “Master”, “Music”, “Battlefield effects”, “Ambience”, “Unit voices” and “Interface and menus” each have a 0–100 slider and a speaker that mutes it without losing the volume. Moving a slider plays a sample. With “Mute in background”, everything goes quiet while the tab is hidden. At maximum it sounds as before.

### Fixes
- Water that reaches the map edge now ends in the theme's ground (earth, mud, icy rock or sand) instead of a blue wall in front of the sea, dunes or ice.
- In a match, Options and Help keep the keyboard while they're open: E no longer ends the turn when switching tabs, the arrows move through the rows instead of the camera, and in Controls you can pick a new key. Also, O and H open Options and Help.
- With the pause menu open, only its keys work: the camera no longer moves and no orders go through behind it, the arrows move through its options, and its shortcuts are the keys you set in Controls.
- The single-file game (`ilogic.html`) plays music in a match even when its theme's track isn't bundled in.

## [0.14.0] - 2026-11-22 — Banderas, minimapa y un mundo que suena

### Novedades
- **El tablero suena**: cada disparo, paso y motor suena desde su casilla, a un lado o al otro y más flojo cuanto más lejos. Cada unidad tiene su disparo, su motor y su caída, y los soldados suenan según el suelo que pisan. Hay ambiente por zonas (costa, bosque, cumbres, ciénaga, fábricas), el del tema y el del clima, con un trueno en cada relámpago, que se oye más con la cámara baja. También suenan las compras (las de la IA también), subir y bajar, unir, curar y esperar, los botones y unas voces de juguete. Lo que pasa bajo la niebla no suena. En Opciones, volumen nuevo para «Ambiente» y «Voces de las unidades».
- **Minimapa**: siempre abierto en una esquina, con los colores del tablero, la niebla, los edificios, las unidades y un recuadro con lo que ves. Crece al pasar el ratón (o al tocarlo con el dedo), y tocarlo o arrastrar en él lleva la cámara allí. La M lo cierra.
- **Ir allí en varios turnos**: con una unidad elegida, toca una casilla libre a la que no llega este turno. Da ya el primer paso y sigue sola cada turno; moverla tú lo cancela.
- **Banderas de destino**: una banderita azul marca la casilla a la que va cada unidad tuya con orden (atacar, capturar, defender o ir allí) hasta que llega. Lleva el retrato de la unidad o la tecla de su escuadra; si van varias al mismo sitio, sale una de cada (hasta tres, y «+N» si son más).
- **Siluetas y contornos**: una unidad tapada por una montaña o un edificio se ve a través, como una silueta del color de su bando. La unidad elegida lleva un borde amarillo y la señalada, uno blanco.
- **Cada tema con su alrededor**: el desierto está rodeado de un mar de dunas con mesetas de cañón, y el nevado, de un mar helado con témpanos, banquisa e icebergs.
- **El pantano tiene su propio aspecto**: suelo oliva con charcos, agua turbia, cipreses con musgo, troncos secos, nenúfares, juncos, ranitas que saltan y luciérnagas. Con «Reducir el movimiento», ni saltos ni luciérnagas.
- **Se ven mejor las unidades**: árboles, flores y cactus son algo más pequeños para que no tapen lo que hay en su casilla, y la cámara empieza más cerca.

### Interfaz
- La ficha de la casilla enseña su defensa en % (en vez de los cubitos amarillos sobre la casilla), lo que cuesta entrar, lo que da y lo que falta por capturar. Con Alt crece con todos los datos de la unidad.
- El minimapa y las miniaturas de los mapas pintan el pantano de verde, como se ve en el tablero.

### Arreglos
- El lateral del tablero ya no parpadea a rayas en el borde del mapa ni en los desniveles.
- Los números de las chapas y los textos que suben ya no se quedan con otra letra al empezar la partida.

<!-- en -->

### New
- **The board has sound**: every shot, step and engine sounds from its tile, to one side or the other and quieter the farther it is. Each unit has its own shot, engine and death sound, and soldiers' steps depend on the ground. There's ambience by area (coast, forest, peaks, marsh, factories), for the theme and for the weather, with thunder on every lightning bolt, louder with the camera low. Purchases (the AI's too), loading and unloading, joining, healing and waiting, buttons and some toy voices make sounds too. Whatever happens under the fog stays silent. Options has new volumes for “Ambience” and “Unit voices”.
- **Minimap**: always open in a corner, with the board's colors, fog, buildings, units and a box showing what you see. It grows when you hover it (or tap it), and tapping or dragging on it moves the camera there. M closes it.
- **Go there over several turns**: with a unit selected, tap a free tile it can't reach this turn. It takes the first step now and keeps going on its own every turn; moving it yourself cancels it.
- **Destination flags**: a little blue flag marks the tile each of your units with an order (attack, capture, hold or go there) is heading to, until it arrives. It shows the unit's portrait or its squad's key; when several go to the same place, one of each appears (up to three, and “+N” for more).
- **Silhouettes and outlines**: a unit hidden behind a mountain or a building shows through as a silhouette in its side's color. The selected unit gets a yellow outline and the hovered one a white one.
- **Each theme has its own surroundings**: the desert is surrounded by a sea of dunes with canyon mesas, and the snowy theme by a frozen sea with ice floes, pack ice and icebergs.
- **The swamp has its own look**: olive ground with puddles, murky water, mossy cypresses, dead trunks, water lilies, reeds, hopping frogs and fireflies. With “Reduce motion”, no hopping and no fireflies.
- **Units are easier to see**: trees, flowers and cacti are a bit smaller so they don't hide what's on their tile, and the camera starts closer.

### Interface
- The tile card shows its defense in % (instead of the little yellow cubes on the tile), what it costs to enter, what it pays and what's left to capture. Hold Alt and it grows with all of the unit's details.
- The minimap and map thumbnails paint the swamp green, as it looks on the board.

### Fixes
- The side of the board no longer flickers in stripes at the map edge or between height levels.
- Numbers on chips and floating texts no longer get stuck with a different font when a match starts.

## [0.13.1] - 2026-11-17 — Con los pies en el suelo

### Arreglos
- Las unidades ya no se quedan flotando al pulsar «Fin del turno» (E) varias veces seguidas.

<!-- en -->

### Fixes
- Units no longer stay floating when pressing «End turn» (E) several times in a row.

## [0.13.0] - 2026-11-17 — El tablero se lee

### Novedades
- **El tablero cuenta lo que pasa**: al elegir una unidad, losas azules hasta donde llega y un marco rojo en cada casilla a la que podría disparar. Bajo cada enemigo al que puede atacar sale una diana, y la casilla señalada lleva un cursor de cuatro esquinas. El camino es una flecha de bloques y la artillería enseña un arco de puntos hasta su blanco.
- **Quién te puede atacar**: al señalar una unidad tuya sale una flecha roja desde cada enemigo visible que podría alcanzarla en su turno. «Ver amenaza» es ahora un velo rojo con borde, que ya no se confunde con el mover.
- **Previsión en chapas**: al apuntar, el daño esperado sale encima del enemigo (dorado si lo más probable es destruirlo) y el contraataque encima de tu unidad. Con Alt sigue la tarjeta con todo el detalle.
- **La vida en tramos**: una unidad herida lleva su porcentaje y diez tramos debajo. Al apuntar, los tramos enseñan a rayas lo que perdería. Al recibir un golpe, lo perdido brilla en blanco y se encoge mientras el porcentaje baja.
- **Defensa y capturas a la vista**: la casilla señalada enseña sus estrellas de defensa como bloquecitos amarillos, y una captura a medias lleva los puntos que le faltan.
- **Comprar en abanico**: los retratos salen alrededor de la fábrica con su nombre y su precio. Lo que no puedes pagar sale apagado con lo que falta en rojo, y en el centro, los datos de la unidad señalada.
- **Retratos nuevos**: las unidades de la interfaz se dibujan desde sus modelos 3D, así que son las mismas que ves en el tablero.
- **Fin del turno avisa**: si quedan unidades sin mover, la primera pulsación las hace saltar y el botón pasa a «¿Terminar?»; la segunda termina.
- **La banderola del día**: cae una banderola del color del bando con el día y el clima si ha cambiado, y sobre cada edificio que cobra sale lo que da.
- **Explosiones**: las unidades destruidas estallan en una explosión de bloques con destello, fuego y cascotes, y los vehículos y aviones dejan sus restos quemados.
- **Unidades a escala**: un soldado ya no mide lo mismo que un tanque, y las unidades quedan por debajo de los edificios. Si comparten casilla, cada uno va a una esquina y se ven los dos.
- **Montañas en cordilleras**: el mapa levanta sierras en vez de acantilados sueltos, con un paso por lo más bajo si parten la tierra en dos. Se ven como macizos, con hierba, roca y nieve según la altura.
- **El mundo alrededor**: los islotes son pequeñas sierras con el mismo relieve que las montañas, y las nubes son bolas de bloques blancas y redondeadas.

### Cambios de juego
- **Sin generales**: casi no se usaban, así que se quitan con sus poderes y su barra de estrellas, también en la partida en línea.
- Las partidas guardadas de versiones anteriores no se pueden seguir.

### Rendimiento
- El tablero se dibuja con muchas menos llamadas, y los islotes con la mitad de triángulos: la partida va más suelta.

<!-- en -->

### New
- **The board tells you what's going on**: when you pick a unit, blue tiles show where it can go and a red frame marks every tile it could shoot at. A target ring appears under each enemy it can attack, and the hovered tile gets a four-corner cursor. The path is a block arrow, and artillery shows a dotted arc to its target.
- **Who can attack you**: hovering one of your units draws a red arrow from every visible enemy that could reach it on its turn. “Show threat” is now a red veil with an outline, no longer confused with movement.
- **Forecast on chips**: when aiming, the expected damage shows above the enemy (gold if it will most likely be destroyed) and the counterattack above your unit. Hold Alt for the full card.
- **Health in segments**: a damaged unit shows its percentage with ten segments below. When aiming, the segments it would lose are striped. When hit, the lost part flashes white and shrinks while the percentage counts down.
- **Defense and captures at a glance**: the hovered tile shows its defense stars as little yellow blocks, and a half-done capture shows the points it still needs.
- **Buying in a fan**: portraits spread around the factory with their name and price. What you can't afford is dimmed with the missing amount in red, and the hovered unit's stats sit in the middle.
- **New portraits**: interface units are drawn from their 3D models, so they match what you see on the board.
- **End turn warns you**: if units haven't moved, the first press makes them hop and the button turns into “End?”; the second ends the turn.
- **Day banner**: a banner in the side's color drops with the day and the weather if it changed, and each building that pays shows how much.
- **Explosions**: destroyed units burst in a blocky explosion with a flash, fire and debris, and vehicles and planes leave their burnt wrecks.
- **Units to scale**: a soldier is no longer as tall as a tank, and units stay smaller than buildings. When they share a tile, each goes to a corner so both can be seen.
- **Mountain ranges**: maps raise ranges instead of loose cliffs, with a pass at the lowest point if they would split the land. They look like massifs, with grass, rock and snow by height.
- **The world around**: islets are small ranges with the same relief as the mountains, and clouds are round white balls of blocks.

### Gameplay
- **No more generals**: they were barely used, so they are gone along with their powers and star bar, online too.
- Saved games from earlier versions can't be continued.

### Performance
- The board draws with far fewer calls, and the islets with half the triangles: matches run smoother.

## [0.12.0] - 2026-11-16 — Una interfaz de juguete y un mar alrededor

### Novedades
- **Interfaz nueva, «caja de juguete»**: fichas redondeadas de color crema con borde oscuro y letra redonda. En pantalla solo quedan cuatro cosas: el dinero (su desglose al pasar el ratón), el día con su clima, el menú y «Fin del turno», ahora abajo a la derecha. Su número dice cuántas unidades quedan sin mover, y pulsarlo lleva a la siguiente.
- **Sin menú de la unidad**: todo se hace tocando el tablero. Junto a la unidad elegida solo salen fichas para lo que no es un clic (capturar si ya está encima, bajar carga, reparar), y si no hay nada de eso, nada.
- **Esperar es automático**: la unidad que se mueve y ya no puede hacer nada espera sola, y la que dejas tras moverla también. Ctrl+Z deshace el movimiento aunque ya haya esperado. Se puede apagar en Opciones, «Esperar sola al soltar».
- **La rueda**: clic derecho (o mantener pulsado con el dedo) sobre una unidad o un grupo abre a su alrededor lo poco frecuente: esperar ahí, órdenes, escuadras (también elegir la escuadra entera), deshacer y disolver.
- **Órdenes con un clic derecho**: con algo elegido, clic derecho (o F) en otra casilla le da la orden que tiene sentido allí: atacar al enemigo, capturar el edificio o defender.
- **Comprar con retratos**: al tocar una fábrica sale una rejilla con cada unidad y su precio; las que no puedes pagar, en gris. Un toque compra y tocar fuera cierra.
- **Los datos cuando los pides**: al parar el ratón sobre una casilla sale a su lado una ficha con la unidad y el terreno (con el dedo, al tocarla); con Alt, todos los datos. La previsión de combate enseña lo justo y el resto con Alt.
- **Ver amenaza (T) en 3D**: marca en naranja a dónde pueden disparar los enemigos que ves. Está en el menú de la partida, junto a «Ver órdenes» (V).
- **Cielo y mar**: el tablero ya no flota sobre un fondo azul. Ahora es una isla en un mar que llega al horizonte, con bajíos claros, espuma en la orilla e islotes de bloques alrededor, bajo un cielo de dibujo animado con nubes de bloques. El cielo cambia con el clima: gris con lluvia, oscuro con tormenta, blanco con nieve y ocre con la tormenta de arena. La cámara se puede inclinar más para verlo.

### Interfaz
- El cartel del día, los avisos, la pausa, la pantalla final, las opciones y los menús de inicio tienen la misma estética nueva.
- Arrastrar con el botón derecho sigue girando la cámara; el clic derecho sin arrastrar es ahora la rueda o una orden.

<!-- en -->

### New
- **New “toy box” interface**: rounded cream chips with a dark outline and a round font. Only four things stay on screen: funds (hover for the breakdown), the day with its weather, the menu and “End turn”, now at the bottom right. Its number says how many units haven't moved, and tapping it goes to the next one.
- **No unit menu**: everything is done by clicking the board. Next to the selected unit only chips for what isn't a click appear (capture when already on it, unload, repair), and if there's none of that, nothing.
- **Waiting is automatic**: a unit that moves and can do nothing else waits by itself, and so does one you leave after moving it. Ctrl+Z undoes the move even after it waited. Turn it off in Options, “Wait automatically on drop”.
- **The wheel**: right-click (or press and hold with a finger) a unit or a group to open the rarely used actions around it: wait there, orders, squads (including picking the whole squad), undo and disband.
- **Orders with a right-click**: with something selected, right-click (or F) another tile to give the order that makes sense there: attack the enemy, capture the building or hold there.
- **Buying with portraits**: tapping a factory shows a grid of units with their price; the ones you can't afford are greyed out. One tap buys and tapping elsewhere closes it.
- **Details when you ask for them**: resting the mouse on a tile shows a small card next to it with the unit and the terrain (with a finger, tap it); hold Alt for everything. The combat forecast shows the essentials and the rest with Alt.
- **See the threat (T) in 3D**: tiles enemies you can see could shoot at turn orange. It's in the game menu, next to “Show orders” (V).
- **Sky and sea**: the board no longer floats on a flat blue background. It's now an island in a sea that reaches the horizon, with light shallows, foam along the shore and block islets around it, under a cartoon sky with block clouds. The sky changes with the weather: grey in rain, dark in storms, white in snow and ochre in sandstorms. The camera can tilt lower to see it.

### Interface
- The day banner, notices, pause, end screen, options and start menus share the new look.
- Dragging with the right button still turns the camera; a right-click without dragging is now the wheel or an order.

## [0.11.0] - 2026-11-16 — Órdenes, grupos y sonido

### Novedades
- **Efectos de sonido**: pasos, disparos, golpes, explosiones, capturas, menús, el principio de tu turno y el final de la partida. Cada sonido tiene varias versiones para que no suene siempre igual. Se apagan en Opciones, «Efectos de sonido».
- **Ves el camino antes de mover**: con una unidad elegida, al pasar el ratón por su alcance sale una flecha por el suelo con el camino y una copia transparente de la unidad donde llegaría. El camino sigue al ratón y la unidad va por él.
- **El clic hace lo que toca**: con una unidad elegida, un clic en un enemigo lo ataca (moviéndose antes si hace falta), en un edificio ajeno va a capturarlo, en un transporte sube y en una unidad igual se une. Ya no se abre un menú al mover: sale al lado una barra con solo lo que vale ahí (esperar, reparar, desembarcar, deshacer...). Esc deshace el movimiento.
- **Elegir varias unidades**: arrastra para dibujar un recuadro, Mayúsculas + clic suma o quita una y doble clic elige todas las de ese tipo. Con un grupo, un clic en un enemigo hace que le ataquen las que llegan, y en otra casilla las lleva allí.
- **Órdenes y escuadras en 3D**: atacar, capturar o defender en una casilla (también con Q, C, G y X), escuadras con nombre y grupos con número (Ctrl + número para guardarlo, el número para elegirlo). Las órdenes se cumplen al terminar el turno.
- **Ves lo que hará cada orden**: las unidades con orden llevan su letra encima, y al señalarlas se ve una flecha con su camino y a quién atacarán o qué capturarán. «Ver órdenes» (V) las enseña todas.

### Interfaz
- La cámara ya no se mueve arrastrando con el botón izquierdo (ahora dibuja el recuadro): se mueve con el botón central, WASD o llevando el ratón al borde de la pantalla. Con el dedo, arrastrar sigue moviéndola.

### Todavía no
- Aún no están en 3D: jugar en línea, el minimapa, los poderes de los generales y el tutorial.

<!-- en -->

### New
- **Sound effects**: footsteps, shots, hits, explosions, captures, menus, the start of your turn and the end of the game. Each sound has several versions so it doesn't always sound the same. Turn them off in Options, “Sound effects”.
- **See the path before moving**: with a unit selected, hovering over its range shows an arrow on the ground along the path and a see-through copy of the unit where it would end up. The path follows the mouse and the unit takes it.
- **One click does the right thing**: with a unit selected, clicking an enemy attacks it (moving first if needed), an enemy building goes to capture it, a transport boards it and a unit of the same type joins it. No more menu after moving: a bar beside it shows only what makes sense there (wait, repair, unload, undo...). Esc undoes the move.
- **Select several units**: drag to draw a box, Shift + click adds or removes one and double-click selects all of that type. With a group, clicking an enemy makes those in reach attack it, and clicking another tile sends them there.
- **Orders and squads in 3D**: attack, capture or hold at a tile (also with Q, C, G and X), named squads and numbered groups (Ctrl + number to save one, the number to select it). Orders are carried out when the turn ends.
- **See what each order will do**: units with an order carry its letter above them, and pointing at one shows an arrow along its path and whom it will attack or what it will capture. “Show orders” (V) shows them all.

### Interface
- Dragging with the left button no longer moves the camera (it now draws the box): move it with the middle button, WASD or by taking the mouse to the edge of the screen. With a finger, dragging still moves it.

### Not yet
- Still missing in 3D: online play, the minimap, generals' powers and the tutorial.

## [0.10.0] - 2026-11-15 — El juego en 3D

### Novedades
- **Todo en 3D**: el tablero es ahora un mundo 3D de juguete. Montañas y dunas con relieve, agua que se mueve, lluvia, nieve y tormentas de arena, y una cámara de estrategia: arrastra para moverla, botón derecho para girarla y rueda para acercarla.
- **Unidades y edificios nuevos**: las 19 unidades y los seis edificios, hechos de bloques con mucho detalle y del color de su bando. Se mueven: los soldados andan con su arma en las manos, las ruedas giran, los cañones retroceden al disparar, las hélices, los radares y los contrapesos de la bomba de petróleo giran, y las banderas ondean.

### Cambios de juego
- **Altura**: cada casilla tiene su altura (el agua abajo, las montañas arriba). Desde arriba se acierta más (+10 % por nivel) y desde abajo menos, se ve una casilla más lejos por nivel y subir cuesta un punto de movimiento más. A los aviones no les afecta.

### Interfaz
- La ayuda de la partida enseña los controles de la vista 3D. «Gráficos» pasa a llamarse «Dibujos de los paneles», que es lo que cambia, y se quita «Fondo del menú».

### Todavía no
- Algunas cosas del juego en 2D aún no están en 3D y volverán en próximas versiones: jugar en línea, escuadras y órdenes, elegir varias unidades con un recuadro, el minimapa, los poderes de los generales y el tutorial.
- Las partidas guardadas con versiones anteriores no se pueden seguir.

<!-- en -->

### New
- **Everything in 3D**: the board is now a toy 3D world. Mountains and dunes with relief, moving water, rain, snow and sandstorms, and a strategy camera: drag to move it, right button to turn it and the wheel to zoom.
- **New units and buildings**: all 19 units and the six buildings, made of blocks with lots of detail and in their side's colour. They move: soldiers walk with their weapon in their hands, wheels turn, guns recoil when firing, propellers, radars and the oil pump's counterweights spin, and flags wave.

### Gameplay
- **Height**: every tile has a height (water low, mountains high). Shooting from above hits more often (+10% per level) and from below less, you see one tile further per level, and climbing costs one more movement point. Aircraft don't care.

### Interface
- The in-game help shows the 3D view's controls. “Graphics” is now called “Panel pictures”, which is what it changes, and “Menu background” is gone.

### Not yet
- Some things from the 2D game are not in 3D yet and will come back in later versions: online play, squads and orders, selecting several units with a box, the minimap, generals' powers and the tutorial.
- Games saved with earlier versions can't be continued.

## [0.9.0] - 2026-11-07 — Teclas a tu gusto y edificios que vigilan

### Novedades
- **Teclas a tu gusto**: en Opciones → Controles puedes cambiar la tecla de cada orden del mapa (fin de turno, siguiente unidad, atacar, capturar, defender, amenaza, minimapa, zoom, ayuda...). Pulsa «Cambiar» y la tecla nueva; si ya la usa otra orden o es fija (flechas, Enter, números, Ctrl+Z), te lo dice. «Por defecto» vuelve a las de serie. La ayuda y los botones enseñan siempre tus teclas.
- **Opciones en pestañas** (Partida, Pantalla, Sonido e idioma, Controles): Q y E cambian de pestaña con el teclado.

### Cambios de juego
- **Los edificios vigilan**: con niebla, cada edificio tuyo descubre lo que hay a su alrededor. La Base y la fortaleza ven 3 casillas, las fábricas y los aeropuertos 2, las ciudades y los pozos 1. Capturar un edificio también sirve para ver más.

<!-- en -->

### New
- **Keys your way**: in Options → Controls you can change the key of every map command (end turn, next unit, attack, capture, hold, threat, minimap, zoom, help...). Press “Change” and the new key; if another command already uses it or it is fixed (arrows, Enter, numbers, Ctrl+Z), it tells you. “Reset” brings back the default keys. The help and the buttons always show your keys.
- **Options in tabs** (Game, Screen, Sound and language, Controls): Q and E switch tabs on the keyboard.

### Gameplay
- **Buildings keep watch**: with fog of war, each building you own reveals its surroundings. The HQ and the stronghold see 3 tiles, factories and airports 2, cities and oil wells 1. Capturing a building also widens your view.

## [0.8.0] - 2026-11-07 — Escuadras, órdenes y un rival que juega limpio

### Novedades
- **Escuadras con nombre y órdenes que duran**: da a una unidad o a una escuadra la orden de atacar, capturar, defender o ir a un sitio y la cumple turno a turno sin que la muevas. Unas **flechas** enseñan qué hará cada unidad con orden al terminar el turno, y las escuadras con la misma orden avanzan **en formación**.
- **Órdenes de escuadra**: una orden a toda la escuadra es de la escuadra. A solo algunas de sus unidades, esas van **destacadas** (raya naranja, y «2 destacadas» en el botón de la escuadra) y al cumplirla vuelven solas a la orden de la escuadra.
- **Ayudante**: deja unidades en automático y la **fábrica automática** compra por ti, con postura «Responder», dinero de reserva y resumen de lo comprado.
- **Puntos de control**: zonas de 3×3 en el centro del mapa que dan dinero cada ronda, pero solo si nadie te las disputa.
- **Varias personas en la misma pantalla**, por turnos, cada una con su cámara.
- **Rendirse** en cualquier momento, y salir mientras juega la IA.
- El botón de fin de turno avisa de las unidades que aún no han movido.

### Controles
- **Elegir unidades como en los juegos de estrategia en tiempo real**: recuadro arrastrando desde fuera de tus unidades (sin tecla), Mayúsculas + clic para añadir o quitar, doble clic (o Ctrl + clic) para todas las de ese tipo en pantalla y clic en vacío o Esc para soltar. Las elegidas llevan un aro a los pies.
- **Grupos con número**: Ctrl + 1…9 hace el grupo con lo elegido (es una escuadra), Mayúsculas + número añade, el número lo elige y pulsarlo dos veces lleva la cámara allí. El botón de la bandeja hace lo mismo.
- **Clic derecho que acierta solo**: con unidades elegidas, en una casilla libre las mueve, en un enemigo ataca, en un edificio captura, en un transporte sube y, fuera del alcance de una sola unidad, va allí en varios turnos. El puntero del ratón dice qué hará (y prohibido si no puede). Mayúsculas + clic derecho lo deja como orden sin mover nada ahora; Alt + clic derecho (o F, o mantener pulsado) abre el menú con todas las acciones, también «Formar escuadra» y «Sacar de la escuadra». El grupo sigue elegido después.
- Las órdenes y las escuadras también se manejan **con el dedo**.
- La cámara se mueve arrastrando con el botón derecho o la rueda (además del borde de la pantalla).
- Al señalar una unidad de escuadra se marcan sus compañeras.
- **Panel de lo elegido**: con varias unidades elegidas, abajo salen sus retratos por tipo con su vida. Clic en uno elige solo esa, Mayúsculas + clic la quita y Ctrl + clic deja solo las de su tipo. Tab va pasando por ellas.
- **Teclas de orden**: Q atacar, C capturar y G defender, y luego la casilla (clic o Enter); X quita la orden. (A, D y S siguen moviendo el cursor.)

### Cambios de juego
- **La IA juega limpio**: decide solo con lo que ve su equipo y ya no esquiva unidades escondidas en la niebla. Lo mismo las órdenes que cumplen tus unidades: no te delatan a un enemigo que no ves.
- **La IA, más dura**: concentra el fuego para rematar y deja paso a sus aliados.
- Atacar exige ver al objetivo y poder hacerle daño.
- Si empiezas a capturar a mano con una unidad que tenía orden, la acaba en vez de irse el turno siguiente.
- Deshacer un movimiento que ha descubierto enemigos ya no se puede.
- Con tres o más equipos, la partida acaba bien y avisa de cada equipo que cae.
- **Las partidas guardadas con versiones anteriores no se pueden cargar** en esta.

### Equilibrio
- **Motorizado** 3500 → 2500, **Jeep** 5000 → 4000 y **Tanque anfibio** 15000 → 11000: rendían menos de la mitad de lo que costaban.
- **Caza ligero** 12000 → 15000: rendía casi el doble de lo que costaba.
- **Generales más igualados**: el ataque aéreo de Brisa hace 20 de daño (antes 30) y cuesta 6★; la reparación de Roca cura 8 (antes 10) y cuesta 5★; la ventaja en tierra de Ámbar sube del 7 % al 15 %.

### Arreglos
- Las **partidas guardadas** se cargan con las reglas con las que se jugaban (niebla, clima, mantenimiento, puntos de mando...), y las de una **misión**, siempre con las de esa misión.
- Tab vuelve a saltar de unidad en el mapa y de botón en la pantalla final, también con Mayúsculas + Tab.
- «Atrás» ya no pierde una captura a medias, e irse de un edificio a medio capturar ya no estropea Ctrl + Z.
- El poder de curar del general ya no cura a las unidades que van en un transporte.
- Unirse o subir a un transporte ya no se salta la zona de control.
- Subir, unirse o atacar a mano también acaban el viaje de una unidad.
- El juego en un solo fichero (`ilogic.html`) ya no estropea partes de la interfaz.

<!-- en -->

### New
- **Named squads and lasting orders**: tell a unit or a squad to attack, capture, hold or go somewhere and it carries it out turn after turn without you moving it. **Arrows** show what each unit with an order will do at the end of the turn, and squads with the same order move **in formation**.
- **Squad orders**: an order to a whole squad belongs to the squad. To only some of its units, those go **detached** (orange stripe, and "2 detached" on the squad button) and rejoin the squad's order once done.
- **Helper**: put units on automatic, and the **automatic factory** buys for you, with a "Respond" stance, a cash reserve and a summary of what it bought.
- **Control points**: 3×3 areas in the middle of the map that pay every round, but only while nobody contests them.
- **Several people on the same screen**, taking turns, each with their own camera.
- **Surrender** at any moment, and leave while the AI is playing.
- The end-turn button warns about units that have not moved yet.

### Controls
- **Select units like in real-time strategy games**: drag a box from outside your units (no key needed), Shift + click adds or removes, double-click (or Ctrl + click) picks all of that type on screen, and clicking empty ground or Esc clears. Selected units have a ring at their feet.
- **Number groups**: Ctrl + 1…9 makes the group from the selection (it is a squad), Shift + number adds, the number selects it and pressing it twice moves the camera there. The tray button does the same.
- **Smart right-click**: with units selected, a free tile moves them, an enemy is attacked, a building is captured, a transport is boarded and, out of a single unit's range, it goes there over several turns. The mouse pointer shows what will happen (or a no-entry sign). Shift + right-click leaves it as an order without moving now; Alt + right-click (or F, or a long press) opens the menu with every action, including "Form squad" and "Leave the squad". The group stays selected afterwards.
- Orders and squads also work **by touch**.
- Pan the camera by dragging with the right button or the wheel (besides the screen edge).
- Pointing at a squad unit highlights its squadmates.
- **Selection panel**: with several units selected, their portraits appear at the bottom by type with their health. Click one to select only it, Shift + click removes it and Ctrl + click keeps only its type. Tab goes through them.
- **Order keys**: Q attack, C capture and G hold, then the tile (click or Enter); X clears the order. (A, D and S still move the cursor.)

### Gameplay
- **The AI plays fair**: it decides only from what its team can see and no longer dodges units hidden in the fog. The same goes for the orders your units carry out: they never give away an enemy you can't see.
- **A tougher AI**: it focuses fire to finish units off and makes way for its allies.
- Attacking requires seeing the target and being able to damage it.
- If you start a capture by hand with a unit that had an order, it finishes it instead of leaving next turn.
- A move that revealed enemies can no longer be undone.
- With three or more teams, the match ends properly and announces every team that falls.
- **Games saved with earlier versions can't be loaded** in this one.

### Balance
- **Motor trooper** 3500 → 2500, **Jeep** 5000 → 4000 and **Amphibious tank** 15000 → 11000: they were worth less than half their price.
- **Light fighter** 12000 → 15000: it was worth almost twice its price.
- **More even generals**: Brisa's air strike deals 20 damage (was 30) and costs 6★; Roca's repair heals 8 (was 10) and costs 5★; Ámbar's land bonus goes from 7 % to 15 %.

### Fixes
- **Saved games** load with the rules they were played with (fog, weather, upkeep, command points...), and a **mission** always with that mission's rules.
- Tab again jumps between units on the map and between buttons on the end screen, Shift + Tab too.
- "Back" no longer loses a half-done capture, and leaving a building mid-capture no longer breaks Ctrl + Z.
- The general's heal power no longer heals units riding in a transport.
- Joining or boarding a transport no longer skips the zone of control.
- Boarding, joining or attacking by hand also ends a unit's trip.
- The single-file game (`ilogic.html`) no longer breaks parts of the interface.

## [0.7.1] - 2026-10-31 — Polvo en los ojos

### Arreglos
- La **tormenta de arena** por fin se ve: rayas claras que cruzan toda la pantalla, un velo ocre y nubes de polvo. Antes las rayas eran del color de la arena y al poco rato se juntaban todas arriba.

<!-- en -->

### Fixes
- The **sandstorm** is finally visible: pale streaks across the whole screen, an ochre haze and drifting dust clouds. Before, the streaks were sand-coloured and soon bunched up at the top of the screen.

## [0.7.0] - 2026-10-31 — A la ofensiva

Atacar por fin sale a cuenta: rematar da dinero, atacar en grupo da puntería y el enemigo ya no se cura gratis bajo tu fuego.

### Cambios de juego
- **Botín.** Al destruir una unidad cobras el 25 % de su precio (lo ves caer en dorado sobre el mapa).
- **Flanqueo.** Contra una unidad que ya ha recibido un ataque ese día aciertas un 15 % más: ataca en grupo.
- **Bajo fuego.** Una unidad que ha recibido un ataque ese día no se cura esa noche, aunque esté en una ciudad. Lleva una señal roja abajo a la izquierda y su ficha lo avisa.
- **Veteranía más fuerte.** Cada estrella da ahora +10 % de acierto y de defensa (antes +5 %): a una veterana dañada le compensa curarse antes que comprar otra.
- La **previsión de combate** enseña el flanqueo y el botín antes de atacar.
- **Jeep — Explorador:** ve a las unidades escondidas en bosque, montaña o ciudad dentro de su visión, sin estar al lado.
- **Motorizado — Captura rápida:** captura edificios 1,5 veces más rápido que el resto de la infantería.

### Gráficos
- **Combates y movimientos nuevos.** Las unidades miran a quien atacan y cada una dispara lo suyo (balas, proyectil, parábola de artillería, misil, bombas); la víctima destella y al caer deja restos y una marca quemada durante dos días. Al moverse aceleran y frenan, la infantería da saltitos y los vehículos levantan polvo.
- Los combates son **más rápidos**: un ataque pasa de 2,7 s a 1,5 s, y con contraataque de 4,6 s a 2,3 s.
- La flecha de movimiento se vuelve roja cuando soltar ahí ataca.
- Las unidades rojas ya no giran al revés al moverse.
- Arreglada la «fi» de los textos, que salía como «A» («edifAcios»).

<!-- en -->

Attacking finally pays: finishing units off earns money, attacking together improves your aim and the enemy no longer heals for free under your fire.

### Gameplay
- **Bounty.** Destroying a unit pays you 25% of its price (you see it pop up in gold on the map).
- **Flanking.** Against a unit that has already been attacked that day you hit 15% more often: attack together.
- **Under fire.** A unit attacked that day does not heal that night, even in a city. It shows a red mark at the bottom left and its card warns you.
- **Stronger veterancy.** Each star now gives +10% hit chance and defence (was +5%): a damaged veteran is worth healing rather than replacing.
- The **combat forecast** shows flanking and bounty before you attack.
- **Jeep — Scout:** sees units hidden in woods, mountains or cities within its vision, without being next to them.
- **Motorized — Fast capture:** captures buildings 1.5 times faster than other infantry.

### Graphics
- **New combat and movement animations.** Units face their target and each fires its own projectile (bullets, shell, artillery arc, missile, bombs); the victim flashes and leaves wreckage and a scorch mark for two days. Units speed up and slow down when moving, infantry hop and vehicles kick up dust.
- Combat is **faster**: an attack goes from 2.7 s to 1.5 s, and with a counterattack from 4.6 s to 2.3 s.
- The movement arrow turns red when dropping there attacks.
- Red units no longer turn the wrong way when moving.
- Fixed the Spanish texts where «fi» showed up as «A».

## [0.6.0] - 2026-10-31 — Al mando

Llegan los generales: elige uno al empezar la partida y úsalo en el momento justo.

### Novedades
- **Generales.** En «Nueva partida» eliges general para ti y para el enemigo. Cada uno tiene una ventaja fija, una **barra de estrellas** que se llena con el daño que haces y el que recibes, y **habilidades** que la gastan (una por turno):
  - **Brisa, coronel del aire:** sus aviones aciertan un 10 % más. **Reconocimiento** (2★): ves todo el mapa hasta el final de la ronda. **Ataque aéreo** (5★): los enemigos en un cuadrado de 3×3 pierden 30 de vida (nunca los destruye).
  - **Roca, general de blindados:** sus vehículos reciben un 5 % menos de daño. **Reparación** (4★): todas sus unidades recuperan 10 de vida.
  - **Ámbar, intendente:** sus tropas de tierra aciertan un 7 % más. **Reconocimiento** (2★) y **Suministros** (4★): 6000 de dinero al momento.
- **La IA también usa a su general**, y su panel arriba a la derecha avisa de cuándo puede usar sus habilidades.

### Gráficos
- La **vida de las unidades** en el mapa se lee mejor: cifras nítidas con la letra del juego, en vez de los números de 2013, que se veían borrosos y aplastados.

<!-- en -->

Generals are here: pick one when you start a match and use it at the right moment.

### New
- **Generals.** In "New game" you choose a general for yourself and for the enemy. Each one has a fixed advantage, a **star bar** that fills with the damage you deal and take, and **abilities** that spend it (one per turn):
  - **Brisa, Air Colonel:** her planes hit 10% more often. **Recon** (2★): you see the whole map until the end of the round. **Air strike** (5★): enemies in a 3×3 square lose 30 health (it never destroys them).
  - **Roca, Armor General:** his vehicles take 5% less damage. **Repair** (4★): all his units recover 10 health.
  - **Ámbar, Quartermaster:** her ground troops hit 7% more often. **Recon** (2★) and **Supplies** (4★): 6000 money right away.
- **The AI uses its general too**, and its panel at the top right warns you when it can use its abilities.

### Graphics
- **Unit health** on the map is easier to read: sharp numbers in the game's font instead of the 2013 ones, which looked blurry and squashed.

## [0.5.0] - 2026-10-31 — A dos toques

Jugar con el dedo cuesta menos toques, y varios arreglos para el móvil.

### Interfaz
- **Mover con el dedo en dos toques:** toca tu unidad y luego adónde ir; si no hay nada más que hacer, espera sola (antes eran cuatro toques y el menú). Para atacar, toca el enemigo dos veces: la primera enseña la previsión. También se puede arrastrar la unidad sin mantener pulsado, y tocar una fábrica libre abre la compra al momento.
- En el móvil, la **bandeja de unidades sin mover** y las **fichas de unidad y terreno** se pliegan y despliegan tocándolas, para dejar más mapa a la vista.

### Arreglos
- En el móvil, el **desglose del dinero y del día** se cierra al volver a tocarlo, y en horizontal ya no se sale de la pantalla (se desplaza dentro).
- El icono de **visión** ya no se sale de la ficha de la unidad en pantallas estrechas.
- Las **cifras** del texto ya no confunden el 5 con el 8 ("Fondos: 5000" se leía "8000").
- En el móvil, el texto de la **ayuda** ya no se corta por la derecha.
- Las teclas del juego ya no se disparan junto con los atajos del navegador: Ctrl+T abría una pestaña y a la vez enseñaba la amenaza.

<!-- en -->

Playing with your finger takes fewer taps, plus several fixes for phones.

### Interface
- **Move with your finger in two taps:** tap your unit, then where to go; if there is nothing else to do, it waits on its own (it used to take four taps and the menu). To attack, tap the enemy twice: the first tap shows the forecast. You can also drag a unit without holding first, and tapping a free factory opens the shop right away.
- On phones, the **unmoved units tray** and the **unit and terrain cards** fold and unfold with a tap, leaving more of the map in view.

### Fixes
- On phones, the **money and day breakdown** closes when tapped again, and in landscape it no longer runs off the screen (it scrolls inside).
- The **vision** icon no longer sticks out of the unit card on narrow screens.
- **Numbers** in text no longer mix up 5 and 8 ("Funds: 5000" looked like "8000").
- On phones, the **help** text is no longer cut off on the right.
- Game keys no longer fire together with browser shortcuts: Ctrl+T opened a tab and showed the threat at the same time.

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
