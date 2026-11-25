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
| El servidor | `server/` | La sala del servidor (`HostedRoom`, `server/src/`) alojada en uno de dos sitios: un Worker de Cloudflare con un Durable Object por sala (`server/src/cloudflare/`) o un proceso de Node que cualquiera puede alojar (`server/node/`). Mueve mensajes entre los sockets y la sala, la guarda y lleva los relojes. No sabe de la partida |
| El cliente | `src/net/`, `src/menu/online/`, `src/view3d/systems/net/` | El navegador: la conexion con la sala, lo que llega convertido en partida y jugadas, la pantalla «Jugar en línea» y lo que la partida 3D hace distinto cuando es por la red (`OnlinePlay`) |

## Que garantiza

- **El servidor manda.** La partida de verdad vive en el servidor, en una `GameSession` como la de la
  pantalla (`Room` la tiene dentro). Cada persona es un `remoteController` (la sesion espera sus
  acciones), cada equipo de la IA lo juega el servidor con `aiController`, y los dados son los de la
  partida. Todo lo que manda un cliente pasa por `session.act` con las mismas comprobaciones que lo
  de cualquiera (`dispatch`: su turno, su unidad, su alcance). La pantalla lleva una copia (la
  "sesion espejo") para saber que se puede hacer y para animar, pero no hace en ella ninguna accion:
  todas las decide el servidor, y lo que vale es lo que contesta.
- **Toda accion que vale trae su eco.** Detras del `result` que vale, quien actuo recibe siempre un
  `events` con su vista al dia, aunque no vea ningun suceso nuevo (`Courier.carry` con `echoTo`): la
  pantalla que lo espera nunca se queda colgada. Si la respuesta se pierde en un corte, al volver se
  da por buena (el `welcome` dice hasta que `seq` se atendio) y la vista entera que llega trae lo que hizo.
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
  azar que pone el servidor, `newToken`; el nucleo no tira de ningun azar). Quien crea la sala se
  queda con la del primer asiento; los demas piden la de un asiento libre con el codigo
  (`claimSeat`: cada asiento se da una sola vez) y este navegador la guarda en «Mis partidas»; con
  ella se entra y se vuelve a entrar. El codigo y el enlace de la sala no llevan ninguna ficha. Se compara en tiempo constante (`sameToken`). Las
  fichas no viajan en la URL del WebSocket: van en el primer mensaje (`hello`).
- **Por que no se puede hacer trampa.** Un cliente trucado solo puede mandar mensajes del protocolo
  (lo demas es 'badMessage': `isValidMessage` comprueba campo a campo y con topes de tamaño). Cada
  mensaje lo atiende la partida de verdad, que no sabe que viene de la red. Lo que recibe es su vista
  con niebla, nunca la partida. Un mensaje repetido no se hace dos veces (`seq`). Y a quien insiste
  con mensajes que la sala rechaza, el servidor le corta (`rateLimit.ts`).

## Glosario

