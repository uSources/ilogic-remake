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

## Fase M4: el jugador traza el camino

1. **Camino a mano:**
   - al mover el cursor dentro del alcance, el camino sigue por donde pasas, como en Advance Wars, siempre que no supere el movimiento;
   - si te sales, vuelve al más corto.
   - Así se puede rodear la zona de amenaza o pasar por bosque.
2. **Con el teclado:** las flechas alargan el camino casilla a casilla y Retroceso quita la última.
3. **En pantallas táctiles:** al arrastrar sobre el alcance se dibuja el camino, y al soltar se confirma.

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

M2 → M1 → M3 → M4 → M5.

- **M2 primero:** corrige que la niebla delate a los enemigos, que hoy es un fallo, y además es barata.
- **M1 después:** es el cambio de reglas más grande.
- **M3 y M4:** son sobre todo interfaz.
- **M5:** pulido.

Cada fase deja tests y se comprueba con el simulador de equilibrio. Las reglas que cambian el original (coste de terreno, atravesar aliados, emboscadas) van solo con las reglas nuevas.
