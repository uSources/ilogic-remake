import { useAltHeld } from '../common/useAltHeld';
import { t } from '../../settings';
import type { TileVM } from '../vm/tile';
import { GroundPart, UnitPart } from './TileParts';

/**
 * Lo que hay bajo el cursor, abajo a la izquierda (lienzo «Todo en estilo C», «Partida: tu turno»):
 * el sitio con lo que da y, si hay, la unidad con su vida. Va fijo en su esquina, asi que sale en
 * cuanto se señala una casilla y no tapa nada. Con Alt pulsado, la unidad crece con el resto (de quien
 * es, sus datos, carga, habilidades).
 */
export function TileTip({ tile }: { tile: TileVM }) {
  const isDetailed = useAltHeld();
  return (
    <section class={`cursor-info ${isDetailed ? 'detailed' : ''}`} aria-label={t('underCursor')}>
      <GroundPart tile={tile} />
      {tile.unit && <div class="ci-divider" aria-hidden="true" />}
      {tile.unit && <UnitPart unit={tile.unit} isDetailed={isDetailed} />}
    </section>
  );
}
