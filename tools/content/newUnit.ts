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

export function addUnitLike(units: readonly UnitDef[], id: string, like: string): NewUnitResult {
  if (!/^\w+$/.test(id)) throw new Error(`"${id}" no vale como id (letras, numeros y _)`);
  if (units.some((u) => u.id === id)) throw new Error(`Ya hay una unidad "${id}"`);
  const base = units.find((u) => u.id === like);
  if (!base) throw new Error(`No hay ninguna unidad "${like}" (hay: ${units.map((u) => u.id).join(', ')})`);

  const copy: UnitDef = {
    ...structuredClone(base),
    id,
    name: { es: `${base.name.es} (nueva)`, en: `${base.name.en} (new)` },
    art: base.art ?? base.id,
    notes: `Copiada de ${like}: ajustar numeros, nombre y dibujo.`,
  };
  delete copy.classicSprite;
  // Se ataca a si misma como la original se atacaba a si misma.
  if (copy.attack && base.attack?.hitChance[like] !== undefined) copy.attack.hitChance[id] = base.attack.hitChance[like];

  const copied: NewUnitResult['copied'] = { attackers: [], carriers: [], healers: [] };
  const next = units.map((u) => {
    const v = structuredClone(u);
    const p = v.attack?.hitChance[like];
    if (v.attack && p !== undefined) {
      v.attack.hitChance[id] = p;
      copied.attackers.push(v.id);
    }
    if (v.transport?.carries.includes(like)) {
      v.transport.carries.push(id);
      copied.carriers.push(v.id);
    }
    const heal = v.heals?.[like];
    if (v.heals && heal !== undefined) {
      v.heals[id] = heal;
      copied.healers.push(v.id);
    }
    return v;
  });
  return { units: [...next, copy], copied };
}
