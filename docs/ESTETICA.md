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
   cortas. La figura llena la casilla de alto (unas 31 de 32 unidades).
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
- **Poca cosa en pantalla**: en las esquinas solo dinero, día, menú y fin del turno; lo demás sale
  junto a lo que se toca y cuando hace falta.
- Todo sale de las variables de `src/hud/styles/base/base.css` y de las piezas de
  `src/hud/common/toy.tsx` (`Pill`, `Chip`): un color o una forma nuevos se añaden ahí, no sueltos en
  un componente.

## Cielo y fondo

Decidido con el usuario (16-11-2026): el tablero es **una isla de juguete en un mar que llega al
horizonte**, bajo un cielo de dibujo animado. Se eligió frente a una tierra de bloques alrededor (el
tablero destacaba menos) y a un mar de nubes (seguía pareciendo que flotaba).

- **Cielo en bandas**: una cúpula con seis bandas secas del horizonte (claro) al cenit (azul), sin
  degradado suave, como la sombra de dos tonos de las piezas. Sol **cuadrado** de píxel con un halo.
- **Nubes de bloques**: losas blancas con bultos encima, con el material cartoon, bajas y lejos del
  mapa para que se vean por encima del mar al inclinar la cámara; pasan despacio con el viento.
- **Mar**: un plano por debajo del agua del tablero (se ve el borde de tierra, como un acantilado)
  que recibe la sombra del mapa, con casillas un poco más claras u oscuras y los mismos brillos de
  píxel que el agua del tablero. Su color va por tema: templado, turquesa en el desierto, verdoso en
  el pantano y más frío con nieve.
- **Niebla del horizonte**: del color de abajo del cielo, empieza pasado el mapa (nunca lo tapa) y
  funde el mar con el cielo.
- **Con el clima**: cielo, nubes y niebla cambian a la vez que la luz: gris y sin sol con lluvia,
  oscuro con tormenta, blanco con nieve, ocre con la tormenta de arena.
- Para ver el cielo, la cámara se puede inclinar hasta 12° sobre el suelo.
- Código: `src/view3d/engine/core/sky.ts` (cielo y nubes), `engine/terrain/sea.ts` (mar) y los
  colores de cada clima en `engine/core/world.ts` (`WEATHER_MOODS`).

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
