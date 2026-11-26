# Ideas pendientes

Lista viva de lo que se ha hablado para Ilogic y aún no está hecho (o se descartó, y por qué). Se
actualiza al terminar cada cosa: lo hecho sale de aquí y va a las notas de versión (`CHANGELOG.md`).

Estado a 26 de noviembre de 2026, con la versión 0.18.0 publicada: el juego en línea ya está
(«Jugar en línea» y «Buscar rival»; lo que le falta, en la idea 15). El foco sigue siendo que la
vista 3D tenga lo que tenía el 2D, con su forma por sistemas (`docs/ARQUITECTURA.md`, "Vista 3D"),
y un núcleo PvE bueno.

## Plan escrito, sin empezar

- **Una IA más humana** (planes que duran, mapas de influencia, memoria, personalidades y
  dificultad): plan por fases en `docs/PLAN-IA.md`, para revisar antes de tocar código. Recoge
  también las ideas 1 (partidas que acaben) y 3 (dificultad).

## Vista 3D (lo que tenía el 2D y aún falta)

El juego pasó de 2D (Phaser) a 3D (three.js, `src/view3d/`). Las reglas, la IA y la interfaz HTML
son las mismas, pero la vista 3D aún no deja hacer todo. La ayuda de la partida solo cuenta lo que
ya hace la vista 3D: al portar cada cosa, añadir su fila (`src/i18n/*/help.ts`).

19. **Tutorial y paneles de misión.** Las piezas están (el panel, `hud/game/MissionPanel.tsx`, y
    los pasos del tutorial, `campaign.ts`), pero la partida 3D nunca rellena `mission` en la
    interfaz: hoy el objetivo solo sale en la pausa.
20. **Repetir el turno enemigo**: con el registro de la sesión (`replaySession`), como hacía el 2D.
21. **El dedo:** el pellizco está hecho (`controls/gestures/pinch.ts`, dentro de `PointerGestures`),
    pero la vista 3D usa su propio `pointerInput.ts` y no lo tiene (idea 33). Girar con dos dedos,
    aún no (`docs/PLAN-MOVIL.md`).
22. **Laboratorio de animaciones** (se quitó con el 2D; para los modelos está `units3d.html`).
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
2. **Ejércitos más pequeños.** La partida «Rápida» ya va con 20 puntos de mando (`PRESETS`,
   `src/setup.ts`); falta decidir si la Normal baja de 30 a ~20, para que cada unidad pese más y
   haya menos que mover. Medir antes con `npm run balance`.
3. **Dificultad en «Nueva partida».** Fácil: la IA empieza con menos dinero y sin
   curarse. Normal: como ahora.
4. **Partidas aún más cortas.** «Rápida» ya es 20×20 con 20 días; queda un mapa pequeño (12×12),
   con menos dinero, para partidas de ~10 días.

## Campaña: la guerra por el mapamundi

