# La partida por la red, de punta a punta

Para leer el codigo de la red con calma: que garantiza, como se llama cada cosa, por donde pasa una
jugada desde que se pulsa «Atacar» hasta que los demas la ven, y en que archivo esta cada pieza.
Las decisiones de diseño y el porque de cada una estan resumidas en `docs/ARQUITECTURA.md` ("Red",
"Servidor", "Cliente"); aqui esta el recorrido. Los nombres son los del codigo (si uno no cuadra con
el codigo, gana el codigo y hay que arreglar esto).

Tres piezas, en tres sitios:

| Pieza | Donde | Que es |
|---|---|---|
| El nucleo de la red | `src/core/net/` (fachada `src/core/net.ts`) | Una partida por la red **sin red**: el protocolo como datos, la sala (`Room`) que lo habla sobre una `GameSession`, la niebla de los sucesos y la vista de un cliente. TypeScript puro; se prueba sin servidor (`tests/room.test.ts`) |
| El servidor | `server/src/` | Un Worker de Cloudflare con un Durable Object por sala. Mueve mensajes entre los sockets y la sala, la guarda y lleva los relojes. No sabe de la partida |
| El cliente | `src/net/`, `src/menu/online/`, `src/scenes/game/onlinePlay.ts` | El navegador: la conexion con la sala, lo que llega convertido en partida y jugadas, la pantalla «Jugar en línea» y lo que la escena hace distinto cuando la partida es por la red |

## Que garantiza

- **El servidor manda.** La partida de verdad vive en el servidor, en una `GameSession` como la de la
  pantalla (`Room` la tiene dentro). Cada persona es un `remoteController` (la sesion espera sus
  acciones), cada equipo de la IA lo juega el servidor con `aiController`, y los dados son los de la
  partida. Todo lo que manda un cliente pasa por `session.act` con las mismas comprobaciones que lo
  de cualquiera (`dispatch`: su turno, su unidad, su alcance). La pantalla lleva una copia (la
  "sesion espejo") solo para jugar el turno propio con fluidez y animar; lo que vale es lo que el
  servidor contesta.
- **Nadie recibe mas que su vista con niebla.** Un cliente recibe la partida tal como la sabe su
  equipo (`ViewSnapshot`: la vista de `FOG`, en la forma de una partida guardada) y, de cada paso,
  solo los sucesos que su equipo ve (`eventsSeenBy`). Las semillas no salen del servidor (en una
  vista van a 0). Los pasos de los demas equipos van juntos en un solo mensaje (`events`), y si de
  ellos no se ve nada el mensaje no sale: ni leyendo la memoria del navegador ni escuchando la red
  se cuenta lo que hacen los enemigos donde no se ve.
- **La sala no delata nada al rechazar.** Antes de mandar una accion a la partida, la sala la
  pregunta a la partida **tal como la sabe el equipo** (`actionProblem` sobre su vista con niebla,
  `Room.dispatchKnown`): si ahi no vale, contesta eso sin preguntar a la de verdad. Probando uids o
  casillas no se descubre una unidad escondida ('notTarget', 'notYours', 'unreachable' la delatarian).
- **Las fichas son el unico secreto.** Cada asiento de persona tiene una ficha (`token`: 24 bytes de
  azar que pone el servidor, `newToken`; el nucleo no tira de ningun azar). El enlace de invitacion
  la lleva; con ella se entra y se vuelve a entrar. Se compara en tiempo constante (`sameToken`). Las
  fichas no viajan en la URL del WebSocket: van en el primer mensaje (`hello`).
- **Por que no se puede hacer trampa.** Un cliente trucado solo puede mandar mensajes del protocolo
  (lo demas es 'badMessage': `isValidMessage` comprueba campo a campo y con topes de tamaño). Cada
  mensaje lo atiende la partida de verdad, que no sabe que viene de la red. Lo que recibe es su vista
  con niebla, nunca la partida. Un mensaje repetido no se hace dos veces (`seq`). Y a quien insiste
  con mensajes que la sala rechaza, el servidor le corta (`rateLimit.ts`).

## Glosario

