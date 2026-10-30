# Ilogic (remake)

Remake en **TypeScript + Phaser 4** de *Ilogic*, el juego de estrategia por turnos
(estilo Advance Wars) que hicimos en Java en 2013. El codigo Java se recupero
descompilando el `.jar`; las reglas, la IA y el generador de mapas se han portado
a partir de el, con vuestros graficos y vuestra musica originales.

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

## Como se juega

| Accion | Teclado | Raton |
|---|---|---|
| Mover el cursor | Flechas / WASD | Pasar por encima |
| Aceptar | Enter / Espacio | Clic |
| Atras / cancelar | Esc / Retroceso | Clic derecho (o clic fuera del menu) |
| Menu de partida | Esc en el mapa | Boton ☰ arriba a la derecha |
| Fin del turno | E | Boton "Fin del turno" |
| Mover el mapa | (sigue al cursor) | Arrastrar, o raton en el borde de la pantalla |
| Zoom | + / - | Rueda |
| Siguiente unidad sin mover | Tab | Clic en la bandeja de abajo a la derecha |
| Zona de amenaza enemiga | T | Boton "Ver amenaza enemiga" |
| Alcance de una unidad | Enter sobre ella | Clic derecho (movil: mantener pulsado) |
| Minimapa | M | Clic o arrastrar sobre el minimapa |
| Ayuda | H | Menu de partida > Como se juega |

- Pulsa sobre una unidad tuya (azul) para ver adonde puede ir. Al pasar por encima de una casilla
  se dibuja el camino; pulsa el destino y elige una accion en el menu que aparece junto a la unidad.
  Casillas azules = moverse, moradas = unirse a una unidad igual, turquesa = subir a un transporte,
  rojas = objetivos de ataque. Al pasar por encima de un objetivo sale la prevision de combate:
  margen de dano (del 5 % al 95 % de las tiradas), vida que le quedara y probabilidad de destruirlo.
- Con T se ve en rojo todo lo que el enemigo (lo que ves de el) puede atacar en su proximo turno.
- La ficha de abajo muestra la unidad, el edificio y el terreno bajo el cursor (vida,
  movimiento, alcance, defensa del terreno...).
- Pulsa sobre una ciudad, fabrica o aeropuerto tuyo libre para comprar unidades.
- Despues de mover, "Atras" deshace el movimiento.
- **Ejército:** cada unidad ocupa puntos de mando (la infantería 1, lo más grande hasta 5) y el
  ejército no puede pasar de 30. Cada ronda se paga de mantenimiento el 10 % del precio de tus unidades
  (si no llega, se paga lo que haya). Las dos reglas se cambian o se quitan en Nueva partida →
  Personalizada; la campaña no las usa.
- **Se gana conquistando la Base enemiga.** Capturar va por puntos: un edificio tiene 20 (la
  Base 30) y cada turno la unidad le resta su vida ÷ 10; si se mueve o muere se pierde lo avanzado.
  Una unidad que se queda sin usar encima de un edificio sigue capturando sola al acabar el turno.
- El defensor que sobrevive contraataca (salvo unidades a distancia) y el daño varía
  poco (el esperado ±10 %). La previsión de combate enseña ambas cosas.
- **Combate a la vista:** cada ataque (tuyo o del enemigo) se ve paso a paso: una mira marca el
  objetivo, el disparo sale del atacante (en parábola si es a distancia), la barra de vida baja sobre
  la unidad y, si hay contraataque, se anuncia y pasa igual al revés. Abajo sale el panel de combate
  con las dos unidades (la tuya a la izquierda), quién ataca, su acierto, las vidas bajando y el daño
  de cada lado. Una unidad que dispara desde la niebla sale como «???».
- Durante el turno enemigo, Enter o clic acelera las animaciones.
- En pantallas tactiles: tocar una unidad tuya la elige y tocar el destino la mueve (captura o
  espera sola si no hay nada mas que hacer); para atacar se toca el enemigo dos veces (el primero
  ensena la prevision). Arrastrar una unidad la lleva; mantener pulsado ensena el alcance de cualquier
  unidad y se pellizca para hacer zoom.
- **Final de la partida:** el mapa se descubre entero y la cámara va a la jugada decisiva (confeti al
  ganar; mapa en gris y humo al perder). Un resumen enseña la gráfica del valor de los ejércitos día a
  día, las estadísticas, la mejor marca de la misión y botones: Revancha (mismo mapa), Nueva partida,
  Siguiente misión o Reintentar.
