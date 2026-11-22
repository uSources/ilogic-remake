# Estética del juego (modelos 3D)

Cómo tienen que verse las unidades, los edificios y el decorado del tablero 3D. Vale para cualquiera
que haga o toque un modelo (persona o IA). El cómo técnico (generador, exportar, reglas de Ashfox)
está en la skill `ashfox`; aquí, el qué y el porqué. Lo decidido sale de las pruebas con el soldado
(noviembre de 2026), que es el modelo de referencia: `trooper` en `tools/art/ashfox/models/units.mjs`.

## En una frase

Muñecos y vehículos **de juguete hechos de bloques** (vóxel, estilo chibi), con **textura de pixel
art** y **mucho detalle**: el detalle pequeño, pintado; lo que sobresale, en 3D. Del color de su
equipo, que se lean bien desde arriba, con la cámara del juego.

## Principios

1. **El estilo del 2D, no sus píxeles.** Los sprites de 32×32 (`public/assets/img/u/`) son la
   referencia de qué lleva cada unidad (casco con gafas, mochila, el arma...) y de su color, pero no
   hay que copiarlos píxel a píxel ni de lado: es un modelo 3D que se ve desde todos los lados.
2. **Resolución: 32 unidades por casilla** (`detail: 2`). Ashfox pone siempre un píxel de textura
   por unidad; a 16 por casilla (lo de antes) no cabe detalle: la cara del soldado medía 6×4 píxeles.
   Todo modelo nuevo o rehecho va con `detail: 2`.
3. **Doblar no basta: el detalle se dibuja.** Un modelo al doble con lo mismo pintado se ve igual.
   Lo que da vida es lo que se pinta y se añade (cara, correas, hebillas, suelas, bolsillos...).
4. **Lo pequeño pintado, lo que sobresale en 3D.**
   - Pintado (`stamps`): ojos, boca, pelo, orejas, correas, cinturón, costuras, rodilleras, suelas,
     solapas, detalles del arma.
   - En 3D (cubos propios): lo que en la realidad tiene bulto y se ve de lado: las gafas (marco y
     cristales que asoman), la hebilla, las cartucheras, la solapa de la mochila, la cantimplora, la
     manta enrollada, la mira y el cargador del arma.
5. **Proporciones chibi.** Cabeza y casco grandes (casi la mitad de la altura), cuerpo corto, piernas
   cortas. La figura llena la casilla de alto (unas 31 de 32 unidades) en Ashfox: el detalle se
   modela a tamaño completo y el juego la encoge con su tamaño (ver «Tamaños en el tablero»).
6. **Que se lea desde arriba.** La cámara del juego mira desde arriba en diagonal: el casco, el arma y
   la mochila son lo que más se ve. Las armas, gruesas y algo exageradas (si no, desaparecen); el
   casco, con sus gafas bien visibles.
7. **El color del equipo manda.** El uniforme y el casco del color del equipo (`team_<lado>`, y
   `dark_<lado>` para pantalones y sombras); el resto, colores de material apagados que no compiten.
8. **Rampas de tonos cercanos** (sombra, medio, luz): las caras se ven casi lisas; con tonos muy
   separados se ve moteado. El borde claro (`rim`) solo en las piezas altas (el cuerpo, el casco, las
   piernas), no en brazos ni piezas pequeñas.

## Personajes (infantería)

Lo que vale para todo muñeco; la referencia es el soldado.

- **Cara de soldado, seria.** Dos ojos oscuros de 2×2, sin brillo; boca recta. **Sin coloretes ni
  cejas** (se probaron y se quitaron: lo hacían infantil o raro). Pelo bajo el casco por detrás y en
  las patillas; orejas a los lados.
- **Casco** más ancho que la cabeza, con su copa y la nuca, y la correa de las gafas por los lados.
  Tapa las tres filas de arriba de la cabeza.
- **Gafas en 3D:** marco de cuero y dos cristales azul claro que sobresalen, con un punto de brillo.
- **Uniforme:** tirantes de la mochila por delante, cinturón de dos filas con hebilla dorada (cubo) y
  cartucheras (cubos); rodilleras oscuras; botas grises con suela oscura.