| Palabra | En el codigo | Que es |
|---|---|---|
| Sala | `Room` (nucleo), `RoomObject` + `RoomAdapter` (servidor) | Una partida por la red: la `GameSession` de verdad, sus asientos, y lo que hay que mandar a cada uno. Se guarda entera como JSON (`RoomSnapshot`) |
| Asiento | `Seat` = `PersonSeat` \| `AiSeat`; su numero, `SeatId` | Un puesto de la partida: hoy uno por equipo (`seat.team`), en el orden de los equipos. El 0 es siempre quien creo la sala |
| Persona / IA | `PersonSeat` (`kind: 'person'`) / `AiSeat` (`kind: 'ai'`) | Quien juega el asiento. En la partida, el `controller` del equipo es `'human'` o `'ai'` (nombres del nucleo del juego, no de la red): la red solo cambia **quien** mueve a la persona (un `remoteController` en el servidor, un `humanController` en la pantalla) |
| Ficha | `token` (`PersonSeat.token`) | El secreto con el que una persona entra en su asiento. La pone el servidor (`server/src/codes.ts`) |
| Codigo | `code` (`isRoomCode`, `newRoomCode`) | Las 6 letras de una sala (sin 0/O/1/I/L). Es publico: con el se pregunta el vestibulo (`GET /rooms/:code`) |
| Enlace de invitacion | `invite` (`#/sala/CODIGO/FICHA`), `parseInvite`, `inviteUrl` | Lo que se reparte a cada amigo: la pagina del juego con el codigo y la ficha de su asiento tras el `#` |
| Paso | `SessionStep`, `ActedStep` | Un paso de la `GameSession`: una accion hecha (con su equipo y sus sucesos), o que la sesion espera a alguien, o el final |
| Lote | `events` (mensaje), `Batch` (en `Courier`), `RoomPlay` de tipo `'events'` (cliente) | Los sucesos de varios pasos seguidos que una persona ve, juntos en un mensaje, con como queda su vista. Se junta mientras juegan los demas y se manda cuando algo lo saca (ver `Courier`) |
| `seq` | `seq` en `act`, `endTurn`, `surrender`; `PersonSeat.lastSeq` | El numero de orden de un mensaje con efecto, creciente por asiento y puesto por el cliente (`ServerLink`). La sala contesta con el (`result`) y no repite uno ya atendido ('stale') |
| `step` | `step` en `view`, `events`, `turn`; `PersonSeat.step` | El numero de cada mensaje que la sala manda a un asiento, creciente. Si al cliente le falta uno, pide la vista (`resync`). (No confundir con un paso de la sesion) |
| Vista | `ViewSnapshot` (= `SavedGameState`), `ViewChange` | La partida tal como la sabe un equipo, en la forma de una partida guardada. La entera llega en `view`; en cada `events` va solo lo que puede cambiar (`ViewChange`: sin mapa, reglas ni semillas: `FIXED_VIEW_KEYS`), y el cliente la completa con `mergeView` |
| Niebla | `FOG` (`playerView.ts`), `knowledgeOf`, `foggedCopy` | Lo que un equipo sabe de la partida. La red no calcula vision: se la pregunta a `PlayerView` |
| Sucesos vistos | `eventsSeenBy(sucesos, { before, after })` | Los sucesos de un paso tal como los ve un equipo, segun lo que sabia antes y sabe despues del paso (`Knowledge`, `Vantage`) |
| Courier | `Courier` (`courier.ts`) | Quien lleva a cada persona lo que pasa: guarda lo que sabia tras lo ultimo que se le mando, junta los lotes y numera los mensajes (`step`). `Outbox` es el monton de mensajes que salen en lo que va de llamada |
| Lo que sale | `Outgoing` (`{ seat, message }`) | Un mensaje para un asiento. Todo lo que la sala devuelve es una lista de estos; el servidor los reparte a los sockets de cada asiento |
| Jugada (del cliente) | `RoomPlay` (`roomClient.ts`) | Lo que la escena atiende en orden mientras no es su turno: un lote (`'events'`, con la vista de antes y la de despues), una vista entera (`'view'`), a quien se espera (`'turn'`) o el final (`'ended'`) |
| Snapshot | `RoomSnapshot` (`ROOM_SNAPSHOT_VERSION`) | La sala guardada: su estado, sus asientos (con `lastSeq` y `step`), la partida (`savedPart`) y el numero de la siguiente conexion. No lleva el registro de la sesion: la partida decide igual al recuperarla (las semillas van en ella) |
| Conexion | `PersonSeat.connection` (numero), `Attachment.connection` | Cada vez que una persona entra (`join`) recibe un numero nuevo; otra pestaña con la misma ficha la sustituye. (En el cliente, como va el enlace es `LinkStatus`: 'connecting', 'online', 'reconnecting', 'closed') |
| Enlace (con el servidor) | `ServerLink` (`serverLink.ts`) | El WebSocket del cliente con los mensajes encima: saluda, numera, reconecta y reenvia |
| Cliente de la sala | `RoomClient` (`roomClient.ts`) | Convierte los `ServerMessage` en la partida del equipo y en jugadas (`RoomPlay`) |
| `OnlineMatch` | `onlineMatch.ts` | Enlace y cliente juntos, con quien los escucha ahora (primero la pantalla del vestibulo, luego la escena) |
| Sesion espejo | `mirrorSession` (`matchSetup.ts`) | La `GameSession` de la pantalla sobre la vista del servidor: la persona juega su equipo (`humanController`), los demas son `remoteController` (la sesion los espera y no juega nada por ellos) |
| Eco | `RoomClient.nextEcho`, `echoDue` | El `events` que sigue a un `result` que valio: es la vista al dia tras la accion propia. No se anima (ya se animo con el `result`); se da a quien la espera |
| Presupuesto de pasos | `ADVANCE_STEP_BUDGET`, `Room.isMidway`, `Room.continueMatch` | Cuantos pasos seguidos da la sala en una llamada (un turno de la IA puede ser largo y una llamada del servidor tiene su tiempo contado). Si se queda a medias, el servidor sigue desde una alarma |

## El viaje de una jugada

