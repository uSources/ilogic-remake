# Plan: una IA más humana

## Estado (19-11-2026)

**Fase 0 hecha:** `npm run balance` enfrenta perfiles de IA y da las medidas de «humanidad»
(`balance/README.md`, «Una IA contra otra»). Línea de partida, la IA de ahora en 100 partidas
(`balance/reports/ia-base.md`):

| Medida | IA de ahora |
|---|---|
| Partidas con ganador antes del día 60 | 7 % (93 sin terminar) |
| Unidades regaladas por partida (de cada bando) | 19,0 (el 67 % de sus bajas) |
| Al aliado más cercano | 3,3 casillas |
| Vaivenes | 24 % de los movimientos |
| Tiempo por turno (media / p95) | 34 / 109 ms (en la máquina de las pruebas) |

**Fase 1 hecha:** la IA del juego usa mapas de influencia. Contra la de antes (perfil `fase0`), 80
partidas con los lados alternos (`balance/reports/ia-fase1.md`; allí la nueva sale como
`influencia`):

| Medida | Antes (`fase0`) | Con influencia |
|---|---|---|
| Gana (de verdad o con ventaja clara) | 44 % | 40 % (5 victorias de verdad contra 1) |
| Regaladas por partida | 19,2 | 16,5 |
| Al aliado más cercano | 3,5 casillas | 3,1 casillas |
| Vaivenes | 24 % | 28 % |
| Turno (media / p95) | 36 / 116 ms | 59 / 191 ms |

Igual de fuerte (la diferencia está dentro del ruido), regala menos y va más agrupada; da más
vaivenes (entra y sale del peligro de un turno a otro), que es justo lo que ataca la fase 2. Probado
y descartado: no perseguir a quien no llega a disparar (38 % contra 50 %: más floja).

**Fase 2 hecha:** cada unidad tiene un objetivo que mantiene de un turno a otro (`ai/plans.ts`),
guardado como orden permanente y cumplido por la propia IA (opción b de la decisión abierta 1).
Contra la de la fase 1 (perfil `fase1`), 80 partidas con los lados alternos
(`balance/reports/ia-fase2.md`; allí la nueva sale como `planes`):

| Medida | Fase 1 | Con planes |
|---|---|---|
| Gana (de verdad o con ventaja clara) | 36 % | 53 % |
| Regaladas por partida | 14,7 | 16,6 |
| Al aliado más cercano | 3,1 casillas | 3,4 casillas |
| Vaivenes | 27 % | 28 % |
| Turno (media / p95) | 58 / 184 ms | 59 / 188 ms |

Claramente más fuerte, algo más agresiva (regala un poco más). Lo que no ha movido: los vaivenes
(los domina el ir y venir de la pelea, no el objetivo) y las partidas sin terminar. Probado y
corregido por el camino: con la niebla, «rematar» contaba solo los enemigos a la vista y lanzaba a
todo el ejército contra la Base demasiado pronto (18 % contra 77 %); ahora estima al enemigo también
por sus edificios. Y defender cualquier edificio con un enemigo cerca la dejaba en casa: solo se
defiende lo que están capturando y la Base.

**Fase 3 hecha:** cada equipo recuerda dónde vio por última vez a cada enemigo
(`TeamState.sightings`, puesta al día por la invariante `sightings`, `core/rules/sightings.ts`; la
niebla se la quita a las demás alianzas; `SAVE_VERSION` 15). La IA cuenta a los recordados en el
peligro, el control y lo que calcula que tiene el enemigo (`ai/memory.ts`), menos cuanto más viejo es
el recuerdo, durante `memoryDays` días (`ai.json`). Contra la de la fase 2 (perfil `fase2`), 60
partidas con los lados alternos (`balance/reports/ia-fase3.md`; allí la nueva sale como `memoria`):

| Medida | Fase 2 | Con memoria (1 día) |
|---|---|---|
| Gana (de verdad o con ventaja clara) | 43 % | 45 % |
| Regaladas por partida | 16,3 | 16,3 |
| Al aliado más cercano | 3,4 casillas | 3,5 casillas |
| Vaivenes | 28 % | 28 % |
| Turno (media / p95) | 65 / 200 ms | 64 / 199 ms |

