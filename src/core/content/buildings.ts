/** Edificios (buildings.json): validacion y su tipo resuelto (`BuildingType`). */
import { MAX_LIFE } from '../data';
import { type Checker, checkSprites } from './check';
import type { BuildingDef, ContentContext, Texts } from './types';

export function validateBuildings(buildings: readonly BuildingDef[], ctx: ContentContext, check: Checker): void {
  for (const building of buildings) {
    const scope = check.scope(`edificio ${building?.id}`);
    scope.texts('name', building?.name);
    scope.num('earning', building?.earning, { min: 0, int: true });
    scope.num('heals', building?.heals, { min: 0, max: MAX_LIFE, int: true });
    scope.num('protection', building?.protection, { min: 0.05, max: 1 });
    scope.num('vision', building?.vision, { min: 0, max: 20, int: true });
    checkSprites(scope, building?.classicSprite, ctx.terrainIds);
  }
  check
    .scope('buildings.json')
    .expect(buildings.filter((building) => building?.hq).length === 1, 'tiene que haber exactamente un edificio con "hq": true');
}

/** Un tipo de edificio, resuelto al cargar el contenido (buildings.json). */
export interface BuildingType {
  readonly id: string;
  readonly name: Texts;
  /** Cuartel general: si lo capturan, ese equipo pierde (hay exactamente uno: GameContent.hq). */
  readonly isHq: boolean;
  /** Dinero por ronda (antes de la regla incomeScale). */
  readonly earning: number;
  /** Vida que cura a las unidades propias que repara. */
  readonly heals: number;
  /** Multiplica el acierto contra quien esta encima (menos = mas defensa). */
  readonly protection: number;
  readonly vision: number;
  /** Graficos de 2013: prefijo de la imagen segun el terreno, por id de terreno (si no esta, ''). */
  readonly classicSprite: Readonly<Record<string, string>>;
}

export function buildBuildingTypes(buildings: readonly BuildingDef[]): BuildingType[] {
  return buildings.map((definition) => ({
    id: definition.id,
    name: definition.name,
    isHq: !!definition.hq,
    earning: definition.earning,
    heals: definition.heals,
    protection: definition.protection,
    vision: definition.vision,
    classicSprite: { ...definition.classicSprite },
  }));
}
