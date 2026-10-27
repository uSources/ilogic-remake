# Plan: rehacer los gráficos con animaciones

## Qué hay ahora

- 299 imágenes PNG, casi todas de 32×32 (unas 170 distintas si no se cuentan las variantes de color).
- **Unidades:** 19 tipos, cada uno dibujado tres veces: azul, rojo y gris (ya usada). Algunas tienen además una versión por terreno.
- **Terreno:** 5 temas (llanura, desierto, bosque, pantano y nieve), con orillas.
- **Edificios:** 9 tipos, en azul, rojo y neutral.
- **Animación:** ninguna. Todo el movimiento que se ve lo pone el código (saltitos, polvo, chispas).
- **Estilo:** los dibujos de 2013 no siguen una paleta común; cada uno tiene sus colores y su grosor de borde. Por eso chocan con la interfaz pixel nueva.

## Cómo hacerlo

### 1. Guía de estilo antes de generar nada
- **Paleta fija** de unas 32 a 48 colores, sacada de la interfaz actual: azul #3aa8ff, rojo #ff4d45, dorado #ffd447, fondo #0b1220...
- **Casilla de 32×32.** Las unidades miran a la derecha (la izquierda se consigue volteando la imagen).
- **Dibujo:** borde oscuro de 1 píxel, luz desde arriba a la izquierda y sombra en el suelo.
- **Color de bando por código:** cada unidad y edificio se genera una sola vez, con unos colores "clave". El juego los cambia por azul, rojo o gris. Así se generan tres veces menos imágenes y los dos bandos quedan siempre iguales.

### 2. Qué animar

| Qué | Animaciones | Fotogramas |
|---|---|---|
| Unidades (19) | quieta (respira o vibra el motor), andar, atacar | 2–4, 4, 3–4 |
| Edificios (9) | bandera ondeando, humo en la fábrica, radar girando | 2–4 |
| Agua | olas y orillas | 4 |
| Efectos | explosión, humo, disparo, bandera al capturar | 4–6 |
| Terreno | nada, o árboles con viento suave | 0–2 |

La muerte de una unidad es la explosión común, así que no hace falta una por unidad.

### 3. Herramienta: un servicio de IA de pixel art
Hay dos que encajan, y los dos tienen servidor MCP para que yo los use directamente:

- **Retro Diffusion**
  - Se paga por imagen, sin suscripción: unos 0,015 a 0,18 $ por imagen, 0,07 a 0,25 $ por animación y 0,10 $ por tileset.
  - Tiene paletas fijas, ciclos de andar, quieto y ataque a partir de un primer fotograma, y salida en hoja de sprites.
  - Incluye una herramienta para recuperar la cuadrícula de píxeles.
  - Para esta lista, unas 80 animaciones con repeticiones, el coste estaría por debajo de unos 100 $.
- **PixelLab**
  - Personajes en 4 u 8 direcciones y animaciones (andar, correr, quieto).
  - Tilesets con orillas automáticas, que encajan con nuestro terreno.
  - Precio por suscripción (ver su web).

La propuesta es hacer la fase G0 (ver abajo) con los dos, con las mismas tres unidades, y elegir por el resultado.

### 4. Cadena de trabajo (la monto yo)
1. **Generar** con la herramienta elegida.
2. **Limpiar automáticamente:** recuperar la cuadrícula de píxeles, pasar a la paleta y quitar el fondo.
3. **Montar** la hoja de sprites y un `manifest.json` con las animaciones.
4. **Cargar en Phaser:** el juego lee el manifiesto y crea las animaciones. Cada gráfico nuevo sustituye al viejo **si existe**, así que se puede cambiar poco a poco sin romper nada.

## Fases

- **G0, prueba de estilo:**
  - contenido: Soldado, Tanque y Artillería, más 4 terrenos y un edificio;
  - se ve en una página de comparación, con lo viejo y lo nuevo lado a lado y las animaciones en marcha;
  - **se decide aquí el estilo**: seguir los dibujos de 2013 pero mejorados, o un estilo nuevo.
- **G1, terreno:** los 5 temas, agua animada y orillas.
- **G2, unidades:** las 19, con quieta, andar y atacar.
- **G3, edificios:** con su animación y el color de bando.
- **G4, efectos:** explosiones, humo y captura, sustituyendo a los cuadraditos de ahora donde mejore.
- **G5, logo y pantalla de carga**, si se quiere.

**Antes de empezar (lo que hace falta del usuario):**
- elegir la herramienta y crear la cuenta con su clave;
- dejarme llegar a ella desde aquí, de una de dos formas:
  - añadir su dominio (`retrodiffusion.ai` o `pixellab.ai`) en claude.ai → Ajustes → Capacidades, porque ahora la red de este entorno lo bloquea;
  - o conectar su MCP;
- revisar la licencia de uso comercial de lo generado, si se piensa publicar.

**Se puede adelantar ya, sin la IA:**
- el sistema de animaciones desde el manifiesto;
- el cambio de color por bando por código;
- el agua animada con las imágenes actuales.
