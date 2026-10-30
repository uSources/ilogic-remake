import { it } from 'vitest';
import { aiVsAi } from './partidas';

// Partidas IA contra IA, semillas 1-5 de 20 (el resto en los otros ia-*.test.ts).
it('partidas IA contra IA 1-5 (60 dias): sin errores y guardar/cargar exacto', () => aiVsAi(1, 5), 300_000);