Igual de fuerte (dentro del ruido) y con lo que sabe un jugador: ya no olvida al enemigo que acaba de
perder de vista. Probado y descartado: recordar 3 días (40 % contra 43 %,
`balance/reports/ia-fase3-3dias.md`): los enemigos se mueven, y un recuerdo viejo es un peligro donde
ya no hay nadie, que la vuelve prudente de más. Los fantasmas en el 3D (decisión abierta 2) quedan
para otra PR (`docs/IDEAS.md`).

Cada fase es una PR (o dos), se mide antes y después y se puede parar en cualquiera: cada una
mejora algo por sí sola.

## Qué queremos decir con «más humana»

No más fuerte a cualquier precio, sino que juegue como juega una persona:

- **Tiene un plan y lo sigue.** Va a por algo (una ciudad, un hueco, la Base) durante varios
  turnos, en vez de cambiar de idea en cuanto cambian los números.
- **Piensa en frentes, no en vecinos.** Sabe dónde le pueden hacer daño, qué zona es suya y dónde
  está la línea entre los dos ejércitos.
- **No deja unidades tiradas.** No acaba el turno donde la pueden destruir sin necesidad y avanza en
  grupo, no desperdigada.
- **Recuerda lo que ha visto.** Un enemigo que se mete en la niebla no deja de existir.
- **Tiene carácter.** Una agresiva, una cauta, una codiciosa: se nota contra quién juegas.
- **Se equivoca de forma creíble.** No elige siempre la jugada perfecta; en Fácil, menos aún.

Y, de paso, que **las partidas acaben**: hoy casi 9 de cada 10 partidas de la IA contra sí misma
llegan al día 60 sin ganador (`docs/IDEAS.md`, 1).

## Cómo está ahora

`src/core/ai/` (unas 1.400 líneas con `src/core/autopilot/`):

- **El turno** (`aiTurn`, `ai/turn.ts`): primero un plan de fuego concentrado (`planFire`), luego
  cada unidad por su cuenta (`unitTurn`) y al final la compra (`produce`).
- **Cada unidad** prueba una lista de comportamientos en orden de urgencia y se queda con el primero
  que la usa (`UNIT_BEHAVIOURS`, `ai/unitTurn.ts`): terminar una captura, apartarse de la Base
  enemiga, retirarse si está débil, atacar o acercarse al enemigo más cercano, capturar...
- **Los ataques** se puntúan con una lista de razones (`ATTACK_SCORE_TERMS`,
  `autopilot/scoring.ts`): daño por precio, rematar, lo que devuelve el contraataque, echar a quien
  captura...
- **Los números** son pesos de `src/core/content/ai.json`, dentro de su perfil (`AiProfile`): dos IAs
  con perfiles distintos juegan a la vez sin tocar nada común.

**Lo que le falta para parecer humana:** decide cada turno desde cero y unidad a unidad. No tiene
una idea del mapa más allá de «el enemigo más cercano», ni planes que duren, ni memoria. Los
destinos solo se eligen por distancia: nada le dice que una casilla es peligrosa o que se queda sola.

## Lo que se respeta (de `docs/ARQUITECTURA.md`, «La IA»)

- Todo en `src/core` (TypeScript puro), decidiendo con la **vista de su equipo** (`PlayerView`):
  nunca ve lo que su equipo no ve.
- **Solo propone acciones** (`ActionPlan`); la partida cambia por `dispatch`, como con una persona.
  Así queda en el registro, se guarda y va por la red.
- **El azar, de la partida** (`decisionRngOf(vista)`): la misma partida decide igual al cargar, al
  repetir o por la red.
- **Sin estado global**: lo del turno va en `PlayCtx`; lo que cambia de una IA a otra, en su perfil.
- **Lo que crece, como listas**: una razón nueva es una entrada en su lista, no un `if` más.
- Cada cambio de comportamiento, a propósito: `tests/aiGolden.test.ts` se actualiza con `-u` y se
  mide con `npm run balance`.

## Fase 0: medirlo (antes de cambiar la IA)

Sin medidas, «más humana» es una opinión. Dos cosas en `tools/balance/`:

1. **Una IA contra otra.** Hoy `--vs` solo deja enfrentar la IA a un equipo que no hace nada
   (`passive`). Hace falta poder jugar el perfil actual contra uno candidato en las mismas partidas
   (con los lados cambiados para que no cuente quién empieza), para saber si un cambio la hace más
   fuerte o más débil.