- **Menú con tarjetas:** Continuar (con miniatura de la partida guardada), Nueva partida (Rápida o
  Personalizar) y Campaña, sobre una partida IA contra IA en directo (o la imagen original).
  **Opciones** (también con la tecla O en partida): sonido, autoguardado, velocidades, tamaño de la
  interfaz (90/100/125 %), reducir el movimiento, ver siempre la amenaza e idioma.
- **Nueva partida** enseña el mapa que va a tocar ("Otro mapa" o R para sortear otro) y tiene los
  ajustes Normal, Rápida (20×20, 20 días) y Personalizada, que deja elegir tamaño del mapa (20, 32 o 40),
  terreno, niebla, dinero inicial, ingresos y límite de días (al acabar gana quien tenga más puntos:
  valor del ejército + 1000 por edificio). Cada mapa tiene un código (menú de partida) que se puede
  escribir en "Código del mapa" para volver a jugarlo o pasárselo a alguien.
- En el menú de partida: repetir el último turno enemigo y rendirse.
- **Campaña** (menú principal): 6 misiones en mapas hechos a mano, que se desbloquean en orden.
  La primera es un tutorial que va diciendo qué hacer; las demás tienen objetivos propios (capturar
  ciudades, aguantar unos días, escoltar un convoy, destruir a todo el enemigo, asalto final).
  Las misiones están en `src/core/missions.ts` y es fácil añadir más.
- **Mover unidades:** se cogen y se arrastran (con el dedo, manteniendo pulsado). El camino sigue al
  puntero como una flecha y un bocadillo dice cuánto movimiento se gasta, la defensa de la casilla
  y si allí te pueden atacar. Al soltar pasa lo lógico: sobre un enemigo,
  ataca desde la casilla por la que llegabas; sobre un edificio, captura; sobre una unidad igual, se
  unen; sobre un transporte, sube; en una casilla vacía sin nada más que hacer, espera. Fuera del
  alcance vuelve a su sitio; muy lejos, queda una orden de "ir hacia allí" que la unidad cumple sola
  turno a turno. Mayúsculas + recuadro elige varias para moverlas en grupo. Ctrl+Z deshace el último
  movimiento si no ha descubierto nada.
- **Reglas nuevas de movimiento:** el terreno cuesta (bosque, arena y nieve frenan a los vehículos;
  acantilados y agua poco profunda, a la infantería), se atraviesan las unidades propias y, con
  niebla, el bosque esconde: si tu camino choca con un enemigo escondido, emboscada.
- Opciones dentro de la partida (menú > Opciones): esperar sola al soltar, saltar a la siguiente
  unidad, velocidad de las animaciones propias y del enemigo, música y autoguardado.
- **Clima** (reglas nuevas): cada pocos días cambia el tiempo para los dos bandos. La lluvia frena a los vehículos, la nevada a todo lo que va por tierra, la tormenta a los aviones y la tormenta de arena (desierto) a infantería y aviones; el mal tiempo quita visión y puntería. Arriba, junto al día, el clima de hoy, sus efectos (pasando por encima) y el de mañana si cambia. Se quita en Nueva partida → Personalizada; la campaña no lo usa. Números en `src/core/content/weather.json`.
- **Veteranía** (reglas nuevas): una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas),
  cada una con +5 % de acierto y de defensa.
- Al empezar cada turno sale un resumen de la ronda (ingresos y unidades reparadas).
- Al acabar la partida se ven estadisticas de los dos bandos (compras, bajas, capturas, gasto).
- Si el sistema pide reducir el movimiento, se quitan los temblores, parpadeos y paneos de camara.

## Unidades y edificios

Se definen en ficheros de configuracion, sin tocar codigo: `src/core/content/units.json` (precio,
movimiento, daño contra cada unidad, quien la fabrica...), `buildings.json`, `terrain.json` (defensa y
coste de movimiento), `rules.json` (reglas por defecto) y `ai.json` (pesos de la IA). El editor los
autocompleta con su esquema y el juego dice que esta mal si hay un error. Para una unidad nueva:
`npm run unit -- new <Id> --like <Parecida>`. Guia: [docs/CONTENIDO.md](docs/CONTENIDO.md).

## Estructura