- **Mochila con detalle:** cuerpo con correas a los lados, solapa de cuero que sobresale con su
  hebilla, bolsillo de detrás con solapa y hebilla, cantimplora verde con tapón en un lado y funda en
  el otro, y la manta enrollada (oliva, con sus atillos) encima.
- **Brazos:** hombro y antebrazo, del mismo grosor (3) y manos pequeñas (3×3×3). Nada de bloques
  anchos tipo hombrera ni manos más gordas que el brazo.

- **Variantes:** todos salen del mismo muñeco (`trooper(side, look)`: gafas, pasamontañas, tirantes
  de mochila) y cambian lo que llevan. El antidisturbios: pasamontañas del color oscuro del equipo
  (solo asoma la franja de los ojos), casco con visera oscura y sin gafas, peto, espaldar y
  hombreras grises, escudo alto hasta los ojos (mirilla oscura, franja del equipo, remaches) y una pistola pequeña en la otra mano (no porra): la mano coge la culata justo bajo la corredera clara, que lleva sus miras.

- **El del bazuca:** casco con cinta oscura, chaleco antibalas oscuro con franjas claras delante y
  detrás (dos bolsas y una granada delante), la bolsa de cohetes verde a la espalda con dos de
  repuesto asomando (cabeza roja), un cohete cargado asomando por la boca, almohadilla en el hombro,
  y el bazuca **encima** del hombro derecho y algo alzado, con la boca de atrás bien por detrás
  (tubo con las bocas anchas, franja, mira junto a la cara y empuñadura), cogido con la mano
  derecha; la otra, libre. Al principio iba a la altura de la cara y desde arriba parecía que
  apuntaba al suelo: «si lo lanza así, sale volando».

- **El del mortero:** como en la foto de referencia: en zancada (una pierna adelantada y doblada,
  la otra estirada atrás), inclinado sobre el mortero y soltando la granada en la boca del tubo con
  las dos manos; casco de camuflaje con gafas; el mortero (placa, tubo, bípode) delante a su
  derecha, para que se vea desde arriba, y la caja de granadas.
- **El de la moto** (`biker`): el motorista es **el muñeco de los soldados sentado** (cabeza grande,
  casco con gafas, cinturón), **inclinado hacia delante** como en el 2D; el tripulante pequeño se
  veía diminuto. Muslos sobre el depósito, espinillas rectas a los pedales y brazos con codo hasta el manillar (`limb`: cada tramo va de un punto a otro), y la
  bufanda oscura caída hacia atrás. La moto, de motocross y **oscura** (que contraste con el
  motorista, del color del equipo, como en el 2D): motor con aletas, depósito con la franja del
  equipo, tapa del número, guardabarros y faro blancos, escape con silenciador, ruedas finas con
  tapacubos. Las versiones toda azul y con el motorista pequeño no gustaron.

### La pose

- **En guardia, con el arma en las dos manos.** Nunca el arma colgando de una mano a un lado ni
  flotando delante con los brazos rectos como palos (se probaron y se descartaron).
- **Propuesta actual (pendiente de visto bueno):** guardia alta. Piernas abiertas, una adelantada; el
  fusil cruzado delante del pecho, culata a la derecha y boca hacia delante, a la izquierda y algo
  alzada; la mano derecha en la empuñadura y la izquierda en el guardamanos. Cada antebrazo sale del
  codo y apunta en 3D a su mano en el arma (`grip`), así se recoloca solo si se mueve el arma.
- **Las animaciones no sueltan el arma:** al andar se mueven las piernas y el cuerpo (no los brazos);
  al disparar, el cuerpo se echa atrás y el arma con él.

## Vehículos

La referencia es el tanque (`tank` en `units.mjs`). Lo mismo que en los muñecos: 32 unidades por
casilla, el color del equipo en la carrocería y el detalle dibujado.

- **Orugas con sus ruedas:** de lado, eslabones arriba y abajo y cinco ruedas pintadas con buje
  claro; delante y detrás, solo eslabones oscuros (nada gris: la oruga es negra entera). Ocupan casi
  toda la casilla de largo. Se probaron ruedas de rodaje en 3D que giraban al andar y quedaban feas:
  la oruga va pintada. Si se anima, que sea en el juego (que corran los eslabones), no con piezas.
