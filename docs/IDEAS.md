# Ideas pendientes

Lista viva de lo que se ha hablado para Ilogic y aún no está hecho (o se descartó, y por qué). Se
actualiza al terminar cada cosa: lo hecho sale de aquí y va a las notas de versión (`CHANGELOG.md`).

Estado a 19 de noviembre de 2026, con la versión 0.13.1 publicada y, aún sin versión, que el
tablero se lea mejor: siluetas de las unidades tapadas, contorno en la elegida y la señalada,
minimapa en 3D (siempre abierto, con los colores del tablero y que crece al señalarlo), decorado
más pequeño y la cámara de partida más cerca. Ahora el foco es que la vista 3D tenga lo que tenía
el 2D, con su forma por sistemas (`docs/ARQUITECTURA.md`, "Vista 3D"), y un núcleo PvE bueno; el
PvP, después.

## En marcha

- **Una IA más humana** (planes que duran, mapas de influencia, memoria, personalidades y
  dificultad): plan por fases en `docs/PLAN-IA.md`, para revisar antes de tocar código. Recoge
  también las ideas 1 (partidas que acaben) y 3 (dificultad).

## Vista 3D (lo que tenía el 2D y aún falta)

El juego pasó de 2D (Phaser) a 3D (three.js, `src/view3d/`). Las reglas, la IA y la interfaz HTML
son las mismas, pero la vista 3D aún no deja hacer todo. La ayuda de la partida solo cuenta lo que
ya hace la vista 3D: al portar cada cosa, añadir su fila (`src/i18n/*/help.ts`).

19. **Tutorial y paneles de misión.**
20. **Varias personas en la misma pantalla** (el aviso de cambio de jugador), repetir el turno
    enemigo y guardado automático.
21. **El dedo:** pellizcar para acercar y girar con dos dedos (`docs/PLAN-MOVIL.md`).
22. **Laboratorio de animaciones** (se quitó con el 2D; para los modelos está `units3d.html`) y fondo
    vivo del menú (se quitó también su opción).
24. **Edificios con explanada delante** (como en Advance Wars): rehacer los seis en Ashfox ocupando
    la mitad de atrás de la casilla, para que la unidad de encima quede delante sin tener que
    encogerlos ni moverlos a una esquina (ahora lo hace `sharedTile.ts`). Para cuando se retoquen los
    modelos; no corre prisa (`docs/ESTETICA.md`, «Tamaños en el tablero»).

## Vida en los biomas

El pantano (luciérnagas, ranas), el bosque (hojas, ardillas, ciervos, pájaros), el desierto
(remolinos, lagartijas, bolas rodadoras, buitres), la nieve (copos que brillan, pingüinos, focas) y la
llanura (mariposas, conejos, peces, bandadas en V) ya tienen la suya y el sistema común está hecho
(`src/view3d/engine/life/`; cómo se ve, `docs/ESTETICA.md`, «Lo que vive en cada bioma»). Falta, cada
cosa en su PR:

29. **Pantano:** libélulas y burbujas en el agua turbia.
30. **Que reaccionen a la partida:** los pájaros salen volando cuando una unidad entra en el bosque,
    las ranas se tiran al agua si pasa un tanque y los pingüinos se deslizan al acercarse alguien.
    Los sucesos (`systems/events/`) avisan al motor por un puerto (algo como
    `life.disturb(casilla)`), sin que el motor sepa de reglas.

## Jugabilidad

