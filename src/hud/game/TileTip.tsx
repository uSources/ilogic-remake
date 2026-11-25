import { useEffect, useState } from 'preact/hooks';
import { useAltHeld } from '../common/useAltHeld';
import { Popover } from '../common/Popover';
import type { Anchor } from '../vm/common';
import type { TileVM } from '../vm/tile';
import { GroundPart, UnitPart } from './TileParts';

/** Lo que tarda en salir la ficha al parar el raton sobre una casilla: de paso, no estorba. */
const TIP_DELAY_MS = 400;

/** Sale al cabo de TIP_DELAY_MS desde que se monta (la casilla cambia: se vuelve a montar). */
function useDelayed(ms: number): boolean {
  const [isReady, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return isReady;
}

/**
 * La ficha de la casilla señalada, junto a ella (docs/PLAN-INTERFAZ.md, fase 5): sale al parar el
 * raton un momento, con lo justo (la unidad, el sitio y lo que da); con Alt pulsado, la misma ficha
 * crece con el resto (de quien es la unidad, sus datos, carga, habilidades).
 */
export function TileTip({ tile, at }: { tile: TileVM; at: Anchor }) {
  const isReady = useDelayed(TIP_DELAY_MS);
  const isDetailed = useAltHeld();
  if (!isReady && !isDetailed) return null;
  return (
    <Popover anchor={at} prefer="right" class={`tile-tip ${isDetailed ? 'detailed' : ''}`}>
      {tile.unit && <UnitPart unit={tile.unit} isDetailed={isDetailed} />}
      <GroundPart tile={tile} />
    </Popover>
  );
}

/** Para volver a montar la ficha (y su espera) solo cuando cambia lo que hay en la casilla. */
export const tileTipKey = (tile: TileVM): string =>
  `${tile.terrain.name}|${tile.building?.name ?? ''}|${tile.unit?.name ?? ''}|${tile.unit?.life ?? ''}`;
