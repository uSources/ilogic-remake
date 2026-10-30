# La infantería domina y el Tanque rinde poco (30-10-2026)

Medido con `npm run metrics` (120 partidas IA contra IA de 32x32, 40 días, mitad con los bandos
cambiados), los cambios uno detrás de otro sobre `main` (dae5a5a, con puntos de mando y mantenimiento).
Duelos en llanura: `duelos-tanques-antes-Grass.md` y `duelos-tanques-despues-Grass.md`.

## Por qué

1. **El Tanque casi no se compraba**: 21 de unas 6000 compras (0,3 %). La IA, con puntos de mando, empieza
   por el edificio que fabrica lo más caro: el Aeropuerto (Caza, 20000) iba siempre antes que la Fábrica y
   se llevaba el dinero o el ahorro del turno. Cuando a la Fábrica le salía un Tanque, 39 de cada 48 veces
   no podía pagarlo ni el turno siguiente y compraba algo barato (diagnóstico en 10 partidas).
   Los aviones eran el 36 % de las compras.
2. **El Tanque perdía contra la infantería en el cuerpo a cuerpo** (duelos a 100 de vida, en llanura):

   | Ataque | Daño | Valor quitado por cada 1000 que cuesta el atacante |
   |---|---:|---:|
   | Tanque (12000) → Soldado (1500) | 30 | 38 |
   | Soldado → Tanque | 10 | 798 |
   | Mortero (2500) → Tanque, sin respuesta | 40 | 1931 |

3. **El Soldado rendía 3,2 veces la mediana**: le quitaba 15-20 a vehículos de 8000-11000.

## Cambios y medidas

| Paso | Nota | Precios (ajuste) | Bandos | Tanques comprados | Tanque, destruye por cada 1 | Soldado, x la mediana |
|---|---:|---:|---:|---:|---:|---:|
| Antes | 61,8 | 6,8 (45 %) | 58/42 | 21 | — (casi no hay) | 3,20x |
| 1. La IA reparte Fábrica y Aeropuerto al azar | 65,6 | 10,6 (71 %) | 54/46 | 134 | 0,60 | 3,31x |
| 2. Tanque contra infantería (`POWER`) | 65,7 | 10,7 (71 %) | 55/45 | 142 | 0,73 | 2,99x |
| 3. Soldado contra vehículos (`POWER`) | **66,4** | 11,4 (76 %) | 55/45 | 129 | 0,87 | 2,22x |

Los bandos quedan dentro del ruido (±10 %) en todos los pasos; remontadas y variedad, enteras. Duración
y partidas terminadas no cambian (siguen sin terminar: es la IA, no las unidades).

Probado y no usado: ahorrar para lo elegido si se paga en dos turnos (`funds + 2 x ingresos`) en lugar de
uno. Nota 65,1, pero la IA ahorra sobre todo para aviones: Tanques 21 → 38.

## Valores

- Tanque → Soldado, Escudero, Mortero, Motorizado: 0,3 → 0,6. Tanque → Bazuca: 0,3 → 0,45.
- Soldado, Escudero, Motorizado → Tanque: 0,1 → 0,05. Mortero → Tanque: 0,4 → 0,2. Bazuca → Tanque: 0,4 (igual).
- Soldado → Jeep 0,3 → 0,2; Tanque ligero 0,15 → 0,1; Transporte, Lanzamisiles, Suministros 0,2 → 0,1;
  Antiaéreo, Tanque anfibio 0,15 → 0,1; Artillería 0,1 → 0,05.

## Lo que queda

- El Soldado sigue en 2,2x la mediana (fuera de la banda 0,67-1,5x). Lo siguiente: Escudero y Motorizado
  contra vehículos, o el precio de toda la infantería de 1500-2500 junta (ver `improve/DIARIO.md`).
- Caza ligero 2,0x; Jeep 0,47x, Motorizado 0,36x y Tanque anfibio 0,27x rinden poco.
