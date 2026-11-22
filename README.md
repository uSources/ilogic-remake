# Ilogic (remake)

Remake en **TypeScript + three.js** (3D) de *Ilogic*, el juego de estrategia por turnos
(estilo Advance Wars) que hicimos en Java en 2013. El codigo Java se recupero
descompilando el `.jar`; las reglas, la IA y el generador de mapas se han portado
a partir de el, con vuestra musica original; el tablero es ahora 3D y la interfaz, HTML (Preact).

**Jugar:** https://usources.github.io/ilogic-remake/ (se publica sola con cada push a `main`,
`.github/workflows/pages.yml`). Descargas para jugar sin conexion en
[Releases](https://github.com/uSources/ilogic-remake/releases).

**Previews:** las PR con la etiqueta `preview` se publican en su propia URL,
`https://usources.github.io/ilogic-remake/preview/<hash>/` (`.github/workflows/preview.yml`). El enlace sale en
un comentario de la PR, se pone al dia con cada push y la carpeta se borra al quitar la etiqueta o cerrar la PR.
La web y las previews salen de la rama `gh-pages` (Settings → Pages → Deploy from a branch → `gh-pages`). El hash
usa el secreto opcional `PREVIEW_SALT`: con el, la URL no se puede calcular; aun asi la rama `gh-pages` es publica,
asi que no es un control de acceso.

## Requisitos

- [Node.js](https://nodejs.org) 20 o superior.

## Uso

```bash
npm install          # la primera vez
npm run dev          # abre el juego en http://localhost:5173 y recarga al guardar cambios
                     # (/?seed=2013: escaramuza directa en ese mapa; /units3d.html: playground de modelos)
npm test             # tests de la logica (reglas, mapas, IA, guardado)
npm run build        # version para publicar en dist/ (subela a cualquier hosting estatico)
npm run build:single # todo el juego en un solo fichero: dist-single/ilogic.html
npm run build:ci     # dist y dist-single sin recompilar graficos ni pasar tipos/lint (lo usa GitHub)
```

`dist-single/ilogic.html` se puede abrir con doble clic, sin servidor, y pasarselo a quien sea.

La web publicada es una PWA: desde el navegador se puede instalar como app (movil u ordenador) y se
juega sin conexion. `public/manifest.webmanifest` describe la app y `public/sw.js` (service worker)
guarda el juego al instalarse; `vite build` le pone la version y la lista de ficheros, asi que cada
publicacion se actualiza sola. Solo se registra en la web (`src/pwa.ts`): ni en `npm run dev` ni en
`dist-single/ilogic.html`.

## Jugar en línea

Contra amigos por internet, cada uno en su navegador, por turnos y sin prisa (se puede cerrar y
volver: la partida vive en el servidor). Hace falta un servidor de partidas (`server/`, un Worker
de Cloudflare: como publicarlo, en `server/README.md`) y que el juego sepa donde esta:
`VITE_SERVER_URL` al compilar (en GitHub, la variable del repositorio; en local, `.env` a partir de
`.env.example`) o, por encima, la clave `ilogic.server` en el localStorage del navegador (para
jugar con un servidor propio sin recompilar). Sin servidor, Inicio no ofrece «Jugar en línea».

- **Crear sala**: Inicio → «Jugar en línea» → «Crear sala». Las opciones de una partida nueva, de 2 a
  4 equipos y quien juega cada asiento (una persona o la IA), y si se quiere un
  reloj por turno (al acabarse, el turno pasa solo) y cuanto esperar a los que no entran (pasado, su
  asiento lo juega la IA). La sala da un codigo y un enlace de invitacion por asiento de persona:
  copialos (o compartelos desde el movil) y reparte uno a cada amigo. La partida empieza cuando han
  entrado todos; mientras, quien creo la sala puede dar a la IA un asiento que sigue vacio.
- **Entrar**: con el enlace (abre el juego directamente en la sala) o pegandolo en «Entrar con
  enlace». «Mis partidas en línea» recuerda las salas de este navegador para volver a entrar.
- **En la partida**: tu turno se juega como siempre; en los demas sale «Esperando al equipo N…» y
  lo que hacen llega animado cuando acaban. Si cambias de pestaña, el titulo (y un toque, con la
  musica activada) avisan de que te toca. La linea de arriba dice como va la conexion: si se
  corta, el juego vuelve a conectar solo. Guardar y repetir el turno enemigo no estan: la partida
  sigue desde el servidor. Rendirse o salir, desde el menu de pausa (al salir, tu asiento sigue
  siendo tuyo: vuelve con el enlace).

`npm run online` lo prueba de punta a punta con un servidor local (`wrangler dev`) y dos
navegadores. Como funciona por dentro (que garantiza, por donde pasa cada jugada, los mensajes):
[docs/RED.md](docs/RED.md).

## Como se juega

| Accion | Teclado | Raton |
|---|---|---|
| Elegir, mover y atacar | — | Clic en la unidad, en una casilla azul o en un enemigo en rojo |
| Desplazar la camara | Flechas / WASD (mantener) | Arrastrar con el izquierdo o el central |
| Girar la camara | — | Arrastrar con el derecho |
| Acercar y alejar | + / - | Rueda |
| Aceptar en un menu | Enter | Clic |
| Atras / menu de partida | Esc (sin nada elegido abre la pausa) | Boton ☰ arriba a la derecha |
| Fin del turno | E | Boton "Fin del turno" |
| Siguiente unidad sin mover | Tab | Clic en la bandeja de abajo a la derecha |

- Pulsa sobre una unidad tuya (azul) para ver adonde puede ir (casillas azules) y a quien puede
  atacar (rojo). Pulsa una casilla azul para moverla y elige una accion en el menu que sale junto a
  ella; pulsa un enemigo en rojo para ir y atacarle. Al pasar por encima de un objetivo sale la
  prevision de combate: margen de dano (del 5 % al 95 % de las tiradas), vida que le quedara y
  probabilidad de destruirlo.
- La ficha de abajo muestra la unidad, el edificio y el terreno bajo el puntero (vida,
  movimiento, alcance, defensa del terreno...).
- Pulsa sobre una ciudad, fabrica o aeropuerto tuyo libre para comprar unidades.
- Despues de mover, "Atras" deshace el movimiento.
- **Aun no en la vista 3D** (estaban en la 2D): escuadras y ordenes, elegir varias, zona de amenaza,
  minimapa, tutorial guiado, resumen de ronda, repetir el turno enemigo,
  varias personas en la misma pantalla y gestos de dos dedos. Las reglas siguen igual.
- **Ejército:** cada unidad ocupa puntos de mando (la infantería 1, lo más grande hasta 5) y el
  ejército no puede pasar de 30. Cada ronda se paga de mantenimiento el 10 % del precio de tus unidades
  (si no llega, se paga lo que haya). Las dos reglas se cambian o se quitan en Nueva partida →
  Personalizada; la campaña no las usa.
- **Se gana conquistando la Base enemiga.** Capturar va por puntos: un edificio tiene 20 (la
  Base 30) y cada turno la unidad le resta su vida ÷ 10; si se mueve o muere se pierde lo avanzado.
  Una unidad que se queda sin usar encima de un edificio sigue capturando sola al acabar el turno.
- El defensor que sobrevive contraataca (salvo unidades a distancia) y el daño varía
  poco (el esperado ±10 %). La previsión de combate enseña ambas cosas.
- **Combate a la vista:** el disparo sale del atacante (en parábola si es a distancia), salen
  chispas, humo y el daño sobre la unidad, y los vehículos destruidos dejan restos humeantes.
- **Final de la partida:** un cartel de victoria o derrota y despues un resumen con las
  estadísticas, la mejor marca de la misión y botones: Revancha (mismo mapa), Nueva partida,
  Siguiente misión o Reintentar.
- **Menú con tarjetas:** Continuar (con miniatura de la partida guardada), Nueva partida (Rápida o
  Personalizar) y Campaña, sobre la imagen original del menú.
  **Opciones** (también con la tecla O en partida): volumen general y de cada sonido (música, efectos del
  tablero, ambiente, voces e interfaz; cada uno con su silencio), silenciar en segundo plano, autoguardado,
  avisar de unidades sin mover, velocidades, tamaño de la interfaz (90/100/125 %), reducir el movimiento,
  ver siempre la amenaza e idioma.
- **Nueva partida** enseña el mapa que va a tocar ("Otro mapa" o R para sortear otro) y tiene los
  ajustes Normal, Rápida (20×20, 20 días) y Personalizada, que deja elegir tamaño del mapa (20, 32 o 40),
  terreno, niebla, dinero inicial, ingresos y límite de días (al acabar gana quien tenga más puntos:
  valor del ejército + 1000 por edificio). Cada mapa tiene un código (menú de partida) que se puede
  escribir en "Código del mapa" para volver a jugarlo o pasárselo a alguien.
- En el menú de partida: guardar, opciones, ayuda y rendirse.
- **Campaña** (menú principal): 6 misiones en mapas hechos a mano, que se desbloquean en orden.
  La primera es un tutorial que va diciendo qué hacer; las demás tienen objetivos propios (capturar
  ciudades, aguantar unos días, escoltar un convoy, destruir a todo el enemigo, asalto final).
  Las misiones están en `src/core/content/missions.json` y es fácil añadir más (skill `nueva-mision`).
- **Reglas nuevas de movimiento:** el terreno cuesta (bosque, arena y nieve frenan a los vehículos;
  montañas y agua poco profunda, a la infantería), se atraviesan las unidades propias y, con
  niebla, el bosque esconde: si tu camino choca con un enemigo escondido, emboscada. Los edificios
  propios vigilan a su alrededor (la Base y la fortaleza 3 casillas, fábricas y aeropuertos 2, ciudades y pozos 1).
- Opciones dentro de la partida (menú > Opciones): esperar sola al soltar, saltar a la siguiente
  unidad, velocidad de las animaciones propias y del enemigo, volúmenes y autoguardado, en pestañas (Q y
  E cambian de pestaña). En la pestaña «Controles» se cambia la tecla de cada orden del mapa (fin de
  turno, amenaza, órdenes, zoom...; las flechas, Enter y los números son fijos); la ayuda y los
  botones enseñan las teclas elegidas.
- **Clima** (reglas nuevas): cada pocos días cambia el tiempo para los dos bandos. La lluvia frena a los vehículos, la nevada a todo lo que va por tierra, la tormenta a los aviones y la tormenta de arena (desierto) a infantería y aviones; el mal tiempo quita visión y puntería. Arriba, junto al día, el clima de hoy, sus efectos (pasando por encima) y el de mañana si cambia. Se quita en Nueva partida → Personalizada; la campaña no lo usa. Números en `src/core/content/weather.json`.
- **Veteranía** (reglas nuevas): una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas),
  cada una con +5 % de acierto y de defensa.
- Al acabar la partida se ven estadisticas de los dos bandos (compras, bajas, capturas, gasto).
- Si el sistema pide reducir el movimiento, no salen el humo y el polvo, las particulas del clima ni los relampagos (queda el velo del clima).

## Unidades y edificios

Se definen en ficheros de configuracion, sin tocar codigo: `src/core/content/units.json` (precio,
movimiento, daño contra cada unidad, quien la fabrica...), `buildings.json`, `terrain.json` (defensa y
coste de movimiento), `settings.json` (reglas por defecto) y `ai.json` (pesos de la IA). El editor los
autocompleta con su esquema y el juego dice que esta mal si hay un error. Para una unidad nueva:
`npm run unit -- new <Id> --like <Parecida>`. Los temas de mapa y el generador de mapas al azar
estan en `themes.json` y `mapgen.json`. Guia: [docs/CONTENIDO.md](docs/CONTENIDO.md).

## Estructura

```
src/
  core/        Logica del juego en TypeScript puro (sin three.js ni DOM): se puede probar con tests
               y reutilizar, por ejemplo, en un servidor para partidas online.
    content/     Unidades, edificios, terreno, temas, mapas al azar, reglas e IA en JSON + su validacion
                 y sus tipos resueltos (UnitType, TerrainType...): ver docs/CONTENIDO.md
    model/       Modelo de datos de la partida (GameState, Unit, Building, GameEvent...), sin dependencias
    matchSettings.ts  settingsWith(contenido, cambios): los ajustes de una partida (MatchSettings, s.settings)
    ruleModules/ Modulos de reglas (veterania, clima, habilidades, emboscadas...): se enchufan segun los
                 ajustes y aportan entradas a las listas de las reglas (RULE_MODULES, hooksOf)
    data.ts      Constantes que no son contenido (tamaños de mapa, vida)
    gameContent.ts  El contenido de cada partida (unitTypeOf, terrainAt, themeOf); gameState.ts: newGameState
    teams.ts     Los equipos de la partida: alianzas, quien juega cada uno (isHostile, enemiesOf, teamState)
    defaultGames.ts Partidas con el contenido del juego (createMatch, loadGame)
    match.ts     Empezar una partida: MatchConfig por modo, buildMatch, skirmishConfig, rematchOf
    modes.ts     GAME_MODES: como se acaba cada modo, su orden de turnos, sus reglas fijas y sus fases
    session/     La partida en juego: GameSession y los controladores sin IA (persona, red, repeticion)
    controllers/ Los controladores de la IA y el de cada equipo (controllersFor)
    autopilot/   Cumplir las ordenes permanentes (una regla para todos): los pasos de unidad que reutiliza la IA
    mapGrid.ts   El mapa de una partida como rejilla (el tamaño sale del estado)
    rules.ts     Reglas (fachada de rules/: movimiento, combate, captura, union, transporte, compra, fin de ronda)
    abilities.ts Lo que hace cada clase de habilidad de las unidades (ABILITY_EFFECTS)
    squads.ts    Escuadras y ordenes permanentes del jugador (fachada de squads/)
    trail.ts     El camino trazado con el cursor
    ai.ts        Inteligencia artificial (fachada de ai/: un plan que propone cada accion, con su perfil
                 AiProfile); las reglas, las acciones, autopilot/ y session/ no la importan (ESLint)
    playerView.ts Lo que sabe cada equipo (PlayerView): lo que recibe quien decide por el
    mapgen.ts    Generador de mapas aleatorios (fachada de mapgen/: un modulo por paso)
    missions.ts  Misiones de la campaña (fachada de missions/; el contenido, en content/missions.json)
    stats.ts     Estadisticas de la partida (se guardan con ella)
    save.ts      Guardar / cargar en JSON (solo el formato de ahora: las partidas de antes se descartan)
    geom.ts      Rombos y distancias
    util/random.ts Numeros aleatorios con semilla (seededRng, weightedPick, randomInt)
  view3d/      La vista 3D (three.js): main.ts (arranque: imagenes, modelos y menu o partida), menuFlow.ts
               (menu principal), gameStart.ts (cada partida en su carga de pagina), match3d.ts (junta la
               partida), turnControls.ts (el turno), board/terrain/relief (tablero), animations, fx,
               particles, weather3d, world (luz y bucle), glbModels (modelos de Ashfox), playground/ (units3d.html)
  ui/          Datos puros para la interfaz: hudModels.ts (ficha de casilla, prevision de combate,
               minimapa, por panel en models/), sprites.ts (claves de imagen), sides.ts, palette.ts (PAL_CSS)
  menu/        Pantallas del menu (inicio, partida nueva, campaña, opciones), sin dibujo propio
  controls/    Teclado, menus, gestos y seleccion: funciones puras que traducen lo pulsado a ordenes
  audio/       Musica (music.ts, con <audio>), efectos de sonido (sfx.ts, con Web Audio; WAV de Ashfox o de IA)
               y los volumenes de Opciones (volumes.ts) que pone el mezclador (audioContext.ts)
  net/         Partidas por la red desde el navegador: la conexion con la sala (serverLink), lo que llega
               como partida y jugadas (roomClient), las rutas (roomApi) y «Mis partidas en línea»
  patchNotes/  Novedades: notas de parche de GitHub y del CHANGELOG
  atlas.ts     Atlas de imagenes de la interfaz (GameImages, loadGameImages), sin motor de juego
  hud/         Interfaz en HTML con Preact encima del lienzo: Hud.tsx (raiz), game/ menus/ overlays/
               (un componente por fichero), common/ (piezas compartidas), store.ts (estado que publica
               la vista; tipos en state.ts, actions.ts y vm/) y hud.css (estilo "retro pixel", por partes en styles/)
public/assets/ img/ (cada imagen suelta, material de partida), atlas/ (lo que carga la interfaz), models/ (GLB) y musica
tools/art/     Scripts que compilan las imagenes a partir de los dibujos guardados (Retro Diffusion)
               y ashfox/ (fuentes de los modelos 3D y de los efectos sintetizados)
tools/audio/   Sonidos con IA local: Stable Audio 3 en ComfyUI (npm run sonidos, skill sonidos)
docs/          Especificacion del juego original sacada del codigo Java
tests/         Tests (vitest)
scripts/       assets.mjs (compila los graficos), gen-assets.mjs (lista de imagenes) y
               build-single.mjs (version de un fichero)
```

### Graficos

Los graficos se compilan antes de jugar, no mientras se juega. Hay dos clases:

- **Modelos 3D** (unidades, edificios, casillas y decorado del tablero): se hacen con Ashfox a partir
  de `tools/art/ashfox/` y se guardan ya exportados en `public/assets/models/` (`.glb`). Ver la skill
  `ashfox`. Un tipo sin GLB se ve con un modelo de bloques (`src/view3d/models/`).
- **Retratos de unidades**: `npm run retratos` renderiza cada modelo 3D (en el playground, sobre magenta) a
  `tools/art/retratos/3d/` (se guarda en el repo); `tools/art/retratos_pixel.py` lo pasa a pixel art de 64x64 en
  `public/assets/img/retrato/` (`b_` azul, `r_` rojo, `i_` gris). Ese paso lo hace `npm run assets`.
- **Imagenes de la interfaz** (iconos, fichas, miniaturas de mapa): `npm run assets`
  (necesita Python 3 con lo de `tools/art/requirements.txt`) ejecuta en orden los scripts de `tools/art/`:

1. edificios y unidades con sus colores de bando
   (desde los dibujos ya guardados en `tools/art/`: no llama a ningun servicio de pago);
2. los iconos de la interfaz (`tools/art/icons/iconos.txt` → `public/assets/img/ui`, claves `ui/vida`,
   `ui/dinero`...) y la letra pixel del logo (`tools/art/font/ilogic.txt` → `src/hud/fonts/ilogic.woff2`; la de la interfaz,
   Fredoka y Nunito, ya viene hecha en `src/hud/fonts/`),
   las dos dibujadas como rejillas de pixeles en texto: se retocan editando el `.txt`;
   retratos, habilidades, clima y banderin (los retratos de unidades salen de sus modelos 3D: ver abajo); los iconos de la app (pestaña, PWA y pantalla de inicio)
   a partir del Soldado azul nuevo (`tools/art/build_app_icons.py` → `public/icons`);
3. la lista de imagenes (`src/assetList.ts`) y el atlas (`public/assets/atlas`: 2 paginas colocadas con MaxRects y
   comprimidas sin perdida con oxipng);
4. una comprobacion (`tests/assets.test.ts`): que no falte ninguna imagen, que cada
   unidad y edificio tenga sus bandos y que nada se salga de la casilla.

Se ejecuta solo antes de `npm run build`; si algo falla, no se compila. Lo compilado se sube al repo:
GitHub publica la web, las previews y las Releases con esos graficos (`npm run build:ci`, sin Python ni
`npm run assets`), asi que tras retocar un dibujo hay que ejecutar `npm run assets` y subir lo que cambie. `npm run assets:pack` rehace
solo la lista, el atlas y la comprobacion (para cuando se retoca a mano un PNG de `public/assets/img`).
En `dist` van el atlas, los modelos GLB, los punteros del raton (`raton*.png`) y los iconos de `public/icons`; en la version de un fichero (que incrusta tambien los `.glb`) la musica va solo en mp3.

### Sonidos

Los efectos sintetizados (disparos, pasos, menus...) salen de Ashfox (skill `ashfox`). Los efectos nuevos,
los ambientes y la musica nueva se hacen con IA local: Stable Audio 3 Medium en ComfyUI, con
`npm run sonidos` (`tools/audio/`, skill `sonidos`, plan en `docs/PLAN-SONIDO.md`). Genera candidatos
que se escuchan en una pagina y los elegidos pasan a `public/assets/` ya recortados; tambien se suben al repo.

## Calidad del codigo

- `npm run check`: tipos, ESLint (con tipos), formato (Prettier) y tests. GitHub lo pasa antes de
  publicar la web; `npm run build` incluye tipos y lint.
- `npm run format` pone el formato; `git config blame.ignoreRevsFile .git-blame-ignore-revs` para que
  `git blame` se salte el commit que formateo todo.
- Lo visual se mira en el navegador (`npm run dev`; `window.ilogic3d` en la consola). Ya no hay
  capturas comparadas: se quitaron con la vista 2D.
- `npm run play`: partida por texto (reglas sin graficos), para probar reglas o la IA en segundos.

### Preparado para trabajar con IA

- `CLAUDE.md` y `AGENTS.md` (el mismo contenido para otras IAs): normas y comandos.
- `docs/ARQUITECTURA.md` (capas, flujo de un turno, vista 3D, decisiones), `docs/RED.md` (la partida
  por la red de punta a punta) y `docs/AGENTES.md` (como comprobar el trabajo).
- Skills en `.claude/skills/`: `ilogic-code`, `ashfox` (modelos 3D), `arte-retro-diffusion`,
  `nueva-unidad`, `nueva-mision`, `sacar-version` y `equilibrar`.
- `.claude/settings.json`: formato y lint automaticos al editar y proteccion de ficheros generados.
- GitHub: `@claude` en issues y PRs y revision automatica de PRs (ver "Claude en GitHub").

## Claude en GitHub

- `.github/workflows/claude.yml`: escribir `@claude ...` en una issue o en un PR y Claude lo hace
  (responde, cambia el codigo en una rama, abre PR), siguiendo `CLAUDE.md` y las skills.
- `.github/workflows/claude-review.yml`: revision automatica de cada PR: secretos, codigo obsoleto,
  normas del proyecto y mejoras, en comentarios en linea y un resumen.
- Plantillas de issue (`tarea`, `fallo`) con criterios de aceptacion, y de PR con lo que hay que comprobar.

Para activarlo (una vez): instalar la app de Claude (https://github.com/apps/claude) en el repo y crear
**uno** de estos secretos en *Settings → Secrets and variables → Actions*: `CLAUDE_CODE_OAUTH_TOKEN`
(planes Pro/Max: `claude setup-token` en tu ordenador) o `ANTHROPIC_API_KEY`. Sin secreto no hacen
nada.

Lo que se puede mirar con reglas fijas no se deja solo a la IA:

- **Secretos**: `.github/workflows/secretos.yml` pasa [gitleaks](https://github.com/gitleaks/gitleaks)
  por los commits de cada PR (job `gitleaks`; la salida sale tapada, el repo es publico). Un falso
  positivo se marca en su linea con un comentario `gitleaks:allow` y el porque. Si salta uno de
  verdad, borrarlo del commit no basta: ya se ha subido, hay que revocarlo.
- **Codigo obsoleto**: ESLint (`@typescript-eslint/no-deprecated`, dentro de `npm run check`) no deja
  usar lo marcado `@deprecated` en los tipos. Si hace falta a proposito, en su linea:
  `// eslint-disable-next-line @typescript-eslint/no-deprecated -- el porque`.

Para gastar pocos minutos de Actions, cada cosa se hace una vez: los tests (`npm run check`) solo en
las PR (`main` solo cambia por PR), y la web y las
Releases solo compilan (`npm run build:ci`, unos segundos) con los graficos ya compilados del repo.

## Commits

Con [gitmoji](https://gitmoji.dev): `✨ Asunto` en español y el porque debajo. El emoji dice que es
(✨ novedad, 🐛 arreglo, ⚖️ equilibrio, 📝 docs...) y decide si sale en las notas de parche. Lo
comprueba commitlint al hacer commit y en cada PR. Lista y reglas: [docs/COMMITS.md](docs/COMMITS.md).

## Notas de parche

El menu tiene **Novedades**: las notas de cada version, sacadas de las Releases de GitHub del repo
de `package.json` ("repository"). Si no hay conexion, salen las de `CHANGELOG.md`, que van dentro
del juego. Una marca en el menu avisa de notas sin leer, y si hay una version publicada mas nueva
que la que se juega, el panel lo dice y enlaza la descarga.

Para sacar una version:

1. `npm run notes -- --write` escribe en `CHANGELOG.md` (`[Sin publicar]`) un borrador con los commits
   desde la version anterior, agrupados por su emoji (✨ Novedades, ⚖️ Equilibrio, 🐛 Arreglos...; ver
   [docs/COMMITS.md](docs/COMMITS.md)). Se reescribe para el jugador, se traduce (el ingles despues de
   `<!-- en -->`) y se borran sus marcas: con marcas la Release no sale;
2. subir `version` en `package.json` y convertir `[Sin publicar]` en `## [x.y.z] - AAAA-MM-DD — Titulo`;
   `npm run release` enseña como quedaran las notas;
3. commit (`🔖 Version x.y.z`) y PR a `main` (al fusionarla). GitHub (`.github/workflows/release.yml`) compila el juego (los tests ya los paso la PR)
   y publica la Release `vx.y.z` con esas notas e `ilogic.html` adjunto. Si esa version ya estaba
   publicada, solo pone al dia sus notas (para corregir una errata basta con cambiar el CHANGELOG).

El juego enseña lo que haya en la Release (se consulta como mucho cada media hora). Se puede
retocar en la web de GitHub, pero el siguiente cambio del CHANGELOG lo vuelve a sobrescribir.

## Diferencias con el original de 2013

El modo "reglas de 2013" se quitó (27-10-2026).


Las reglas son las del juego original salvo los fallos que se han corregido. Todos estan
marcados en el codigo con `[CAMBIO]`. Los principales:

- Tabla de dano: en las filas de Soldier, SSoldier y FSoldier sobraba un numero
  (los soldados hacian x3 de dano al LTank).
- Ya no se cuelga al abrir el menu de un WTank junto a un aliado (faltaba una fila en una tabla).
- Unir unidades y subir a un transporte mueve de verdad a la unidad (antes se hacia a distancia).
- Despues de mover se puede deshacer con "Atras".
- Esc pide confirmacion antes de abandonar la partida; "Borrar unidad" tambien.
- Sin combustible ni municion: no aportaban (unidades paradas, aviones que caian, partidas que no
  acababan). El camion de suministros ahora repara a los vehiculos y aviones de al lado.
- Mapas: las dos bases siempre existen, estan conectadas por tierra y separadas.
- IA: ataca solo a lo que puede danar y elige el mejor objetivo, vuelve a repararse,
  avanza hacia la Base del jugador y compra con mas criterio.
- Tablero en 3D (three.js) con modelos hechos con Ashfox, relieve, agua y clima animados, y una
  camara que se desplaza, gira y acerca.
- Interfaz nueva de estilo pixel (HTML y CSS sobre el lienzo): menus emergentes junto a la unidad,
  fichas de terreno y unidad, compra con nombres y estadisticas, prevision de combate, bandeja de
  unidades sin mover (Tab), ayuda, estadisticas finales y cartel de cambio de turno. Se conservan
  el logo y el fondo del menu originales (las pantallas de victoria y derrota de 2013 se cambiaron
  por un final dentro de la partida).
- Guardado y configuracion en el navegador (localStorage).
- El original no tenia graficos para las esquinas inferiores de las orillas en los temas
  llanura y bosque: se han generado girando las superiores (`c_0_18/19`, `c_2_18/19`).

## Creditos

Juego original: Ilogic, Fingerprint Games (2013).
