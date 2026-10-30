---
name: equilibrar
description: Use when tuning game balance in Ilogic (prices, damage, terrain, income, AI weights) or when a rules/AI change needs its balance impact measured.
---

# Equilibrar el juego

Herramienta: `npm run balance` (docs en `balance/README.md` y `docs/BALANCE.md`). Juega cientos de
partidas IA contra IA con las reglas reales.

```bash
npm run balance -- run --games 200 --name antes                     # linea base
npm run balance -- run --set UNIT.cost.Tank=10000 --name tanque-10k # probar un cambio
npm run balance -- compare antes tanque-10k                         # comparar
npm run balance -- duel --terrain Woods                             # unidad contra unidad
```

Como leerlo y decidir:
- Victorias por bando cerca del 50 % (el bando 0 mueve primero; el mapa se sortea). Mirar tambien
  `--swap` (bandos cambiados en el mismo mapa) para descartar ventaja del mapa.
- Por unidad: compradas, valor destruido / valor perdido. Una unidad que nadie compra o que gana
  siempre es la candidata. Cambiar **una cosa cada vez** y comparar con la linea base.
- Partidas que acaban por limite de dias = demasiado defensivo.

Al aplicar un cambio:
1. Cambiar el valor en `src/core/content/`: `units.json` (precio, daño `attack.hitChance`, movimiento),
   `buildings.json` (ingresos, proteccion), `terrain.json` (defensa, coste de movimiento), `rules.json`,
   `ai.json`. Para probar sin tocar ficheros, una variante (`--set UNIT.cost.Tank=9500`,
   `POWER.Soldier.Tank=0.2`, `MOVE_COST.vehicle.Woods=3`, `AI.KILLBONUS=60`) o `balance/variants/`.
2. `npx vitest run -u tests/aiGolden.test.ts` (cambian las partidas de referencia, es lo esperado).
3. Guardar el informe que lo justifica en `balance/reports/` y apuntarlo en `docs/BALANCE.md`.
4. Si cambia algo que el jugador nota, al CHANGELOG.

Para mirar una partida concreta paso a paso: `npm run play -- --seed N -e "ai; ai; ai; map; status"`.
