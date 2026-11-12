# Servidor de partidas por la red

Un Worker de Cloudflare con un Durable Object por sala. La partida de verdad vive aqui, en la
`Room` del nucleo (`src/core/net`): el servidor solo mueve mensajes, guarda la sala tras cada uno y
lleva los relojes. Lo que decide (quien puede hacer que, que ve cada equipo) esta en el nucleo, con
sus tests; aqui no hay reglas del juego. El como y el porque, en `docs/ARQUITECTURA.md`, "Red" →
"Servidor".

## Rutas

| Ruta                  | Que hace                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /rooms`         | Crea una sala. Cuerpo: `{ match, turnSeconds?, waitingSeconds? }` (`match` es lo que elige la pantalla de escaramuza, `SkirmishChoices`: `seed`, `size`, `theme`, `settingChanges`, `teams`, `firstTeam`). Responde `201 { code, seats: [{ seat, team, token, invite }] }`: el codigo de la sala (6 letras) y, por asiento de persona, su ficha y su enlace de invitacion (`#/sala/CODIGO/FICHA`). Quien crea se queda con el primero y reparte los demas; las fichas no se vuelven a dar |
| `GET /rooms/:code`    | Lo que puede saber cualquiera: `{ status, protocol, save, seats: [{ seat, team, kind, joined }] }`. Nada de la partida ni de las fichas                                                                                                                                                 |
| `POST /rooms/:code/ai` | Quien creo la sala (cuerpo `{ token, seat }`: la ficha de su asiento, el primero) da a la IA un asiento de persona que no ha entrado, mientras la sala espera. Responde `{ ok: true }`; si no, `403` (`badToken`), `409` (`notWaiting`, `seatTaken`) o `404` (`noSeat`)                                                                              |
| `GET /rooms/:code/ws` | La conexion de la partida (subida a WebSocket). El primer mensaje es el saludo (`hello`, con la ficha y la version del protocolo); desde ahi, los mensajes de `src/core/net/protocol.ts` como texto JSON, uno por trama                                                                 |

Errores de las rutas: `{ error }` con `400` (`badRequest`, `badCode`), `403` (`badOrigin`), `404`
(`noSuchRoom`, `notFound`), `413` (`tooBig`), `503` (`noFreeCode`). Una conexion que el servidor
cierra lo dice con un codigo propio (`CLOSE_CODES`, `src/roomObject.ts`): 4400 no era un saludo,
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

## Desarrollo

```sh
npm run server:dev    # wrangler dev: el Worker en http://localhost:8787 (con sus Durable Objects locales)
npm run server:test   # tests: unit (Node) y workers (dentro de workerd, con el Worker y el objeto de verdad)
npm run check         # desde la raiz: tipos, lint, tests del juego y, al final, tipos y tests del servidor
```

El juego lee la URL del servidor de `VITE_SERVER_URL` (`.env.example`; en local,
`http://localhost:8787`).

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
   primera publicacion crea el Worker `ilogic-servidor` y su migracion `v1` (la clase
   `RoomObject`).
4. La URL del Worker es `https://ilogic-servidor.<subdominio de la cuenta>.workers.dev` (la dice
   `wrangler deploy` y el panel). En GitHub, en el mismo sitio pero en **Variables**:
   `VITE_SERVER_URL` con esa URL. Los workflows de la web (`pages.yml`) y de las previews
   (`preview.yml`) la pasan al `vite build`.
5. Si la web se sirve desde otro sitio que no sea `https://usources.github.io`, añadirlo a
   `ALLOWED_ORIGINS` en `wrangler.toml` (separado por comas). `localhost`, `127.0.0.1` y `null`
   (el juego abierto desde un fichero, `dist-single/ilogic.html`) entran siempre.

Publicar a mano: `cd server && npx wrangler login && npx wrangler deploy`.

## Piezas (`src/`)

| Fichero          | Que va                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`       | el Worker: las rutas (`ROUTES`), CORS, el tope del cuerpo, buscar el objeto de la sala por su codigo                                                                 |
| `roomObject.ts`  | el Durable Object de una sala: conexiones (Hibernation API), guardar y recuperar, la alarma, frenar a quien insiste                                                  |
| `roomAdapter.ts` | el unico que toca la `Room` del nucleo: lo que el objeto necesita de ella, con nombres del servidor; el vestibulo (`lobby`) y las invitaciones                       |
| `roomRequest.ts` | la forma de lo que se pide al crear una sala, comprobada campo a campo contra el contenido del juego                                                                 |
| `timers.ts`      | los relojes como datos puros: caducar, el turno, la espera, seguir una partida a medias; `nextAlarm` elige la unica alarma                                           |
| `limits.ts`      | todos los topes y tiempos, con nombre                                                                                                                               |
| `rateLimit.ts`   | la ventana de rechazos por asiento                                                                                                                                   |
| `codes.ts`       | codigos de sala (sin letras que se confundan), fichas (192 bits de `crypto.getRandomValues`) y su comparacion en tiempo constante                                   |
| `cors.ts`        | que origenes pueden hablar con el servidor                                                                                                                          |

Tests: `test/unit` (las piezas puras, con la sala del nucleo de verdad) y `test/workers` (el Worker
y el objeto de verdad en workerd, con `@cloudflare/vitest-plugin`: crear una sala, dos personas y la
IA jugando varios dias por WebSocket, volver a entrar, despertar el objeto, mensajes repetidos, lo
que no entra, y las alarmas adelantando los relojes guardados).
