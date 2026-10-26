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