- **Casco:** guardabarros sobre las orugas con el borde de arriba claro y una junta oscura debajo, el
  bajo oscuro entre las orugas, faros amarillos en 3D delante, rejilla del motor detrás y alguna caja
  (herramientas) encima.
- **Torreta grande y cuadrada,** como en el 2D: juntas y remaches en los lados, mantelete oscuro,
  cúpula con escotilla y periscopio, caja detrás y antena. Lo que se ve desde arriba (cúpula,
  escotilla, antena, cajas) es lo que más cuenta.
- **Cañones gordos y algo exagerados**, con su freno de boca; al disparar, retroceden.
- **Ruedas que se vean redondas:** dos piezas de goma en cruz y, por fuera, el tapacubos gris con la
  cruz del 2D. La rueda de repuesto, detrás.
- **El jeep** (`jeep`): bañera del equipo con la estrella blanca en el capó, rejilla y faros delante,
  guardabarros, parabrisas levantado, asientos de cuero, el conductor pequeño (cara seria, casco con
  gafas en 3D, manos al volante), arco antivuelco y la ametralladora en su poste, en el lado del
  acompañante para que no la tape el conductor (camisa con agujeros, caja de balas y asas).
- **La artillería** (`artillery`): un obús autopropulsado. Orugas y casco bajo; la casamata grande
  del equipo (puertas, rejillas detrás, techo oscuro con escotilla y antena) con el mantelete; el
  cañón largo **del color del equipo**, alzado, con manguito oscuro y freno de boca con ranuras; y
  detrás, las palas de anclaje. **Sin artillero** (se probó y se quitó, y la primera versión, un
  tanque con un tubo gordo, no gustó).
- **El bloqueador** (`blocker`): un blindado muy alto (casi una casilla) que cierra el paso. El
  frente, redondeado a escalones como en el 2D, con la mirilla; una banda blindada con remaches
  alrededor; mirillas pequeñas a los lados; delante, abajo, **la pala con franjas de peligro**
  amarillas y negras; arriba, escotilla, periscopio y foco; detrás, la puerta y los tubos de escape.
  (La primera versión, un cajón liso, no gustó.)
- **El tanque ligero** (`lightTank`): orugas y casco más cortos que el tanque, torreta más pequeña
  con escotilla y antena, y un solo cañón gordo del color del equipo.
- **El lanzamisiles** (`missileTruck`): cuatro ruedas, más pequeñas que las del jeep (con aquellas
  parecían enormes); la cabina del transporte y, detrás, mucho detalle: la
  plataforma con franjas de peligro, barandillas del equipo, la caja del misil de repuesto, la
  plataforma giratoria con dos pistones y la caja de mandos (luces), la rampa con sus abrazaderas y
  el misil blanco (franjas, letras, punta, tobera y aletas rojas), pilotos y las patas de apoyo con
  su franja.
- **El de suministros** (`supplier`): **el mismo camión que el transporte** (cabina, ruedas y
  medidas); solo cambia la caja: abierta, con laterales del equipo y trampilla, y la carga ordenada
  (cajas de suministros con la cruz amarilla, tres abajo y dos encima, con su cincha, y cuatro bidones
  verdes en su soporte). Se probaron camionetas más pequeñas y, al lado del transporte, parecían de
  juguete: los vehículos de la misma familia comparten medidas.
- **El antiaéreo** (`antiair`): orugas y casco del tanque; torreta alta y cuadrada con juntas y
  remaches, un cañón gordo a cada lado por fuera en su afuste (camisa y freno de boca), el radar de
  búsqueda arriba que gira en reposo y el de tiro delante. (La primera versión, torreta baja con
  cuatro cañones finos como palos, no gustó.)