La persona de la pantalla ataca con una unidad. Lo que pasa, en orden, nombrando cada funcion:

1. **La escena** (`src/scenes/GameScene.ts`, fase `attack` en `src/scenes/game/phases/`) llama a
   `perform({ kind: 'attack', uid, target })` (`ActionHost.perform`). En una partida por la red,
   `perform` delega en `OnlinePlay.perform` (`src/scenes/game/onlinePlay.ts`): atacar lo decide el
   servidor (los dados y lo escondido estan alli), asi que no se hace en la sesion espejo.
2. **`OnlinePlay.perform`** pide el eco por adelantado (`client.nextEcho()`) y manda la accion:
   `online.client.act(action)`.
3. **`RoomClient.act`** (`src/net/roomClient.ts`) la envuelve en un mensaje `act` y lo manda por
   `ServerLink.send`, que le pone el siguiente `seq`, lo guarda en localStorage (`seqStorageKey`), lo
   apunta como sin contestar (`unanswered`) y lo escribe en el WebSocket como JSON. `act` devuelve
   una promesa que se resuelve con el `result` de ese `seq`.
4. **El Worker** no ve el mensaje: el WebSocket esta aceptado por el Durable Object de la sala
   (`RoomObject.fetch` lo subio; `server/src/roomObject.ts`). Llega a `RoomObject.webSocketMessage`:
   comprueba los bytes (`MAX_MESSAGE_BYTES`), carga la sala si estaba dormida (`load`), lee el JSON y,
   como el socket ya tiene su `Attachment` (asiento, conexion, ficha), llama a
   `adapter.handle(attachment.seat, message)`.
5. **`RoomAdapter.handle`** (`server/src/roomAdapter.ts`) es un paso fino a `Room.handle`.
6. **`Room.handle`** (`src/core/net/room.ts`): el asiento es de una persona (si no, 'noSeat'); el
   mensaje tiene forma (`isValidMessage`; si no, 'badMessage'); la persona esta dentro ('notJoined');
   el `seq` es mayor que el ultimo atendido (si no, 'stale'); se apunta `lastSeq` y se atiende
   (`attend` → `act`).
7. **`Room.act`**: `mayAct` (la sala juega y se espera a este equipo; si no, 'notPlaying' o
   'notYourTurn'), y `dispatchKnown`: primero `actionProblem` sobre la partida tal como la sabe el
   equipo (`courier.knownOf(person)`: lo ultimo que se le mando); si no vale ahi, ese es el
   resultado. Si vale, `session.act(person.team, action)`.
8. **`GameSession.act`** (`src/core/session/gameSession.ts`): `dispatch` con las reglas de siempre.
   Si vale, `record` apunta la accion y avisa a quien escucha: la sala esta suscrita
   (`Room.carry`).
9. **`Room.carry` → `Courier.carry`** (`src/core/net/courier.ts`): para cada persona que esta dentro,
   calcula lo que sabe ahora (`knowledgeOf`), saca los sucesos que ve (`eventsSeenBy` con el antes y
   el despues) y los junta a su lote pendiente. Si es de la alianza de quien actuo, su lote se manda
   ya (`deliver`: un `events` con `step` nuevo). Lo que vio quien actuo queda en `seenByActor`.
10. **De vuelta en `Room.act`**: el `result` para quien actuo lleva `seenByActor` (sus sucesos tal
    como el los ve) y va **antes** del `events` del paso; despues `advance()` lleva la sesion si hay
    algo que llevar (tras un ataque no: se sigue esperando a la misma persona). Todo sale como una
    lista de `Outgoing`.
11. **`RoomObject.afterActivity` → `sync`**: pone los relojes al dia (`timers.ts`), guarda la sala
    entera (`save`: `snapshot` + `meta`, y la alarma del primer reloj) y reparte cada `Outgoing` a los
    sockets abiertos de su asiento (`deliver`). `restrain` corta a quien lleva demasiados rechazos.
12. **En cada cliente**, `ServerLink.receive`: si el mensaje lleva `seq`, deja de estar sin contestar
    (`answered`); si lleva `step`, tiene que ser el siguiente (`followsStep`; si no, `resync`). Se lo
    pasa a `RoomClient.receive`.
13. **Quien ataco**: el `result` resuelve la promesa de `act` (`resultArrived`, que apunta que viene
    un eco: `echoDue`); el `events` que sigue es el eco (`eventsArrived`): pone `state` al dia con
    `mergeView` + `loadView` y lo da a `nextEcho`. `OnlinePlay.perform` recibe el `result` (si no
    vale: aviso «La sala no lo ha aceptado» y `resync`), espera el eco, adopta esa vista como partida
    (`adoptView`: sesion espejo nueva, `refresh`) y anima los sucesos del `result` como siempre
    (`playEvents`; `attacker: null` si no se ve a quien dispara ya lo dibuja la escena).
14. **Un aliado** recibe su `events` al momento (es de su alianza): `eventsArrived` lo pone en la cola
    como jugada `'events'` (con `before` y `after`). Su escena esta mirando la cola
    (`OnlinePlay.watchUntilMyTurn` → `showBatch`): lo anima contra `animationView(before, after)` y adopta `after`.
