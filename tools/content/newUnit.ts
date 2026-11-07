/**
 * Unidad nueva a partir de otra: copia sus numeros y su columna de daño (quien puede atacarla y con
 * cuanto acierto), transportes y quien la repara, y la deja al final de la lista con el dibujo de la original ("art").
 * Funcion pura: la usa tools/content/cli.ts y se prueba en tests/newUnit.test.ts.
 */
import type { UnitDef } from '@core/content';

export interface NewUnitResult {
  units: UnitDef[];
  /** Que se ha copiado, para contarlo. */
  copied: { attackers: string[]; carriers: string[]; healers: string[] };
}

/** La original y la nueva, por su id. */
interface Copying {
  original: string;
  added: string;
}

/** La unidad nueva: la original con otro id y otro nombre, su dibujo y una nota (sin los graficos de 2013). */
function newUnitFrom(original: UnitDef, { added }: Copying): UnitDef {
  const unit: UnitDef = {
    ...structuredClone(original),
    id: added,
    name: { es: `${original.name.es} (nueva)`, en: `${original.name.en} (new)` },
    art: original.art ?? original.id,
    notes: `Copiada de ${original.id}: ajustar numeros, nombre y dibujo.`,
  };
  delete unit.classicSprite;
  // Se ataca a si misma como la original se atacaba a si misma.
  const selfHit = original.attack?.hitChance[original.id];
  if (unit.attack && selfHit !== undefined) unit.attack.hitChance[added] = selfHit;
  return unit;
}

/** `unit` ataca a la nueva con el acierto con el que ataca a la original. true si la ataca. */
function copyHitChance(unit: UnitDef, { original, added }: Copying): boolean {
  const hitChance = unit.attack?.hitChance[original];
  if (!unit.attack || hitChance === undefined) return false;
  unit.attack.hitChance[added] = hitChance;
  return true;
}

/** `unit` lleva a la nueva si lleva a la original. true si la lleva. */
function copyCarriage(unit: UnitDef, { original, added }: Copying): boolean {
  if (!unit.transport?.carries.includes(original)) return false;
  unit.transport.carries.push(added);
  return true;
}

/** `unit` repara a la nueva como a la original. true si la repara. */
function copyHealing(unit: UnitDef, { original, added }: Copying): boolean {
  const healing = unit.heals?.[original];
  if (!unit.heals || healing === undefined) return false;
  unit.heals[added] = healing;
  return true;
}

/** Lo que se copia en las demas unidades, y donde se cuenta. */
const COPIES: readonly { copy: (unit: UnitDef, copying: Copying) => boolean; into: keyof NewUnitResult['copied'] }[] = [
  { copy: copyHitChance, into: 'attackers' },
  { copy: copyCarriage, into: 'carriers' },
  { copy: copyHealing, into: 'healers' },
];

function checkedOriginal(units: readonly UnitDef[], id: string, like: string): UnitDef {
  if (!/^\w+$/.test(id)) throw new Error(`"${id}" no vale como id (letras, numeros y _)`);
  if (units.some((unit) => unit.id === id)) throw new Error(`Ya hay una unidad "${id}"`);
  const original = units.find((unit) => unit.id === like);
  if (!original) throw new Error(`No hay ninguna unidad "${like}" (hay: ${units.map((unit) => unit.id).join(', ')})`);
  return original;
}

export function addUnitLike(units: readonly UnitDef[], id: string, like: string): NewUnitResult {
  const original = checkedOriginal(units, id, like);
  const copying: Copying = { original: like, added: id };
  const copied: NewUnitResult['copied'] = { attackers: [], carriers: [], healers: [] };
  const updated = units.map((unit) => {
    const copy = structuredClone(unit);
    for (const { copy: copyInto, into } of COPIES) if (copyInto(copy, copying)) copied[into].push(copy.id);
    return copy;
  });
  return { units: [...updated, newUnitFrom(original, copying)], copied };
}
