# Herramienta de equilibrio

Juega cientos de partidas IA contra IA con las reglas reales del juego (`src/core`, sin vista), mide qué pasa y propone ajustes. Sirve para cualquier cambio: precios, daño, terreno, ingresos o reglas nuevas.

```bash
npm run balance -- run --games 200 --name actual                  # estado actual
npm run balance -- run --variant mi-variante --name mi-variante   # probar una variante
npm run balance -- run --set UNIT.cost.Tank=10000 --name tanque-10k   # cambio rápido sin fichero
npm run balance -- compare actual tanque-10k                      # antes / después
npm run balance -- duel --terrain Woods                           # unidad contra unidad
npm run balance -- tune --iterations 3                            # ajustar precios solo
npm run balance -- run --vs candidata --name candidata            # un perfil de IA contra la del juego
```

Los informes salen en `balance/reports/<nombre>.md`, para leer, y en `.json`, para comparar.

## Variantes

Una variante es un JSON en `balance/variants/` con los cambios que se quieren probar:

```json
{
  "name": "tanques-baratos",
  "notes": "¿se compran más tanques si cuestan menos?",
  "set": {
    "UNIT.cost.Tank": 10000,
    "UNIT.cost.*": "x1.1",
    "HIT_CHANCE.Tank.Soldier": "+0.05",
    "BUILDING.earning.City": 800,
    "TERRAIN.protection.Woods": 0.8,
    "SETTINGS.initialFunds": 8000
  }
}
```

- **Rutas:** cada una nombra un campo de los ficheros de `src/core/content/`, con su nombre en el JSON;
  la variante se carga como el contenido del juego (`loadContent`: se valida, se resuelven todos los
  tipos y se congela), así que un valor imposible para antes de jugar.
  - `UNIT.<cost|command|move|vision>.<unidad>`: campos de `units.json`.
  - `HIT_CHANCE.<atacante>.<defensor>`: probabilidad de acierto (`attack.hitChance`).
  - `BUILDING.<earning|heals|protection|vision>.<edificio>`.
  - `TERRAIN.<protection|buildable|water>.<terreno>` y `MOVE_COST.<movimiento>.<terreno>` (`movement` de `terrain.json`; `null` = no se puede pasar).
  - `SETTINGS.<regla>`: las reglas por defecto de `settings.json` (la variante se juega con `settingsWith(su contenido)`).
  - `AI.<peso>`: pesos de `ai.json`.
- **Casillas:** se nombran con los nombres internos (`Tank`, `City`, `Woods`…), con su índice o con `*` para todas.
- **Valores:** un número fijo, `"x1.1"` (multiplicar), `"+500"` o `"-0.05"`. Precios e ingresos se redondean a 100.
- **Reglas nuevas:** se añaden a `settings.json` (y a `MatchSettings`) y quedan disponibles para las variantes sin tocar la herramienta.

## Qué mide

- **Resultado:**
  - victorias de cada bando y partidas sin terminar;
  - en las que no terminan, quién va claramente por delante al final (al menos un 15 % de ventaja);
  - duración.
- **Bola de nieve:** si quien va por delante el día 5, el 10 o el 20 acaba ganando.
- **Unidades:** compras, eficiencia (valor destruido por cada 1 gastado), supervivencia, bajas causadas y capturas.
- **Duelos:** daño, contraataque, probabilidad de destruir, valor quitado por cada 1000 de coste y cuántas veces gana quien ataca primero en un duelo a muerte.
- **IA** (`docs/PLAN-IA.md`): de cada perfil que juega, lo que la hace parecer humana o una máquina (`tools/balance/humanity.ts`):
  - **regaladas:** unidades que caen en el turno del rival sin haber atacado, capturado o llegado en su último turno (se quedaron donde las mataron);
  - **al aliado más cercano:** a cuántas casillas queda, de media, cada unidad del suyo más cercano al acabar su turno (menos, más en grupo);
  - **vaivenes:** movimientos que van en contra del anterior de la misma unidad (cambiar de idea de un turno a otro);
  - **tiempo por turno** de la IA (media y el 95 %, en esta máquina).

  Con dos perfiles (`--vs`), también cuánto gana cada uno. `compare` compara estas medidas entre informes.