- **El anfibio** (`amphibiousTank`): un aerodeslizador: falda de goma negra con costuras, casco del
  equipo, la torreta del tanque ligero y, detrás, el ventilador **integrado**: una carcasa cuadrada
  del color del equipo apoyada en el casco, con el hueco redondeado a escalones, las aspas dentro
  (giran) y dos timones en los bordes. (Suelto encima, en un aro o en un marco gris, era un pegote.)
- **El transporte** (`transport`): camión con la cabina del equipo delante (parabrisas en 3D con su
  barra, ventanillas, rejilla, faros, retrovisores) y la caja con la lona (costillas, la abertura
  oscura de detrás con la lona enrollada) y pilotos rojos.

## Tamaños en el tablero

Con todo llenando la casilla, un soldado medía lo mismo que un tanque (0,97 y 0,94 casillas de alto)
y no se distinguía de un vistazo qué era cada cosa (noviembre de 2026). Los modelos se siguen
haciendo a tamaño completo, que es donde cabe el detalle, y el juego los escala con el tamaño de
cada unidad (`modelSize` en `units.json`, por uno):

| Clase | Tamaño | Unidades |
|---|---|---|
| Infantería | 0,42 (moto 0,45) | soldado, bazuca, mortero, antidisturbios, moto |
| Vehículos ligeros | 0,5–0,55 | jeep, transporte, suministros, lanzamisiles, tanque ligero, anfibio |
| Tanques | 0,62 | tanque, antiaéreo |
| Pesados | 0,65 | artillería, bloqueador |
| Aviones | 0,6–0,72 | caza ligero, caza, helicóptero; el bombardero, el más grande |

Una unidad nueva entra en la clase que le toca. La regla de fondo: que el tamaño diga lo que pesa la
unidad, con la infantería claramente la más pequeña, y que **todas queden más bajas que los
edificios** (como en Advance Wars): así, con una unidad encima, el edificio asoma por detrás.
Se probó antes con la infantería a 0,6 y los tanques a 0,9 (un tanque tapaba la fábrica de debajo)
y luego a 0,5 y 0,75 (aún descompensadas al lado de los edificios). Referencia: en Advance Wars
(también en Re-Boot Camp) y Wargroove las unidades quedan claramente por debajo de los edificios.

**El decorado** (árboles, flores, cactus, muñecos de nieve, nenúfares) va al 0,82 de su modelo (`DECOR_SIZE` en
`src/view3d/engine/terrain/terrain.ts`), y las ranas del pantano al 0,55 (más pequeñas que un soldado): a tamaño completo los bosques tapaban las unidades de dentro
y las casillas de alrededor. Se probó también agrandar las casillas, que en 3D es encoger todo lo de
encima y acercar la cámara: las unidades quedaban demasiado pequeñas o cabía mucho menos mapa, y el
relieve no cambia. Por eso, en su lugar, la cámara empieza más cerca (distancia 13; la rueda deja
alejarse).

**Una unidad encima de un edificio**: cada uno se va a una esquina de la casilla, la unidad a la de
delante (la más cerca de la cámara) y el edificio, encogido a 0,8, a la de atrás
(`src/view3d/engine/pieces/sharedTile.ts`). Así no se atraviesan y se ven los dos. Va por esquinas y
no siguiendo a la cámara para que no se muevan al desplazarla; solo cambian de esquina al girarla.
Si la unidad está en la niebla, el edificio no se mueve (no la delata). Se probó y no gustó: solo
encoger el edificio (la unidad lo tapaba) y hacerlo semitransparente (un borrón).

## Siluetas de las unidades tapadas

Donde una montaña, un edificio o un árbol tapa una unidad desde la cámara, se ve su silueta a través,
del color de su lado (azul lo propio y aliado, rojo lo enemigo), con algo de transparencia para que
no parezca que está delante (`src/view3d/engine/core/silhouettes.ts`). Solo donde la unidad está
tapada: una unidad no se pinta encima de sí misma ni de otra que tiene delante. Las que están en la
niebla no se dibujan, así que tampoco su silueta; los restos de una destruida no llevan.

## Edificios

`tools/art/ashfox/models/buildings.mjs`, también a 32 por casilla. Del color de su dueño (turquesa,
rojo o gris, como en el 2D), sobre una losa de acera con bordillo, con ventanas en rejilla (marco
claro y algunas encendidas) y mucho detalle alrededor: farolas, macetas, sacos, franjas de peligro.