| Palabra | En el codigo | Que es |
|---|---|---|
| Sala | `Room` (nucleo), `HostedRoom` + `RoomAdapter` (servidor; lo que da cada sitio, `RoomHost`: el Durable Object `RoomObject` en Cloudflare, `NodeRooms` en Node) | Una partida por la red: la `GameSession` de verdad, sus asientos, y lo que hay que mandar a cada uno. Se guarda entera como JSON (`RoomSnapshot`) |
| Asiento | `Seat` = `PersonSeat` \| `AiSeat`; su numero, `SeatId` | Un puesto de la partida: hoy uno por equipo (`seat.team`), en el orden de los equipos. El 0 es siempre quien creo la sala |
| Persona / IA | `PersonSeat` (`kind: 'person'`) / `AiSeat` (`kind: 'ai'`) | Quien juega el asiento. En la partida, el `controller` del equipo es `'human'` o `'ai'` (nombres del nucleo del juego, no de la red): la red solo cambia **quien** mueve a la persona (un `remoteController` en el servidor, un `humanController` en la pantalla) |
| Ficha | `token` (`PersonSeat.token`) | El secreto con el que una persona entra en su asiento. La pone el servidor (`server/src/codes.ts`) |
| Codigo | `code` (`isRoomCode`, `newRoomCode`) | Las 6 letras de una sala (sin 0/O/1/I/L). Es publico: con el se pregunta el vestibulo (`GET /rooms/:code`) y se pide asiento. Su forma (`isRoomCode`) es del nucleo: la comprueban igual el servidor y la pantalla, que no pregunta por lo que no puede ser un codigo |
| Enlace de la sala | `#/sala/CODIGO`, `parseRoomLink`, `roomLinkUrl` | Lo que se reparte (el mismo para todos): la pagina del juego con el codigo tras el `#`. Quien lo abre entra en su asiento si ya lo tiene; si no, pide uno libre. `#/sala/CODIGO/FICHA` entra en un asiento concreto |
| Pedir asiento | `claimSeat` (`Room`, `RoomAdapter`, `HostedRoom`; `POST /rooms/:code/seat`), `PersonSeat.claimed` | Con el codigo, el servidor da la ficha del primer asiento de persona libre mientras la sala espera. Un asiento dado ya no se da a nadie mas (`claimed` va en el snapshot) |
| Paso | `SessionStep`, `ActedStep` | Un paso de la `GameSession`: una accion hecha (con su equipo y sus sucesos), o que la sesion espera a alguien, o el final |
| Lote | `events` (mensaje), `Batch` (en `Courier`), `RoomPlay` de tipo `'events'` (cliente) | Los sucesos de varios pasos seguidos que una persona ve, juntos en un mensaje, con como queda su vista. Se junta mientras juegan los demas y se manda cuando algo lo saca (ver `Courier`) |
| `seq` | `seq` en `act`, `endTurn`, `surrender`; `PersonSeat.lastSeq` | El numero de orden de un mensaje con efecto, creciente por asiento y puesto por el cliente (`ServerLink`). La sala contesta con el (`result`) y no repite uno ya atendido ('stale') |
| `step` | `step` en `view`, `events`, `turn`; `PersonSeat.step` | El numero de cada mensaje que la sala manda a un asiento, creciente. Si al cliente le falta uno, pide la vista (`resync`). (No confundir con un paso de la sesion) |
| Vista | `ViewSnapshot` (= `SavedGameState`), `ViewChange` | La partida tal como la sabe un equipo, en la forma de una partida guardada. La entera llega en `view`; en cada `events` va solo lo que puede cambiar (`ViewChange`: sin mapa, reglas ni semillas: `FIXED_VIEW_KEYS`), y el cliente la completa con `mergeView` |
| Niebla | `FOG` (`playerView.ts`), `knowledgeOf`, `foggedCopy` | Lo que un equipo sabe de la partida. La red no calcula vision: se la pregunta a `PlayerView` |
| Sucesos vistos | `eventsSeenBy(sucesos, { before, after })` | Los sucesos de un paso tal como los ve un equipo, segun lo que sabia antes y sabe despues del paso (`Knowledge`, `Vantage`) |
| Courier | `Courier` (`courier.ts`) | Quien lleva a cada persona lo que pasa: guarda lo que sabia tras lo ultimo que se le mando, junta los lotes y numera los mensajes (`step`). `Outbox` es el monton de mensajes que salen en lo que va de llamada |
| Lo que sale | `Outgoing` (`{ seat, message }`) | Un mensaje para un asiento. Todo lo que la sala devuelve es una lista de estos; el servidor los reparte a los sockets de cada asiento |
| Jugada (del cliente) | `RoomPlay` (`roomClient.ts`) | Lo que la partida (`OnlinePlay`) atiende en orden: un lote (`'events'`, con la vista de antes y la de despues), una vista entera (`'view'`), a quien se espera (`'turn'`) o el final (`'ended'`) |
| Snapshot | `RoomSnapshot` (`ROOM_SNAPSHOT_VERSION`) | La sala guardada: su estado, sus asientos (con `lastSeq` y `step`), la partida (`savedPart`) y el numero de la siguiente conexion. No lleva el registro de la sesion: la partida decide igual al recuperarla (las semillas van en ella) |
| Conexion | `PersonSeat.connection` (numero), `Attachment.connection` | Cada vez que una persona entra (`join`) recibe un numero nuevo; otra pestaña con la misma ficha la sustituye. (En el cliente, como va el enlace es `LinkStatus`: 'connecting', 'online', 'reconnecting', 'closed') |
| Enlace (con el servidor) | `ServerLink` (`serverLink.ts`) | El WebSocket del cliente con los mensajes encima: saluda, numera, reconecta y reenvia |
| Cliente de la sala | `RoomClient` (`roomClient.ts`) | Convierte los `ServerMessage` en la partida del equipo y en jugadas (`RoomPlay`) |
| `OnlineMatch` | `onlineMatch.ts` | Enlace y cliente juntos, con quien los escucha ahora: la pantalla del vestibulo y, en la partida (otra carga de pagina, otra conexion), `OnlinePlay` |
| Quien lleva la partida | `MatchRunner` (`src/view3d/systems/turn/matchRunner.ts`) | Lo unico que el turno 3D (`TurnControls`) sabe de quien lleva la partida: hacer una accion, acabar el turno y esperar a que vuelva a tocar. `localRunner` (la sesion de esta pantalla) u `OnlinePlay` (la sala) |
| Sesion espejo | `mirrorSession` (`src/net/mirrorSession.ts`) | La `GameSession` de la pantalla sobre la vista del servidor: la persona juega su equipo (`humanController`), los demas son `remoteController` (la sesion los espera y no juega nada por ellos) |
| Eco | `RoomClient.echoDue` (en la sala, `echoTo`) | El `events` que sigue a un `result` que valio: es la vista al dia tras la accion propia. Sale siempre, aunque quien actuo no vea nada nuevo. No se anima (ya se anima con el `result`): `act` lo devuelve junto al resultado (`RoomReply.state`) |
| Presupuesto de pasos | `ADVANCE_STEP_BUDGET`, `Room.isMidway`, `Room.continueMatch` | Cuantos pasos seguidos da la sala en una llamada (un turno de la IA puede ser largo y una llamada del servidor tiene su tiempo contado). Si se queda a medias, el servidor sigue desde una alarma |

## El viaje de una jugada

La persona de la pantalla ataca con una unidad. Lo que pasa, en orden, nombrando cada funcion:

1. **El turno 3D** (`TurnControls`, `src/view3d/systems/turn/turnControls.ts`) hace la accion con
   `perform`, que se la pide a quien lleva la partida: `runner.act({ kind: 'attack', uid, target })`
   (`MatchRunner`). Por la red es `OnlinePlay.act` (`src/view3d/systems/net/onlinePlay.ts`): toda
   accion la decide el servidor (los dados y lo escondido estan alli), asi que no se hace en la
   sesion espejo.
2. **`OnlinePlay.act`** mira primero si vale con lo que sabe el equipo (`actionProblem` sobre la
   vista; si no, contesta el aviso sin preguntar a la sala) y, si vale, `askRoom` la manda
   (`client.act(action)`).
3. **`RoomClient.act`** (`src/net/roomClient.ts`) la envuelve en un mensaje `act` y lo manda por
   `ServerLink.send`, que le pone el siguiente `seq`, lo guarda en localStorage (`seqStorageKey`), lo
   apunta como sin contestar (`unanswered`) y lo escribe en el WebSocket como JSON. `act` devuelve
   una promesa que se resuelve con el `result` de ese `seq` y, si vale, con su eco.
4. **El servidor** lo da a la sala, `HostedRoom.receive` (`server/src/hostedRoom.ts`). En Cloudflare
   el Worker no ve el mensaje: el WebSocket esta aceptado por el Durable Object de la sala
   (`RoomObject.fetch` lo subio) y llega a `RoomObject.webSocketMessage`; en Node, a la conexion que
   `NodeRooms.accept` dio a su sala. `receive` comprueba los bytes (`MAX_MESSAGE_BYTES`), carga la
   sala si no estaba en memoria (`load`), lee el JSON y, como el socket ya tiene su `Attachment`
   (asiento, conexion, ficha), llama a `adapter.handle(attachment.seat, message)`.
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
11. **`HostedRoom.afterActivity` → `sync`**: pone los relojes al dia (`timers.ts`), guarda la sala
    entera (`save`: `snapshot` + `meta`, y la alarma del primer reloj, `RoomHost.save`) y reparte cada
    `Outgoing` a los sockets abiertos de su asiento (`deliver`; cada `turn`, con lo que le queda al
    reloj del turno: `withTurnClock`). A quien lleva demasiados rechazos
    (`isOverRejectionLimit`, contado al llegar cada mensaje) se le corta despues.
