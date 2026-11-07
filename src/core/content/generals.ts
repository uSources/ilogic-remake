/**
 * Generales (generals.json): cada uno tiene una ventaja fija (`passive`), una barra de carga que se
 * llena con el combate y poderes que la gastan. Las reglas estan en core/generals.ts; aqui solo
 * la forma de los datos y su validacion. Ver docs/CONTENIDO.md, "Generales".
 */
import { type Checker, type Scope } from './check';
import { MOVEMENTS, type MoveType, type Texts } from './types';

/** A que unidades afecta una ventaja o un efecto: por tipo de movimiento y/o por id (sin nada = a todas). */
export interface UnitFilter {
  movement?: MoveType[];
  units?: string[];
}

/**
 * Ventaja fija del general (siempre activa):
 * - attack: multiplica el acierto de sus unidades al atacar (1.1 = +10 %).
 * - defense: multiplica el acierto de los enemigos contra sus unidades (0.9 = 10 % menos de daño).
 */
export type GeneralModifier = ({ kind: 'attack' } | { kind: 'defense' }) & UnitFilter & { factor: number };

/** Las clases de ventaja fija (el tipo obliga a que esten todas, como EFFECT_SHAPES con los efectos). */
const MODIFIER_KINDS: { readonly [K in GeneralModifier['kind']]: true } = { attack: true, defense: true };

/** Las clases de ventaja fija que entiende el juego, en su orden. */
const GENERAL_MODIFIER_KINDS = Object.keys(MODIFIER_KINDS) as readonly GeneralModifier['kind'][];

/**
 * Lo que hace un poder:
 * - reveal: el general ve todo el mapa hasta que acaba la ronda.
 * - areaDamage: quita `damage` de vida a las unidades enemigas en un cuadrado de lado 2*radius+1
 *   alrededor de la casilla que se elija; nunca las deja por debajo de `minLife` (no mata).
 * - heal: sus unidades (las del filtro; sin filtro, todas) recuperan `amount` de vida, hasta 100.
 * - funds: el general consigue `amount` de dinero al momento.
 */
export type GeneralEffect =
  | { kind: 'reveal' }
  | { kind: 'areaDamage'; radius: number; damage: number; minLife: number }
  | ({ kind: 'heal'; amount: number } & UnitFilter)
  | { kind: 'funds'; amount: number };

export interface GeneralPowerDef {
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
  powers: GeneralPowerDef[];
  notes?: string;
}

/** Un efecto de esa clase, tal como viene del JSON. */
type EffectOfKind<K extends GeneralEffect['kind']> = Extract<GeneralEffect, { kind: K }>;

/** Comprueba los numeros de un efecto de esa clase. */
type EffectShapeCheck<K extends GeneralEffect['kind']> = (scope: Scope, effect: EffectOfKind<K>, unitIds: ReadonlySet<string>) => void;

/**
 * La validacion de cada clase de efecto de un poder. Lo que hace cada una en la partida (y lo que le
 * vale a la IA) esta en core/generalPowers.ts (`POWER_EFFECTS`), con las mismas claves: una clase
 * nueva es su forma en `GeneralEffect`, su entrada aqui y la suya alli.
 */
export const EFFECT_SHAPES: { readonly [K in GeneralEffect['kind']]: EffectShapeCheck<K> } = {
  reveal: () => {},
  areaDamage: (scope, effect) => {
    scope.num('effect.radius', effect.radius, { min: 0, max: 5, int: true });
    scope.num('effect.damage', effect.damage, { min: 1, max: 100, int: true });
    scope.num('effect.minLife', effect.minLife, { min: 1, max: 99, int: true });
  },
  heal: (scope, effect, unitIds) => {
    scope.num('effect.amount', effect.amount, { min: 1, max: 100, int: true });
    for (const movement of effect.movement ?? []) scope.known('effect.movement', movement, MOVEMENTS);
    for (const unit of effect.units ?? []) scope.known('effect.units', unit, unitIds);
  },
  funds: (scope, effect) => {
    scope.num('effect.amount', effect.amount, { min: 100, max: 100000, int: true });
  },
};

/** Las clases de efecto que entiende el juego (las de EFFECT_SHAPES, en su orden). */
export const GENERAL_EFFECT_KINDS = Object.keys(EFFECT_SHAPES) as readonly GeneralEffect['kind'][];