```
src/
  core/        Logica del juego en TypeScript puro (sin Phaser): se puede probar con tests
               y reutilizar, por ejemplo, en un servidor para partidas online.
    content/     Unidades, edificios, terreno, reglas e IA en JSON + su validacion: ver docs/CONTENIDO.md
    data.ts      Tablas sacadas de content/ (UNIT, POWER, Movement...) y el generador de mapas
    rules.ts     Reglas: movimiento, combate, captura, union, transporte, compra, fin de ronda
    orders.ts    Ayudas para las ordenes del jugador (desde donde atacar, grupo, camino)
    ai.ts        Inteligencia artificial (un generador que va devolviendo cada accion)
    mapgen.ts    Generador de mapas aleatorios
    save.ts      Guardar / cargar en JSON
    geom.ts      Rombos, distancias, numeros aleatorios con semilla
    types.ts     Modelo de datos (GameState, Unit, Building, GameEvent)
  scenes/      Escenas de Phaser: Boot (carga), Logo, Menu, Game (partida y final)
  ui/          Dibujo del mapa (mapView: sprites persistentes, zoom entero) y nombres de imagenes (sprites)
    hudModels.ts Datos que enseña la interfaz (ficha de casilla, prevision de combate, minimapa)
    palette.ts   Colores de Phaser (los mismos que hud.css)
  menu/        Pantallas del menu y fondo vivo (liveBackground: partida IA contra IA)
  patchNotes/  Novedades: notas de parche de GitHub y del CHANGELOG
  atlas.ts     Atlas de imagenes del juego (una textura 'atlas' de varias paginas)
  hud/         Interfaz en HTML con Preact encima del lienzo: Hud.tsx (componentes), hud.css
               (estilo "retro pixel") y store.ts (estado que publican las escenas)
  ui/fx.ts     Efectos pixel: explosiones, textos flotantes, destellos
  core/stats.ts Estadisticas de la partida (se guardan con ella)
  display.ts   Lienzo a resolucion fisica de la pantalla (nitido en pantallas de alta densidad)
public/assets/ img/ (cada imagen suelta, material de partida), atlas/ (lo que carga el juego) y musica
tools/art/     Scripts que compilan los graficos a partir de los dibujos guardados (PixelLab, Retro Diffusion)
docs/          Especificacion del juego original sacada del codigo Java
tests/         Tests (vitest)
scripts/       assets.mjs (compila los graficos), gen-assets.mjs (lista de imagenes) y
               build-single.mjs (version de un fichero)
```

### Graficos

Los graficos se compilan antes de jugar, no mientras se juega. `npm run assets` (necesita Python 3
con lo de `tools/art/requirements.txt`) ejecuta en orden los scripts de `tools/art/`:

1. suelos Wang, montañas y bosques, edificios, unidades con sus colores de bando, flores, cactus y
   muñecos de nieve (desde los dibujos ya guardados en `tools/art/`: no llama a ningun servicio de pago);
2. laminas de costa, agua organica, olas, espuma de la orilla y niebla (`public/assets/img/blob`, `anim`);
   los iconos de la interfaz (`tools/art/icons/iconos.txt` → `public/assets/img/ui`, claves `ui/vida`,
   `ui/dinero`...) y la letra de titulos y botones (`tools/art/font/ilogic.txt` → `src/hud/fonts/ilogic.woff2`),
   las dos dibujadas como rejillas de pixeles en texto: se retocan editando el `.txt`;
   los iconos de la app (pestaña, PWA y pantalla de inicio) a partir del Soldado azul nuevo
   (`tools/art/build_app_icons.py` → `public/icons`);
3. la lista de imagenes (`src/assetList.ts`) y el atlas (`public/assets/atlas`: 2 paginas colocadas con MaxRects y
   comprimidas sin perdida con oxipng);
4. una comprobacion (`tests/assets.test.ts`): que no falte ninguna imagen ni lamina, que cada
   unidad y edificio tenga sus bandos y que nada se salga de la casilla.

Se ejecuta solo antes de `npm run build`; si algo falla, no se compila. Lo compilado se sube al repo:
GitHub publica la web, las previews y las Releases con esos graficos (`npm run build:ci`, sin Python ni
`npm run assets`), asi que tras retocar un dibujo hay que ejecutar `npm run assets` y subir lo que cambie. `npm run assets:pack` rehace
solo la lista, el atlas y la comprobacion (para cuando se retoca a mano un PNG de `public/assets/img`).
En `dist` solo van el atlas, los punteros del raton (`raton*.png`) y los iconos de `public/icons`; en la version de un fichero la musica va solo en mp3.
Las imagenes de 2013 que el remake ya no usa estan en `tools/art/sin_usar_2013` (no se publican).

## Calidad del codigo

- `npm run check`: tipos, ESLint (con tipos), formato (Prettier) y tests. GitHub lo pasa antes de
  publicar la web; `npm run build` incluye tipos y lint.
- `npm run format` pone el formato; `git config blame.ignoreRevsFile .git-blame-ignore-revs` para que
  `git blame` se salte el commit que formateo todo.
