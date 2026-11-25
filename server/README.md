# Servidor de partidas por la red

La partida de verdad vive aqui, en la `Room` del nucleo (`src/core/net`): el servidor solo mueve
mensajes, guarda la sala tras cada uno y lleva los relojes. Lo que decide (quien puede hacer que, que
ve cada equipo) esta en el nucleo, con sus tests; aqui no hay reglas del juego. El como y el porque,
en `docs/ARQUITECTURA.md`, "Red" → "Servidor".

Se puede alojar en dos sitios, con la misma sala (`src/hostedRoom.ts`) y las mismas rutas
(`src/routes.ts`):

- **En Cloudflare** (`src/cloudflare/`): un Worker con un Durable Object por sala y otro para el
  emparejador de «Buscar rival». Es el de la web publica: ver "Publicar en Cloudflare".
- **En Node** (`node/`): un proceso con todas las salas y el emparejador, guardados en disco, que
  sirve tambien el juego. Para alojarlo uno mismo, en casa o en un servidor propio: ver "Alojarlo
  uno mismo".

## Rutas

| Ruta                  | Que hace                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /rooms`         | Crea una sala. Cuerpo: `{ match, turnSeconds?, waitingSeconds?, start? }` (`match` es lo que elige la pantalla de escaramuza, `SkirmishChoices`: `seed`, `size`, `theme`, `settingChanges`, `teams`, `firstTeam`; `start`, cuando empieza: `everyoneIn`, cuando entren todos, o `everyoneSeated`, en cuanto cada asiento sea de alguien). Responde `201 { code, seat, team, token }`: el codigo de la sala (6 letras) y el asiento de quien crea (el primero de persona) con su ficha. Para invitar se reparte el codigo o el enlace de la sala (`#/sala/CODIGO`) |
| `POST /rooms/:code/seat` | Pide un asiento con el codigo: da el primer asiento de persona libre, con su ficha, mientras la sala espera. Responde `{ code, seat, team, token }`; si no, `404` (`noSuchRoom`) o `409` (`notWaiting`, `noFreeSeat`). Cada asiento se da una sola vez |
| `GET /rooms/:code`    | Lo que puede saber cualquiera: `{ status, protocol, save, seats: [{ seat, team, kind, joined }], turn }`, con `turn` a quien se espera (`{ seat, day, endsAt }`: `endsAt` cuando vence su reloj, o `null`) o `null`. Nada de la partida ni de las fichas                                                                                                                                                 |
| `GET /health`         | Si el servidor contesta y que version habla: `{ protocol, save }`, sin mirar ninguna sala. Lo pregunta «Jugar en línea» para decir «Conectado» cuando no hay partidas apuntadas por las que preguntar |
| `POST /rooms/:code/ai` | Quien creo la sala (cuerpo `{ token, seat }`: la ficha de su asiento, el primero) da a la IA un asiento de persona que no ha entrado, mientras la sala espera. Responde `{ ok: true }`; si no, `403` (`badToken`), `409` (`notWaiting`, `seatTaken`) o `404` (`noSeat`)                                                                              |
| `POST /rooms/:code/close` | Quien creo la sala (cuerpo `{ token }`) la cierra antes de que empiece: se borra y quien este dentro sale (4410). Es cancelar una busqueda de rival. Responde `{ ok: true }`; si no, `403` (`badToken`), `409` (`notWaiting`) o `404` (`noSuchRoom`) |
| `POST /match`         | Buscar rival (`src/matchmaker.ts`). Cuerpo: `{ pace, avoid? }`: el ritmo (`daily`, un dia por turno; `live`, dos minutos) y como mucho 16 codigos de salas propias que no deben tocarle. Da el asiento libre de la primera sala de ese ritmo que espera rival (y la partida empieza) o, si no hay, abre una sala nueva que espera (1 contra 1, reglas normales, mapa al azar). En `live` solo se empareja con quien esta en su sala. Responde `{ code, seat, team, token, matched }`; si no, `429` (`tooManySearches`) o `503` (`serverFull`, `noFreeCode`) |
| `GET /rooms/:code/ws` | La conexion de la partida (subida a WebSocket). El primer mensaje es el saludo (`hello`, con la ficha y la version del protocolo); desde ahi, los mensajes de `src/core/net/protocol.ts` como texto JSON, uno por trama                                                                 |

