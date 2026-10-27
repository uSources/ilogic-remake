# Equilibrio: línea base (fase 0)

Medido el 26-10-2026 con `npm run balance -- run --games 200 --name actual`: 200 partidas IA contra IA, semillas 1–200, máximo 60 días, reglas originales. El informe completo está en `balance/reports/actual.md`.

## Hallazgos

1. **Las partidas no terminan.**
   - Ninguna de las 200 acaba en 60 días.
   - Con 150 días, siguen sin terminar 38 de cada 40.
   - Hay mucho combate y muchas capturas (más de 12.000 en total): los edificios cambian de mano una y otra vez, pero la Base nunca cae.
   - Contra un bando que no hace nada, la IA gana en 23 días de mediana.
   - Las reglas permiten defender casi siempre. Es el problema principal y lo atacan las fases 1 (contraataque) y 2 (captura y Base).
2. **El que mueve segundo tiene ventaja.**
   - En las partidas sin terminar va claramente por delante en 105 frente a 66 (61 % frente a 39 %).
   - Puede deberse a que juega justo antes del cobro y las reparaciones, o al mapa. Hay que investigarlo en la fase 1.
3. **Quien ataca primero gana casi siempre:** el 98 % de los duelos entre unidades iguales, porque no hay contraataque.
4. **La infantería barata rinde demasiado.**
   - Soldado, Escudero y Bazuca destruyen entre 1,5 y 2,9 veces su coste.
   - Bombardero, Lanzamisiles y Tanque anfibio no llegan a 0,4.
   - El daño depende de la vida y no del precio, así que un soldado de 1500 dispara las mismas veces que un tanque de 12.000, con otra probabilidad de acierto.

## Precios que propone la herramienta (sin aplicar)

| Unidad | Ahora | Propuesto |
|---|---:|---:|
| Soldado | 1500 | 2000 |
| Bazuca, Escudero, Mortero | 2500 | 3000 |
| Antiaéreo | 8000 | 10000 |
| Tanque anfibio | 15000 | 12000 |
| Lanzamisiles | 16000 | 13000 |
| Bombardero | 20000 | 16000 |

No conviene aplicarlos todavía: el contraataque y la captura por puntos van a cambiar mucho estos números. Se volverá a medir después de cada fase.

---

# Fase 1: combate (reglas nuevas)

Contraataque, daño esperado ±10 % y sorteo de quién empieza cada partida. Informes: `balance/reports/f1-orden.md` y `f1-combate.md`.

- **El primer golpe ya no sale gratis.** Tanque contra tanque: el atacante quita 50 y recibe 25. Soldado contra soldado: 50 y 25. La artillería quita 40 a un tanque y no recibe nada, así que vale la pena protegerla. En un duelo a muerte entre iguales sigue ganando quien empieza, como en Advance Wars.
- **Se acabó la ventaja del segundo en mover.** Con el sorteo de lados, las partidas que no terminan van 63/94 en f1-combate, pero 50/50 una vez corregido el orden (f1-orden).
- **La infantería barata sigue rindiendo mucho.** Lo trata la propuesta de precios, más abajo.

# Fase 2: captura por puntos y Base más dura

Medido el 27-10-2026: `npm run balance -- run --games 200 --name f2-captura` y `--vs passive --name f2-pasivo`.

- **La Base ya no cae por sorpresa.**
  - Capturarla cuesta como mínimo 3 turnos seguidos con una unidad entera (30 puntos), y se pierde lo avanzado si la echan.
  - La IA contra un jugador pasivo gana 56 de 60 (93 %), en 27 días de mediana.
- **Bola de nieve moderada.** Quien va por delante el día 5 acaba ganando o por delante el 56 % de las veces; el día 10, el 70 %. No hace falta tocar los ingresos (`RULES.incomeScale` se queda en 1).
- **Bandos equilibrados:** 82 frente a 85 en las partidas sin terminar.
- **Las partidas IA contra IA siguen sin terminar** (199 de 200 en 60 días). Las dos IA son iguales y defienden bien. Sin una IA más agresiva (fuera del plan por ahora), el límite de días con victoria por puntos de la fase 4 es lo que les pone fin.

## IA adaptada a las reglas nuevas (fase 3, mínimo)

- Tiene en cuenta el contraataque al elegir a quién atacar.
- Termina las capturas empezadas y empieza a capturar en cuanto está encima.
- Ataca a quien defiende su Base encima de ella y a quien está capturando las suyas.
- Las unidades que no capturan ya no se quedan aparcadas encima de la Base enemiga tapando a las que sí.

## Propuesta de precios (no aplicada)

`npm run balance -- tune --iterations 2 --games 120` propone (variante `balance/variants/f2-precios.json`):

| Unidad | Ahora | Propuesto |
|---|---:|---:|
| Soldado | 1500 | 2500 |
| Bazuca, Escudero | 2500 | 4000 |
| Mortero | 2500 | 3000 |
| Artillería | 8000 | 10000 |
| Antiaéreo | 8000 | 12500 |
| Tanque anfibio | 15000 | 12000 |
| Lanzamisiles | 16000 | 13000 |
| Bombardero | 20000 | 13000 |

Reduce los avisos de 11 a 6, pero encarece mucho la infantería, que es la que captura. La métrica de eficiencia favorece a las unidades baratas compradas en masa, y la IA compra con sus propias reglas. Es una decisión de diseño: se puede probar en una partida con esa variante antes de aplicarla.
