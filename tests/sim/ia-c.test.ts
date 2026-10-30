import { it } from 'vitest';
import { aiVsAi } from './partidas';

// Partidas IA contra IA, semillas 11-15 de 20 (el resto en los otros ia-*.test.ts).
it('partidas IA contra IA 11-15 (60 dias): sin errores y guardar/cargar exacto', () => aiVsAi(11, 15), 300_000);
