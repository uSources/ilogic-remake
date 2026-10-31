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
- **Se acabó la ventaja del segundo en mover.** Antes de sortear quién empieza, las partidas sin terminar iban 63 frente a 94 (f1-combate). Con el sorteo de lados van 77 frente a 83 (f1-orden).
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

## Precio del Tanque (2026-10-30): descartado

Tanque 12000 → 9500 se acepto primero (nota 56,8 → 59,3) y se retiro al revisar la medida: la subida
venia del reparto de victorias entre bandos, que con 120 partidas se mueve ±10 puntos solo por azar.
Con la nota corregida (`tools/improve/metrics.ts`: el reparto solo resta fuera del ruido y el precio
cuenta lo cerca que esta cada unidad de la banda) queda igual: 65,3 → 65,2. Detalle en `improve/DIARIO.md`.

## Bombardero y Lanzamisiles mas baratos (2026-10-30)

Bombardero 20000 → 13000 y Lanzamisiles 16000 → 11000, medidos juntos con `npm run metrics` (120
partidas 32x32): nota 65,3 → 66,2 (precios: ajuste 69 % → 75 %, 8 de 15 en la banda). El Bombardero pasa
de rendir 0,45x la mediana a 0,76x (entra en la banda) y el Lanzamisiles de 0,30x a 0,50x; el reparto
entre bandos no cambia (48/52). Por separado cada uno daba +0,7. Aceptado por el usuario con +0,9 (el
criterio general es +1,0). Detalle en `improve/DIARIO.md`.

## Puntos de mando y mantenimiento (30-10-2026)

Medido con `npm run balance -- run --games 100 --name ejercito` contra la variante `sin-ejercito`
(las dos reglas apagadas). Informes en `balance/reports/ejercito.md`, `sin-ejercito.md` y
`comparar-sin-ejercito-vs-ejercito.md`.

| | Sin las reglas | Con 30 puntos y 10 % |
|---|---:|---:|
| Unidades en el mapa por bando, día 10 / día 20 | 18,1 / 28,7 | 8,7 / 10,9 |
| Partidas decididas en 60 días | 1 % | 17 % |

- Sin las reglas, el día 20 cada bando está casi en el tope de 30 unidades: el mapa se atasca.
- Con puntos de mando, la IA compraba solo infantería (gasta todo cada turno y llena el tope de
  unidades de 1 punto). Ahora empieza por los edificios que fabrican lo grande y ahorra un turno si lo
  que elige se paga con lo que entra el siguiente.
- Pendiente: con la IA nueva se compran muchos aviones (los aeropuertos van primero) y casi ningún
  tanque. Revisar los pesos de compra o los puntos de los aviones.

## Clima (30-10-2026)

Medido con `npm run balance -- run --games 200 --name con-clima` contra `sin-clima`
(`--set RULES.weather=false`). Informes en `balance/reports/con-clima.md`, `sin-clima.md` y
`comparar-sin-clima-vs-con-clima.md`.

| | Sin clima | Con clima |
|---|---:|---:|
| Victorias bando 0 / bando 1 | 5 % / 7 % | 7 % / 5 % |
| Días (mediana) | 46 | 49 |
| Daño hecho / devuelto (iguales) | 2,0 | 2,0 |

- El clima es igual para los dos bandos y no inclina la balanza; las partidas duran unos 3 días más
  (lluvia y nieve frenan los avances por tierra).
- La eficiencia de cada unidad apenas se mueve; la que más, el tanque (0,25 → 0,14), con muy pocas
  compras (55 → 48), así que es ruido más que efecto.

## Tanque contra infantería (30-10-2026)

La infantería barata dominaba y el Tanque casi no se veía. Tres cambios, medidos uno detrás de otro con
`npm run metrics` (120 partidas). Informe: `balance/reports/tanques-vs-infanteria.md`.

| | Antes | Después |
|---|---:|---:|
| Nota | 61,8 | 66,4 |
| Tanques comprados (de unas 6000 compras) | 21 | 129 |
| Tanque: valor destruido por cada 1 que cuesta | — | 0,87 (en la banda) |
| Soldado: veces la mediana | 3,2x | 2,2x |
| Aviones, parte de las compras | 36 % | 12 % |

- **La IA compra Tanques otra vez.** El Aeropuerto iba siempre antes que la Fábrica y se quedaba el
  dinero; ahora los dos van en orden al azar (`src/core/ai.ts`, `produce`). Es lo que más cuenta (+3,8).
- **El Tanque gana a la infantería**: le acierta 0,6 (0,45 a la Bazuca) y la infantería ligera le acierta
  0,05; el Mortero 0,2. La Bazuca (0,4) sigue siendo el antitanque.
- **El Soldado acierta menos a los vehículos** (0,1-0,2; Artillería 0,05).
- Sigue pendiente: el Soldado aún rinde 2,2x la mediana.

## Que atacar salga a cuenta (31-10-2026)

Un jugador decía que le costaba ganar terreno a la IA. Se midió con `npm run balance -- run --games 80`
(IA contra IA, máximo 60 días): con las reglas de entonces el **95 %** de las partidas seguía sin
ganador el día 60. Defenderse no costaba nada: la unidad dañada volvía a una ciudad, se curaba 30 y
esperaba con el 70-90 % de protección.

Palancas de reglas probadas (sin terminar el día 60; menos es mejor):

| Variante | Sin terminar |
|---|---:|
| Reglas de entonces | 95 % |
| Sin contraataque | 95 % |
| 40 puntos de mando y 5 % de mantenimiento | 95 % |
| Curación de edificios a la mitad / a un tercio | 93 % / 94 % |
| Capturar con 10 puntos (Base 20) | 86 % |
| Capturar la Base con 10 puntos | 85 % |
| Captura rápida + curación a la mitad + sin contraataque | 83 % |
| Botín 30 % | 91 % |
| Flanqueo +15 % | 95 % |
| Sin cura bajo fuego | 91 % |
| Veteranía +10 % por rango | 94 % |
| Las cuatro nuevas juntas (las de ahora) | 91-93 % |

Reglas nuevas (`rules.json`, todas se pueden apagar):

- `bounty` 0,25: quien destruye una unidad cobra el 25 % de su precio (también el defensor si el
  atacante cae en el contraataque). La IA lo suma al valor de rematar.
- `flankBonus` 0,15: +15 % de acierto contra una unidad que ya ha recibido un ataque ese día.
- `noHealUnderFire`: una unidad atacada ese día no se cura en los edificios esa noche (señal roja
  abajo a la izquierda y aviso en su ficha).
- `vetBonus` 0,10 (antes 0,05 fijo): a una veterana dañada le compensa curarse antes que comprar otra.

Conclusiones:

- Ninguna regla rompe el empate entre IAs: el atasco viene sobre todo de cómo juega la IA (se queda en
  las ciudades y apenas empuja). Estas reglas premian al que ataca, es decir, sobre todo al jugador; la
  IA solo las aprovecha a medias.
- Generales con las reglas nuevas (contra sin general, 80 partidas): Brisa 71 % (antes 60), Roca 70 %
  (68), Ámbar 50 % (60). Brisa gana con el flanqueo y el bajo fuego (su daño en área marca a varias
  unidades); Ámbar pierde porque el botín reparte dinero a los dos. Vigilar; margen ±10-11.
- Pendiente: una IA que ataque en grupo (entrenador de IA) para acercar la duración a 15-25 días.