12. **En cada cliente**, `ServerLink.receive`: si el mensaje lleva `seq`, deja de estar sin contestar
    (`answered`); si lleva `step`, tiene que ser el siguiente (`followsStep`; si no, `resync`). Se lo
    pasa a `RoomClient.receive`.
13. **Quien ataco**: un `result` que no vale resuelve ya la promesa de `act`; uno que vale la deja
    esperando su eco (`resultArrived` lo apunta en `echoDue` con sus sucesos). El `events` que sigue
    es el eco (`eventsArrived`): pone `state` al dia con `mergeView` + `loadView` y resuelve la
    promesa con los sucesos y esa vista (`answerEchoes`). Una vista entera que llegue antes no la
    resuelve (puede ser de antes de la accion: la de un `resync`); solo hace de eco a lo que ya valio
    o se perdio en un corte. `OnlinePlay.askRoom` recibe la respuesta (si no vale: `resync` y el
    aviso «La sala no lo ha aceptado») y adopta el eco como la partida que se ve (`adopt`: `fillWith`
    en el mismo objeto, sesion espejo nueva y `TurnControls.viewReplaced`); `TurnControls.perform`
    anima los sucesos del `result` como en una partida de esta pantalla (`events.play`).
14. **Un aliado** recibe su `events` al momento (es de su alianza): `eventsArrived` lo pone en la cola
    como jugada `'events'` (con `before` y `after`). Su pantalla esta mirando la cola
    (`OnlinePlay.untilInput` → `showBatch`): pone en la partida que se ve `animationView(before,
    after)`, lo anima y adopta `after`.
15. **Un enemigo** no recibe nada todavia: su lote sigue juntandose (`Courier.pending`) hasta que la
    sala pare (se espera a alguien, o acaba): entonces `deliverAll` le manda un solo `events` con todo
    lo que vio, si vio algo.

```mermaid
sequenceDiagram
  participant P as Persona (pantalla)
  participant S as TurnControls / OnlinePlay
  participant C as RoomClient + ServerLink
  participant O as HostedRoom (Cloudflare o Node)
  participant A as RoomAdapter
  participant R as Room
  participant G as GameSession
  participant K as Courier
  P->>S: Atacar
  S->>S: actionProblem(vista del equipo)
  S->>C: client.act({ kind: 'attack' })
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
  C-->>S: act() resuelve con los sucesos del result y la vista al dia (el eco)
  S->>S: adopt(vista); events.play(sucesos)
  S-->>P: el combate animado
  Note over K: los enemigos reciben su lote cuando la sala para (deliverAll)
```

Todas las acciones van por este camino, tambien las que apenas se animan (mover, esperar, dar una
orden): la pantalla no las hace en la sesion espejo, espera a la sala. Asi no hay nada que deshacer
cuando la sala rechaza algo (lo escondido lo impedia), y la espera es una ida y vuelta que apenas se
nota. Mientras, el turno esta ocupado (`TurnControls.busy`) y no se puede pulsar otra cosa.

## Otros viajes, mas cortos

### Crear una sala y entrar

1. Pantalla «Crear partida» (`src/menu/online/createScreen.ts`): quien juega (el 0 es quien crea; los
   demas, persona por defecto, o IA), las reglas (los ajustes de «Nueva partida», `applyPreset`; las
   opciones una a una solo en «Personalizada») y los relojes. «Crear partida» →
   `createRoom(base, { match: SkirmishChoices, turnSeconds?, waitingSeconds? })` (`src/net/roomApi.ts`,
   `POST /rooms`).
2. `server/src/routes.ts`, ruta `createRoom`: comprueba el cuerpo campo a campo (`isRoomRequest`,
   `roomRequest.ts`), elige un codigo (`newRoomCode`) y pide la sala a quien aloja el servidor
   (`RoomDirectory.create`: en Cloudflare, por RPC a `RoomObject.create`) → `HostedRoom.create` →
   `RoomAdapter.create` → `Room.create(config, context)`: `buildMatch` prepara la partida y `seatsFor`
   los asientos, con una ficha por persona (`context.newToken`). Se guarda (`save`) con sus relojes
   (`initialTimers`). Quien crea se queda con el primer asiento (`HostedRoom.create` →
   `RoomAdapter.claimSeat` → `Room.claimSeat`) y la respuesta es su billete: `{ code, seat, team,
   token }` (`seatTicket`).
3. Quien creo apunta la sala en «Mis partidas» (`rememberRoom`) y entra:
   `OnlineScreens.joinRoom(code, token, { seat, team })`. Para invitar, el vestibulo enseña el codigo
   y el enlace de la sala (`roomLinkUrl`, sin ficha) para copiar o compartir. **Los demas** escriben
   el codigo (o pegan el enlace) en «Unirse a una partida», o abren el enlace:
   `OnlineScreen.enterRoom(code)`. Si este navegador ya tiene asiento en esa sala (`readOnlineRooms`)
   entra en el; si no, `claimSeat(base, code)` (`src/net/roomApi.ts`, `POST /rooms/:code/seat` →
   `HostedRoom.claimSeat` → `Room.claimSeat`): el primer asiento de persona libre, o por que no
   ('noSuchRoom', 'notWaiting', 'noFreeSeat'). Con su billete entra igual.
4. **Entrar** (`LobbyScreen.join`, `src/menu/online/lobbyScreen.ts`): `new OnlineMatch(base, code, token)` →
   `ServerLink.connect` → `GET /rooms/:code/ws` (la subida a WebSocket: en Cloudflare, `routes.ts` →
   `RoomObject.fetch`; en Node, `upgrader` en `nodeServer.ts`) → al abrirse, `hello` con la ficha y las versiones (`CURRENT_PROTOCOL`).