15. **Un enemigo** no recibe nada todavia: su lote sigue juntandose (`Courier.pending`) hasta que la
    sala pare (se espera a alguien, o acaba): entonces `deliverAll` le manda un solo `events` con todo
    lo que vio, si vio algo.

```mermaid
sequenceDiagram
  participant P as Persona (pantalla)
  participant S as GameScene / OnlinePlay
  participant C as RoomClient + ServerLink
  participant O as RoomObject (Durable Object)
  participant A as RoomAdapter
  participant R as Room
  participant G as GameSession
  participant K as Courier
  P->>S: Atacar
  S->>C: client.nextEcho(); client.act({ kind: 'attack' })
  C->>O: { kind: 'act', seq, action } (WebSocket)
  O->>A: handle(seat, message)
  A->>R: handle(seat, message)
  R->>R: isValidMessage, isJoined, seq > lastSeq, mayAct
  R->>R: dispatchKnown: actionProblem(vista del equipo)
  R->>G: session.act(team, action)
  G-->>R: record → carry(step)
  R->>K: carry(step, dentro)
  K-->>R: eventsSeenBy por persona; events a los aliados; seenByActor
  R-->>A: Outgoing[]: result (seq, sucesos vistos), events (aliados)
  A-->>O: Outgoing[]
  O->>O: sync: relojes, snapshot, alarma
  O-->>C: result; events (eco)
  C-->>S: act() resuelve con el result; nextEcho() con la vista al dia
  S->>S: adoptView(vista); playEvents(sucesos)
  S-->>P: el combate animado
  Note over K: los enemigos reciben su lote cuando la sala para (deliverAll)
```

Una accion que no se anima (mover, esperar, dar una orden) va por otro camino, mas corto: la escena
la hace en la sesion espejo (`GameScene.act`: `session.act`, con lo que sabe el equipo, como la
comprobaria la sala) y, si vale, la manda a la sala (`sendToRoom`) sin esperar; la respuesta solo se
mira si es un rechazo (algo escondido lo impedia): aviso y `resync`, y la vista del servidor vuelve
a ser la partida (`OnlinePlay.send`). Las ordenes que empiezan ya (`ActionHost.dispatcher`) van igual.

## Otros viajes, mas cortos

### Crear una sala y entrar

1. Pantalla «Crear sala» (`src/menu/online/createScreen.ts`): las opciones, los asientos (el 0 es
   quien crea; los demas, persona o IA, con su general) y los relojes. «Empezar» →
   `createRoom(base, { match: SkirmishChoices, turnSeconds?, waitingSeconds? })` (`src/net/roomApi.ts`,
   `POST /rooms`).
2. `server/src/index.ts`, ruta `createRoom`: comprueba el cuerpo campo a campo (`isRoomRequest`,
   `roomRequest.ts`), elige un codigo (`newRoomCode`) y llama por RPC a `RoomObject.create` →
   `RoomAdapter.create` → `Room.create(config, context)`: `buildMatch` prepara la partida y `seatsFor`
   los asientos, con una ficha por persona (`context.newToken`). Se guarda (`save`) con sus relojes
   (`initialTimers`). La respuesta: el codigo y, por asiento de persona, su ficha y su enlace
   (`inviteOf`).
3. Quien creo se queda con el asiento 0 y guarda los enlaces de los demas (`OnlineRoomEntry.invites`,
   `rememberRoom`) para repartirlos desde el vestibulo. Y entra: `OnlineScreens.joinRoom(code, token)`.
4. **Entrar** (`LobbyScreen.join`, `src/menu/online/lobbyScreen.ts`): `new OnlineMatch(base, code, token)` →
   `ServerLink.connect` → `GET /rooms/:code/ws` (`index.ts` → `RoomObject.fetch`: la subida a
   WebSocket) → al abrirse, `hello` con la ficha y las versiones (`CURRENT_PROTOCOL`).
5. `RoomObject.webSocketMessage` sin `Attachment` → `greet` → `adapter.join(hello)` → `Room.join`:
   forma y version ('badMessage', 'badVersion'), la ficha es de un asiento (`personWithToken`; si no,
   'badToken'), conexion nueva, y le manda `welcome` (asiento, equipo, versiones, estado, `lastSeq`) y
   su situacion (`sendSituation`: su vista entera y, si toca, a quien se espera o que acabo). Si con
   el ya estan todas las personas, `startIfComplete`: la sala pasa a 'playing' y `advance` lleva la
   partida hasta la primera persona (`turn` a todos). El servidor cierra otras pestañas con la misma
   ficha (`replaceSockets`, 4409) y apunta el `Attachment` en el socket.
6. El vestibulo pregunta cada 3 s quien esta (`lobbyOf`, `GET /rooms/:code` → `RoomAdapter.lobby`,
   nada de la partida) mientras la sala espera. Quien creo puede dar un asiento vacio a la IA
   (`handToAi`, `POST /rooms/:code/ai` → `RoomAdapter.handToAi` → `Room.replaceWithAi`).