2. **Medidas de «humanidad»** en el informe:
   - **Partidas que acaban**: cuántas tienen ganador antes del día 60 y el día medio de fin.
   - **Unidades regaladas**: las que acaban el turno donde el enemigo las puede destruir y las
     destruyen sin haber hecho daño ese turno.
   - **Cohesión**: distancia media de cada unidad a su aliado más cercano.
   - **Constancia**: cuántas veces cambia una unidad de idea. Se mide desde fuera, sin tocar la IA:
     **vaivenes**, los movimientos que van en contra del anterior de la misma unidad. (Si hace falta
     afinar más, la fase 2 puede dejar una traza de sus objetivos.)
   - **Tiempo por turno** de la IA, con un tope (el turno no puede tardar más en un móvil).

**Hecho cuando:** `npm run balance` da estas medidas para la IA de ahora (la línea de partida) y
compara dos perfiles. No cambia ninguna decisión de la IA.

## Fase 1: mapas de influencia

Una idea del mapa entero, calculada una vez al empezar su turno (`src/core/ai/influence.ts`), como
rejillas del tamaño del mapa (`Grid<number>`, `createLayer`):

- **Amenaza**: cuánto daño le pueden hacer en cada casilla los enemigos que conoce
  (`knownFoes`), con lo que se mueven y su alcance (`distanceMap`, `strikeReach`).
- **Control**: su fuerza menos la del enemigo, que se apaga con la distancia.
- **Frente**: las casillas donde el control cambia de signo.

Va en el contexto del turno (`PlayCtx`, como el fuego concentrado) y se pone al día cuando cae un
enemigo (sale de la amenaza). Con mapas de 32×32 y unas decenas de unidades es barato; se mide en la
fase 0.

**Cómo lo usa:** una lista nueva en el perfil, **razones para elegir una casilla de destino**
(`moveScoreTerms`, como `scoreTerms` para los ataques), con sus pesos en `ai.json`:

- **Peligro**: no acabar donde la amenaza pasa de lo que aguanta (salvo para atacar o capturar).
- **Frente**: acercarse a la línea, no al enemigo más cercano (`advance` deja de ir en línea recta).
- **Compañía**: quedarse cerca de los suyos.

**Hecho cuando:** bajan las unidades regaladas y sube la cohesión, sin perder contra la IA de antes.
Tests de `influence.ts` en mapas pequeños hechos a mano (amenaza, control y frente donde se espera).

## Fase 2: planes que duran

La IA se marca **objetivos** y los mantiene varios turnos:

- **Objetivos posibles**, puntuados con los mapas de la fase 1: edificios que capturar (mejor si
  están en zona propia o en el frente), grupos enemigos que atacar, edificios propios amenazados que
  defender y la Base enemiga cuando el control lo permite.
- **Reparto**: cada unidad (o grupo) se asigna a un objetivo según distancia, lo que hace falta allí
  (fuerza enemiga cerca, capturadores) y lo que hace ella.
- **Constancia**: solo cambia de plan si pasa algo gordo: el objetivo ya es suyo o lo ha perdido, el
  grupo ha caído por debajo de cierta fuerza, o la amenaza en el destino supera lo que lleva. Esos
  umbrales, pesos de `ai.json`.

**Dónde se guarda el plan.** Tiene que vivir en la partida (si no, se pierde al cargar o por la
red). Se reutiliza lo que ya hay: la IA forma **escuadras** y les da **órdenes permanentes**
(`attack`, `capture`, `defend`, `goto`) con acciones, como haría una persona. Así el plan se guarda,
la niebla ya lo esconde del rival («sus órdenes, su escuadra») y no hay que inventar nada.

**Decisión abierta:** quién cumple esas órdenes. (a) Las cumple el sistema de órdenes, como las de
una persona (sencillo, pero esas órdenes son más simples que la IA), o (b) la IA lee la orden como
**el destino de su plan** y sigue moviendo ella cada unidad con sus comportamientos (más trabajo,
juega mejor). Propuesta: **(b)**.

**Hecho cuando:** sube la constancia y bajan las partidas sin ganador, sin perder contra la IA de la
fase 1.

## Fase 3: memoria con la niebla

Cada equipo recuerda **dónde vio por última vez** a cada enemigo y cuándo.