5. `HostedRoom.receive` sin `Attachment` → `greet` → `adapter.join(hello)` → `Room.join`:
   forma y version ('badMessage', 'badVersion'), la ficha es de un asiento (`personWithToken`; si no,
   'badToken'), conexion nueva, y le manda `welcome` (asiento, equipo, versiones, estado, `lastSeq`) y
   su situacion (`sendSituation`: su vista entera y, si toca, a quien se espera o que acabo). Si con
   el ya estan todas las personas, `startIfComplete`: la sala pasa a 'playing' y `advance` lleva la
   partida hasta la primera persona (`turn` a todos). El servidor cierra otras pestañas con la misma
   ficha (`replaceSockets`, 4409) y apunta el `Attachment` en el socket.
6. El vestibulo pregunta cada 3 s quien esta (`lobbyOf`, `GET /rooms/:code` → `RoomAdapter.lobby`,
   nada de la partida) mientras la sala espera. Quien creo puede dar un asiento vacio a la IA
   (`handToAi`, `POST /rooms/:code/ai` → `RoomAdapter.handToAi` → `Room.replaceWithAi`). «Mis
   partidas» pregunta lo mismo cada 20 s por cada sala apuntada (`MenuScreen.refresh`): con
   `LobbyInfo.turn` (a quien se espera, el dia y cuando vence su reloj; los turnos se anuncian a
   todos) dice «Te toca», el turno de quien, «Esperando jugadores», «Acabada» o «Ya no existe», con
   lo que pide hacer algo arriba (`roomLines.ts`).
7. Cuando el cliente tiene vista y ademas un `turn` o un `ended` (`RoomClient.isInPlay`), el
   vestibulo cierra su conexion y la partida empieza en otra carga de pagina, como todas
   (`OnlineHost.startOnline` → `MenuFlow.startOnline` → `GameStart` 'online', con el codigo y la
   ficha, en sessionStorage). Alli `openGame` → `joinMatch` (`src/view3d/app/gameStart.ts`) vuelve a
   entrar (`OnlineMatch.inPlay`: conecta y espera a estar en juego, o a un cierre sin arreglo, que
   vuelve al menu con su aviso) y la partida empieza sobre su vista (`mirrorSession`). Ese arranque no
   se borra al cargar: recargar la pagina vuelve a la sala; solo «Menú» lo quita (`backToMenu`). Un
   enlace `#/sala/...` al cargar el juego entra directo (`MenuFlow.openRoomFromHash` →
   `OnlineScreen.openRoom`).

### Buscar rival

1. «Buscar rival» en el menu (`src/menu/online/menuScreen.ts`): el ritmo (por turnos o en vivo;
   `PACE_RULES`, `src/core/net/search.ts`, que dice tambien el reloj y el mapa de cada uno) y
   «Buscar» → `OnlineScreen.searchRival(pace)` → `searchRival(base, { pace, avoid })`
   (`src/net/roomApi.ts`, `POST /match`). `avoid` son las salas propias que esperan rival
   (`OnlineRoomEntry.search`): que no le toque la suya.
2. `server/src/routes.ts`, ruta `searchRival`: comprueba el cuerpo (`searchRequestOf`) y lo pasa,
   con la direccion de quien pide (`CF-Connecting-IP`), al emparejador (`RivalSearch.search`: en
   Cloudflare, por RPC al unico `MatchmakerObject`; en Node, el `Matchmaker` del proceso). Las
   busquedas van de una en una (`Matchmaker.search` las encadena) y cada direccion tiene un tope
   (`RequestLimit`; pasado, 'tooManySearches').
3. `Matchmaker.searchNow`: la cola de ese ritmo (cargada del almacen la primera vez) → para cada sala
   (como mucho `MAX_SEARCH_CANDIDATES`, sin las de `avoid`), `RoomDirectory.info`: si ya no espera o
   no existe, sale de la cola; en vivo, si quien la abrio no esta dentro, se deja un rato
   (`LIVE_ABSENCE_GRACE_MS` desde que se ve) y despues sale; si vale, sale de la cola y
   `RoomDirectory.claimSeat` le da el asiento libre → `Room.claimSeat`, y como la sala es de las que
   empiezan con los asientos dados (`start: 'everyoneSeated'`), empieza ya: 'playing' y `advance`
   hasta la primera persona, que es quien llega (`firstTeam`: esta delante). A quien estaba dentro
   le llega por su socket (`ClaimSeatResult.outgoing`). Respuesta: `{ code, seat, team, token,
   matched: true }`.
4. Si ninguna vale: `createRoomWithFreeCode(rooms, searchRoomRequest(pace, newSeed()))` (lo mismo
   que `POST /rooms`: 1 contra 1, las reglas de siempre, mapa al azar con el tamaño del ritmo, su
   reloj y `start: 'everyoneSeated'`), la sala entra en la cola (si pasa de `MAX_WAITING_ROOMS`, sale
   la mas vieja) y la respuesta es su primer asiento, `matched: false`. La cola se guarda
   (`MatchQueueStore`: el almacen del objeto, o `emparejador.json`).
5. La pantalla entra en la sala como siempre (`OnlineScreens.joinRoom(code, token, { seat, team,
   search })`, paso 4 de «Crear una sala»): con rival, la sala ya juega y pasa a la partida; sin
   rival, la sala se apunta en «Mis partidas» con su ritmo y el vestibulo (`LobbyScreen`, con
   `entry.search`) dice «Buscando rival» en vez de invitar, con «Jugar contra la IA» (`handToAi` del
   asiento del rival: la sala empieza y sale de la cola al mirarla) y «Cancelar búsqueda». Por
   turnos se puede cerrar el juego: cuando llega alguien, «Mis partidas» lo dice («Te toca» o el
   turno del otro).
6. **Cancelar** (en el vestibulo, o «Cancelar» en la linea de «Mis partidas»:
   `OnlineScreen.cancelSearch`) → `closeRoom(base, code, token)` (`POST /rooms/:code/close` →
   `HostedRoom.close` → `RoomAdapter.canClose`: la ficha del primer asiento y la sala esperando) →
   la sala se borra (`expire`: quien este dentro sale con 4410) y se quita de «Mis partidas». Si
   justo llego un rival, 'notWaiting': la sala se queda y la partida sigue.

### Reconexion y resync