7. Cuando el cliente tiene vista y ademas un `turn` o un `ended` (`RoomClient.turn`/`ended`), la
   pantalla pasa la conexion a la escena (`OnlineHost.startOnline` → `MenuScene.startOnline` →
   `GameStartData` 'online' → `startMatch` → `mirrorSession`). Un enlace `#/sala/...` al cargar el
   juego entra directo (`MenuScene.openInviteFromHash` → `OnlineScreen.openRoom`).

### Reconexion y resync

- **Se corta el socket.** `ServerLink.closed`: si el codigo de cierre no es de los que no tienen
  arreglo (`FATAL_CLOSE_CODES`: ficha mala 4401, otra pestaña 4409, la sala ya no existe 4410, otra
  version 4426), pasa a 'reconnecting' y vuelve a abrir con esperas crecientes (`RECONNECT_MS`).
  Al abrirse saluda otra vez; el servidor lo trata como entrar (`Room.join`: conexion nueva, `welcome`
  con `lastSeq`, y la vista entera: punto de partida nuevo). `welcomed` descarta lo mandado que el
  servidor ya atendio (`seq <= lastSeq`) y reenvia lo demas; el `seq` evita que nada se haga dos veces.
- **Falta un mensaje.** Cada `view`, `events` y `turn` lleva su `step`; si no es el siguiente
  (`followsStep`), el enlace pide la vista (`resync`) y no entrega el mensaje con hueco. Una `view`
  siempre esta en orden (es el punto de partida nuevo).
- **`resync`** llega a `Room.handle` → `sendSituation`: vista entera (+ `turn` o `ended`). Lo pide
  tambien el cliente cuando no puede leer una vista (`RoomClient.stateOf`), cuando le llega un
  `events` sin vista entera, y la escena cuando la sala rechaza una accion que la sesion espejo
  habia dado por buena.
- **La vista que llega en la escena**: si esta mirando la cola (`OnlinePlay.watchUntilMyTurn`), la
  adopta (`adoptView`: sesion espejo nueva, `GameScene.replaceMatch`); si es su turno,
  `OnlinePlay.playDuringOwnTurn` la adopta igual (lo que estuviera a
  medio decidir se abandona).
- **El servidor despierta.** Un Durable Object puede dormirse con los sockets abiertos
  (Hibernation API). `RoomObject.load` recupera la sala del almacen (`RoomAdapter.restore` →
  `Room.restore`: la partida se lee como una guardada y los asientos se comprueban, `isSeatOf`;
  `resume` deja a todos fuera y, si estaba jugando, `advance` sin mandar nada) y vuelve a meter a
  cada socket con la ficha de su `Attachment` (`readmitAll` → `adapter.rejoin(token)`): esos clientes
  reciben su vista entera otra vez.

### El turno de la IA en el servidor

1. La persona pulsa «Fin de turno»: `TurnFlow.endOwnTurn` → `OnlinePlay.endTurn` → `client.endTurn()`
   (mensaje `endTurn`, con `seq`; sin `result`: lo que sigue llega como jugadas) y la escena se pone a
   mirar la cola (`watchUntilMyTurn`).
2. `Room.attend` 'endTurn' → `mayAct` → `finishTurn`: `session.finishInput(team)` y `advance()`.
3. `advance` lleva la sesion con `runMatch(session, { until: ++steps >= budget })`: el `endTurn` de
   la persona (sus ordenes permanentes, sus capturas), el `startTurn` del siguiente, y si es de la
   IA su `aiController` propone acciones que la sesion hace una a una. Cada paso avisa a `Room.carry`:
   el `Courier` saca lo que ve cada persona y lo junta a su lote. Para cuando:
   - **se espera a una persona** (`awaitingInput`): `deliverAll` (a cada persona dentro, su lote en
     un solo `events`, si ve algo) y `announceTurn` (`turn` a todos, una vez por turno y dia);
   - **la partida se decide** (`over`) o ya no juega ninguna persona (`somebodyPlays`): 'ended';
   - **se agota el presupuesto** (`ADVANCE_STEP_BUDGET`, 400 pasos; `RoomContext.stepBudget` en
     los tests): `isMidway()` es true. El servidor lo ve en `sync` (`withContinuation` pone
     `continueAt: now`), pone la alarma y, en `RoomObject.alarm` ('continue'), llama a
     `adapter.continueMatch()` → `Room.continueMatch` → `advance` otra vez, con su propio tiempo de
     CPU. Lo que sale de una alarma llega a los que estan dentro como lo de cualquier paso.
4. En la pantalla, el `turn` de otro equipo pone «Esperando al equipo N…» en la linea de la conexion
   (`UIState.net.waiting`); el lote de los demas se anima por turnos (`splitByTurn`, el aviso de cada
   uno) contra `animationView(before, after)`; el `turn` propio devuelve el mando (`notifyTurn`: si no
   se mira la pestaña, el titulo y un toque lo avisan).

### Abandono y sustituir por la IA

- **Cerrar la pestaña** no es abandonar: `RoomObject.webSocketClose` → `adapter.leave(seat,
  connection)` → `Room.leave`: la persona queda fuera (`connection: null`, el `Courier` la olvida), su
  asiento sigue siendo suyo y la sala sigue esperandola. Vuelve con el enlace o desde «Mis partidas».
