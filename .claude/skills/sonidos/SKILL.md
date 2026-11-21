---
name: sonidos
description: Use when creating or redoing sound effects, ambiences or music for Ilogic with local AI (Stable Audio 3 in ComfyUI), or when touching tools/audio. Covers the sound catalog, how to generate candidates, the listening page, how picked sounds reach public/assets, and what was learned about the model. The synthesized effects made with Ashfox are the ashfox skill.
---

# Sonidos con IA local (ComfyUI)

Plan y lista de lo que falta: `docs/PLAN-SONIDO.md`. Herramienta: `tools/audio/` (`npm run sonidos`).

## Lo que hace falta

- **ComfyUI abierto** (Comfy Desktop, `http://127.0.0.1:8188`; otro sitio con `COMFYUI_URL`).
- En su carpeta de modelos (`~/ComfyUI-Shared/models` en el equipo del usuario):
  `checkpoints/stable_audio_3_medium.safetensors` y `text_encoders/t5gemma_b_b_ul2.safetensors`
  (repo `Comfy-Org/stable-audio-3` de Hugging Face, sin registro). Es gratis y local.
- macOS: el FLAC de ComfyUI se pasa a WAV con `afconvert` (no hay ffmpeg); el MP3 y el Opus los
  codifica el propio ComfyUI.

## Flujo

```sh
npm run sonidos -- lista                          # catalogo y cuantos candidatos tiene cada uno
npm run sonidos -- generar shot_flak,amb_sea      # 4 candidatos de cada uno (--tandas 3: 12)
npm run sonidos -- escuchar                       # abre la pagina para oirlos (http://localhost:5180)
npm run sonidos -- oir shot_flak 2,5              # o los suena en la terminal (afplay), sin navegador
npm run sonidos -- elegir shot_flak 2,5,7         # efectos: tantos como variantes
npm run sonidos -- elegir amb_sea 3               # ambientes y musica: uno
npm run sonidos -- grafo shot_flak                # el grafo para abrirlo a mano en ComfyUI
```

- **Catalogo** (`tools/audio/catalog.ts`): id, clase (`sfx`, `ambient`, `music`, `jingle`), texto en
  ingles (solo lo que suena), segundos y variantes. El estilo comun de cada clase y como se recorta
  estan en `soundKinds.ts`: cambiar el estilo de todo es tocar `style` alli.
- **Escuchar**: la pagina (`tools/audio/out/index.html`) abierta como fichero (doble clic, o desde la
  app de Claude) no suena: el navegador no carga los audios de al lado. Por eso `escuchar` la sirve
  (`listeningServer.ts`, con rangos de bytes, que Safari pide) y la pagina avisa si no la sirve nadie.
- **Candidatos** en `tools/audio/out/<id>/` (fuera de git): `<n>.wav` ya recortado, `raw/<n>.flac` tal
  cual salio y `candidates.json` (semilla y texto de cada uno). Se numeran seguidos entre tandas.
- **Elegir** deja: efectos en `public/assets/sfx/<id>_<n>.wav` (mono 48 kHz, pico -1 dB) y rehace
  `src/audio/soundList.ts` desde los WAV de la carpeta (`tools/audio/soundList.mjs`, la misma que usa
  Ashfox: ninguna herramienta borra de la lista los de la otra); ambientes en
  `public/assets/ambient/<id>.ogg|mp3` y musica en `public/assets/music/<id>.ogg|mp3` (bucle cerrado
  con un fundido del final sobre el principio).
- **Un efecto, una herramienta**: `elegir` no pisa un efecto que hace Ashfox (`tools/art/ashfox/sounds/<id>.ashfox`).
  Para rehacerlo con IA: quitarlo de `tools/art/ashfox/models/sounds.mjs` y su `.ashfox`, y ponerlo en el catalogo.
- **Nombres con sustituto** (`src/audio/soundNames.ts`): el juego ya pide los efectos del catalogo por su
  nombre; mientras no se elija uno, suena su sustituto (o nada) y en cuanto se elige suena el suyo, sin
  tocar codigo. Un id nuevo: al catalogo y a `SOUND_FALLBACKS`, y pedirlo donde toque (`soundCues.ts`,
  `eventSteps.ts`, `turnControls.ts`; un boton, con `data-sound`). Los ambientes van por nombre en
  `src/audio/ambientNames.ts` (de zona, de fondo y de clima) y la musica en `MusicTrack` (`music.ts`).
- **Sonido 3D**: lo del tablero suena desde su sitio (`docs/ARQUITECTURA.md`, "Sonido 3D"); para
  comprobarlo sin oir, `window.ilogic3d.recentSounds()` en la partida.

## Lo aprendido del modelo

- **Stable Audio 3 Medium** (9,2 GB): efectos, ambientes y musica instrumental. 8 pasos, `cfg` 1,
  `lcm`/`simple` (lo de la plantilla de ComfyUI). En el M4 Max, 4 candidatos de 1-2 s en unos 5 s y
  4 de 40 s en unos 25 s.
- **Small SFX no vale**: con ComfyUI 0.45.3 en Mac solo da ruido, con cualquier muestreador.
- El texto acaba en `Length: N seconds` (entero): asi se entreno. Se genera algo mas largo (la cola, o
  el fundido del bucle) y luego se recorta.
- "Single", "one short burst" ayudan a que salga uno solo (si no, rafagas o varios pasos seguidos).
- No oye por ti: mirar el espectrograma ayuda a descartar basura (ruido sin ataque ni cola), pero
  quien elige es el usuario escuchando la pagina de candidatos.
- Licencia (Stability AI Community): lo generado es del usuario y se puede usar gratis por debajo de 1 M$ al año.