- **Se corta el socket.** `ServerLink.closed`: si el codigo de cierre no es de los que no tienen
  arreglo (`FATAL_CLOSE_CODES`: ficha mala 4401, otra pestaña 4409, la sala ya no existe 4410, otra
  version 4426), pasa a 'reconnecting' y vuelve a abrir con esperas crecientes (`RECONNECT_MS`).
  Al abrirse saluda otra vez; el servidor lo trata como entrar (`Room.join`: conexion nueva, `welcome`
  con `lastSeq`, y la vista entera: punto de partida nuevo). `welcomed` descarta lo mandado que el
  servidor ya atendio (`seq <= lastSeq`) y reenvia lo demas; el `seq` evita que nada se haga dos veces.
  Si lo atendido era un `act` cuya respuesta se perdio en el corte, su promesa se da por buena sin
  sucesos (`RoomClient.answerLost`): lo que hizo llega en la vista entera.
- **Falta un mensaje.** Cada `view`, `events` y `turn` lleva su `step`; si no es el siguiente
  (`followsStep`), el enlace pide la vista (`resync`) y no entrega el mensaje con hueco. Una `view`
  siempre esta en orden (es el punto de partida nuevo).
- **`resync`** llega a `Room.handle` → `sendSituation`: vista entera (+ `turn` o `ended`). Lo pide
  tambien el cliente cuando no puede leer una vista (`RoomClient.stateOf`), cuando le llega un
  `events` sin vista entera, y la partida cuando la sala rechaza una accion (`OnlinePlay.askRoom`).
- **La vista que llega en la partida**: `OnlinePlay` atiende cada jugada en su orden (`pump`, que
  espera a la accion en curso). Si esta mirando la cola (`untilInput`), la adopta (`adopt`: `fillWith`
  sobre la partida que se ve, sesion espejo nueva, `TurnControls.viewReplaced`); si es su turno, pone
  la partida al dia con la ultima que sabe el cliente (`duringOwnTurn`), no con la de la jugada: la
  vista de un `resync` puede atenderse detras del eco de una accion posterior, y volver a ella la
  desharia en la pantalla. Lo elegido que ya no esta se suelta: el turno busca sus unidades por uid
  (`onBoardNow`), no se fia de las de antes.
- **El servidor despierta.** Un Durable Object puede dormirse con los sockets abiertos
  (Hibernation API), y el servidor de Node arranca otra vez con las salas en disco (ahi nadie sigue
  dentro: los clientes vuelven a entrar por su cuenta). `HostedRoom.load` recupera la sala del almacen (`RoomAdapter.restore` →
  `Room.restore`: la partida se lee como una guardada y los asientos se comprueban, `isSeatOf`;
  `resume` deja a todos fuera y, si estaba jugando, `advance` sin mandar nada) y vuelve a meter a
  cada socket con la ficha de su `Attachment` (`readmitAll` → `adapter.rejoin(token)`): esos clientes
  reciben su vista entera otra vez.

### El turno de la IA en el servidor

1. La persona pulsa «Fin del turno»: `TurnControls.endTurn` → `runner.finishTurn()` →
   `OnlinePlay.finishTurn` → `client.endTurn()` (mensaje `endTurn`, con `seq`; sin `result`: lo que
   sigue llega como jugadas) y el turno se pone a mirar la cola (`runUntilInput` →
   `OnlinePlay.untilInput`).
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
     `continueAt: now`), pone la alarma y, en `HostedRoom.ring` ('continue'), llama a
     `adapter.continueMatch()` → `Room.continueMatch` → `advance` otra vez, con su propio tiempo de
     CPU. Lo que sale de una alarma llega a los que estan dentro como lo de cualquier paso.
4. En la pantalla, el `turn` de otro equipo pone «Esperando al equipo N…» en la linea de la conexion
   (`UIState.net.waiting`, una pastilla bajo la del dia) o, si la sala tiene reloj, su cuenta atras
   (ver «El reloj del turno»); el lote de los demas se anima contra
   `animationView(before, after)` (`showBatch` → `TurnControls.showOthers`, con el aviso del turno de
   cada uno, que va en sus sucesos); el `turn` propio devuelve el mando (`hooks.ownTurn` →
   `notifyTurn`: si no se mira la pestaña, el titulo lo avisa; el sonido de «tu turno» ya lo pone el
   turno).

### El reloj del turno

Si la sala tiene reloj (`turnSeconds`: 2 minutos en vivo, 1 dia por turnos), la pantalla cuenta lo
que le queda al turno de quien se espera:

1. La sala no sabe de relojes: su `turn` sale con `clock: null`. El servidor, en `HostedRoom.sync`,
   pone el reloj al dia (`withTurnOf`) y, al repartir, cada `turn` del turno en curso (a todos, y a
   quien entra o vuelve) lleva lo que le queda y lo que dura (`turnClockOf` → `TurnTimeLeft`:
   `{ leftMs, totalMs }`; `RoomAdapter.withTurnClock`). Va en tiempo que queda, no en hora: el reloj
   del navegador puede no ir a la par del servidor.
2. `RoomClient` lo pasa a hora de aqui al llegar (`TurnDeadline`: `endsAt`, `totalMs`) y lo lleva en
   la jugada `turn`: asi corre desde que llego aunque la jugada se atienda despues de lo que se anima.
3. `OnlinePlay` lo dice al atender cada `turn` (`hooks.showClock`; tambien el propio que vuelve tras
   un corte, `duringOwnTurn`) y lo quita (null) al acabar el turno propio, cuando la partida sigue sin
   el (`endsOwnTurn`: se le acabo el tiempo) y al final.
4. `TurnClock` (`src/view3d/systems/net/turnClock.ts`) lo cuenta con el bucle de dibujo y publica
   `UIState.turnClock` (`turnClockVM`, `src/ui/models/turnClock.ts`) cada vez que cambia el segundo:
   azul en el turno propio, rojo los ultimos `HURRY_SECONDS` (15) con un tic suave por segundo
   (`turn_clock_tick`) y «Fin del turno» que parpadea, y oscuro en el de otro (el anillo de su lado,
   «Juega el rojo»). Con el reloj y la conexion bien, la linea de la conexion no sale: ya lo dice el reloj.

### Abandono y sustituir por la IA

- **Cerrar la pestaña** no es abandonar: `HostedRoom.forget` → `adapter.leave(seat,
  connection)` → `Room.leave`: la persona queda fuera (`connection: null`, el `Courier` la olvida), su
  asiento sigue siendo suyo y la sala sigue esperandola. Vuelve con el enlace o desde «Mis partidas».