- **Rendirse** (menu de pausa, dos pulsaciones): `surrender` por la red (`RoomClient.act` lo manda
  como mensaje `surrender`; vale fuera de turno: `isAnyTime`). La sesion lo apunta, el `Courier` lo
  cuenta a todos (es publico) y, si ya no juega ninguna persona, la sala acaba (`ended.abandoned`).
- **Los que no llegan**: si quien creo pidio una espera (`waitingSeconds`), al vencer
  (`RoomObject.alarm`, 'waiting') cada asiento vacio pasa a la IA (`adapter.absentSeats` →
  `replaceWithAi`) y la partida empieza. Quien creo puede hacerlo antes, asiento a asiento, desde el
  vestibulo (`handToAi`).
- **`Room.replaceWithAi(seat)`**: el asiento pasa a ser `AiSeat`, la sesion cambia su controlador
  (`replaceController`: desde su turno en curso, si era el suyo) y la partida sigue (`advance`).
- **`Room.abandon(seat)`** (su equipo se rinde y queda fuera; si la sala esperaba, ya no se le
  espera) esta en el nucleo y probado, pero hoy el servidor no lo llama: quien se va conserva su
  asiento. Esta para cuando se quiera dar por ido a alguien.
- **Se acaba el tiempo** (`turnSeconds`): `RoomObject.alarm` ('turn') → `adapter.timeOut(seat)` →
  `Room.endTurnOf`: su turno acaba como si hubiera pulsado «Fin de turno», este dentro o no. En su
  pantalla llega un `turn` de otro equipo en pleno turno propio: `OnlinePlay.playDuringOwnTurn` lo
  atiende poniendose a esperar.

### Fin de partida

- La partida se decide en el servidor (`session.result` deja de ser 'playing') o se queda sin
  personas: `Room.advance` pone 'ended' y manda a cada persona dentro su lote y un `ended` (`result`,
  `abandoned`). Quien entre despues recibe la vista y el `ended` (`sendSituation`).
- En el cliente, `RoomClient` apunta `ended` y lo pone en la cola. La escena (`OnlinePlay.endedByRoom`)
  adopta la ultima vista y deja que la pantalla decida el final como siempre (`checkEnd` →
  `screenEnd`: ganada, perdida, rendicion). Por la red el final solo ofrece volver al menu (la
  revancha seria otra sala).
- La sala sigue guardada hasta que caduca (30 dias sin actividad, `ROOM_EXPIRY_MS`): entonces
  `expire` borra todo y cierra los sockets con 4410 ('gone'); el cliente lo quita de «Mis partidas».

## Los mensajes del protocolo

Todo JSON (`src/core/net/protocol.ts`). `PROTOCOL_VERSION` sube cuando cambia la forma de uno; la
version de la partida (`SAVE_VERSION`) va aparte en el saludo porque la vista es una partida guardada.

**Del cliente a la sala** (`ClientMessage`; los comprueba `isValidMessage` con `CLIENT_MESSAGE_SHAPES`):

| Mensaje | Quien lo manda | Cuando | Que lleva |
|---|---|---|---|
| `hello` | `ServerLink.open` | al abrirse el socket (la primera vez y en cada reconexion) | `token`, `protocol`, `save` |
| `act` | `RoomClient.act` | una accion del equipo propio (la que la sesion espejo dio por buena, o la que decide el servidor) | `seq`, `action` (una `GameAction`, con topes: `isWithinBounds`) |
| `endTurn` | `RoomClient.endTurn` | «Fin de turno» | `seq` |
| `surrender` | `RoomClient.act` con `{ kind: 'surrender' }` | rendirse (vale fuera de turno) | `seq` |
| `resync` | `ServerLink.resync` / `RoomClient.resync` | falta un `step`, una vista no se puede leer, la sala rechazo algo que aqui valia | nada |

**De la sala a un asiento** (`ServerMessage`):

| Mensaje | Quien lo manda | Cuando | Que lleva |
|---|---|---|---|
| `welcome` | `Room.join` | tras un `hello` que entra | `seat`, `team`, `protocol`, `save`, `status`, `lastSeq` (el ultimo `seq` suyo atendido) |
| `view` | `Courier.sendView` (desde `sendSituation`) | al entrar, al volver, tras `resync`, al despertar el servidor | `step`, `view` (`ViewSnapshot` entera) |
| `events` | `Courier.deliver` | lo de su alianza, al momento; lo de los demas, cuando la sala para (si ve algo) | `step`, `actor` (el equipo del ultimo paso), `events` (los vistos), `view` (`ViewChange`) |
| `result` | `Room.act` | la respuesta a un `act` o `surrender` suyo | `seq`, `result` (`{ ok, events }` con sus sucesos tal como los ve, o `{ ok: false, reason }`) |
| `turn` | `Courier.sendTurn` (desde `announceTurn` y `sendSituation`) | la sala para esperando a una persona (a todos), y al entrar si ya se esperaba a alguien | `step`, `team`, `day` |
| `ended` | `Room.advance`, `sendSituation` | la partida se decide o ya no juega ninguna persona | `result` (`MatchResult`), `abandoned` |
| `error` | `Room.refuse`, `RoomObject.turnAway` | un mensaje que la sala no atiende | `error` (`NetError`), `seq` si lo llevaba |

