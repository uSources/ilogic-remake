# Plan: sonidos, ambientes y música con IA local (ComfyUI)

Objetivo: generar en local, con ComfyUI, los efectos, los ambientes y la música que le faltan al juego,
con un flujo repetible (catálogo de sonidos con su texto → ComfyUI → archivos en `public/assets/`).

Pasos: 1) qué sonidos hacen falta (este documento), 2) qué modelo local, 3) el flujo.

## Lo que hay hoy

- **Efectos**: 19 sonidos sintetizados con Ashfox (`tools/art/ashfox/models/sounds.mjs` →
  `public/assets/sfx/<id>_<n>.wav`, WAV mono 48 kHz, con variantes). La lista que lee el juego,
  `src/audio/soundList.ts`, sale de los WAV de esa carpeta (`tools/audio/soundList.mjs`, la usan Ashfox y
  la herramienta de IA). Suenan con Web Audio (`sfx.ts`);
  quién decide qué suena está en `src/view3d/systems/sound/soundCues.ts`.
- **Música**: dos pistas originales de 2013, `menu` y `game` (`public/assets/music/*.ogg|mp3`), con
  `<audio>` (`music.ts`). Solo admite esas dos (`MusicTrack`).
- **Ambientes**: ninguno.

## 1. Lo que hace falta

Prioridad: **A** imprescindible, **B** mejora clara, **C** si sobra tiempo.

### Efectos que ya existen (rehacer o dejar)

`ui_move`, `ui_select`, `ui_back`, `unit_select`, `step_march`, `step_drive`, `step_fly`, `shot_rifle`,
`shot_cannon`, `shot_artillery`, `shot_missile`, `hit`, `explosion`, `capture`, `capture_done`,
`spawn`, `turn_start`, `victory`, `defeat`.

Se pueden rehacer con IA manteniendo el mismo `id` (el código no cambia). Por decidir: si sustituyen a
los de Ashfox o conviven (Ashfox para la interfaz, IA para el tablero).

### Efectos nuevos: sucesos de la partida sin sonido

Salen de `GameEvent` (`src/core/model/events.ts`); se enchufan en `eventSteps.ts` o `turnControls.ts`.

| id | Cuándo | Prioridad |
| --- | --- | --- |
| `load` / `unload` | Subir y bajar del transporte | A |
| `merge` | Unir dos unidades | A |
| `supply` | Suministros repara o reabastece (llave, carga) | A |
| `heal` | Curación al empezar el turno en un edificio | B |
| `income` | Ingresos al empezar el turno (monedas) | B |
| `undo` | Deshacer un movimiento (rebobinado corto) | B |
| `wait` | La unidad termina sin hacer nada (clic suave) | C |
| `capture_dropped` | Se pierde una captura a medias | B |
| `cargo_lost` | Cae un transporte con pasajeros | C (vale `explosion`) |
| `team_defeated` | Cae un equipo en partidas de más de dos | B |
| `new_day` | Empieza un día nuevo | C |
| `ui_error` | Orden que no se puede hacer | A |
| `ui_tab` | Cambiar de pestaña en paneles (Q/E) | C |
| `ui_open` / `ui_close` | Abrir y cerrar un panel o menú | C |

### Efectos nuevos: armas y motores por unidad

Hoy el disparo y el paso van por **forma de moverse** (`march`, `drive`, `fly`): el bazuca suena a fusil
y el helicóptero a avión. Pedirlos por unidad (o por arma) es un cambio pequeño en `soundCues.ts`.

| id | Unidades | Prioridad |
| --- | --- | --- |
| `shot_bazooka` | Bazuca | A |
| `shot_mortar` | Mortero | A |
| `shot_machinegun` | Jeep, Helicóptero, Motorizado | A |
| `shot_flak` | Antiaéreo | A |
| `shot_bomb` | Bombardero (silbido y caída) | A |
| `shot_rocket_salvo` | Lanzamisiles | B |
| `step_tracks` | Tanques (orugas) | B |
| `step_jeep` / `step_truck` | Jeep; Transporte, Suministros y Lanzamisiles (camiones) | B |
| `engine_start_jeep` / `engine_start_truck` | Arranque de los de ruedas al echar a andar | B |
| `horn_jeep` / `horn_truck` | Bocina de los de ruedas al elegirlos (en vez de la voz) | B |
| `step_heli` | Helicóptero (rotor) | B |
| `step_jet` | Cazas y Bombardero | B |
| `step_splash` | Tanque anfibio en el agua | C |

### Ambientes (bucles de 30–60 s, flojos, debajo de todo)

Necesitan un canal nuevo (como la música: un bucle a la vez por capa, con fundido al cambiar).