- **Ciudad:** torre de oficinas con ventanas en las cuatro caras, entrada de cristal con marquesina
  y, en el tejado, aparatos de aire, depósito de agua y antena con luz roja.
- **Petróleo:** **bomba de balancín** (el «caballito»): caballete en A, balancín que cabecea con la
  cabeza curva y el cable al pozo (siempre recto), las bielas de la cola a la manivela, contrapesos
  que giran y motor (las piezas que cuelgan van en su hueso y giran al revés que el balancín, para
  no despegarse); al lado, el depósito de crudo con
  su escalera, la tubería y los bidones.
- **Fábrica:** nave con tejado de sierra acristalado, portón con franjas de peligro, oficina pegada,
  dos chimeneas de ladrillo con franjas blancas y rojas, y el silo.
- **Fuerte:** búnker en cúpula de anillos con troneras, escotilla, periscopio y bandera; la entrada
  blindada con franjas y sacos terreros a los lados.
- **Aeropuerto:** pista con línea y luces, torre de control con cabina de cristal y radar que gira,
  hangar con tejado redondeado y portón, y la manga de viento que ondea.
- **Base:** cuartel con un edificio alto y otro bajo unidos por una pasarela de cristal, radar que
  gira, antena, garita con barrera y bandera.

## Aviones

Vuelan (todo cuelga de `body`, subido); a 32 unidades por casilla, como el resto. Escarapelas en las
alas (aro del equipo, blanco y centro oscuro: lo que se ve desde arriba).

- **Caza ligero:** de hélice (dos palas en cruz con el cono rojo), capó gris con escapes, ala baja,
  cabina abierta con el piloto (cara, gorro de cuero y gafas) y el tren de aterrizaje.
- **Caza:** reactor del equipo, morro gris, cúpula con su marco, tomas de aire, alas con misiles en
  las puntas, dos derivas y la tobera.
- **Cristales grandes** (el morro del bombardero, la burbuja del helicóptero): escalonados para que se
  vean redondeados, con un brillo y **sin marco pintado** (las rayas del marco parecían una cara).
- **Bombardero:** gordo, morro de cristal, cabina, torreta de cristal arriba, dos
  motores con hélice en las alas, bombas debajo, compuertas pintadas en la panza y dos derivas.
- **Helicóptero:** cabina grande con ventanillas, puerta y escarapela, burbuja de cristal delante,
  motor con rejillas, cola con su rotor, patines y el rotor grande que gira.

## Materiales (pinturas compartidas)

| Pintura | Para | Tono |
|---|---|---|
| `team_<lado>`, `dark_<lado>` | uniforme, casco; pantalones | azul / rojo del equipo |
| `skin` | cara y manos | carne |
| `leather` | marco de las gafas, solapas, fundas | marrón oscuro |
| `pack` | mochila, culata y guardamanos de madera | marrón |
| `brass` | hebillas | dorado |
| `gun`, `steel` | cuerpo del arma; cañón y mira | gris muy oscuro; gris metal |
| `glass` | cristales | azul claro |
| `tread`, `lamp` | orugas; faros | casi negro; amarillo |
| `canteen`, `bedroll` | cantimplora; manta | oliva |
| `boot_grey` | botas (suela oscura pintada) | gris |

Antes de inventar un color, usar uno de estos: así todas las unidades parecen del mismo juego.

## Interfaz

Decidido con el usuario (16-11-2026): **caja de juguete**, a juego con el tablero de bloques. Plan
y estado: `docs/PLAN-INTERFAZ.md`.

- **Fichas de plástico**: fondo crema (`--panel`), borde de tinta de 3 px (`--ink`, un morado casi
  negro), esquinas redondas (`--radius` 16 px; botones 10 px; pastillas del todo) y una sombra dura
  debajo (`--lift`), sin difuminar. Al pulsar, la ficha baja hasta su sombra.