Errores de las rutas: `{ error }` con `400` (`badRequest`, `badCode`), `403` (`badOrigin`,
`badToken`), `404` (`noSuchRoom`, `notFound`, `noSeat`), `409` (`notWaiting`, `noFreeSeat`,
`seatTaken`), `413` (`tooBig`), `429` (`tooManySearches`), `503` (`noFreeCode`, `serverFull`). Una conexion que el servidor
cierra lo dice con un codigo propio (`CLOSE_CODES`, `src/hostedRoom.ts`): 4400 no era un saludo,
4401 ficha mala, 4409 otra pestaña entro con la misma ficha, 4410 la sala ya no existe, 4413
mensaje demasiado grande, 4426 otra version del protocolo, 4429 demasiados mensajes rechazados.

## Topes y tiempos (`src/limits.ts`)

- Un mensaje (por el WebSocket o el cuerpo de `POST /rooms`): 64 KiB como mucho, antes de leerlo
  como JSON (los topes de forma los pone el protocolo).
- A un asiento se le aguantan 30 mensajes rechazados por minuto; al pasarse, se le cierra la
  conexion (puede volver con su ficha).
- Una sala sin actividad se borra a los 30 dias (cada mensaje o entrada la renueva).
- Reloj por turno (`turnSeconds`) y espera a los que faltan (`waitingSeconds`), si el creador los
  pide: de 30 segundos a 7 dias.
- Salas de 2 a 4 equipos, al menos uno de una persona.
- Buscar rival: 20 busquedas por direccion cada 10 minutos (la direccion la pone Cloudflare,
  `CF-Connecting-IP`, o en Node la del socket: la que mande el cliente no vale). Es un freno, no
  una cuenta exacta: se lleva en memoria, y empieza de cero si Cloudflare saca de memoria al
  emparejador o si se reinicia el servidor de Node. La cola guarda como mucho 100 salas por ritmo
  (sale la mas vieja) y en cada busqueda se miran como mucho 20. En vivo, una sala cuyo creador no
  esta sigue en la cola 5 minutos desde que se ve (puede estar recargando) y despues sale.

## Desarrollo

```sh
npm run server:dev    # wrangler dev: el Worker en http://localhost:8787 (con sus Durable Objects locales)
npm run server:node   # o el de Node, en el mismo puerto (las salas, en server/data)
npm run server:test   # tests: unit, node (el de Node en un puerto) y workers (dentro de workerd)
npm run check         # desde la raiz: tipos, lint, tests del juego y, al final, tipos y tests del servidor
```

El juego lee la URL del servidor de `VITE_SERVER_URL` (`.env.example`; en local,
`http://localhost:8787`, sirve con cualquiera de los dos).

## Publicar en Cloudflare

Lo que hay que hacer una vez:

1. Una cuenta de Cloudflare. **Vale el plan gratuito de Workers**: las salas usan Durable Objects
   con almacen SQLite (`new_sqlite_classes` en `wrangler.toml`), que estan en el plan gratuito
   desde abril de 2025; los Durable Objects "clasicos" (almacen clave-valor) siguen pidiendo el
   plan de pago (Workers Paid, 5 $/mes). Topes del gratuito (segun la pagina de precios de
   Durable Objects, noviembre de 2026): 100.000 peticiones al dia, 13.000 GB-s de duracion de
   objetos al dia, 5 GB de almacen SQLite en total, 5 millones de filas leidas y 100.000 escritas
   al dia; se reponen a las 00:00 UTC y, pasado uno, las operaciones de ese tipo fallan hasta el
   dia siguiente. Los mensajes de WebSocket que llegan cuentan 20 a 1 (100 mensajes son 5
   peticiones; los que salen, nada), cada mensaje atendido escribe dos filas (la sala y sus
   relojes) y una sala con conexiones abiertas consume duracion solo mientras esta despierta (con
   la Hibernation API duerme entre mensajes). Para unas cuantas partidas a la vez sobra; si se
   queda corto, el plan de pago quita esos topes.
2. En el panel de Cloudflare, Workers & Pages → crear un token de la API (Manage account → API
   Tokens → plantilla "Edit Cloudflare Workers") y apuntar el **Account ID** (en la pagina de
   Workers & Pages, a la derecha).
3. En GitHub, Settings → Secrets and variables → Actions → **Secrets**: `CLOUDFLARE_API_TOKEN` y
   `CLOUDFLARE_ACCOUNT_ID`. Con los dos, `.github/workflows/server.yml` publica el servidor con
   cada push a `main` que toque `server/` o `src/core/` (sin ellos, no hace nada y lo dice). La
   primera publicacion crea el Worker `ilogic-servidor` y sus migraciones: `v1`, la clase
   `RoomObject`, y `v2`, `MatchmakerObject` (una clase nueva de Durable Object va siempre en una
   migracion nueva; `wrangler deploy` aplica las que falten).
