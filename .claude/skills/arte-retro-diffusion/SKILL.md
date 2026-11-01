---
name: arte-retro-diffusion
description: Use when creating or redoing game art for Ilogic (units, buildings, terrain decor, textures) with Retro Diffusion, or when touching the art pipeline in tools/art. Covers cost rules, prompts that worked, the magenta team-color key and how art reaches the game.
---

# Graficos con Retro Diffusion

Retro Diffusion (RD) **cuesta dinero en la cuenta del usuario**. Reglas, sin excepciones:

1. **No lanzar nada de pago sin que el usuario lo pida en ese momento.** Ofrecer y esperar el si.
2. Antes de generar, decir cuantas imagenes y el precio (`generate.py` sin `--yes` lo calcula gratis).
3. **Mirar el historial antes y despues** (`generate.py --history`): si una respuesta se pierde, el
   trabajo puede haberse lanzado igual. Nunca decir "no se ha lanzado" sin mirar el historial.
4. Si algo se cobra dos veces, decirlo.
5. La clave nunca en el repo ni en commits: `RD_API_KEY=...` o `RD_TOKEN_FILE=/ruta/fuera/del/repo`.
   Si el usuario la pega en el chat, guardarla fuera del repo y recordarle que la regenere al terminar.
6. Recoger un resultado ya pagado es gratis: `generate.py --fetch <task_id> salida.png`.

Precios orientativos (2026): RD Pro 32x32 ≈ 0,18 $; reduccion K-Centroid ≈ 0,001 $; fallos no se cobran.

## Estilo que funciono (el usuario lo aprobo)

- Estilo `rd_pro__default`, **tamaño nativo** (32x32 unidades, 32x48 edificios). No generar grande y
  reducir: queda borroso.
- Referencias: el mapa `tools/art/retrodiffusion/pro_map.png` y unidades ya aprobadas de
  `tools/art/retrodiffusion/units32/`.
- **Una imagen por encargo**, con su semilla, mejor que hojas con varias.
- Unidades de lado mirando a la derecha, chibi "de juguete", contorno oscuro, luz arriba a la
  izquierda, **fondo blanco liso** y un pixel de margen. Aviones con cabina de cristal **sin piloto**
  (salvo cabina abierta). Tanque pesado con doble cañon.
- **Color del bando en magenta.** Se genera una sola version neutral y el codigo saca azul, rojo y gris
  girando el tono (`tools/art/team_key.py`): conserva brillo, saturacion y contorno.
- Edificios: perspectiva cenital 3/4 como el mapa. Los "reimaginados" con mas fantasia se rechazaron
  por perspectiva: solo se quedo el aeropuerto. Edificios **sin animacion**.
- Prompts aprobados en `tools/art/rd/prompts.json` (descripcion + cola comun `unit_tail` /
  `building_tail`). Partir de ahi.

## Como llega al juego

```
encargo.json → tools/art/rd/generate.py --yes → tools/art/retrodiffusion/inbox/X.png
  → revisar con el usuario → mover a tools/art/retrodiffusion/units32/ (o buildings32/, decor/...)
  → npm run assets (rd_units32.py quita el fondo blanco unido al borde y saca b_/i_/r_)
  → npm run shots (ver como queda) → commit
```

- Unidades: `units32/<Nombre>.png` → `public/assets/img/u/{b,i,r}_<Nombre>.png` (r mira a la izquierda).
- Edificios: `buildings32/<Nombre>.png` → `flat/bld_{b,r,n}_<Nombre>.png` (la Base sin neutral).
- Flores y cactus: hojas de 96x32 (3 piezas) en `decor/`; muñecos de nieve `snow_rd.png`.
- Interfaz (`ui/`, lo compila `tools/art/rd_ui.py` a `public/assets/img/ui/`): retratos de general
  `gen_<id>.png` 48x48 (magenta → `gen_b_`/`gen_r_`), habilidades `ab_<id>.png` 16x16, clima
  `wx_<id>.png` 16x16, `zona.png` 16x16 y `flag.png` 16x24 (magenta → `_b`/`_r`/`_i`). Si falta uno,
  el juego usa lo de antes (inicial, SVG del clima, banderin por codigo).
- **Fondo:** el quitafondos de RD (`remove_bg`) se come lo fino o blanco (gotas, copos, rayos, cajas
  claras) y aun asi cobra. Mejor pedir un fondo liso de un color que no salga en el dibujo (verde
  vivo, azul cielo) y quitarlo aqui con un relleno desde el borde o por color.
- Iconos pequeños (ordenes `cmd_<orden>.png`): basta `rd_plus__low_res` 16x16 (0,06 $, un tercio que
  Pro). Ignora el color de fondo pedido y lo devuelve gris opaco: quitarlo con relleno desde el borde.
  `rd_ui.py` les pone un contorno oscuro porque van encima de la unidad.
- Marcas de unidad (`mk_star/noheal/cargo`): igual que las de orden y luego reducidas a 8-10 px por
  moda de color (sin mezclar) antes de guardarlas en `ui/`.
- Efectos animados: `rd_animation__vfx` (24-96 px, 0,07 $ la animacion entera) con `return_spritesheet`.
  No pedir fondo negro (lo quita y se lleva el humo). La hoja va como `ui/anim_<nombre>.png` y `rd_ui.py`
  la parte en fotogramas de 48x48 sin los vacios ni el magenta suelto; `playAnim` (src/ui/fx.ts) la pone.
- Retratos: pasar un retrato ya aprobado como referencia para que salgan con el mismo encuadre;
  sin ella RD a veces pinta un paisaje detras.
- Nunca editar a mano `public/assets/atlas/` ni lo que genera `npm run assets`.
- Lo que no se usa del 2013 esta en `tools/art/sin_usar_2013/` (no se publica).

Ejemplo de encargo (`/tmp/encargo.json`, fuera del repo):

```json
{ "prompt": "<units.Tank de prompts.json><unit_tail>", "prompt_style": "rd_pro__default",
  "width": 32, "height": 32, "reference_images": ["tools/art/retrodiffusion/pro_map.png",
  "tools/art/retrodiffusion/units32/LTank.png"], "seed": 61, "out": "tools/art/retrodiffusion/inbox/Tank.png" }
```