35. **La campaña como una guerra entera, no misiones sueltas.** Idea del usuario (24-11-2026); los
    conceptos de pantalla están en el lienzo de diseño «Ilogic · Rediseño de Jugar en línea», página
    «Campaña: mapamundi».
    - **El mapamundi**: el mundo partido en territorios (regiones), cada uno de un bando o neutral.
      Cada territorio es un mapa de batalla. Lo que se gana o se pierde se pinta en el mapamundi.
    - **Turnos de guerra**: en cada uno se elige qué territorio atacar (uno vecino de los tuyos) o
      dónde defender, y se juega esa batalla con las reglas de siempre.
    - **Recursos**: cada territorio da presupuesto por turno de guerra; las **capitales** dan mucho
      más. El presupuesto se gasta en el **cuartel general** (decidido), al estilo de Heroes &
      Generals.
    - **Equipos, no unidades sueltas** (decidido): se compran grupos con nombre y composición fija
      (Infantería: 4 soldados y 2 bazucas; Blindados: 2 tanques y 1 tanque ligero; Artillería;
      Reconocimiento…) y se asignan a los frentes (atacar, defender, guarnición). En la batalla son
      sus unidades de siempre; el equipo solo existe en la capa de la guerra. La veteranía es del
      equipo, que sube de nivel ganando batallas, y cuesta mantenimiento por turno de guerra.
    - **La fábrica como entrada de refuerzos** (propuesta): cada equipo trae unidades en el campo y
      otras en reserva; en la batalla no se compra con dinero, la fábrica o la Base saca unidades de
      la reserva de tus equipos, hasta que se acaba. Al volver, las bajas se pagan con el presupuesto
      (reabastecer).
    - **Líneas de suministro** (decidido; al usuario le encanta): un territorio sin camino de
      territorios propios hasta tu capital queda aislado y no puede reabastecer a sus equipos.
      Cortar el frente enemigo por el medio es una jugada en sí, sin ir a por su capital; y lo mismo
      te lo puede hacer la IA.
    - **Moverse cuesta turnos de guerra** (decidido): un equipo avanza un territorio por turno y,
      mientras viaja, no combate; en el mapamundi se ve con su flecha y «llega en N turnos». Cada
      tipo tiene su velocidad (Reconocimiento e Infantería motorizada, 2; Infantería y Blindados, 1).
      Los equipos nuevos aparecen en la capital y tienen que llegar al frente: no se puede comprar
      defensa en el mismo territorio atacado, hay que preverlo. Propuesta de turno: los dos dan
      órdenes, todo se mueve a la vez y hay batalla donde coinciden equipos enemigos o alguien entra
      en territorio ajeno.
    - **El tren va por las líneas de suministro** (decidido): dentro de tu territorio conectado a la
      capital, los equipos van en tren, 3 territorios por turno; fuera, a pie. Cortarle el frente al
      rival también le frena los refuerzos, y un territorio recién conquistado aún no tiene vía.
    - **La IA también ataca** (decidido): el rojo mueve sus frentes, así que hay que repartir entre
      atacar y defender lo que ya es tuyo.
    - **Inteligencia** (decidido): saber qué hay en un territorio antes de atacarlo o qué trae quien
      te ataca. Por niveles: patrulla gratis si hay un equipo de Reconocimiento en un vecino
      (cuántos y de qué tipo, a grandes rasgos), reconocimiento pagado (todas las unidades) y espía (además, su
      veteranía y lo que piensa hacer). La IA también sabe de ti lo que haya visto.
    - **Se gana conquistando la capital enemiga.** Perder la propia es perder la guerra.
    - **Mapas hechos a mano**, el mapamundi y el de cada territorio (decidido): la guerra es
      contenido diseñado, como las misiones (skill `nueva-mision`).
    - **En línea, más adelante** (decidido): la misma guerra entre dos personas es mucho más
      compleja de hacer; primero la campaña de una persona.
    - **Qué reutiliza**: cada batalla es una partida normal (`createMatch` con su mapa, las
      unidades asignadas y su objetivo), así que lo nuevo es la capa de encima: el mapamundi, sus
      turnos, el cuartel general y la inteligencia, en `src/core` y guardada aparte de la partida.
    - **Preguntas abiertas**: ¿la fábrica como entrada de refuerzos? ¿se
      puede cambiar alguna unidad de un equipo? ¿cuántas batallas por turno de guerra? ¿cuánto dura una guerra? ¿la campaña de 6
      misiones de ahora se queda como tutorial antes de la guerra?

## Equilibrio

10. **Soldado 1500 → 2000.** `npm run balance` decía que el Soldado (1,6×) y el Caza ligero (2×)
    rendían demasiado para lo que cuestan, y el Jeep (0,4×) y el Motorizado (0,3×) muy poco. El Jeep
    (4000) y el Caza ligero (15000) ya tienen el precio que proponía; falta el Soldado y volver a
    medir, sobre todo el Motorizado.

## PvP (más adelante: primero un núcleo PvE bueno)

El juego por turnos le va bien al PvP asíncrono, y el núcleo ya ayuda: es determinista con semilla
(los dados van en la partida), la partida es JSON, se puede repetir un turno y todo lo que hace un
jugador es una acción (datos) que pasa por `dispatch`, con sucesos completos: lo que mandaría y
recibiría un cliente. Por fases, para no apostarlo todo de golpe:

15. **Lo que le falta al juego en línea.** Ya está entero: el núcleo habla por la red (`src/core/net`,
    `docs/ARQUITECTURA.md`, "Red"), el servidor (`server/`, en Cloudflare Workers o en Node), la
    pantalla («Jugar en línea», `src/net`; en la vista 3D, `OnlinePlay`) y «Buscar rival», por turnos
    o en vivo (`server/src/matchmaker.ts`). Decidido: el servidor manda (las acciones pasan por la
    sesión como las de cualquiera, la IA rival y los dados juegan allí) y un cliente nunca recibe
    más que la vista de su equipo (si no, se puede mirar a través de la niebla). Queda:
    - **Un tope para pedir asiento con el código** (`POST /rooms/:code/seat`, hoy sin tope por IP):
      quien sabe el código de una sala que espera puede gastar sus asientos libres, y el código es el
      único secreto. Las de la búsqueda no se reparten, pero su código sale en «Mis partidas» de los dos.
    - **Lo que queda del lienzo de diseño** «Ilogic · Rediseño de Jugar en línea»: en la sala, sus
      reglas en chapas y «Cambiar reglas» (el vestíbulo aún no las sabe: `LobbyInfo` no las trae); en
      «Mis partidas», la barra de lo que queda de turno, que pide saber cuánto dura.
    - **Avisos fuera de la pestaña**: hoy solo cambia el título (`view3d/systems/net/turnNotice.ts`).
      Notificaciones del navegador, más aún con «Buscar rival» por turnos, que empieza sin que estés.
    - **Que el final sepa las cuentas de todos**: cada uno solo ve las suyas (`withoutBooks`,
      `core/playerView.ts`), así que en la pantalla final las del rival salen a 0 y su gráfica del
      valor del ejército solo tiene el último día. Al acabar ya no hay nada que esconder y la sala
      podría mandar la partida entera.