`NetError`: 'badMessage', 'badVersion', 'badToken', 'noSeat', 'notJoined', 'notPlaying',
'notYourTurn', 'stale'. Un `hello` que no entra se contesta con `error` y se cierra el socket con su
codigo (`CLOSE_CODES`: 4400 badMessage, 4401 badToken, 4409 replaced, 4410 gone, 4413 tooBig, 4426
badVersion, 4429 tooManyRejections).

**Las rutas HTTP** (`server/src/index.ts`, `ROUTES`; el cliente en `src/net/roomApi.ts`):

| Ruta | Que hace | Lleva / devuelve |
|---|---|---|
| `POST /rooms` | crea una sala | `RoomRequest` (`match`, `turnSeconds?`, `waitingSeconds?`) → `{ code, seats: [{ seat, team, token, invite }] }` |
| `GET /rooms/:code` | el vestibulo | → `LobbyInfo` (`status`, versiones, `seats: [{ seat, team, kind, joined }]`) |
| `POST /rooms/:code/ai` | quien creo da un asiento vacio a la IA | `{ token, seat }` → `{ ok: true }` |
| `GET /rooms/:code/ws` | la conexion de la partida | subida a WebSocket |

## Los estados de la sala

`RoomStatus`: 'waiting' (esperando a que entren todas las personas), 'playing', 'ended'. Esta tabla
es la maquina de estados de `Room` (`src/core/net/room.ts` remite aqui).

| Suceso | 'waiting' | 'playing' | 'ended' |
|---|---|---|---|
| `join` (hello con ficha buena) | entra, `welcome` + `view`; si ya estan todos → **'playing'** y `advance` | entra, `welcome` + `view` + `turn` (si se esperaba a alguien) | entra, `welcome` + `view` + `ended` |
| `leave` (se cierra su socket) | queda fuera; se le sigue esperando | queda fuera; su turno sigue siendo suyo (y su reloj, si lo hay) | queda fuera |
| `act` / `surrender` con `seq` repetido | 'stale' | 'stale' | 'stale' |
| `act` | 'notPlaying' | si se le espera: la accion por la sesion, `result` y lo que ven los demas; si no, 'notYourTurn' | 'notPlaying' |
| `surrender` | 'notPlaying' (pero ver `abandon`) | se rinde (vale fuera de turno); si ya no juega ninguna persona → **'ended'** (`abandoned`) | 'notPlaying' |
| `endTurn` | 'notPlaying' | si se le espera: `finishInput` y `advance` hasta la siguiente persona (`turn`), el final (**'ended'**) o el presupuesto (`isMidway`); si no, 'notYourTurn' | 'notPlaying' |
| `resync` | `view` | `view` + `turn` | `view` + `ended` |
| `replaceWithAi(seat)` (alarma de espera, o quien creo) | el asiento pasa a la IA; si ya estan todos → **'playing'** | el asiento pasa a la IA y la partida sigue (desde su turno, si era el suyo) | nada (el asiento cambia, pero no se juega) |
| `endTurnOf(seat)` (reloj del turno) | nada | si se le esperaba: como `endTurn` | nada |
| `abandon(seat)` (hoy no lo llama el servidor) | se rinde y ya no se le espera; si con eso estan todos → **'playing'** | se rinde y queda fuera; `advance` | queda fuera |
| `continueMatch()` | nada | `advance` (sigue lo que quedo a medias) | nada |
| `restore(snapshot)` | igual, todos fuera | igual, todos fuera; `advance` sin mandar nada | igual, todos fuera |
| la partida se decide (dentro de `advance`) | — | → **'ended'**: lotes pendientes y `ended` a todos | — |

Al parar `advance`, cada persona dentro recibe su lote pendiente (`deliverAll`); el `turn` se anuncia
una vez por equipo y dia (`announced`). Los asientos y sus numeros (`lastSeq`, `step`) van en el
snapshot; las conexiones no (al recuperar, nadie esta dentro).

## Mapa de archivos y orden de lectura

**El nucleo (`src/core/net/`)**, en este orden:

| Archivo | Que hay |
|---|---|
| `protocol.ts` | Los mensajes como tipos (`ClientMessage`, `ServerMessage`, `NetError`), las versiones, `isValidMessage` con sus topes, y la vista por trozos (`FIXED_VIEW_KEYS`, `viewChangeOf`, `mergeView`) |
| `seats.ts` | `PersonSeat`, `AiSeat`; buscar una persona por ficha (`personWithToken`), los asientos de una partida nueva (`seatsFor`), un asiento guardado bien formado (`isSeatOf`) |
| `eventFog.ts` | La niebla de los sucesos: `knowledgeOf`, `eventsSeenBy` y la tabla `EVENT_FOG` (que ve un equipo de cada tipo de suceso) |
| `courier.ts` | `Outbox` (lo que sale en esta llamada) y `Courier` (lo que se lleva a cada persona: vista, lotes, turno; los `step`) |
| `room.ts` | `Room`: crear, guardar y recuperar; entrar y salir; cada mensaje (`handle` → `attend` → `act` / `finishTurn`); lo que decide el servidor (`abandon`, `replaceWithAi`, `endTurnOf`, `continueMatch`); llevar la partida (`advance`) y repartir lo que pasa (`carry`) |
| `clientState.ts` | `viewSnapshotOf` (lo que se manda) y `loadView` (lo que lee el cliente, comprobado como una partida guardada) |
| `../net.ts` | La fachada: lo que el servidor y el cliente importan |

