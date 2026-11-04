# Estilo del codigo

Codigo que se entienda a la primera, sin descifrarlo. Vale para todo `src/`, `tests/` y `tools/`, lo
escriba una persona o una IA. Si una regla estorba en un caso concreto, gana que se lea mejor; se
explica en un comentario.

## Ejemplo

Antes (funciona, pero hay que descifrarlo):

```ts
const dist = groundDistance(s, goal, UNIT.movtype[u.type]!, grid(false));
const here = samePos(u, goal) ? 0 : dist[u.x]![u.y]! || Infinity;
let best: Pos | null = null;
let bestD = here;
let bestC = Infinity;
for (let x = 0; x < range.steps.length; x++)
  for (let y = 0; y < range.steps[x]!.length; y++) {
    const c = range.steps[x]![y]!;
    if (c <= 0) continue;
    // ...
  }
```

Despues (se lee como lo que hace):

```ts
const distanceToGoal = distanceMap(s, goal, movement);
const best = minBy(reachableTiles(range), (tile) => [distanceToGoal.at(tile.pos), tile.cost]);
const gotCloser = best && distanceToGoal.at(best.pos) < distanceToGoal.at(unit);
return gotCloser ? best.pos : null;
```

## Reglas

1. **Nombres completos.** `unit`, `movement`, `distanceToGoal`, `attacker`; no `u`, `mt`, `d`, `c`.
   Solo valen letras sueltas en bucles de 2-3 lineas (`x`, `y`, `i`) y `s` para el `GameState`
   (esta en todo el nucleo). Un booleano se lee como pregunta: `isReachable`, `hasCargo`, `canCapture`.
2. **Una funcion, una idea.** Si hace falta un comentario para separar partes, cada parte es una
   funcion con nombre. Orientativo: unas 25 lineas y 2 niveles de anidacion como mucho.
3. **Salir pronto.** Las comprobaciones arriba con `return`, en vez de `if` dentro de `if`.
4. **Nada magico.** Ni numeros ni condiciones sueltas que haya que adivinar: `steps > 0` es
   `isReachable(...)`, `team === 0` es `isPlayer(...)`, una constante con nombre en vez de `350`.
5. **Recorrer con piezas comunes, no a mano.** Para el mapa, `Grid<T>` (`at`, `set`, `forEach`) y
   `reachableTiles`; para elegir el mejor, `minBy`/`maxBy`. Nada de `[x]![y]!` ni de tripletes
   `best / bestD / bestC`. Antes de escribir un bucle, buscar si ya existe la ayuda (`src/core/util/`).
6. **Abierto a ampliar con datos.** Algo que crece (acciones, fases, objetivos, habilidades,
   animaciones por suceso) es una lista de entradas con su `when`/`run`, no un `switch` que hay que
   abrir cada vez. Un `switch` corto sobre un tipo cerrado esta bien.
7. **Depender de poco.** Cada modulo pide una interfaz pequena con lo que usa (`...Host`), no la
   escena ni el estado entero. El nucleo (`src/core`) no importa nada de fuera.
8. **Funciones puras donde se pueda.** Calcular y aplicar por separado: primero se decide (puro, con
   test), despues se cambia el estado o se dibuja. Una funcion con nombre de consulta (`statsOf`,
   `captureProgress`) nunca escribe en la partida.
9. **Tipos que cuentan la verdad.** Uniones con nombre (`'attack' | 'capture'`) en vez de `string`;
   `null` solo cuando "no hay" es un caso real, y entonces se trata arriba (regla 3).
10. **Comentarios del porque, no del que.** Si un comentario explica que hace el codigo, se reescribe
    el codigo. Se comenta la razon, la regla del juego original o la trampa que se evita.
11. **Identificadores en ingles, comentarios y textos en castellano** (como hasta ahora).
12. **Nada de estado global de partida.** Lo que depende de la partida sale de ella: reglas de
    `s.rules`, tamaño del mapa de `mapGrid(s)`, capas con `createLayer(s, fill)`. Nada de variables de
    modulo que se cambian al empezar una partida. El contenido va con la partida (`tablesOf(s)`,
    `weightsOf(s)`) y esta congelado; reglas con cambios con `rulesWith(...)`, partidas nuevas con
    `newGameState(...)`. Las casillas se pasan como `Pos`, no como `x, y` sueltos, y se copian con
    `posOf(unit)`.

## Al cambiar codigo que ya existe

- Reescribir sin cambiar lo que hace: los mismos resultados, el mismo orden en los empates (`minBy`
  se queda con el primero, como los bucles de antes).
- Comprobar con `npm run check`; si toca reglas o IA, que las partidas de referencia de la IA
  (`tests/aiGolden.test.ts`) salgan iguales sin `-u`; si toca algo visual, `npm run shots`.
- Commits pequenos, uno por idea, para que se pueda revisar.