| id | Cuándo | Prioridad |
| --- | --- | --- |
| `amb_sea` | Siempre: la isla en el mar (olas suaves, gaviotas lejanas) | A |
| `amb_plains` | Tema Llanura: brisa, pájaros, grillos | A |
| `amb_desert` | Tema Desierto: viento seco, arena | A |
| `amb_forest` | Tema Bosque: pájaros, hojas | A |
| `amb_swamp` | Tema Pantano: ranas, insectos, burbujas | A |
| `amb_snowy` | Tema Nieve: viento frío | A |
| `amb_rain` | Clima Lluvia (encima del tema) | A |
| `amb_storm` | Clima Tormenta: lluvia fuerte | A |
| `thunder` (3 variantes) | Truenos sueltos con la tormenta, al azar | B |
| `amb_snowfall` | Clima Nevada: viento apagado | B |
| `amb_sandstorm` | Clima Tormenta de arena: rachas | B |

### Música

Las dos pistas de 2013 se quedan. Lo nuevo amplía `MusicTrack`.

| id | Qué | Prioridad |
| --- | --- | --- |
| `victory` / `defeat` (jingles) | 5–10 s, más musicales que los efectos de hoy | B |
| `game_<tema>` | Una pista de batalla por tema (5), para no oír siempre la misma | B |
| `briefing` | Pantalla de misión de la campaña | C |
| `enemy_turn` | Variación más tensa mientras juega el rival | C |

### Estilo (por decidir con el usuario)

Tiene que ir con la estética (`docs/ESTETICA.md`): **juguetes de bloques**, chibi, una isla de juguete.
Propuesta: sonidos de **guerra de juguete**, con pegada pero sin sangre ni realismo duro; ambientes
suaves de diorama; música orquestal ligera o de banda militar de juguete.

### Formatos

- Efectos: WAV mono 48 kHz, pico a −1 dB, sin silencio delante (como los de Ashfox), 0,2–2 s. Lo que
  suena muchas veces seguidas y no debe tapar nada (el tic del reloj del turno), `soft` en el
  catalogo: pico a −10 dB, como los de la interfaz que hace Ashfox.
- Ambientes y música: OGG y MP3, bucle sin corte. La versión de un solo fichero lleva solo el MP3.
- Peso: hoy 1,9 MB de efectos y 1,5 MB de música; los ambientes añadirían unos 5 MB.

## 2. Modelo local (hecho)

ComfyUI (Comfy Desktop 0.45.3, en `127.0.0.1:8188`, Apple M4 Max con 36 GB) trae los nodos de serie.
Descargados (21-11-2026) en `~/ComfyUI-Shared/models`:

- **Stable Audio 3 Medium** (`checkpoints/stable_audio_3_medium.safetensors`, 9,2 GB) con su
  codificador (`text_encoders/t5gemma_b_b_ul2.safetensors`, 1,2 GB), del repo `Comfy-Org/stable-audio-3`
  (sin registro). Un solo modelo para efectos, ambientes y musica instrumental, estereo a 44,1 kHz,
  8 pasos: 4 candidatos de 1-2 s en unos 5 s, 4 de 40 s en unos 25 s. Licencia Stability AI Community:
  lo generado es del usuario y gratis comercialmente por debajo de 1 M$ al año.
- **Stable Audio 3 Small SFX** (2,3 GB) tambien se bajo, pero **no vale**: con esta version de ComfyUI
  en Mac solo da ruido, con cualquier muestreador. Se puede borrar
  (`~/ComfyUI-Shared/models/checkpoints/stable_audio_3_small_sfx.safetensors`).
- Si la musica de Stable Audio no convence: **ACE-Step 1.5** (licencia MIT; la XL turbo, unos 19 GB
  con sus codificadores), tambien con nodos de serie en ComfyUI.
- El codificador Qwen 3.5 2B (4,2 GB) que usa la plantilla de ComfyUI para "mejorar" el texto no hace
  falta: los textos van escritos en el catalogo.

## 3. Flujo (hecho)

`npm run sonidos` (`tools/audio/`, skill `sonidos`):

1. **Catalogo** (`tools/audio/catalog.ts`): todo lo de la seccion 1 que no hace Ashfox, con su texto
   en ingles, duracion y variantes. El estilo de cada clase, en `soundKinds.ts`.
2. **Generar**: por cada sonido manda a ComfyUI el grafo de Stable Audio 3 (tandas de 4 candidatos),
   baja el FLAC, lo pasa a WAV con `afconvert` y lo recorta segun su clase: los efectos sin silencio
   delante ni cola muda, con fundido y pico a −1 dB (−10 los `soft`), en mono a 48 kHz; los ambientes y la musica, con
   el final fundido sobre el principio para que el bucle no corte, y los ambientes igual de fuertes.
3. **Escuchar**: `npm run sonidos -- escuchar` abre la pagina de candidatos en el navegador (la sirve
   en `http://localhost:5180`; abierta como fichero no suena y lo avisa), o `npm run sonidos -- oir <id>`
   los suena en la terminal.