- **Colores**: azul de bando para lo propio y lo principal (`--blue-btn`), rojo para lo enemigo y lo
  peligroso (`--red-btn`), dorado oscuro para resaltar texto (`--gold`) y amarillo para los números
  de las esquinas. Texto en tinta sobre crema; blanco solo sobre azul o rojo.
- **Letras**: Fredoka (redonda, para títulos, botones y cifras) y Nunito (texto). La letra píxel de
  2013 queda para el logo.
- **Iconos**: los de píxel que ya hay, nítidos (`image-rendering: pixelated`), dentro de las fichas.
- **Retratos de unidades**: no son dibujos, son el propio modelo 3D renderizado en tres cuartos y pasado a
  pixel art de 64x64 (`npm run retratos` y `tools/art/retratos_pixel.py`). Así la ficha y el tablero
  muestran lo mismo; si cambia un modelo, hay que volver a renderizarlo.
- **Poca cosa en pantalla**: solo cuatro piezas fijas, el dinero (su desglose al pasar el ratón), el
  día con su clima, el menú y «Fin del turno» con su número de unidades sin mover (que lleva a la
  siguiente). Nada de bandejas ni líneas de ayuda: lo demás sale junto a lo que se toca y cuando hace
  falta (fichas, rueda, compra, ficha de la casilla), y lo de vez en cuando va en el menú (ver
  amenaza, ver órdenes) o en la rueda (escuadras).
- **Sobre el tablero, chapas y bloques** (`docs/PLAN-INTERFAZ-2.md`, fases 2 y 3; probado en el
  navegador el 17-11-2026):
  - Mover y atacar, **losas y bordes**: a donde puede ir, losas azules translúcidas con borde claro
    alrededor del área; hasta donde ataca, marcos rojos casilla a casilla con un velo muy suave y una
    diana que gira en cada enemigo a tiro; el cursor, cuatro esquinas que laten. Con «Ver amenaza»,
    un velo rojo con borde por fuera del área.
  - La vida de una unidad herida es **un número en una chapa** (verde, amarilla o roja según lo que le
    queda; número blanco con tinta), como en Wargroove. Se probó frente a la barra de antes: el número
    se lee de lejos y sin contar píxeles, y la barra se confundía con la de la captura. Entera, nada.
  - La barra queda solo para **lo que perdería** al apuntarle (a rayas), que es una proporción.
  - La captura a medias, una chapa con **los puntos que le faltan**, del color de quien captura y a la
    izquierda (encima está la unidad que captura, con su vida en el centro y su orden a la derecha).
  - La defensa de la casilla señalada va en **su ficha** (`TileTip.tsx`), no en el tablero: una chapa
    con el escudo y el %, junto a las de lo que cuesta entrar, lo que cobra y lo que le falta por
    capturar (solo las que tenga). Antes eran estrellas de bloque (cubitos amarillos) sobre la casilla:
    no se entendía qué eran y se confundían con el cursor, del mismo amarillo (21-11-2026). Con Alt,
    la misma ficha crece con el resto, en las mismas chapas y líneas de texto pequeño: nada de una
    tarjeta aparte con otro aspecto.
  - La previsión de combate, **chapas de plástico** (`Badge`): la del daño encima de la barra de vida
    del enemigo y la del contraataque a los pies de tu unidad (encima, junto al enemigo de al lado,
    chocaban). Comprobadas con la interfaz a 0,9 y a 1,25 (las escalas de Opciones).
  - El cartel del día, una **banderola de tela** en el color del bando colgada de una barra de
    madera, con cola de golondrina: cae, se balancea y vuelve a subir. Dice «Día 4» en grande, «Tu
    turno» debajo y, si el clima cambia, su icono grande en una ficha.
  - Lo que sube del tablero (el daño, lo que cobra cada edificio, la captura), **chapas de crema** con
    el número en su color y borde de tinta, como las del HUD.
  - La compra, **fichas en abanico** alrededor de la fábrica (retrato, nombre y precio; lo que no se
    puede pagar, apagado y con lo que falta en rojo) y en el centro la chapa de la señalada: mover,
    alcance y visión con sus iconos y los retratos de contra qué es buena.