4. La URL del Worker es `https://ilogic-servidor.<subdominio de la cuenta>.workers.dev` (la dice
   `wrangler deploy` y el panel). En GitHub, en el mismo sitio pero en **Variables**:
   `VITE_SERVER_URL` con esa URL. Los workflows de la web (`pages.yml`) y de las previews
   (`preview.yml`) la pasan al `vite build`.
5. Si la web se sirve desde otro sitio que no sea `https://usources.github.io`, añadirlo a
   `ALLOWED_ORIGINS` en `wrangler.toml` (separado por comas). `localhost`, `127.0.0.1` y `null`
   (el juego abierto desde un fichero, `dist-single/ilogic.html`) entran siempre.

Publicar a mano: `cd server && npx wrangler login && npx wrangler deploy`.

Comprobar el publicado con una partida entera (dos navegadores, el juego en local):
`ILOGIC_SERVER_URL=https://ilogic-servidor.<cuenta>.workers.dev npm run online`. Con un servidor
lejano la bienvenida del WebSocket suele llegar antes que la respuesta de `GET /rooms/:code`, cosa
que en local casi nunca pasa: por eso vale la pena probarlo contra el de verdad.

## Alojarlo uno mismo (Node)

Sin cuenta en ningun sitio: un proceso de Node 22 que sirve el juego y las salas en la misma
direccion. Asi no hace falta CORS ni certificado en una red de casa (la web publica es https, y un
navegador no la deja hablar con un servidor sin cifrar).

```sh
npm ci
npm run selfhost      # compila el juego con VITE_SERVER_URL=/ (.env.selfhost) y arranca el servidor
```

Se juega en `http://<la direccion del equipo>:8787` (en el mismo equipo, `http://localhost:8787`), y
los enlaces de las salas llevan esa direccion. Con el juego ya compilado basta `npm run server:node`.
Las salas se guardan en `server/data/`, un JSON por sala (se pueden copiar o borrar a mano con el
servidor parado), y la cola de «Buscar rival» en `server/data/emparejador.json`; al arrancar otra
vez siguen donde estaban y sus relojes tambien (una sala caducada se borra sola). Se para con Ctrl+C (o `SIGTERM`): cierra las conexiones y acaba de guardar.

Variables de entorno (todas opcionales):

| Variable                 | Que es                                                                                  | Sin ella                          |
| ------------------------ | --------------------------------------------------------------------------------------- | --------------------------------- |
| `PORT`                   | el puerto                                                                               | `8787`                            |
| `HOST`                   | la direccion donde escucha                                                              | todas las del equipo              |
| `ILOGIC_DATA_DIR`        | la carpeta de las salas                                                                 | `server/data`                     |
| `ILOGIC_WEB_DIR`         | la carpeta del juego compilado; vacia, no se sirve el juego (solo las salas)            | `dist/`, si se ha compilado       |
| `ALLOWED_ORIGINS`        | otras webs que pueden usar este servidor, separadas por comas (como en `wrangler.toml`) | `https://usources.github.io,null` |
| `ILOGIC_MAX_ROOMS`       | cuantas salas puede haber a la vez (con todas, crear otra da `serverFull`)              | `200`                             |
| `ILOGIC_MAX_CONNECTIONS` | cuantas conexiones a la vez, peticiones y WebSockets (las de mas se cortan al llegar)   | `1000`                            |

Los dos topes estan para que nadie llene el disco ni la memoria creando salas o abriendo conexiones
sin parar (todas las salas viven en memoria). No miran de donde viene cada uno: abierto a internet,
mejor detras de un proxy que limite las peticiones por IP (como `limit_req` de nginx). El tope de
busquedas de rival si mira la direccion, pero la de la conexion: detras de un proxy todos llegan
desde la suya, y las 20 busquedas cada 10 minutos son entonces para todos juntos (con mucha gente,
mejor que el proxy ponga su propio limite por IP).

Abierto por su IP (`http://192.168.1.20:8787`), el juego que sirve ya puede hablar con el servidor.
Con un nombre (`https://ilogic.mi-dominio.net`) no: ese nombre va en `ALLOWED_ORIGINS`, porque si
bastara con ser del mismo sitio, cualquiera podria hacer que su dominio apuntase a la IP del servidor
(DNS rebinding) y su web pareceria la del juego. La variable sustituye a la de por defecto, asi que
se ponen todas: `ALLOWED_ORIGINS=https://ilogic.mi-dominio.net,https://usources.github.io,null`.