- **Rendirse** (menu de pausa, dos pulsaciones, tambien en el turno de otro: la pausa se abre mirando
  jugar a los demas, `TurnControls.isWatchingOthers`, sin «Fin del turno»; `match3d.surrender` →
  `runner.act`): `surrender` por la red (`RoomClient.act` lo manda como mensaje `surrender`; vale
  fuera de turno: `isAnyTime`). La sesion lo apunta, el `Courier` lo
  cuenta a todos (es publico) y, si ya no juega ninguna persona, la sala acaba (`ended.abandoned`).
- **Un asiento pedido no se libera.** Quien pide asiento con el codigo se lo queda aunque no llegue
  a entrar: si cierra la pestaña justo tras la respuesta, antes de apuntar la sala en «Mis partidas»,
  el asiento sigue dado (`claimed`) y nadie mas lo recibe. Es a proposito: soltarlo pediria saber
  cuando se ha ido alguien que nunca se conecto, y la carrera es muy estrecha. Ese asiento sale como
  «sin entrar» en el vestibulo y se arregla como el de cualquiera que no llega (lo siguiente).
- **Los que no llegan**: si quien creo pidio una espera (`waitingSeconds`), al vencer
  (`HostedRoom.ring`, 'waiting') cada asiento vacio pasa a la IA (`adapter.absentSeats` →
  `replaceWithAi`) y la partida empieza. Quien creo puede hacerlo antes, asiento a asiento, desde el
  vestibulo (`handToAi`).
- **`Room.replaceWithAi(seat)`**: el asiento pasa a ser `AiSeat`, la sesion cambia su controlador
  (`replaceController`: desde su turno en curso, si era el suyo) y la partida sigue (`advance`).
- **`Room.abandon(seat)`** (su equipo se rinde y queda fuera; si la sala esperaba, ya no se le
  espera) esta en el nucleo y probado, pero hoy el servidor no lo llama: quien se va conserva su
  asiento. Esta para cuando se quiera dar por ido a alguien.
- **Se acaba el tiempo** (`turnSeconds`): `HostedRoom.ring` ('turn') → `adapter.timeOut(seat)` →
  `Room.endTurnOf`: su turno acaba como si hubiera pulsado «Fin de turno», este dentro o no. En su
  pantalla llega, en pleno turno propio, un `turn` de otro equipo o un lote que pasa de turno:
  `OnlinePlay.route` (`endsOwnTurn`, con el antes y el despues del propio lote) lo pasa a la cola y avisa al turno (`othersGoOn`), que suelta lo
  elegido y se pone a animar a los demas (si estaba animando lo propio, al acabar).

### Fin de partida

- La partida se decide en el servidor (`session.result` deja de ser 'playing') o se queda sin
  personas: `Room.advance` pone 'ended' y manda a cada persona dentro su lote y un `ended` (`result`,
  `abandoned`). Quien entre despues recibe la vista y el `ended` (`sendSituation`).
- En el cliente, `RoomClient` apunta `ended` y lo pone en la cola. `OnlinePlay` (`ended`) adopta la
  ultima vista y el turno acaba (`untilInput` devuelve 'over'); la pantalla decide el final como en
  una partida de esta pantalla (`showEndIfOver`: ganada, perdida, rendicion), sin tocar la partida
  guardada de esta pantalla. Por la red el final solo ofrece volver al menu (la revancha seria otra
  sala). Las cuentas de los demas no estan en la vista (`withoutBooks`), asi que el final no las sabe
  (`docs/IDEAS.md`).
- La sala sigue guardada hasta que caduca (30 dias sin actividad, `ROOM_EXPIRY_MS`): entonces
  `expire` borra todo y cierra los sockets con 4410 ('gone'); el cliente lo quita de «Mis partidas».

## Los mensajes del protocolo

Todo JSON (`src/core/net/protocol.ts`). `PROTOCOL_VERSION` sube cuando cambia la forma de uno; la
version de la partida (`SAVE_VERSION`) va aparte en el saludo porque la vista es una partida guardada.

**Del cliente a la sala** (`ClientMessage`; los comprueba `isValidMessage` con `CLIENT_MESSAGE_SHAPES`):

| Mensaje | Quien lo manda | Cuando | Que lleva |
|---|---|---|---|
| `hello` | `ServerLink.open` | al abrirse el socket (la primera vez y en cada reconexion) | `token`, `protocol`, `save` |
| `act` | `RoomClient.act` | una accion del equipo propio (todas las decide el servidor) | `seq`, `action` (una `GameAction`, con topes: `isWithinBounds`) |
| `endTurn` | `RoomClient.endTurn` | «Fin de turno» | `seq` |
| `surrender` | `RoomClient.act` con `{ kind: 'surrender' }` | rendirse (vale fuera de turno) | `seq` |
| `resync` | `ServerLink.resync` / `RoomClient.resync` | falta un `step`, una vista no se puede leer, la sala rechazo algo que aqui valia | nada |

**De la sala a un asiento** (`ServerMessage`):

| Mensaje | Quien lo manda | Cuando | Que lleva |
|---|---|---|---|
| `welcome` | `Room.join` | tras un `hello` que entra | `seat`, `team`, `protocol`, `save`, `status`, `lastSeq` (el ultimo `seq` suyo atendido) |
| `view` | `Courier.sendView` (desde `sendSituation`) | al entrar, al volver, tras `resync`, al despertar el servidor | `step`, `view` (`ViewSnapshot` entera) |
| `events` | `Courier.deliver` | lo de su alianza, al momento; lo de los demas, cuando la sala para (si ve algo); tras una accion suya que vale, siempre (el eco) | `step`, `actor` (el equipo del ultimo paso), `events` (los vistos), `view` (`ViewChange`) |
| `result` | `Room.act` | la respuesta a un `act` o `surrender` suyo | `seq`, `result` (`{ ok, events }` con sus sucesos tal como los ve, o `{ ok: false, reason }`) |
| `turn` | `Courier.sendTurn` (desde `announceTurn` y `sendSituation`) | la sala para esperando a una persona (a todos), y al entrar si ya se esperaba a alguien | `step`, `team`, `day`, `clock` (`{ leftMs, totalMs }`, lo que le queda al reloj del turno: lo pone el servidor, `withTurnClock`; null sin reloj) |
| `ended` | `Room.advance`, `sendSituation` | la partida se decide o ya no juega ninguna persona | `result` (`MatchResult`), `abandoned` |
| `error` | `Room.refuse`, `HostedRoom.turnAway` | un mensaje que la sala no atiende | `error` (`NetError`), `seq` si lo llevaba |

