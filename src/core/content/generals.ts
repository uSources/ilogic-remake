/**
 * Generales (generals.json): cada uno tiene una ventaja fija (`passive`), una barra de carga que se
 * llena con el combate y habilidades que la gastan. Las reglas estan en core/generals.ts; aqui solo
 * la forma de los datos y su validacion. Ver docs/CONTENIDO.md, "Generales".
 */
import { type Checker } from './check';
import { MOVEMENTS, type MovementName, type Texts } from './types';

/** A que unidades afecta una ventaja: por tipo de movimiento y/o por id (sin nada = a todas). */
interface UnitFilter {
  movement?: MovementName[];
  units?: string[];
}

/**
 * Ventaja fija del general (siempre activa):
 * - attack: multiplica el acierto de sus unidades al atacar (1.1 = +10 %).
 * - defense: multiplica el acierto de los enemigos contra sus unidades (0.9 = 10 % menos de daño).
 */
export type GeneralModifier = ({ kind: 'attack' } | { kind: 'defense' }) & UnitFilter & { factor: number };

/**
 * Lo que hace una habilidad:
 * - reveal: el general ve todo el mapa hasta que acaba la ronda.
 * - areaDamage: quita `damage` de vida a las unidades enemigas en un cuadrado de lado 2*radius+1
 *   alrededor de la casilla que se elija; nunca las deja por debajo de `minLife` (no mata).
 */
export type GeneralEffect = { kind: 'reveal' } | { kind: 'areaDamage'; radius: number; damage: number; minLife: number };

export interface GeneralAbilityDef {
  id: string;
  name: Texts;
  description: Texts;
  /** Carga que gasta (en "estrellas" de la barra). */
  cost: number;
  effect: GeneralEffect;
}

export interface GeneralDef {
  /** Nombre interno (en ingles, sin espacios); lo guardan las partidas. */
  id: string;
  name: Texts;
  /** Cargo o apodo ("Coronel del aire"). */
  title: Texts;
  description: Texts;
  passive: GeneralModifier[];
  /** Barra: `max` estrellas; se gana 1 por cada `per` de valor (precio × vida perdida / 100) que se hace o se recibe. */
  charge: { max: number; per: number };
  abilities: GeneralAbilityDef[];
  notes?: string;
}

export function validateGenerals(list: readonly GeneralDef[], unitIds: ReadonlySet<string>, check: Checker): void {
  const top = check.scope('generals.json');
  if (!top.expect(Array.isArray(list), 'tiene que tener una lista "generals"')) return;
  const ids = new Set<string>();
  list.forEach((g, i) => {
    const s = check.scope(`general ${typeof g?.id === 'string' ? g.id : `#${i}`}`);
    if (s.id(g?.id)) {
      s.expect(!ids.has(g.id), 'id repetido');
      ids.add(g.id);
    }
    s.texts('name', g?.name);
    s.texts('title', g?.title);
    s.texts('description', g?.description);
    s.num('charge.max', g?.charge?.max, { min: 1, max: 20, int: true });
    s.num('charge.per', g?.charge?.per, { min: 100, max: 1e6, int: true });
    if (s.expect(Array.isArray(g?.passive), 'passive tiene que ser una lista (puede estar vacia)'))
      for (const m of g.passive) {
        s.expect(m?.kind === 'attack' || m?.kind === 'defense', `passive: kind "${String(m?.kind)}" no existe (attack, defense)`);
        s.num(`passive.${m?.kind}.factor`, m?.factor, { min: 0.1, max: 3 });
        for (const mv of m?.movement ?? []) s.known(`passive.${m.kind}.movement`, mv, MOVEMENTS);
        for (const u of m?.units ?? []) s.known(`passive.${m.kind}.units`, u, unitIds);
      }
    const abilityIds = new Set<string>();
    if (s.expect(Array.isArray(g?.abilities) && g.abilities.length > 0, 'abilities: al menos una habilidad'))
      for (const a of g.abilities) {
        const sa = check.scope(`general ${g?.id} · habilidad ${typeof a?.id === 'string' ? a.id : '?'}`);
        if (sa.id(a?.id)) {
          sa.expect(!abilityIds.has(a.id), 'id repetido');
          abilityIds.add(a.id);
        }
        sa.texts('name', a?.name);
        sa.texts('description', a?.description);
        sa.num('cost', a?.cost, { min: 1, max: g?.charge?.max ?? 20, int: true });
        const e = a?.effect;
        if (e?.kind === 'areaDamage') {
          sa.num('effect.radius', e.radius, { min: 0, max: 5, int: true });
          sa.num('effect.damage', e.damage, { min: 1, max: 100, int: true });
          sa.num('effect.minLife', e.minLife, { min: 1, max: 99, int: true });
        } else sa.expect(e?.kind === 'reveal', `effect.kind "${String(e?.kind)}" no existe (reveal, areaDamage)`);
      }
  });
}