Para jugar desde fuera de casa hace falta abrir el puerto en el router o, mejor, ponerlo detras de
un proxy con HTTPS (Caddy lo hace solo: `ilogic.mi-dominio.net { reverse_proxy localhost:8787 }`,
con ese nombre en `ALLOWED_ORIGINS`); con HTTPS, la web publica tambien puede usarlo (`ilogic.server`
en el localStorage del navegador).

## Piezas

Lo comun (`src/`):

| Fichero          | Que va                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes.ts`      | las rutas (`ROUTES`), CORS, el tope del cuerpo y la direccion de quien pide (`CLIENT_ADDRESS_HEADER`)                                                                |
| `roomDirectory.ts` | las salas por su codigo, que las da quien aloja el servidor (`RoomDirectory`), y crear una con un codigo libre                                                    |
| `matchmaker.ts`  | el emparejador de «Buscar rival»: una cola por ritmo, de una busqueda en una, guardada tras cada una (`MatchQueueStore`)                                              |
| `hostedRoom.ts`  | una sala del servidor, se aloje donde se aloje: conexiones, guardar y recuperar, la alarma, frenar a quien insiste                                                   |
| `roomHost.ts`    | lo que la sala pide a quien la aloja (`RoomHost`): guardar con su alarma, cargar, borrar, sus conexiones (`RoomSocket`) y la hora                                    |
| `roomAdapter.ts` | el unico que toca la `Room` del nucleo: lo que el objeto necesita de ella, con nombres del servidor; el vestibulo (`lobby`) y pedir asiento (`claimSeat`)                       |
| `roomRequest.ts` | la forma de lo que se pide al crear una sala, comprobada campo a campo contra el contenido del juego                                                                 |
| `timers.ts`      | los relojes como datos puros: caducar, el turno, la espera, seguir una partida a medias; `nextAlarm` elige la unica alarma; `turnClockOf`, lo que le queda al turno (va en cada `turn`)                                           |
| `limits.ts`      | todos los topes y tiempos, con nombre                                                                                                                               |
| `rateLimit.ts`   | la ventana de rechazos por asiento y el tope de peticiones por direccion (`RequestLimit`)                                                                            |
| `codes.ts`       | codigos de sala al azar (sin letras que se confundan; su forma, `isRoomCode`, es del nucleo: `src/core/net/roomCode.ts`), fichas (192 bits de `crypto.getRandomValues`) y su comparacion en tiempo constante                                   |
| `cors.ts`        | que origenes pueden hablar con el servidor                                                                                                                          |

En Cloudflare (`src/cloudflare/`): `index.ts`, el Worker (las rutas); `rooms.ts`, las salas como un
Durable Object por codigo; `roomObject.ts`, el Durable Object de una sala (su almacen, su alarma y
sus conexiones por el Hibernation API); `matchmakerObject.ts`, el unico Durable Object del
emparejador (su cola, en su almacen), y `env.ts`, lo que da Cloudflare (`wrangler.toml`).

En Node (`node/src/`, con su propio `tsconfig.json`: los tipos de Node y los de workerd chocan):

| Fichero          | Que va                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `main.ts`        | arranca con la configuracion del entorno y para con Ctrl+C                                   |
| `config.ts`      | las variables de entorno                                                                     |
| `nodeServer.ts`  | HTTP (`node:http`), la subida a WebSocket (`ws`) y el juego compilado                        |
| `nodeRooms.ts`   | las salas del proceso: cada una con su fichero, sus conexiones y un `setTimeout` como alarma |
| `roomFiles.ts`   | un JSON por sala y el de la cola del emparejador; cada escritura entera o nada, y las de una sala en fila |
| `httpBridge.ts`  | de una peticion de Node a `Request` (lo que entienden las rutas, con la direccion del socket) y vuelta |
| `staticFiles.ts` | los ficheros del juego, sin salir de su carpeta                                              |
| `nodeSocket.ts`  | una conexion de `ws` como conexion de la sala                                                |

Tests: `test/unit` (las piezas puras, con la sala del nucleo de verdad; el emparejador, con salas de
verdad en memoria) y, de integracion, las pruebas de `test/shared` (crear una sala, dos personas y
la IA jugando varios dias por WebSocket, volver a entrar, mensajes repetidos, buscar rival y cerrar
una sala, lo que no entra), que pasan los dos: `test/workers` (el Worker y
el objeto de verdad en workerd, con `@cloudflare/vitest-plugin`; ademas despertar el objeto y las
alarmas adelantando los relojes guardados) y `node/test` (el servidor de Node en un puerto; ademas
sus alarmas con la hora adelantada a mano, arrancar otra vez con las salas guardadas y servir el
juego).