/** Comprueba el efecto de un poder: una clase que existe, con los numeros de su clase. */
function validateEffect(scope: Scope, effect: GeneralEffect | undefined, unitIds: ReadonlySet<string>): void {
  if (!scope.known('effect.kind', effect?.kind, GENERAL_EFFECT_KINDS, 'la clase de efecto ') || !effect) return;
  // TypeScript no sabe que la entrada de cada clase recibe un efecto de esa misma clase.
  (EFFECT_SHAPES[effect.kind] as EffectShapeCheck<typeof effect.kind>)(scope, effect, unitIds);
}

/** Una ventaja fija: una clase que existe, un factor razonable y un filtro de movimientos y unidades que existen. */
function validatePassive(scope: Scope, passive: GeneralModifier, unitIds: ReadonlySet<string>): void {
  const kinds: readonly string[] = GENERAL_MODIFIER_KINDS;
  scope.expect(kinds.includes(String(passive?.kind)), `passive: kind "${String(passive?.kind)}" no existe (${kinds.join(', ')})`);
  scope.num(`passive.${passive?.kind}.factor`, passive?.factor, { min: 0.1, max: 3 });
  for (const movement of passive?.movement ?? []) scope.known(`passive.${passive?.kind}.movement`, movement, MOVEMENTS);
  for (const unit of passive?.units ?? []) scope.known(`passive.${passive?.kind}.units`, unit, unitIds);
}

/** Lo que comparte la validacion de todos los generales: donde se apuntan los fallos y los ids de unidades que existen. */
interface GeneralsCheck {
  readonly check: Checker;
  readonly unitIds: ReadonlySet<string>;
}

/** Un poder de `general`: id propio (sin repetir en el general: `powerIds`), textos, un coste que cabe en su barra y su efecto. */
function validatePower({ check, unitIds }: GeneralsCheck, general: GeneralDef, power: GeneralPowerDef, powerIds: Set<string>): void {
  const scope = check.scope(`general ${general?.id} · poder ${typeof power?.id === 'string' ? power.id : '?'}`);
  if (scope.id(power?.id)) {
    scope.expect(!powerIds.has(power.id), 'id repetido');
    powerIds.add(power.id);
  }
  scope.texts('name', power?.name);
  scope.texts('description', power?.description);
  scope.num('cost', power?.cost, { min: 1, max: general?.charge?.max ?? 20, int: true });
  validateEffect(scope, power?.effect, unitIds);
}

/** Un general (el `index` de la lista, para nombrarlo si no tiene id): id sin repetir, textos, barra, ventajas y poderes. */
function validateGeneral(context: GeneralsCheck, general: GeneralDef, index: number, ids: Set<string>): void {
  const scope = context.check.scope(`general ${typeof general?.id === 'string' ? general.id : `#${index}`}`);
  if (scope.id(general?.id)) {
    scope.expect(!ids.has(general.id), 'id repetido');
    ids.add(general.id);
  }
  scope.texts('name', general?.name);
  scope.texts('title', general?.title);
  scope.texts('description', general?.description);
  scope.num('charge.max', general?.charge?.max, { min: 1, max: 20, int: true });
  scope.num('charge.per', general?.charge?.per, { min: 100, max: 1e6, int: true });
  if (scope.expect(Array.isArray(general?.passive), 'passive tiene que ser una lista (puede estar vacia)'))
    for (const passive of general.passive) validatePassive(scope, passive, context.unitIds);
  const powerIds = new Set<string>();
  if (scope.expect(Array.isArray(general?.powers) && general.powers.length > 0, 'powers: al menos un poder'))
    for (const power of general.powers) validatePower(context, general, power, powerIds);
}

/** Comprueba generals.json: una lista de generales validos y sin ids repetidos. */
export function validateGenerals(list: readonly GeneralDef[], unitIds: ReadonlySet<string>, check: Checker): void {
  if (!check.scope('generals.json').expect(Array.isArray(list), 'tiene que tener una lista "generals"')) return;
  const ids = new Set<string>();
  list.forEach((general, index) => validateGeneral({ check, unitIds }, general, index, ids));
}