- `npm run shots`: capturas de 12 escenas comparadas con `tests/visual/ref/` (informe en
  `tests/visual/out/index.html`); `npm run shots:update` para aceptar cambios.
- `npm run play`: partida por texto (reglas sin graficos), para probar reglas o la IA en segundos.

### Preparado para trabajar con IA

- `CLAUDE.md` y `AGENTS.md` (el mismo contenido para otras IAs): normas y comandos.
- `docs/ARQUITECTURA.md` (capas, flujo de un turno, decisiones) y `docs/AGENTES.md` (como comprobar el
  trabajo: API `window.ilogicDebug`, partida por texto, capturas).
- Skills en `.claude/skills/`: `ilogic-code`, `phaser4` (lleva a las oficiales de Phaser 4 en
  `node_modules/phaser/skills/`), `arte-retro-diffusion`, `nueva-unidad`, `nueva-mision`,
  `sacar-version` y `equilibrar`.
- `.claude/settings.json`: formato y lint automaticos al editar y proteccion de ficheros generados.
- GitHub: `@claude` en issues y PRs y revision automatica de PRs (ver "Claude en GitHub").

## Automejora

El juego se puede mejorar solo, con pruebas, cuando se pide ("lanza un ciclo de automejora"): la skill
`automejora` coordina subagentes (`.claude/agents/`) que proponen **un solo PR** para aprobar.

- **Equilibrador**: un cambio de numeros que suba la nota del juego.
- **Entrenador de la IA**: una mejora de la IA que gane a la anterior en la arena.
- **Cazador de fallos**: busca partidas que rompan las reglas, añade el test y lo arregla.
- **Revisor**: revisa cada propuesta y repite las medidas antes de que llegue al PR.

Medidas: `npm run metrics` (nota 0-100 por partes, linea base en `improve/baseline.json`),
`npm run arena` (IA actual contra la guardada) y `npm run fuzz` (invariantes). Todo lo probado,
aceptado o no, queda en `improve/DIARIO.md`. Nada se fusiona sin aprobarlo.

## Claude en GitHub

- `.github/workflows/claude.yml`: escribir `@claude ...` en una issue o en un PR y Claude lo hace
  (responde, cambia el codigo en una rama, abre PR), siguiendo `CLAUDE.md` y las skills.
- `.github/workflows/claude-review.yml`: revision automatica de cada PR con las normas del proyecto.
- Plantillas de issue (`tarea`, `fallo`) con criterios de aceptacion, y de PR con lo que hay que comprobar.

Para activarlo (una vez): instalar la app de Claude (https://github.com/apps/claude) en el repo y crear
**uno** de estos secretos en *Settings → Secrets and variables → Actions*: `CLAUDE_CODE_OAUTH_TOKEN`
(planes Pro/Max: `claude setup-token` en tu ordenador) o `ANTHROPIC_API_KEY`. Sin secreto no hacen
nada. `.github/workflows/visual.yml` pasa las capturas en las PR que pueden cambiar lo que se ve
(codigo, graficos, CHANGELOG...) y deja el informe como artefacto.

Para gastar pocos minutos de Actions, cada cosa se hace una vez: los tests (`npm run check`) solo en
las PR (`main` solo cambia por PR), las capturas solo en las PR que tocan algo visible, y la web y las
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

El modo "reglas de 2013" se quitó (27-10-2026): las partidas guardadas con esas reglas se siguen
jugando con las actuales.


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
- Interfaz nueva de estilo pixel (HTML y CSS sobre el lienzo): mapa a pantalla completa y nitido
  a cualquier tamano (zoom entero), menus emergentes junto a la unidad, fichas de terreno y unidad,
  compra con nombres y estadisticas, camino previsto, prevision de combate, bandeja de unidades
  sin mover (Tab), zona de amenaza enemiga (T), alcance de cualquier unidad, minimapa, ayuda,
  resumen de cada ronda, estadisticas finales, gestos tactiles (pellizcar, mantener pulsado),
  explosiones y efectos pixel, y cartel de cambio de turno. Se conservan los graficos,
  el logo y el fondo del menu originales (las pantallas de victoria y derrota de 2013 se cambiaron
  por un final dentro del mapa).
- Guardado y configuracion en el navegador (localStorage).
- El original no tenia graficos para las esquinas inferiores de las orillas en los temas
  llanura y bosque: se han generado girando las superiores (`c_0_18/19`, `c_2_18/19`).

## Creditos

Juego original: Ilogic, Fingerprint Games (2013).