## Una IA contra otra

`--vs <perfil>` hace que el primer bando lo juegue ese perfil y el resto la IA del juego (`ai`). Los perfiles están en `tools/balance/profiles.ts`: uno nuevo es una entrada más, con el mismo contenido de la partida y otro `AiProfile` (otros pesos, comportamientos o turno). Así se prueba un cambio de la IA antes de que sea la del juego.

- Con dos perfiles, **los lados se alternan**: en las partidas de semilla par cada uno juega del otro lado, para que no cuente quién empieza ni el mapa.
- El informe dice cuánto gana cada perfil (de verdad o con ventaja clara al final).
- Los avisos de lados y precios solo salen cuando todos los bandos los juega la misma IA: con dos perfiles distintos no dicen nada del juego.
- Las personalidades y las dificultades de `ai.json` tienen su perfil (`agresiva`, `cauta`, `codiciosa`, `tortuga`, `facil`). Las IAs de antes también (`fase0` a `fase2`), para comparar con lo de ahora.

## Ajustar los pesos de la IA

```
npm run balance -- tune-ai --weights minCapturers,dangerAversion --games 40 --name ia-ajustada
```

`tune-ai` busca pesos mejores para la IA jugando sola (`docs/PLAN-IA.md`, fase 5). Para cada peso de `--weights`:

1. Lo sube y lo baja `--step` veces (1,3 por defecto). Un peso entero sigue entero y cambia al menos 1.
2. Juega con ese cambio (perfil `ai`) contra la IA de ahora, que usa los pesos de `ai.json` (perfil `actual`), con los lados alternos.
3. Se queda con el primer valor que saque `--margin` más que ella (10 puntos por defecto) y más que lo que ya tenía.

Los cambios se acumulan y `--iterations` repite la vuelta. Sin `--weights`, prueba los que cambian las personalidades.

El resultado sale como variante (`balance/variants/<nombre>.json`) y como informe con cada prueba. Antes de llevarlo a `ai.json`, hay que confirmarlo con más partidas: `run --variant <nombre> --vs actual --games 80`.

## Avisos y propuestas

Cada informe compara con objetivos (`DEFAULT_TARGETS` en `tools/balance/report.ts`; la duración se cambia con `--target-days 15-25`):

| Objetivo | Por defecto |
|---|---|
| Duración mediana | 15–25 días |
| Diferencia entre bandos | menos de 8 puntos (58/42) |
| Bola de nieve el día 5 | menos del 80 % |
| Partidas sin terminar | menos del 10 % |
| Eficiencia de cada unidad | entre 0,67 y 1,5 veces la mediana |
| Ventaja de atacar primero entre unidades iguales (daño hecho / devuelto) | 3 o menos |

Si una unidad rinde demasiado o demasiado poco para lo que cuesta, propone un precio nuevo. El cambio máximo es de un 20–25 % por ronda y se redondea a 500. `tune` aplica las propuestas, vuelve a jugar y se queda con la versión que tenga menos avisos. Guarda el resultado como variante.

## Cosas a tener en cuenta

- Todas las variantes usan **las mismas semillas** (los mismos mapas y tiradas), así que las diferencias entre informes vienen de los cambios. Para comparar, usad el mismo `--games` y `--seed`.
- La IA decide qué compra y cómo juega. Si una unidad "casi nadie la compra", puede ser culpa de la IA y no del precio. La eficiencia mide cómo la usa la IA, no cómo la usaría una persona.
- La eficiencia favorece a las unidades baratas que se compran en masa. Es una pista para investigar, no una sentencia.
- `--vs passive` enfrenta la IA a un bando que no hace nada. Sirve para comprobar que la IA sigue sabiendo ganar después de cambiar las reglas.
- Lo que tarda cada turno depende de la máquina: para comparar, en la misma y con el mismo `--threads`.
- Opciones: `--games`, `--days` (60 por defecto), `--seed`, `--threads`, `--terrain`, `--no-duel`, `--first 1` (que mueva primero el bando 1) y `--swap` (cambiar de lado los bandos en cada mapa): sirven para separar la ventaja del orden de juego de la del mapa.
