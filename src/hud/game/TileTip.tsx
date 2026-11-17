import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../common/Icon';
import { useAltHeld } from '../common/useAltHeld';
import { Popover } from '../common/Popover';
import { sidePaint } from '../../ui/sides';
import type { Anchor } from '../vm/common';
import type { TileVM } from '../vm/tile';
import { TerrainCard, UnitCard } from './Cards';

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
 * Lo justo: la unidad (nombre y vida) o, sin unidad, el nombre del edificio o del terreno. La defensa
 * ya se ve en el tablero (las estrellas sobre la casilla) y lo demas, con Alt.
 */
function TipSummary({ tile }: { tile: TileVM }) {
  const { unit, building, terrain } = tile;
  if (!unit) return <div class="tt-row tt-ground">{building ? building.name : terrain.name}</div>;
  return (
    <div class="tt-row">
      <Icon k={unit.icon} alt="" cls="px-icon tt-icon" />
      <b class="tt-name">{unit.name}</b>
      <span class="tt-life num" style={{ color: sidePaint(unit.side, 'text') }}>
        {Math.max(0, Math.round(unit.life))}
      </span>
    </div>
  );
}

/**
 * La ficha de la casilla señalada, junto a ella (docs/PLAN-INTERFAZ.md, fase 5): sale al parar el
 * raton un momento, con lo justo; con Alt pulsado, la tarjeta entera (la de antes, abajo a la izquierda).
 */
export function TileTip({ tile, at }: { tile: TileVM; at: Anchor }) {
  const isReady = useDelayed(TIP_DELAY_MS);
  const isDetailed = useAltHeld();
  if (!isReady && !isDetailed) return null;
  return (
    <Popover anchor={at} prefer="right" class={`tile-tip ${isDetailed ? 'detailed' : ''}`}>
      {isDetailed ? (
        <div class="tt-cards">
          <TerrainCard tile={tile} />
          {tile.unit && <UnitCard unit={tile.unit} />}
        </div>
      ) : (
        <TipSummary tile={tile} />
      )}
    </Popover>
  );
}

/** Para volver a montar la ficha (y su espera) solo cuando cambia lo que hay en la casilla. */
export const tileTipKey = (tile: TileVM): string =>
  `${tile.terrain.name}|${tile.building?.name ?? ''}|${tile.unit?.name ?? ''}|${tile.unit?.life ?? ''}`;
