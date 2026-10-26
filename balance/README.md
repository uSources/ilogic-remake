# Herramienta de equilibrio

Juega cientos de partidas IA contra IA con las reglas reales del juego (`src/core`, sin Phaser), mide qué pasa y propone ajustes. Sirve para cualquier cambio: precios, daño, terreno, ingresos o reglas nuevas.

```bash
npm run balance -- run --games 200 --name actual                  # estado actual
npm run balance -- run --variant mi-variante --name mi-variante   # probar una variante
npm run balance -- run --set UNIT.cost.Tank=10000 --name tanque-10k   # cambio rápido sin fichero
npm run balance -- compare actual tanque-10k                      # antes / después
npm run balance -- duel --terrain Woods                           # unidad contra unidad
npm run balance -- tune --iterations 3                            # ajustar precios solo
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
    "POWER.Tank.Soldier": "+0.05",
    "BUILDING.earning.City": 800,
    "TERRAIN.protection.Woods": 0.8,
    "RULES.initialFunds": 8000
  }
}
```

- **Tablas:**
  - `UNIT`: coste, movimiento, visión, alcance, combustible, munición…
  - `POWER`: probabilidad de acierto atacante → defensor.
  - `BUILDING`: ingresos, curación, protección.
  - `TERRAIN`: protección…
  - `RULES`: dinero inicial, límite de unidades, contraataque, azar del daño, modo de captura.
  - `AI`: umbrales de la IA.
- **Casillas:** se nombran con los nombres internos (`Tank`, `City`, `Woods`…), con su índice o con `*` para todas.
- **Valores:** un número fijo, `"x1.1"` (multiplicar), `"+500"` o `"-0.05"`. Precios e ingresos se redondean a 100.
- **Reglas nuevas:** se añaden a `RULES`, en `src/core/data.ts`, y quedan disponibles para las variantes sin tocar la herramienta.

## Qué mide

- **Resultado:**
  - victorias de cada bando y partidas sin terminar;
  - en las que no terminan, quién va claramente por delante al final (al menos un 15 % de ventaja);
  - duración.
- **Bola de nieve:** si quien va por delante el día 5, el 10 o el 20 acaba ganando.
- **Unidades:** compras, eficiencia (valor destruido por cada 1 gastado), supervivencia, bajas causadas y capturas.
- **Duelos:** daño, contraataque, probabilidad de destruir, valor quitado por cada 1000 de coste y cuántas veces gana quien ataca primero en un duelo a muerte.

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
- Opciones: `--games`, `--days` (60 por defecto), `--seed`, `--threads`, `--terrain`, `--no-duel`, `--first 1` (que mueva primero el bando 1) y `--swap` (cambiar de lado los bandos en cada mapa): sirven para separar la ventaja del orden de juego de la del mapa.
