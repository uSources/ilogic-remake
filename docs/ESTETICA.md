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

### La pose

- **En guardia, con el arma en las dos manos.** Nunca el arma colgando de una mano a un lado ni
  flotando delante con los brazos rectos como palos (se probaron y se descartaron).
- **Propuesta actual (pendiente de visto bueno):** guardia alta. Piernas abiertas, una adelantada; el
  fusil cruzado delante del pecho, culata a la derecha y boca hacia delante, a la izquierda y algo
  alzada; la mano derecha en la empuñadura y la izquierda en el guardamanos. Cada antebrazo sale del
  codo y apunta en 3D a su mano en el arma (`grip`), así se recoloca solo si se mueve el arma.
- **Las animaciones no sueltan el arma:** al andar se mueven las piernas y el cuerpo (no los brazos);
  al disparar, el cuerpo se echa atrás y el arma con él.

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
| `canteen`, `bedroll` | cantimplora; manta | oliva |
| `boot_grey` | botas (suela oscura pintada) | gris |

Antes de inventar un color, usar uno de estos: así todas las unidades parecen del mismo juego.

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