17. **Clasificatorias** (emparejamiento, Elo, temporadas): solo si lo anterior consigue jugadores.

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
- **Sonidos en linea**: de los de `soundNames.ts` (`room_created`, `player_joined`, `net_lost`...)
  solo suena el tic del reloj del turno; los demas no los pide nadie (crear la sala, que entre
  alguien, perder la conexion...), y `net_connected` aun no tiene sonido.
- **Mas momentos con sonido**: subir de rango, el botin, la torreta del aerodeslizador... (inventario en
  `docs/PLAN-SONIDO.md`).
- **Silencio tras un trueno cercano.** Con mal tiempo los animales ya bajan o se callan
  (`ANIMALS_IN_WEATHER`, `systems/sound/ambience.ts`); falta que un trueno cerca los deje en silencio
  de golpe unos segundos.

## Técnico

12. **Mando (gamepad).** Un adaptador más en `src/controls`; el hueco queda preparado en la PR #50
    (`docs/ARQUITECTURA.md`, «Mandos»).
31. **Migrar las partidas guardadas al publicar.** Hoy un cambio de formato sube `SAVE_VERSION` y las
    partidas de antes se descartan (`core/saveVersion.ts`): vale mientras el juego no ha salido. Con
    jugadores, perder su partida al actualizar es un fallo; antes de la 1.0, decidir si se migra
    (una función por versión, probada con `tests/fixtures/saves`) o se avisa.
32. **La partida 3D como clase.** `playMatch` (`view3d/app/match3d.ts`) aún tiene unas 270 líneas: lo
    que queda se conecta entre sí (publicar, la sesión, las órdenes, la pausa, la entrada). Una clase
    `Match3d` con un método por cosa lo partiría sin parámetros enormes; hay que probarla jugando.
33. **Un solo puntero.** `controls/pointer.ts` (`PointerGestures`, puro y con test) y
    `view3d/systems/input/pointerInput.ts` hacen lo mismo dos veces; pasar la vista 3D al primero
    (y con él, el pellizco de la idea 21).
34. **Funciones largas que quedan** (más de 40 líneas, sin contar `playMatch`): `Minimap`,
    `CreateRoom`, `FriendsCard` y `Searching` (`hud/menus/Online.tsx`), `RenameSquad`, `controls` de
    la ayuda (`i18n/*/help.ts`), `buildTerrain`, `installPointer` y el constructor de `MenuFlow`.
    Cuando se toquen, partirlas; luego se puede poner `max-lines-per-function` en ESLint como ya
    está `max-depth`.
36. **La segunda producción** (lo que la revisión de la PR #195 dejó para entonces). Cuando haya otra
    forma de sacar unidades que comprar (la fábrica que saca refuerzos de la reserva, idea 35):
    ampliar `ProductionShortage` (`rules/production.ts`) con su motivo y repasar los sitios que
    suponen que lo que falta es dinero, de los que el compilador no avisa: `buyBlockedText`
    (`ui/models/economy.ts`, cuyo `default` diría que el ejército está lleno), el «te faltan N» del
    menú de compra (`view3d/systems/turn/menuItems.ts`) y lo que la IA se plantea aunque aún no lo
    pueda pagar (`ai/production.ts`). Y renombrar `buyBlock` (`rules/economy.ts`), que ya pregunta a
    la producción de la partida y no solo a la compra (`productionBlock` o parecido).

## Descartado (y por qué)

- **Fábrica automática** (comprar sola al terminar el turno, con posturas, reserva y resumen): llenaba
  el mapa de unidades que luego había que mover y se gastaba el dinero. Saber qué comprar es parte
  del juego: si compras mal, lo pagas.
- **«Comprar otra vez»** (repetir la última compra a un toque): comprar no es un problema que haya que
  resolver.
- **Consejero** (botón «¿Qué hago?» que marca la mejor jugada): no gustó.
- **Puntos de control** (zonas de 3×3 que daban dinero cada ronda, PR #47; quitados el 25-11-2026):
  repetían lo que ya hacen las ciudades (pagaban lo mismo, 1000, y hay 8-11 ciudades neutrales por
  mapa), pero se tomaban sin capturar y con cualquier unidad, y se disputaban aparcando una unidad
  barata. No daban nada que un edificio no dé, así que no se leían en la partida aunque se marcaran.
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