- Lo apunta la partida tras cada acción, para **todos los equipos**, con una entrada en `INVARIANTS`
  (`core/rules/invariants.ts`): no hace falta una acción de la IA.
- Un equipo solo ve su memoria: una entrada nueva en `FOG` (`playerView.ts`).
- Cambia lo que se guarda: sube `SAVE_VERSION` (las partidas de antes se descartan).
- En la fase 1, un enemigo recordado pesa en la amenaza menos cuanto más viejo es el recuerdo.

**De regalo para la persona** (otra PR, si se quiere): la vista 3D puede dibujar un «fantasma» donde
se vio a cada enemigo, que es lo que un jugador lleva en la cabeza.

**Hecho cuando:** la IA deja de ir de cara a enemigos que acaba de perder de vista y no
olvida a quien se esconde en un bosque. Tests de la invariante y de la niebla.

## Fase 4: personalidades, errores y dificultad

- **Personalidades** en `ai.json`: cada una cambia algunos pesos y el orden de sus comportamientos
  (agresiva, cauta, codiciosa, tortuga). Se validan como el resto del contenido. Cada equipo de la
  IA lleva la suya (`TeamSetup`); una misión la elige; una escaramuza, al azar con la semilla.
- **Errores creíbles**: una pieza común (`core/util`) para elegir entre las mejores opciones según
  su puntuación, con más margen cuanto más alto es su valor de **nervios** (0: como ahora, siempre
  la mejor). Se usa al elegir objetivo, destino y compra. Con el azar de la partida, repetible.
- **Dificultad en «Nueva partida»** (`docs/IDEAS.md`, 3): Fácil, Normal y Difícil eligen los nervios
  y, si hace falta, el dinero de salida de la IA.

**Hecho cuando:** cada personalidad se distingue en las medidas (la agresiva ataca antes y pierde
más; la tortuga gana menos edificios...) y Fácil pierde claramente contra Normal.

## Fase 5 (más adelante): que los números se aprendan

La estructura sigue escrita a mano (es lo que deja ajustarla y entenderla); lo que se aprende son
**sus pesos**:

- **Jugando sola**: `npm run balance -- tune` ya busca valores; se amplía a los pesos de la IA,
  jugando el perfil nuevo contra el actual (fase 0).
- **Imitando a personas**: cuando haya partidas de personas registradas (la sesión ya las guarda),
  ajustar los pesos para que sus decisiones se parezcan a las de un jugador.

## Lo que no se hace (y por qué)

- **Entrenar una red que juegue sola** (aprendizaje por refuerzo): aprende a ganar, no a parecer
  humana (juega raro y explotable); necesita muchísimas partidas, y hoy casi ninguna acaba; hay que
  volver a entrenarla con cada cambio de reglas o precios; y no se puede afinar ni entender. Si un
  día interesa, como pieza pequeña que valora una posición, dentro de la IA de este plan.
- **Un modelo de lenguaje que decida**: rompe que la misma partida decida igual (repetir, cargar,
  red) y es lento y caro por turno.
- **Árboles de comportamiento o GOAP**: más rígidos que la lista de comportamientos con
  puntuaciones que ya hay; no aportan para esto.
- **Una figura de mando en la partida** (como los generales que se quitaron): todo esto es por
  dentro de la IA; el jugador no ve ninguna pieza nueva.

## Orden y tamaño

| Fase | PR | Cambia la partida guardada | Toca la vista |
|---|---|---|---|
| 0. Medirlo | 1 (herramientas) | No | No |
| 1. Mapas de influencia | 1 | No | No |
| 2. Planes que duran | 1 o 2 | No (usa escuadras y órdenes) | No |
| 3. Memoria | 1 (+1 opcional: fantasmas en 3D) | Sí (`SAVE_VERSION`) | Opcional |
| 4. Personalidades y dificultad | 2 (IA; menú) | Sí (`TeamSetup`) | El menú |
| 5. Aprender los pesos | Más adelante | No | No |

## Decisiones abiertas

1. **Fase 2:** ¿las órdenes del plan las cumple la IA (propuesta) o el sistema de órdenes?
2. **Fase 3:** ¿la memoria también para la persona, con fantasmas en el 3D?
3. **Fase 4:** ¿qué personalidades, y la de la escaramuza al azar o elegible en el menú?
4. **Fase 4:** ¿tres dificultades, y qué cambia cada una además de los nervios?
