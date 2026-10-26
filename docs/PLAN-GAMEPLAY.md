# Plan para mejorar el gameplay de Ilogic

## Cómo funciona ahora

- **Combate:**
  - Cada punto de vida del atacante es un "disparo" que acierta con probabilidad `POWER × terreno × edificio`.
  - El daño es aleatorio, con una desviación de unos ±5 puntos.
  - **No hay contraataque**: atacar primero siempre sale gratis.
- **Captura:**
  - Es instantánea: un soldado se pone encima y en un turno el edificio cambia.
  - Un edificio enemigo hay que capturarlo dos veces: primero queda neutral y luego pasa a ser tuyo.
- **Economía:**
  - Cada edificio da entre 500 y 1500 por ronda.
  - Se empieza con 5000 y hay un máximo de 30 unidades.
- **Partidas:**
  - El mapa es aleatorio, de 32×32, con niebla de guerra siempre activa.
  - Se juega solo contra la IA, con una única dificultad.
  - Se gana neutralizando la Base enemiga.
- **IA:**
  - Ataca al mejor objetivo y se retira a repararse.
  - Avanza hacia la Base del jugador y compra según el coste.
  - Contra un jugador pasivo gana 18 de cada 20 partidas.

Lo que más pesa en la estrategia:
1. Sin contraataque, la posición importa poco: gana quien golpea primero.
2. La captura instantánea vuelve las partidas muy rápidas o muy desequilibradas, y una Base se puede perder en un solo turno.
3. No hay nada que ajustar ni que elegir antes de jugar (mapa, dificultad, reglas), y eso resta rejugabilidad.

---

## Fase 0: medir antes de tocar

Primero hay que saber cómo se juega hoy en números. Si no, cada cambio se decide a ojo.

- **Simulador por línea de comandos** (`npm run sim -- --games 200`). Juega partidas IA contra IA y saca:
  - cuánto dura una partida en días y qué porcentaje gana cada bando;
  - qué unidades se compran y cuánto daño hace cada una por cada 1000 de coste;
  - cuántas partidas se deciden por la Base y cuántas por quedarse sin nada;
  - el efecto bola de nieve: quién va ganando en el día 5 y quién gana al final.
- **Informe** en `docs/BALANCE.md`, para comparar antes y después de cada fase.

**Hecho cuando:** tengamos la línea base y cada fase siguiente compare contra ella.

## Fase 1: combate con decisiones

1. **Contraataque.** El defensor que sobrevive responde con la vida que le queda, si el atacante está a su alcance. Las unidades a distancia (artillería, mortero, lanzamisiles) no contraatacan ni reciben contraataque.
   - Así importan el orden de ataque, rematar a la unidad herida y proteger la artillería.
   - La previsión de combate mostraría también el daño que te devuelven.
2. **Menos azar.** Dos opciones:
   - a) el daño es el esperado ±10 %;
   - b) se mantiene la tirada, pero con mínimo y máximo más estrechos.
   La previsión ya enseña el margen, así que es una decisión de diseño.
3. **Terreno que se note.** Revisar la defensa de bosque, montaña y ciudad para que colocarse bien compense de verdad. La ficha ya enseña las estrellas.
4. **Ventaja por flanqueo** (opcional): +10 % de acierto por cada aliado junto al objetivo. Premia rodear.

**Hecho cuando:** en el simulador, la unidad que ataca primero gane menos del 70 % de los duelos igualados (hoy ronda el 100 %), y la artillería protegida rinda más que la expuesta.

## Fase 2: captura y economía

1. **Captura por puntos**, como en Advance Wars:
   - un edificio tiene 20 puntos;
   - cada turno, la unidad que captura le resta su vida ÷ 10;
   - si la unidad se mueve o muere, el edificio recupera los puntos.
   - Así un edificio cuesta 2 turnos con la unidad entera y más si está herida. Defender importa y la Base no cae por sorpresa.
   - Sustituye al "dos veces: neutral y luego tuyo". Habría que decidir si se mantiene el paso por neutral.
2. **Base más dura:** 30 puntos en lugar de 20, o que se cure sola si no hay enemigos al lado.
3. **Ajuste de ingresos**, con los números de la fase 0, para que la ventaja inicial no se dispare. Por ejemplo, un poco menos de ingreso por edificio a partir del 10.º.
4. **Barra de captura** en el mapa y en la ficha, con el estilo actual.

**Hecho cuando:** ninguna partida simulada se decida antes del día 6 por una captura sorpresa, y la mediana de duración esté entre 15 y 25 días.

## Fase 3: una IA a la altura

1. **Tres dificultades.**
   - **Fácil:** se equivoca adrede, no remata y compra al azar.
   - **Normal:** lo de ahora, mejorado.
   - **Difícil:** sin las ayudas de "ver" de más, pero con mejores decisiones.
2. **Mejores decisiones:**
   - usar la previsión de combate (con contraataque) para elegir ataques;
   - concentrar el fuego y rematar;
   - no meterse en la zona de amenaza si no le compensa;
   - defender su Base cuando un capturador se acerca;
   - usar transportes y poner la artillería detrás de la primera línea.
3. **Que la IA haga trampas solo si se elige:** por ejemplo, que vea a través de la niebla en "difícil", si se quiere.

**Hecho cuando:** en el simulador, Difícil gane a Normal en más del 70 % de las partidas y Normal gane a Fácil en más del 70 %.

## Fase 4: partidas a tu medida

1. **Pantalla de "Nueva partida"** con:
   - tamaño del mapa (20×20, 32×32 o 40×40);
   - clima o tema, o al azar;
   - semilla para compartir un mapa con un código;
   - dinero inicial e ingreso por edificio;
   - niebla de guerra sí o no;
   - dificultad de la IA.
2. **Dos jugadores en el mismo ordenador**, por turnos. Una pantalla de "pasa el dispositivo" oculta el mapa entre turnos si hay niebla.
3. **Otras condiciones de victoria:**
   - límite de días, con victoria por puntos (edificios + valor de las unidades);
   - rendirse;
   - aniquilación.
4. **Repetición** del último turno enemigo.

**Hecho cuando:** se pueda configurar y jugar cualquier combinación sin errores. Las partidas guardadas recordarán la configuración.

## Fase 5: contenido y progresión

1. **Misión tutorial** guiada, en un mapa fijo pequeño: mover, atacar, capturar, comprar y transportar.
2. **Campaña corta**, de 5 a 8 misiones en mapas fijos con objetivos distintos:
   - defender X días;
   - escoltar un transporte;
   - capturar 3 ciudades;
   - empezar en inferioridad.
3. **Veteranía:** una unidad que destruye enemigos sube de rango (★ a ★★★), con +5 % de acierto y +5 de defensa por rango. Así da pena perderla.
4. **Editor de mapas** sencillo, que guarda en el navegador y exporta como código.
5. Opcional: **comandantes** con un poder que se carga con el combate, por ejemplo "+20 % de ataque un turno" o "reparar 2 a todas".

---

## Orden recomendado

Fase 0 → 1 → 2 → 3 van seguidas: cada una cambia los números de la siguiente y la IA debe aprender las reglas nuevas. La 4 y la 5 son independientes y se pueden intercalar.

Cada fase:
- deja tests de las reglas nuevas;
- vuelve a pasar el simulador;
- actualiza `docs/BALANCE.md`;
- marca los cambios respecto al original con `[CAMBIO]`, como hasta ahora.

Las reglas nuevas que cambien el juego original (contraataque, captura por puntos) irán con una opción **"Reglas clásicas de 2013"** en la pantalla de nueva partida, para poder seguir jugando como entonces.
