import { it } from 'vitest';
import { aiVsAi } from './partidas';

// Partidas IA contra IA, semillas 6-10 de 20 (el resto en los otros ia-*.test.ts).
it('partidas IA contra IA 6-10 (60 dias): sin errores y guardar/cargar exacto', () => aiVsAi(6, 10), 300_000);