- Todo sale de las variables de `src/hud/styles/base/base.css` y de las piezas de
  `src/hud/common/toy.tsx` (`Pill`, `Chip`, `Badge`): un color o una forma nuevos se añaden ahí, no sueltos en
  un componente.

## Montañas

Decidido con el usuario (16-11-2026): ya no hay acantilados sueltos, casilla a casilla. Las montañas
son **sierras de verdad**, lo alto del mapa, y se ven como macizos que siguen la cordillera:

- **Forma**: una montaña sola es un pico; una sierra larga, una cresta; una ancha, más alta por el
  medio. Las faldas se salen un poco a las casillas de al lado y tapan el borde. Ruido encima: cimas
  separadas a lo largo de la cresta y ladera rugosa (columnas de voxels de 2 píxeles de Ashfox).
- **Color que varía**: por alturas (hierba en las faldas, monte bajo, roca, nieve en lo más alto),
  con el borde entre bandas mellado, **roca pelada en las laderas empinadas** y manchas más claras y
  más oscuras por el macizo. Nunca una montaña de un solo color.
- **Por tema**: verdes con nieve arriba (llanura, bosque, pantano), gris azulado y nieve (nevado) y
  **mesetas** en terrazas planas a capas de colores, como un cañón (desierto).
- Datos de cada estilo en `TERRAIN_PIECES` (`pieces.ts`); forma en `massif.ts`; color en
  `reliefColors.ts`.

## Pantano

Decidido con el usuario (22-11-2026): el pantano no puede parecer un bosque. Antes usaba los mismos
modelos que el bosque y el agua azul, y «parecía un tipo de bosque». Ahora todo lo suyo es propio
(`THEME_PIECES.Swamp` en `src/view3d/engine/terrain/pieces.ts`; los modelos al final de
`tools/art/ashfox/models/terrain.mjs`, a 32 por casilla):

- **Colores**: verde oliva y apagado en el suelo (con charcos de agua turbia, juncos y barro pintados),
  barro oscuro en los lados, y el **agua turbia**: verde azulado oscuro con lentejas de agua, brillos
  verdosos y verdín en la orilla en vez de espuma blanca (`MURKY_WATER` en `water.ts`). El mar de
  alrededor, los islotes y las montañas, con la misma paleta (verde de agua estancada, oliva y roca
  gris verdosa).
- **Árboles**: cipreses de base ensanchada con sus «rodillas» (raíces que asoman), copas anchas y
  planas y un **fleco de musgo** colgando alrededor, casi junto, como una cortina rota; y algún
  tronco seco gris. Se probó con unas pocas barbas sueltas y desde arriba parecían patas de mesa.
- **Nenúfares** en la mitad del agua (no en la honda): hojas redondas a escalones con su muesca y
  flores blancas o rosas, o capullos. Juncos con espadañas y lirios morados en las flores del tema y,
  sueltos, en algo de la hierba y del agua poco honda.
- **Ranitas** verde lima con manchas, sentadas en el nenúfar del centro o entre los juncos; de vez en
  cuando una da un saltito y se gira (`FROG` en `src/view3d/engine/ambience/life.ts`).
- **Luciérnagas** sobre los árboles, los juncos y el agua cerca de la cámara: un punto amarillo
  verdoso con un halo redondo en anillos (no un cuadrado: se probó y parecía un bloque) que se
  enciende y se apaga a su ritmo y suma su luz, así brillan también de día (`FIREFLIES`, mismo fichero).
- Con «reducir el movimiento», ni luciérnagas ni saltos.

## Lo que vive en cada bioma

Decidido con el usuario (22-11-2026), tras el pantano: cada bioma tiene su vida, que no es de la
partida (`src/view3d/engine/ambience/`: motas que vuelan y animalitos sentados en el decorado, todos
como datos en `life.ts`).

- **Pequeños**: un animal es más pequeño que un soldado, y una mota, un punto.
- **Del bioma, no de un equipo**: colores apagados del terreno donde viven; nunca los de un lado, que
  nadie los confunda con una unidad.
