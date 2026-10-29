---
name: automejora
description: Use when the user asks to run an improvement cycle ("automejora", "mejora el juego solo", "lanza un ciclo") for Ilogic. Orchestrates the subagents equilibrador, entrenador-ia, cazador-fallos and revisor, measures with npm run metrics/arena/fuzz and delivers ONE pull request for the user to approve. Never merges.
---

# Ciclo de automejora

El juego se mejora a si mismo con pruebas, pero **nada entra sin que el usuario apruebe el PR**.
Areas: equilibrio, IA enemiga y caza de fallos. Solo se lanza cuando el usuario lo pide.

## Herramientas (ya existen)

| Orden | Mide |
|---|---|
| `npm run metrics` | Nota del juego 0-100 por partes (IA contra IA), comparada con `improve/baseline.json` |
| `npm run arena -- --games 200` | IA actual contra la guardada (`improve/ai-baseline/`) |
| `npm run fuzz -- --games 300 --seed N` | Invariantes en partidas con jugadas al azar e IA |
| `improve/DIARIO.md` | Todo lo probado, aceptado o no (leer siempre antes) |

## Pasos

1. **Preparar.** Arbol limpio y `main` al dia (`git pull`). `npm run check` tiene que pasar. Crear la
   rama del ciclo: `mejora/AAAA-MM-DD`.
2. **Medir.** `npm run metrics -- --name inicio` y leer `improve/DIARIO.md`. Decir al usuario en dos
   lineas la nota y donde esta el margen.
3. **Elegir.** Si el usuario no dice area: fallos primero (un fallo de reglas invalida todo lo demas),
   luego la parte de la nota con mas puntos por ganar (partidas que no terminan → entrenador-ia;
   precios → equilibrador).
4. **Lanzar subagentes** (Agent, `subagent_type` = nombre del fichero en `.claude/agents/`):
   - `cazador-fallos` puede ir en paralelo (con `isolation: "worktree"`): toca otros ficheros.
   - `entrenador-ia` y `equilibrador` **uno detras de otro** en la rama del ciclo: los dos cambian
     `improve/baseline.json` y `tests/aiGolden.test.ts`, y el segundo debe medir sobre el primero.
   - Pasarles: la rama, la nota de inicio, el area y el limite (3 intentos cada uno).
5. **Revisar.** Por cada cambio aceptado, lanzar `revisor` sobre la rama. Si dice CAMBIOS, devolverselo
   al agente una vez; si sigue mal, quitar ese commit y apuntarlo como DESCARTADO en el diario.
6. **Comprobar todo junto.** En la rama del ciclo: `npm run check`, `npm run metrics` (nota final) y
   `npm run shots` (no deberia cambiar nada visual; si cambia, explicarlo).
7. **Proponer.** Push de la rama y un **solo PR** "Automejora AAAA-MM-DD: nota A → B":
   `gh api repos/uSources/ilogic-remake/pulls -f title=... -f head=mejora/... -f base=main -f body=...`
   con una tabla por cambio (que, por que, evidencia), lo descartado y la nota por partes antes y
   despues. Si no se puede crear el PR desde la sesion, dar el enlace
   `https://github.com/uSources/ilogic-remake/compare/main...mejora/AAAA-MM-DD`.
   El diario va en el PR (tambien los intentos descartados).
8. **Nunca fusionar.** El usuario aprueba (o pide quitar un commit). Tras fusionar, la web se publica
   sola; no es una version nueva hasta que se use la skill `sacar-version`.

## Limites

- Como mucho 3 intentos por agente y por ciclo; si nada mejora, el PR solo lleva el diario (tambien
  es util) o no hay PR si no hay nada que contar.
- Nunca: servicios de pago (Retro Diffusion), secretos, `.github/`, relajar tests o invariantes,
  cambiar reglas para que la IA gane, mas de un cambio por commit.
- Uso de Claude: cada ciclo son varios agentes y cientos de partidas; decir al usuario cuanto ha
  durado. Si pide algo mas barato: un solo area y `--games` mas bajo para probar (la medida final
  siempre con los valores por defecto).
