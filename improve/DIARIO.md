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