- **No estorban**: no tapan unidades ni casillas, y no se tocan (el clic va a lo que hay debajo).
- **Poco y cerca**: solo alrededor de lo que se mira, unos cuantos.
- Con «reducir el movimiento», las motas no salen y los animales se quedan quietos.

## Cielo y fondo

Decidido con el usuario (16-11-2026): el tablero es **una isla de juguete en un mar que llega al
horizonte**, bajo un cielo de dibujo animado. Se eligió frente a una tierra de bloques alrededor (el
tablero destacaba menos) y a un mar de nubes (seguía pareciendo que flotaba).

- **Cielo en bandas**: una cúpula con seis bandas secas del horizonte (claro) al cenit (azul), sin
  degradado suave, como la sombra de dos tonos de las piezas. Sol **cuadrado** de píxel con un halo.
- **Nubes de voxels**: cada nube es la suma de unas cuantas esferas de voxels (1,6 casillas), así el
  borde sale escalonado como el pixel art y no como una losa. Blancas por arriba y azul gris por el
  fondo (el suelo de la nube es plano), con el material cartoon; bajas y lejos del mapa para que se
  vean por encima del mar al inclinar la cámara; pasan despacio con el viento (solo cambia la posición
  de cada voxel). Código: `engine/core/sky.ts`.
- **Mar**: un plano por debajo del agua del tablero (se ve el borde de tierra, como un acantilado)
  que recibe la sombra del mapa. Para que el tablero se asiente en él y no parezca puesto encima
  (primera versión, plana y de un solo azul: «no queda integrado»), el agua va en escalones de
  casilla con el borde mellado: **bajío** claro pegado a la tierra, agua media y **hondo** del azul
  del agua del tablero. Al pie de la tierra late una franja de **espuma** de píxel, y los brillos
  son rayitas de tres píxeles que titilan (no líneas largas), solo cerca de la tierra. Los tonos van
  por tema: templado, turquesa en el desierto, verde de agua estancada en el pantano y frío con nieve.
- **Islotes** alrededor (14, siempre los mismos): cada uno es una sierra pequeña con el relieve de
  las montañas del tablero (`massif.ts`, `reliefColors.ts`): playa baja, tierra del tema, roca pelada
  en las laderas empinadas y manchas de color, con su propio bajío y espuma. Dicen que el mapa es un
  trozo de un mundo. Código: `engine/terrain/islets.ts`.
- **Niebla del horizonte**: del color de abajo del cielo, empieza pasado el mapa (nunca lo tapa) y
  funde el mar con el cielo.
- **Con el clima**: cielo, nubes y niebla cambian a la vez que la luz: gris y sin sol con lluvia,
  oscuro con tormenta, blanco con nieve, ocre con la tormenta de arena.
- Para ver el cielo, la cámara se puede inclinar hasta 12° sobre el suelo.
- Las partículas del clima (copos, polvo) no crecen a menos de 12 casillas de la cámara: con la
  cámara baja un copo pegado al objetivo tapaba media pantalla.
- Código: `src/view3d/engine/core/sky.ts` (cielo y nubes), `engine/terrain/sea.ts` (mar),
  `engine/terrain/islets.ts` (islotes) y los colores de cada clima en `engine/core/world.ts`
  (`WEATHER_MOODS`).

## Cómo comprobarlo

- Capturas de frente, de lado, de espaldas y **desde arriba como la cámara del juego** (elevación
  30–45°), y cada animación con `replay` (skill `ashfox`).
- En el playground (`/units3d.html`) con la luz del juego y junto a las demás unidades: mismo tamaño
  y que se distinga a la primera.
- Ponerlo al lado del sprite 2D: que lleve lo mismo y del mismo color, aunque no sea igual.

## Límites técnicos que condicionan el estilo

- **Ashfox no deja girar los huesos en reposo:** la pose se hace girando cubos (`rotation` y `pivot`
  de cada cubo; admiten giro en varios ejes).
- **20 000 caracteres por fichero `.ashfox`**, pero no por modelo: el generador reparte cada modelo en
  módulos (esqueleto, textura, geometría) y cada uno tiene su límite. El soldado, el que más ocupa,
  se queda en unos 8 400 en su fichero más grande: hay sitio para mucho más detalle.