1. **Romper el atasco IA contra IA.** Con la IA en grupo (#51) sigue ~88 % sin ganador al día 60
   (objetivo: 15-25 días). Pista: con el tope de puntos de mando el dinero se amontona (100.000+ sin
   gastar el día 40), perder unidades sale casi gratis y la Base se defiende sola. Probar junto con
   ejércitos más pequeños (2) y un asalto escoltado a la Base.
2. **Ejércitos más pequeños.** Bajar los puntos de mando de 30 a ~20 para que cada unidad pese más y
   haya menos que mover. Medir antes con `npm run balance`.
3. **Dificultad en «Nueva partida».** Fácil: la IA empieza con menos dinero y sin
   curarse. Normal: como ahora.
4. **Modo Escaramuza.** Mapa pequeño (12×12), menos dinero, partidas de ~10 días.
5. **Más puntos de control o con otras recompensas.** Ahora dan dinero; podrían dar visión. Ver cómo se juegan primero (PR #47).

## Equilibrio

10. **Unidades.** `npm run balance` dice que el Soldado (1,6×) y el Caza ligero (2×) rinden demasiado
    para lo que cuestan, y el Jeep (0,4×) y el Motorizado (0,3×) muy poco. Propuestas de la
    herramienta: Soldado 1500 → 2000, Jeep 5000 → 4000, Caza ligero 12000 → 15000.

## PvP (más adelante: primero un núcleo PvE bueno)

El juego por turnos le va bien al PvP asíncrono, y el núcleo ya ayuda: es determinista con semilla
(los dados van en la partida), la partida es JSON, se puede repetir un turno y todo lo que hace un
jugador es una acción (datos) que pasa por `dispatch`, con sucesos completos: lo que mandaría y
recibiría un cliente. Por fases, para no apostarlo todo de golpe:

14. **Dos jugadores en el mismo dispositivo** (pasarse el móvil): casi gratis de hacer, y sirve para
    probar el equilibrio entre personas.
15. **Partidas con amigos por enlace o código**, asíncronas, con aviso cuando te toca. **En marcha**,
    en tres PR: (1) el núcleo habla por la red, sin servidor (hecho: `src/core/net`, ver
    `docs/ARQUITECTURA.md`, "Red": el protocolo como datos, la sala `Room` sobre una `GameSession`,
    la niebla de los sucesos y la vista del cliente); (2) el servidor, en Cloudflare Workers con un
    Durable Object por sala o en Node para alojarlo uno mismo (la misma sala, `HostedRoom`), que
    guarda la sala (`snapshot`/`restore`), lleva los tiempos y manda a cada uno solo lo que ve
    (hecho: `server/`); (3) la pantalla: crear una partida, unirse con su
    código o su enlace, «Mis partidas» con el estado de cada una (te toca, turno del rival,
    esperando, acabada) y jugar desde la vista y los sucesos que llegan (hecho: `src/net`, «Jugar en línea»;
    ver `docs/ARQUITECTURA.md`, "Red" → "Cliente"; en la vista 3D, `OnlinePlay`). «Buscar rival»
    también está (por turnos o en vivo; 1 contra 1, reglas normales y mapa al azar: un emparejador
    en el servidor, `server/src/matchmaker.ts`). Queda: pedir asiento con el código,
    `POST /rooms/:code/seat`, sin tope por IP (quien sabe el código de una sala que espera puede
    gastar sus asientos libres, y el código es el único secreto; las de la búsqueda no se reparten,
    pero su código sale en «Mis partidas» de los dos), la cuenta atrás del reloj por turno en la
    pantalla, avisos fuera de la pestaña (notificaciones del navegador: más aún con «Buscar rival»
    por turnos, que empieza sin que estés) y que el final sepa las cuentas de todos: cada uno solo ve las suyas
    (`withoutBooks`, `core/playerView.ts`), así que en la pantalla final las del rival salen a 0 y
    su gráfica del valor del ejército solo tiene el último día; al acabar ya no hay nada que
    esconder y la sala podría mandar la partida entera. Decidido: el servidor manda (las acciones pasan por la sesión
    como las de cualquiera, la IA rival y los dados juegan allí) y un cliente nunca recibe más que la
    vista de su equipo (si no, se puede mirar a través de la niebla). Las clasificatorias, después.
17. **Clasificatorias** (emparejamiento, Elo, temporadas): solo si lo anterior consigue jugadores.
18. **Repensar la interfaz del juego en línea** (`src/menu/online/`: crear, unirse, sala): darle una
    vuelta al aspecto y al recorrido de las pantallas, para que encajen con el menú 3D.

Para competir hará falta: equilibrio estricto, mapas simétricos o probados (los de azar
dan algo de ventaja a una salida) y quizá una opción "sin azar" en el daño. El PvE se queda: enseña a
jugar y es lo que hay cuando no hay rival.

## Monetización (si llega)

Sin pagar para ganar, sobre todo con PvP: nada que afecte a la partida se vende suelto.
- **Lo más limpio:** web gratis como demo (parte de la campaña y escaramuza) y pago
  único por la versión completa en itch.io, Steam (aplicación de escritorio) o Google Play (la app
  instalable envuelta). En la web es casi imposible cobrar: el juego es un fichero que se copia.
- **Después:** expansiones de campaña (misiones nuevas), y cosméticos (aspectos de unidades, colores,
  temas de mapa, el estilo 2013 como pack).
- **Nunca:** cajas de botín o gacha, monedas premium, energía, anuncios que cortan la partida.
- Antes de cobrar: derechos del Ilogic original, facturación e IVA.

## Sonido

- **Bucles de unidades paradas**: el rotor del helicoptero, el fuego de las muy dañadas, el radar del
  antiaereo (un emisor mas del ambiente, que se mueve con su pieza).
- **Musica**: `enemy_turn` mientras juega el rival y jingles de victoria y derrota en vez de los efectos
  (`MusicTrack`, `src/audio/music.ts`).
- **Sonidos en linea** (`room_created`, `player_joined`...): ya tienen nombre en `soundNames.ts`;
  falta que la partida en linea llegue a 3D.
- **Mas momentos con sonido**: subir de rango, el botin, la torreta del aerodeslizador... (inventario en
  `docs/PLAN-SONIDO.md`).
- **El trueno de las tormentas.** El relampago ya pide su trueno, lejos y algo despues
  (`ambiencePlayer.lightning`), pero `thunder` sigue sin sonido elegido (`null` en `soundNames.ts`):
  generar varios (cercano seco, lejano que retumba) y que se note la tormenta.
- **Los animales se callan con el mal tiempo.** Con lluvia, tormenta, nevada o tormenta de arena, los
  ambientes de zona con animales (pajaros del bosque, ranas del pantano...) bajan o se apagan, y vuelven
  poco a poco al despejar; con un trueno cerca, silencio de golpe unos segundos. Lo decide el sistema de
  sonido (`systems/sound/ambience.ts`) con el clima del dia, sin que el motor sepa de reglas.
- **Sonidos de los animales.** Dar a la vida de los biomas (`engine/life/`) sus propios sonidos sueltos
  y con sitio: el croar de la rana, el graznido del buitre, el aleteo de la bandada, la foca... que
  suenen de vez en cuando desde donde esta el animal, ademas del bucle de la zona.
- **Repensar los sonidos de las personas y los coches.** Las voces (`voice_ack_*`, `voice_hurt`...) y
  los motores de los vehiculos: revisar cuales faltan, cuales cansan al repetirse y si piden variantes o
  menos volumen.

## Técnico

11. **Tab en la pantalla final.** Mirar si Tab funciona (en la pantalla final no mueve la selección, ni antes del cambio).
12. **Mando (gamepad).** Un adaptador más en `src/controls`; el hueco queda preparado en la PR #50
    (`docs/ARQUITECTURA.md`, «Mandos»).
31. **Migrar las partidas guardadas al publicar.** Hoy un cambio de formato sube `SAVE_VERSION` y las
    partidas de antes se descartan (`core/saveVersion.ts`): vale mientras el juego no ha salido. Con
    jugadores, perder su partida al actualizar es un fallo; antes de la 1.0, decidir si se migra
    (una función por versión, probada con `tests/fixtures/saves`) o se avisa.
32. **La partida 3D como clase.** `playMatch` (`view3d/app/match3d.ts`) aún tiene unas 260 líneas: lo
    que queda se conecta entre sí (publicar, la sesión, las órdenes, la pausa, la entrada). Una clase
    `Match3d` con un método por cosa lo partiría sin parámetros enormes; hay que probarla jugando.
33. **Un solo puntero.** `controls/pointer.ts` (`PointerGestures`, puro y con test) y
    `view3d/systems/input/pointerInput.ts` hacen lo mismo dos veces; pasar la vista 3D al primero
    (y con él, el pellizco de la idea 21).
34. **Funciones largas que quedan** (más de 40 líneas, todas de la interfaz): `Minimap`, `Help`,
    `CreateRoom`, `RenameSquad`, `showEndIfOver`, `buildTerrain` y dos de `menuFlow.ts` y
    `matchScene.ts`. Cuando se toquen, partirlas; luego se puede poner `max-lines-per-function` en
    ESLint como ya está `max-depth`.

## Descartado (y por qué)

- **Fábrica automática** (comprar sola al terminar el turno, con posturas, reserva y resumen): llenaba
  el mapa de unidades que luego había que mover y se gastaba el dinero. Saber qué comprar es parte
  del juego: si compras mal, lo pagas.
- **«Comprar otra vez»** (repetir la última compra a un toque): comprar no es un problema que haya que
  resolver.
- **Consejero** (botón «¿Qué hago?» que marca la mejor jugada): no gustó.
- **Piloto automático** (la IA juega tu turno entero): sería ver a la IA jugar contra sí misma.
- **«Auto» sin destino y «defender aquí» suelto:** sustituidos por las órdenes con destino de #46;
  costaba entender qué hacían.
- **Curar cuesta dinero:** se entiende mal que te quiten dinero sin hacer nada; en su lugar, «bajo
  fuego» (quien recibe un ataque no se cura esa noche).
- **Rediseño del móvil V1-V5:** en un móvil real se veía peor que antes (márgenes negros, textos
  montados). Solo se quedaron dos arreglos (letra 5/8 y la ayuda cortada).
- **Interfaz «Bandeja de juguetes»** (dirección B del plan de la interfaz 2, al estilo Polytopia):
  mete una pieza más que sube y baja. Se eligió la «mesa de juego» (`docs/PLAN-INTERFAZ-2.md`).
- **Interfaz «Cuartel del general»** (dirección C, al estilo Advance Wars y Fire Emblem): vuelve a
  poner información fija en pantalla, justo lo que se quitó en la 0.12.0.
- **Generales** (un general por equipo, con una ventaja fija, una barra que se cargaba con el combate y
  poderes como el ataque aéreo o el reconocimiento): casi no se usaban y la IA apenas los aprovechaba.
  Se quitaron del juego; siguen en el historial de git si algún día vuelven.
- **Barra de vida en las unidades:** con las cifras nuevas de la letra del juego se lee bien; no hace
  falta.
- **Edificio semitransparente con una unidad encima:** se probó y quedaba un borrón; en su lugar,
  unidad y edificio a esquinas distintas de la casilla.
- **Infantería en pelotón** (2 o 3 soldaditos, como en Wargroove): se perdería el soldado chibi con
  detalle, que es el estilo del juego; con las unidades más pequeñas ya se lee bien.
- **Peana del color del equipo bajo cada unidad** (como una figurita, para que no se confunda con lo
  que tiene detrás de su color): se probó y no gustó.
- **Casillas más grandes:** en 3D es encoger todo lo de encima y acercar la cámara. Con la misma
  cámara las unidades quedaban demasiado pequeñas; acercándola cabía mucho menos mapa, y el relieve
  no cambia. Lo que sí daba claridad era que el decorado tapara menos (se encogió al 0,82) y empezar
  con la cámara algo más cerca (`docs/ESTETICA.md`).
- **Botón para abrir y cerrar el minimapa:** mejor siempre abierto (también en el móvil) y que crezca
  al pasar el ratón o al tocarlo; la tecla M lo sigue cerrando.
