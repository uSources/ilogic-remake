# Diario de automejora

Cada experimento, aceptado o descartado, con sus numeros. Los agentes lo leen antes de proponer
nada para no repetir lo que ya se probo. Lo mas nuevo arriba.

Formato:

```
## AAAA-MM-DD · area · ACEPTADO | DESCARTADO
Cambio: que se toco (fichero y valores).
Hipotesis: por que deberia mejorar.
Resultado: nota antes → despues (por partes si cambia), arena, fuzz.
Conclusion: que se aprende (tambien de lo descartado).
```

## 2026-10-30 · equilibrio (precios) · ACEPTADO

Cambio: `UNIT.cost.Tank` 12000 → 9500 (`src/core/data.ts`).
Hipotesis: el Tanque rinde 0.61x la mediana (0.34 por cada 1); a 9500 deberia entrar en la banda
(0.67x-1.5x) sin tocar a los demas, como propone la herramienta de equilibrio.
Resultado: prueba rapida (80 partidas, 40 dias, bandos cambiados): precios 5 → 7 de 15, lados 51 % → 52 %.
Medida completa: **56.8 → 59.3** (+2.5).
- Ningun bando con ventaja 19.8 → 22.3 (48/52 → 49/51); duracion 0 → 0; terminan 0 → 0;
  remontadas 15 → 15 (47 % → 51 %); variedad 15 → 15; precios 7 → 7.
- El Tanque entra en la banda, pero el Antiaereo sale (estaba justo en el borde: 0.80 → 0.85, 1.66x).
Conclusion: la subida viene de "Ningun bando con ventaja", que se mueve mucho con 120 partidas (1 % = 2.5
puntos): tomarla con cautela. Lo que si es del precio: el Tanque ya rinde lo que cuesta. Siguiente idea:
Antiaereo 8000 → 9000 (justo encima del borde) o Mortero 2500 → 3000 (1.66x). El test de puntos por dias
de `tests/setup.test.ts` tenia el precio del Tanque escrito a mano: ahora lo lee de `UNIT.cost`.

## 2026-10-30 · equilibrio (precios) · DESCARTADO

Cambio: `UNIT.cost.Soldier` 1500 → 2000 (solo prueba rapida, sin tocar ficheros).
Hipotesis: el Soldado rinde 3.7x la mediana; mas caro, rinde menos y lo que lo mata vale mas.
Resultado: prueba rapida (80 partidas): nota 58.1 → 41.1. Precios 5 → 6 de 15, pero **lados 51 % → 58 %**
(23.1 → 5.1). El Soldado baja a 1.49 por cada 1, sigue fuera de la banda.
Conclusion: encarecer la infanteria barata desequilibra los bandos (quien mueve primero captura antes).
No volver a subir el Soldado sin mirar tambien el dinero inicial.

## 2026-10-29 · arranque · ACEPTADO

Cambio: herramientas del sistema (npm run metrics, arena, fuzz) y linea base.
Resultado:
- Nota del juego: **56.8 / 100** (120 partidas IA contra IA de 32x32, 40 dias).
  - Ningun bando con ventaja 19.8/25 (48 % / 52 %), variedad 15/15, remontadas 15/15.
  - **Duracion 0/15 y partidas que terminan 0/15: la IA contra la IA no termina ninguna partida en 40 dias.**
  - Precios 7/15: el Soldado rinde 3.7x la mediana; Tanque, Lanzamisiles, Bombardero y Tanque anfibio
    rinden menos de la mitad.
- Fuzz: primer fallo encontrado y arreglado (una captura a medias no se perdia al irse la unidad si
  nadie la consultaba). Despues, 200 partidas 20x20 (semillas 1-200) y 120 de 32x32 (1000-1119) sin fallos.
- Arena: IA de referencia guardada (improve/ai-baseline/ai.ts).

Conclusion / ideas para los siguientes ciclos:
- Lo que mas nota da: que la IA cierre partidas (30 puntos). Hipotesis: es demasiado defensiva o no
  ataca la Base enemiga; revisar `ai.ts` (objetivos, cuando avanzar) con la arena.
- Precios: abaratar las unidades que rinden poco o encarecer el Soldado (una cosa cada vez).
- Fuzz: seguir desde la semilla 1120 (32x32) y 201 (20x20).
