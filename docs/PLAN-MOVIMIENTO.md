# Plan: mover unidades

## Cómo funciona ahora

- **Coste:** todas las casillas cuestan 1, sea llanura, bosque, arena o nieve. El terreno solo decide si se puede pasar o no.
- **Bloqueos:** cualquier unidad bloquea el paso, también las propias. Para pasar entre dos aliados hay que dar la vuelta.
- **Niebla:**
  - Las unidades enemigas ocultas también bloquean.
  - Eso **delata dónde están**: si una casilla dentro de tu alcance no se ilumina, hay alguien escondido.
- **Camino:** siempre el más corto que encuentra el juego. El jugador no puede elegir por dónde va, por ejemplo para rodear la zona de amenaza.
- **Al seleccionar:** se ve adónde se puede ir, pero no a qué se podría atacar desde allí. Hay que mover, abrir el menú y elegir Atacar para descubrirlo.
- **Combustible:** gastar casi todo no avisa. Un avión puede quedarse sin combustible lejos de un aeropuerto sin que el jugador se dé cuenta.

## Fase M0: mover con las manos (arrastrar y soltar)

Hoy mover son tres pasos: pulsar la unidad, pulsar el destino y elegir en un menú. La idea es que mover se sienta físico: **coger la unidad, llevarla y soltarla**, y que al soltar pase lo lógico sin más clics. Los clics de siempre siguen funcionando, igual que el teclado.

### Coger
- **Ratón:** pulsar sobre una unidad propia y arrastrar más de unos píxeles la "levanta".
  - El sprite sube 2 píxeles y deja una sombra en su casilla.
  - Aparece su alcance: azul para moverse y un borde rojo para lo que podría atacar.
- **Táctil:** mantener pulsado 0,25 s sobre la unidad la levanta, con una pequeña vibración. Luego se arrastra con el dedo.
- **Teclado:** Espacio sobre la unidad la levanta, las flechas la llevan y Espacio la suelta.
- **Sin seleccionar, solo pasando por encima** de una unidad propia, su alcance se ve en tenue. Así se puede planear sin tocar nada.

### Llevar
- **La unidad fantasma sigue al puntero**, encajada en las casillas, y **el camino se dibuja por donde arrastras.** Es una flecha pixel con esquinas y punta, como en Advance Wars.
  - Si vuelves atrás, el camino se recorta.
  - Si te pasas del movimiento, se recalcula el más corto hasta donde estás.
- **Bocadillo junto al puntero:**
  - movimiento gastado y restante, por ejemplo "3/5";
  - defensa del terreno de esa casilla (estrellas);
  - combustible que quedaría;
  - un icono de peligro si el enemigo visible puede atacar ahí el turno siguiente.
- **Casillas no válidas:** fuera del alcance o ocupadas, el fantasma se pone rojo y el cursor muestra una ✕.
- **Bordes de la pantalla:** si arrastras cerca de un borde, el mapa se desplaza solo, así que se puede llevar una unidad a cualquier punto del alcance aunque no se vea entero.

### Soltar: pasa lo que tiene sentido
- **En una casilla vacía:** se mueve y se abre el menú de acciones, con la opción más probable ya marcada.
  - Si no hay nada más que hacer, la unidad espera sola. Se puede desactivar.
- **Sobre un enemigo atacable:**
  - la unidad va a la casilla desde la que llegaba tu arrastre (la última del camino junto al enemigo);
  - se ve la previsión de combate y al soltar ataca.
  - Si el enemigo está a distancia, para la artillería, ataca sin moverse.
- **Sobre un edificio capturable:** se mueve y captura directamente, mostrando "20 → 10".
- **Sobre una unidad igual:** se unen. **Sobre un transporte:** sube.
- **Fuera del alcance, sobre la propia casilla o con Esc o clic derecho mientras arrastras:** la unidad vuelve a su sitio con una pequeña animación. No ha pasado nada.
- **Mayúsculas al soltar:** mover y esperar, sin menú.

### Sensación
- **Al soltar:** la unidad recorre el camino casilla a casilla y aterriza con un poco de polvo pixel.
- **Sonido opcional** al coger, al soltar y al cancelar, si se añaden efectos de sonido.
- **Deshacer con Ctrl+Z** el último movimiento, mientras no haya revelado nada, aparte del "Atrás" del menú.

### Órdenes de varios turnos (opcional)
- **Arrastrar más allá del alcance:**
  - la unidad se queda con una orden "ir hacia allí", marcada con una línea de puntos;
  - cada turno avanza sola hasta llegar, salvo que la muevas tú.
  - Va bien en mapas grandes.
- **Mover en grupo:**
  - con mayúsculas y arrastrar en el mapa se selecciona un recuadro de unidades;
  - al soltar en un punto, cada una va lo más cerca posible, sin pisarse.

**Hecho cuando:**
- se pueda jugar un turno entero solo arrastrando, sin abrir ningún menú, salvo para comprar;
- con ratón, dedo y teclado;
- funcione en los tres tamaños de pantalla probados.