4. **Elegir**: los efectos van a `public/assets/sfx/` y la lista `src/audio/soundList.ts` se rehace
   desde los WAV (la comparte con Ashfox); los ambientes y la musica los pasa ComfyUI a OGG (Opus) y
   MP3 en `public/assets/ambient/` y `public/assets/music/`.

## Pendiente

- **Estilo**: se usa la propuesta de arriba ("guerra de juguete"); falta que el usuario la confirme
  escuchando los primeros candidatos.
- **Elegidos (21-11-2026)**: las armas que faltaban (pistola, bazuca, mortero, ametralladora, cañon
  pesado, antiaereo, lanzamisiles, bomba), las orugas, las 7 voces y los 18 ambientes (9 de zona, 5 de
  fondo y 4 de clima). **Elegidos (23-11-2026)**, a ojo por medidas (el usuario lo delego): el trueno,
  los 9 de los animales, el motor del jeep y el de los camiones, sus arranques y sus bocinas, y las 7
  voces otra vez (un balbuceo menos chillon; el piloto, por radio). **Elegidos (25-11-2026)**, por
  medidas: subir y bajar del transporte (`load`, `unload`; los mismos para el camion y el helicoptero,
  sin motor ni rotor, que ya suenan al moverse). **Elegidos (26-11-2026)**, escuchados por el usuario:
  los de la partida en linea (`player_joined`, `match_begins`, `net_connected`, `net_reconnecting`,
  `net_lost`). **Faltan por generar y elegir**: los
  otros efectos (helices y helicoptero, pasos por suelo, impactos, caidas, interfaz, sucesos), la musica
  de cada tema, `briefing`, `enemy_turn` y los jingles; `npm run sonidos -- lista` dice cuales tienen
  candidatos.
- **Que suenen en la partida (hecho, 21-11-2026)**, con sonido 3D (`docs/ARQUITECTURA.md`, "Sonido 3D"):
  - cada efecto del tablero suena desde su sitio respecto a la camara (a un lado, mas flojo lejos);
  - por unidad: disparo, motor y caida (`UNIT_SOUNDS`, `soundCues.ts`); los pasos de la infanteria
    segun el suelo, y el barro y el agua bajo ruedas y orugas;
  - sucesos nuevos con sonido (compras de cualquiera, subir y bajar, unir, curar, esperar, deshacer,
    emboscada, fin del turno...) sin delatar lo que tapa la niebla; botones con su sonido
    (`data-sound`), pasar por encima, errores, la rueda;
  - voces de juguete al elegir, atacar y capturar (una cada 1,5 s como mucho; su volumen en Opciones);
  - ambiente por zonas (los 3 mas cercanos a la camara, cada uno desde un solo sitio y apagandose antes
    que los efectos con la distancia), fondo del tema, clima con fundido y truenos con cada relampago
    (su volumen en Opciones). El fondo y las zonas se oyen con la camara baja y casi nada desde arriba
    (`ambienceZoomLevel`); los de animales, solo al acercarla (`animalZoomLevel`); el clima, siempre.
    Cada ambiente tiene su volumen (`AMBIENT_VOLUMES`): el agua, un murmullo de orilla (ni el hielo ni
    el borde del tablero suenan a agua);
  - musica de batalla por tema (si aun no esta, la de siempre).
  - (23-11-2026) con mal tiempo los animales se callan: los ambientes de pajaros, grillos y ranas bajan
    con lluvia o nevada y se apagan con tormenta o arena (`weatherLevelOf`, `ambience.ts`); los
    animalitos del tablero dicen lo suyo al moverse cerca de la camara (`animal_*`, `animalCalls.ts`);
    el jeep y los camiones, con su motor, su arranque y su bocina al elegirlos (`soundCues.ts`).
  - (25-11-2026) los animales, con mas variantes (de 5 a 7; la rana sigue con 4: de sus 8 candidatos,
    los otros salen cortados) y flojitos: solo se oyen a menos de 7 casillas del oyente, casi nada en el
    borde y mas al acercarse (`callVolumeOf`, `animalCalls.ts`), y cada vez con un tono algo distinto;
    ningun efecto repite la variante de la vez anterior. Y solo al acercar la camara, ellos y los
    ambientes de animales (pajaros, grillos, ranas, del fondo y de las zonas): desde la vista de empezar
    la partida no se oye ninguno, que se oian en todas partes (`animalZoomLevel`, `listener.ts`).
  - Todo se pide por nombre aunque no haya WAV (`src/audio/soundNames.ts`): hasta que se elija, suena su
    sustituto o nada. Lo que falta es **generar y elegir** los sonidos; lo que queda por enchufar, en
    `docs/IDEAS.md` ("Sonido").
- Los ambientes con picos fuertes (gaviotas, truenos) quedan mas bajos que −24 dB RMS porque el pico no
  pasa de −1 dB; si se nota, un limitador antes de igualar.
- El MP3 añade unos milisegundos de silencio al principio (lo pone el codificador): en bucle puede notarse
  un corte; el juego prefiere el OGG, que no lo tiene.