`NetError`: 'badMessage', 'badVersion', 'badToken', 'noSeat', 'notJoined', 'notPlaying',
'notYourTurn', 'stale'. Un `hello` que no entra se contesta con `error` y se cierra el socket con su
codigo (`CLOSE_CODES`: 4400 badMessage, 4401 badToken, 4409 replaced, 4410 gone, 4413 tooBig, 4426
badVersion, 4429 tooManyRejections).

**Las rutas HTTP** (`server/src/routes.ts`, `ROUTES`, las mismas en Cloudflare y en Node; el cliente en `src/net/roomApi.ts`):

| Ruta | Que hace | Lleva / devuelve |
|---|---|---|
| `POST /rooms` | crea una sala | `RoomRequest` (`match`, `turnSeconds?`, `waitingSeconds?`) → `{ code, seat, team, token }` (el asiento de quien crea) |
| `POST /rooms/:code/seat` | pide un asiento libre con el codigo | → `{ code, seat, team, token }`; si no, 404 'noSuchRoom', 409 'notWaiting' o 'noFreeSeat' |
| `GET /rooms/:code` | el vestibulo y «Mis partidas» | → `LobbyInfo` (`status`, versiones, `seats: [{ seat, team, kind, joined }]`, `turn: { seat, day, endsAt } \| null`) |
| `POST /rooms/:code/ai` | quien creo da un asiento vacio a la IA | `{ token, seat }` → `{ ok: true }` |
| `GET /rooms/:code/ws` | la conexion de la partida | subida a WebSocket |

## Los estados de la sala

`RoomStatus`: 'waiting' (esperando a que entren todas las personas o, en una sala de la busqueda de
rival, `start: 'everyoneSeated'`, a que cada asiento sea de alguien), 'playing', 'ended'. Esta tabla
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
| `claimSeat()` (pedir asiento con el codigo, o buscando rival) | da el primer asiento de persona libre (`claimed`) y su ficha; si no queda, 'noFreeSeat'; con 'everyoneSeated', si era el ultimo → **'playing'** y `advance` | 'notWaiting' | 'notWaiting' |
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
| `roomCode.ts` | La forma del codigo de una sala (`isRoomCode`, `ROOM_CODE_ALPHABET`), la misma en el servidor y en la pantalla |
| `search.ts` | Los ritmos de «Buscar rival» (`SEARCH_PACES`, `PACE_RULES`: el reloj, el mapa y si quien busca tiene que estar) y cuantas salas propias se pueden evitar (`MAX_AVOIDED_ROOMS`) |
| `seats.ts` | `PersonSeat`, `AiSeat`; buscar una persona por ficha (`personWithToken`), si un asiento esta libre (`isFree`), los asientos de una partida nueva (`seatsFor`), un asiento guardado bien formado (`isSeatOf`) |
| `eventFog.ts` | La niebla de los sucesos: `knowledgeOf`, `eventsSeenBy` y la tabla `EVENT_FOG` (que ve un equipo de cada tipo de suceso) |
| `courier.ts` | `Outbox` (lo que sale en esta llamada) y `Courier` (lo que se lleva a cada persona: vista, lotes, turno; los `step`) |
| `room.ts` | `Room`: crear, guardar y recuperar; entrar y salir; cada mensaje (`handle` → `attend` → `act` / `finishTurn`); lo que decide el servidor (`abandon`, `replaceWithAi`, `endTurnOf`, `continueMatch`); llevar la partida (`advance`) y repartir lo que pasa (`carry`) |
| `clientState.ts` | `viewSnapshotOf` (lo que se manda), `loadView` (lo que lee el cliente, comprobado como una partida guardada) y `fillWith` (meter una vista en la partida que ya se ve, en el mismo objeto) |
| `../net.ts` | La fachada: lo que el servidor y el cliente importan |

Pruebas: `tests/room.test.ts` (la sala entera por mensajes, con niebla y varios equipos; guardar y
recuperar; que no delata nada), `tests/eventFog.test.ts`, `tests/sim/netClient.ts` (un cliente
simulado que comprueba cada mensaje, y que tras un `result` que vale llega su eco; lo usa tambien el
servidor).

**El servidor (`server/src/`, lo comun; despues, quien lo aloja)**:

| Archivo | Que hay |
|---|---|
| `routes.ts` | Las rutas (`ROUTES`), CORS, el cuerpo acotado y la direccion de quien pide (`CLIENT_ADDRESS_HEADER`) |
| `roomDirectory.ts` | `RoomDirectory`: las salas por su codigo, que da quien aloja el servidor; `createRoomWithFreeCode` |
| `matchmaker.ts` | `Matchmaker`: el emparejador de «Buscar rival» (la cola de cada ritmo, de una busqueda en una, guardada en su `MatchQueueStore`); `searchRoomRequest` (la sala de una busqueda) y `searchRequestOf` (lo que pide quien busca) |
| `hostedRoom.ts` | `HostedRoom`: una sala del servidor, se aloje donde se aloje. Los sockets (`receive`, `greet`, `forget`), guardar y cargar (`save`, `load`, `readmitAll`), la alarma (`ring`) y repartir lo que sale (`deliver`) |
| `roomHost.ts` | `RoomHost`: lo que la sala pide a quien la aloja (guardar con su alarma, cargar, borrar, sus conexiones, la hora) |
| `cloudflare/` | `index.ts`, el Worker (las rutas); `rooms.ts`, las salas como un Durable Object por codigo (`roomOf`); `roomObject.ts`, `RoomObject`: el Durable Object de una sala, con su almacen, su alarma y sus sockets hibernados; `matchmakerObject.ts`, `MatchmakerObject`: el unico emparejador, con su cola en su almacen; `env.ts`, lo que da Cloudflare |
| `../node/src/` | El servidor de Node: `nodeServer.ts` (HTTP, la subida a WebSocket, el emparejador y el juego compilado), `nodeRooms.ts` (las salas del proceso, con `setTimeout` como alarma), `roomFiles.ts` (un JSON por sala y la cola del emparejador), `httpBridge.ts` (con la direccion del socket), `config.ts` (las variables de entorno) |
| `roomAdapter.ts` | `RoomAdapter`: lo unico que toca `Room`, con nombres del servidor; el vestibulo (`lobby`, con a quien se espera), pedir un asiento con el codigo (`claimSeat`), dar un asiento a la IA (`handToAi`) y si se puede cerrar (`canClose`) |
| `timers.ts` | Los relojes como datos puros (caducar, el turno, la espera, seguir a medias), cuando suena la alarma y lo que le queda al turno para el cliente (`turnClockOf`) |
| `roomRequest.ts` | La forma de lo que se pide al crear una sala (`isRoomRequest`) |
| `codes.ts` | El codigo de sala al azar (`newRoomCode`; su forma es del nucleo), las fichas (`newToken`) y `sameToken` |
| `limits.ts`, `rateLimit.ts`, `cors.ts` | Topes y tiempos; frenar a quien insiste (en una sala, y las busquedas por direccion: `RequestLimit`); desde que paginas se puede hablar |