## Fase M1: el terreno cuesta

- **Coste de movimiento por tipo de unidad y terreno**, como en Advance Wars. Por ejemplo:
  - la infantería gasta 2 en acantilado;
  - los vehículos, 2 en bosque y en arena;
  - las orugas, 2 en nieve;
  - los aviones, 1 en todo.
- Una tabla `MOVE_COST[tipoMovimiento][terreno]` en `data.ts` que la herramienta de equilibrio puede cambiar.
- **El combustible se gasta según el coste**, no por casillas.
- **La ficha del terreno enseña cuánto cuesta entrar** para la unidad elegida.
- Va con las reglas nuevas; las clásicas siguen con coste 1.

**Hecho cuando:**
- elegir por dónde ir importa: los caminos y la llanura son rápidos y el bosque protege pero frena;
- el simulador no alarga la duración de las partidas más de un 15 %.

## Fase M2: pasar entre aliados y emboscadas en la niebla

1. **Atravesar unidades propias** sin poder terminar el movimiento encima. Las enemigas siguen bloqueando.
2. **Emboscadas:**
   - el alcance se calcula como si los enemigos ocultos no estuvieran, así que ya no delata dónde están;
   - si el camino choca con uno oculto, la unidad se para en la casilla anterior, sale "¡EMBOSCADA!" y pierde el resto del turno;
   - es lo que hace Advance Wars, y le da sentido a explorar con unidades rápidas.
3. **La IA juega con las mismas reglas:** tampoco ve a través de la niebla al moverse.

**Hecho cuando:** ninguna casilla del alcance revele una unidad oculta (habrá un test para ello), y las emboscadas funcionen igual para el jugador y para la IA.

## Fase M3: ver las consecuencias antes de mover

1. **Alcance de ataque al seleccionar:**
   - además de las casillas azules, un borde rojo marca todo lo que la unidad podría atacar este turno, moviéndose;
   - en la artillería, lo que puede atacar sin moverse.
2. **Atacar desde el mapa:**
   - al pasar el cursor por un enemigo atacable, el juego elige la mejor casilla desde la que atacarle (la de más defensa o la más cercana) y dibuja el camino;
   - se ve la previsión de combate en ese momento;
   - un clic mueve y ataca, sin pasar por el menú.
3. **Peligro al mover:**
   - las casillas de destino a las que el enemigo visible podría atacar el turno siguiente se marcan con una rayita roja, sin tener que pulsar T;
   - se puede desactivar en las opciones.
4. **Combustible y munición tras moverse:**
   - la ficha enseña cómo quedarían, por ejemplo "Comb. 46 → 38";
   - si un avión no podría volver a un aeropuerto propio, sale el aviso "Sin combustible para volver".

## Fase M4: (incluida en M0)

Trazar el camino a mano ya va con arrastrar y soltar. Con el teclado, las flechas alargan el camino y Retroceso quita la última casilla.

## Fase M5: comodidad y ritmo

1. **Velocidad de las animaciones** (lenta, normal, rápida o instantánea), aparte para tus unidades y para las del enemigo.
2. **"Esperar" con un toque:**
   - doble clic sobre el destino mueve y espera sin abrir el menú;
   - con el teclado, mayúsculas + Enter.
3. **Al terminar con una unidad, el cursor salta a la siguiente sin mover** (opcional). Junto con Tab y la bandeja, acelera los turnos largos.
4. **Deshacer más allá del último movimiento:** deshacer todos los movimientos del turno que no hayan tenido consecuencias (sin combates, capturas ni descubrir enemigos ocultos). Cualquier cosa que revele información no se puede deshacer.
5. **Transportes:**
   - subir al transporte y que este se mueva en el mismo turno;
   - descargar justo después de mover;
   - ver la carga en el mapa con un icono.

## Ideas tácticas (opcionales, para decidir después)

- **Flanqueo:** +10 % de acierto por cada aliado junto al objetivo. Premia rodear.
- **Altura:** la artillería sobre un acantilado gana +1 de alcance.
- **Zona de control:** pasar junto a un enemigo cuesta 1 de movimiento extra. Hace que la primera línea proteja a la de atrás.
- **Carreteras y puentes:** un terreno nuevo que cuesta poco para los vehículos. Necesita gráficos nuevos, así que encaja con el remake visual.

## Orden recomendado

M2 → M0 → M3 → M1 → M5. Las órdenes de varios turnos y el movimiento en grupo, al final.

- **M2 primero:** es corta y arregla que la niebla delate a los enemigos.
- **M0, el arrastrar y soltar:** es el centro de este plan. Incluye el camino a mano y gran parte de las previsiones (alcance de ataque, bocadillo, peligro).
- **M3:** completa lo que no entre en M0.
- **M1, el coste del terreno:** cambia las reglas, así que va cuando el movimiento ya se sienta bien.

Cada fase deja tests y se prueba en el navegador con ratón, dedo y teclado. Las reglas que cambian el original (coste de terreno, atravesar aliados, emboscadas) van solo con las reglas nuevas.