Pruebas: `tests/room.test.ts` (la sala entera por mensajes, con niebla y varios equipos; guardar y
recuperar; que no delata nada), `tests/eventFog.test.ts`, `tests/sim/netClient.ts` (un cliente
simulado que comprueba cada mensaje, usado tambien por el servidor).

**El servidor (`server/src/`)**:

| Archivo | Que hay |
|---|---|
| `index.ts` | El Worker: las rutas (`ROUTES`), CORS, el cuerpo acotado, y buscar el Durable Object de un codigo (`roomOf`) |
| `roomObject.ts` | `RoomObject`: el Durable Object de una sala. Los sockets (`webSocketMessage`, `greet`, `webSocketClose`), guardar y cargar (`save`, `load`, `readmitAll`), la alarma (`alarm`) y repartir lo que sale (`deliver`) |
| `roomAdapter.ts` | `RoomAdapter`: lo unico que toca `Room`, con nombres del servidor; el vestibulo (`lobby`) y dar un asiento a la IA (`handToAi`) |
| `timers.ts` | Los relojes como datos puros (caducar, el turno, la espera, seguir a medias) y cuando suena la alarma |
| `roomRequest.ts` | La forma de lo que se pide al crear una sala (`isRoomRequest`) |
| `codes.ts` | El codigo de sala, las fichas (`newToken`) y `sameToken` |
| `limits.ts`, `rateLimit.ts`, `cors.ts` | Topes y tiempos; frenar a quien insiste; desde que paginas se puede hablar |

Pruebas: `server/test/unit/` (las piezas puras con la sala de verdad) y `server/test/workers/`
(el Worker y el objeto de verdad dentro de workerd: dos personas por WebSocket y la IA, volver a
entrar, despertar, un `seq` repetido, las alarmas).

**El cliente (`src/net/`, el menu y la escena)**, en este orden:

| Archivo | Que hay |
|---|---|
| `src/net/serverUrl.ts` | Donde esta el servidor (`VITE_SERVER_URL` o `ilogic.server` en localStorage) |
| `src/net/serverLink.ts` | `ServerLink`: el WebSocket con el protocolo encima: saludo, `seq`, reconexion, reenvio, `step` |
| `src/net/roomClient.ts` | `RoomClient`: los mensajes como partida (`state`) y jugadas (`RoomPlay`, `next`), `act` con su promesa, el eco; `animationView` y `splitByTurn` para animar un lote |
| `src/net/onlineMatch.ts` | `OnlineMatch`: enlace y cliente juntos, con quien los escucha |
| `src/net/roomApi.ts` | Las rutas HTTP: `createRoom`, `lobbyOf`, `handToAi` |
| `src/net/onlineRooms.ts` | «Mis partidas en línea» en localStorage; `parseInvite`, `inviteUrl` |
| `src/menu/online/` | La pantalla «Jugar en línea»: `onlineScreen.ts` (`OnlineScreen`: enlaza las cuatro pantallas, el foco y las ordenes), `menuScreen.ts` (crear, entrar, mis partidas), `createScreen.ts`, `joinScreen.ts`, `lobbyScreen.ts` (el vestibulo: la conexion con la sala y el paso a la escena) y `shared.ts` (`OnlineHost`, `OnlineScreens`) |
| `src/hud/menus/Online.tsx` | El HTML de esa pantalla (Preact), a partir de `OnlineVM` |
| `src/scenes/game/matchSetup.ts` | `startOnlineMatch`, `mirrorSession` |
| `src/scenes/game/onlinePlay.ts` | `OnlinePlay`: lo que la escena hace distinto por la red. `send` (lo que valio en la sesion espejo) y `perform` (lo decide el servidor), `endTurn`, la cola de jugadas hasta el turno propio (`watchUntilMyTurn`, `showBatch` anima un lote, `waitFor` pone «Esperando al equipo N…»), lo que llega en el turno propio (`playDuringOwnTurn`), `adoptView`, la linea de la conexion (`publishLink`), el cierre sin arreglo (`roomClosed`) y el final (`endedByRoom`). Lo que toca de los turnos de la pantalla lo pide a `TurnFlow` por `TurnHooks` |
| `src/scenes/game/turnNotice.ts` | El aviso de «Tu turno» cuando no se mira la pestaña (titulo y toque) |

Pruebas: `tests/onlineClient.test.ts` (enlace y cliente con un socket falso), `tests/visual/online.mjs`
(`npm run online`: `wrangler dev` y dos navegadores de verdad, de punta a punta).