Pruebas: `server/test/unit/` (las piezas puras con la sala de verdad; el emparejador con salas en
memoria, `matchmaker.test.ts`), `server/test/shared/` (lo que tiene que hacer cualquier servidor: dos
personas por WebSocket y la IA, volver a entrar, un `seq` repetido, buscar rival y cerrar una sala,
lo que no deja pasar), que corren `server/test/workers/` (el Worker y el objeto de verdad
dentro de workerd; ademas, despertar y las alarmas) y `server/node/test/` (el servidor de Node en un
puerto; ademas, sus alarmas, arrancar otra vez y servir el juego).

**El cliente (`src/net/`, el menu y la partida 3D)**, en este orden:

| Archivo | Que hay |
|---|---|
| `src/net/serverUrl.ts` | Donde esta el servidor (`VITE_SERVER_URL` o `ilogic.server` en localStorage; "/" es el que sirve el juego) |
| `src/net/serverLink.ts` | `ServerLink`: el WebSocket con el protocolo encima: saludo, `seq`, reconexion, reenvio, `step` |
| `src/net/roomClient.ts` | `RoomClient`: los mensajes como partida (`state`) y jugadas (`RoomPlay`, `next`), `act` con su promesa, que trae el resultado y su eco (y las respuestas perdidas en un corte, `answerLost`); `animationView` para animar un lote |
| `src/net/onlineMatch.ts` | `OnlineMatch`: enlace y cliente juntos, con quien los escucha; `inPlay` (conectar y esperar a estar en juego) |
| `src/net/mirrorSession.ts` | `mirrorSession`: la sesion de la pantalla sobre una vista |
| `src/net/roomApi.ts` | Las rutas HTTP: `createRoom`, `claimSeat`, `lobbyOf`, `handToAi`, `closeRoom`, `searchRival` |
| `src/net/onlineRooms.ts` | «Mis partidas en línea» en localStorage (la sala de una busqueda, con su ritmo: `search`); el enlace de la sala (`parseRoomLink`, `roomLinkUrl`) |
| `src/menu/online/` | La pantalla «Jugar en línea»: `onlineScreen.ts` (`OnlineScreen`: enlaza las tres pantallas, el foco y las ordenes, entrar con el codigo, `enterRoom`, y buscar rival y cancelar, `searchRival`, `cancelSearch`), `menuScreen.ts` (buscar rival con su ritmo, crear, unirse con el codigo y «Mis partidas», que pregunta cada 20 s como va cada sala), `roomLines.ts` (como se enseña cada sala de «Mis partidas», puro), `createScreen.ts`, `lobbyScreen.ts` (el vestibulo: invitar o buscando rival, la conexion con la sala y el paso a la partida) y `shared.ts` (`OnlineHost`, `OnlineScreens`, los textos de los ritmos) |
| `src/hud/menus/Online.tsx` | El HTML de esa pantalla (Preact), a partir de `OnlineVM` |
| `src/view3d/app/gameStart.ts` | El arranque 'online' (codigo y ficha) y `joinMatch`: volver a entrar en la sala al cargar la partida |
| `src/view3d/systems/turn/matchRunner.ts` | `MatchRunner` (lo que el turno pide a quien lleva la partida) y `localRunner` (una partida de esta pantalla) |
| `src/view3d/systems/net/onlinePlay.ts` | `OnlinePlay`, el `MatchRunner` por la red: `act` (lo comprueba con lo que sabe el equipo y lo decide el servidor: `askRoom`), `finishTurn`, la cola de jugadas hasta el turno propio (`untilInput`; `showBatch` anima un lote, `waitFor` pone «Esperando al equipo N…»), una sola bomba que atiende cada jugada en orden (`pump` → `route`: lo que llega en el turno propio, `duringOwnTurn`, o lo que lo acaba, `endsOwnTurn`), `adopt`/`fill` (la vista en la partida que se ve), la linea de la conexion (`publishLink`) y el cierre sin arreglo (`roomClosed`). Lo que toca del turno de la pantalla lo pide por `OnlineHooks` |
| `src/view3d/systems/net/turnNotice.ts` | El aviso de «Tu turno» cuando no se mira la pestaña (el titulo) |
| `src/view3d/systems/net/turnClock.ts` | `TurnClock`: la cuenta atras del turno que se ve (publica `UIState.turnClock` y hace el tic de los ultimos segundos) |
| `src/ui/models/turnClock.ts`, `src/hud/game/TurnClock.tsx` | Lo que enseña el reloj (`turnClockVM`, `clockText`) y su pastilla con el anillo (estilo en `styles/game/turnclock.css`) |
| `src/view3d/app/match3d.ts` | Junta `OnlinePlay` con el turno (`TurnControls`), la pausa (sin guardar; rendirse por la sala) y el final |

Pruebas: `tests/onlineClient.test.ts` (enlace y cliente con un socket falso), `tests/onlinePlay.test.ts`
(la partida 3D por la red sin red: la sala de verdad, `OnlinePlay` y `TurnControls` con puertos
falsos) y `tests/visual/online.mjs` (`npm run online`: el servidor de Node, vite y dos navegadores de
verdad, de punta a punta: crear la sala, entrar por el enlace, jugar, recargar y rendirse; deja
capturas en `tests/visual/out/online-*.png`).
