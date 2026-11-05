import { imgUrl } from '../../assets';
import { fmtNum, t, type TextKey } from '../../settings';
import { FoldMark, useFold } from '../common/fold';
import { stars } from '../common/format';
import { Icon } from '../common/Icon';
import type { OwnerSide, Side } from '../vm/common';
import { sidePaint } from '../../ui/sides';
import type { BuildingVM, TileVM, UnitVM } from '../vm/tile';

type Owner = OwnerSide | 'unknown';

const LIFE_BLOCKS = 10;
const LIFE_PER_BLOCK = 10;
/** Con esta vida o menos, los bloques salen dorados (avisan de que esta a punto de caer). */
const LOW_LIFE = 30;
/** La defensa del terreno sale en estrellas: una por cada 10 %, hasta 4. */
const DEFENSE_PER_STAR = 10;
const MAX_DEFENSE_STARS = 4;

/** Texto de cada lado ('Tuyo', 'Aliado', 'Enemigo'...). */
const SIDE_TEXT: Record<Owner, TextKey> = { own: 'you', ally: 'ally', enemy: 'enemy', neutral: 'neutral', unknown: 'unknown' };

/** Color y nombre del dueño de un edificio o de un punto de control. */
const ownerColor = (owner: Owner) => sidePaint(owner, 'text');
const ownerText = (owner: Owner) => t(SIDE_TEXT[owner]);

/** Vida en 10 bloques (dorados con 30 o menos). */
function Blocks({ life, side }: { life: number; side: Side }) {
  const filled = Math.ceil(Math.max(0, life) / LIFE_PER_BLOCK);
  const fill = life <= LOW_LIFE ? 'var(--gold)' : sidePaint(side, 'fill');
  return (
    <div class="blocks" aria-hidden="true">
      {Array.from({ length: LIFE_BLOCKS }, (_, i) => (
        <span style={i < filled ? { background: fill } : undefined} />
      ))}
    </div>
  );
}

function UnitName({ unit }: { unit: UnitVM }) {
  return (
    <span class="name">
      {unit.name}
      {unit.rank ? (
        <span class="rank" title={t('veteran')}>
          {' ' + stars(unit.rank)}
        </span>
      ) : null}
    </span>
  );
}

/** Ataque, defensa, movimiento... como iconos (chips) o, si no los hay, en una linea de texto. */
function UnitStats({ unit }: { unit: UnitVM }) {
  if (!unit.chips)
    return (
      <span class="muted" style={{ fontSize: 13 }}>
        {unit.stats}
      </span>
    );
  return (
    <span class="chips">
      {unit.chips.map((chip) => (
        <span class="chip" title={chip.title} key={chip.icon}>
          <Icon k={chip.icon} alt={chip.title} cls="px-icon ico" />
          <span class="num">{chip.text}</span>
        </span>
      ))}
    </span>
  );
}

/** "Escuadra Alfa · Destacada · Orden: atacar allí" (lo que haya). */
const squadAndOrder = (unit: UnitVM) =>
  [unit.squad && `${t('squad')} ${unit.squad}`, unit.detached && t('detached'), unit.order].filter(Boolean).join(' · ');

function Abilities({ abilities }: { abilities: NonNullable<UnitVM['abilities']> }) {
  return (
    <ul class="abilities" aria-label={t('abilities')}>
      {abilities.map((ability) => (
        <li title={ability.desc}>
          <span class="gold">{ability.name}</span>
          <span class="muted">{ability.desc}</span>
        </li>
      ))}
    </ul>
  );
}

/** Lo de debajo de la vida (escuadra y orden, sin curar, carga, habilidades); plegada no sale. */
function UnitNotes({ unit }: { unit: UnitVM }) {
  return (
    <>
      {(unit.order || unit.squad) && <span style={{ fontSize: 13, color: '#5fd6c6' }}>{squadAndOrder(unit)}</span>}
      {unit.noHeal && <span style={{ fontSize: 13, color: 'var(--red-soft)' }}>{t('noHeal')}</span>}
      {unit.cargo && (
        <span class="muted" style={{ fontSize: 13 }}>
          {unit.cargo}
        </span>
      )}
      {unit.abilities && unit.abilities.length > 0 && <Abilities abilities={unit.abilities} />}
    </>
  );
}

function UnitCard({ unit, folded = false }: { unit: UnitVM; folded?: boolean }) {
  return (
    <div class="px unitcard">
      <FoldMark folded={folded} />
      <div class="head">
        <Icon k={unit.icon} alt={unit.name} cls="px-icon portrait" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <UnitName unit={unit} />
          <span style={{ fontSize: 13, color: ownerColor(unit.side) }}>{ownerText(unit.side)}</span>
          {!folded && <UnitStats unit={unit} />}
        </div>
      </div>
      <div class="meter" title={t('hp')}>
        <Icon k="ui/vida" alt={t('hp')} />
        <Blocks life={unit.life} side={unit.side} />
        <span class="v">{unit.life}</span>
      </div>
      {!folded && <UnitNotes unit={unit} />}
    </div>
  );
}

function BuildingHeader({ building }: { building: BuildingVM }) {
  return (
    <div class="bld">
      <Icon k={building.icon} alt="" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span class="name" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
          {building.name}
        </span>
        <span style={{ color: ownerColor(building.owner), fontSize: 13 }}>{ownerText(building.owner)}</span>
      </div>
    </div>
  );
}

function DefenseRow({ defense }: { defense: number }) {
  const filledStars = Math.max(0, Math.min(MAX_DEFENSE_STARS, Math.round(defense / DEFENSE_PER_STAR)));
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}
      title={`${t('defense')} ${defense}%`}
    >
      <Icon k="ui/defensa" alt={t('defense')} cls="px-icon ico" />
      <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{stars(filledStars) + '☆'.repeat(MAX_DEFENSE_STARS - filledStars)}</span>
    </div>
  );
}

function StepCostRow({ cost }: { cost: NonNullable<TileVM['terrain']['cost']> }) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}
      title={t('stepCostTitle')}
    >
      <Icon k="ui/movimiento" alt={t('stepCost')} cls="px-icon ico" />
      <span>
        {t('onFoot')} {cost.foot ?? '—'} · {t('byVehicle')} {cost.vehicle ?? '—'}
      </span>
    </div>
  );
}

/** Barra de captura: lo capturado, del color de quien captura, y lo que falta. */
function CaptureBar({ capture }: { capture: NonNullable<BuildingVM['capture']> }) {
  return (
    <div class="capbar" title={`${t('captureLeft')}: ${capture.left}/${capture.total}`}>
      <Icon k="ui/captura" alt={t('capturing')} cls="px-icon ico" />
      <div class="blocks">
        <span style={{ flex: capture.total - capture.left, background: sidePaint(capture.side, 'fill') }} />
        <span style={{ flex: capture.left }} />
      </div>
      <span class="num" style={{ fontSize: 12 }}>
        {capture.left}
      </span>
    </div>
  );
}

function IncomeRow({ income }: { income: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }} title={t('income')}>
      <Icon k="ui/dinero" alt={t('income')} cls="px-icon ico" />
      <span>+{fmtNum(income)}</span>
    </div>
  );
}

function ControlPointRow({ point }: { point: NonNullable<TileVM['point']> }) {
  return (
    <div class="cpoint" title={t('controlPointHelp')}>
      {imgUrl(point.icon) && <Icon k={point.icon} cls="px-icon ico" />}
      <span style={{ color: ownerColor(point.owner) }}>
        {t('controlPoint')} · {ownerText(point.owner)}
        {point.contested ? ` · ${t('contested')}` : ''}
      </span>
      <span>+{fmtNum(point.income)}</span>
    </div>
  );
}

/** Defensa, coste de paso, captura, ingresos y punto de control; plegada no sale. */
function TerrainDetails({ tile }: { tile: TileVM }) {
  const building = tile.building;
  return (
    <>
      <DefenseRow defense={tile.terrain.defense} />
      {tile.terrain.cost && <StepCostRow cost={tile.terrain.cost} />}
      {building?.capture && <CaptureBar capture={building.capture} />}
      {building && building.income > 0 && <IncomeRow income={building.income} />}
      {tile.point && <ControlPointRow point={tile.point} />}
    </>
  );
}

function TerrainCard({ tile, folded = false }: { tile: TileVM; folded?: boolean }) {
  return (
    <div class="px terrain">
      <FoldMark folded={folded} />
      {tile.building ? (
        <BuildingHeader building={tile.building} />
      ) : (
        <span class="swatch" style={{ backgroundImage: `url(${imgUrl(tile.terrain.key)})` }} />
      )}
      <span class="tname" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
        {tile.terrain.name}
      </span>
      {!folded && <TerrainDetails tile={tile} />}
    </div>
  );
}

/** Fichas de abajo: terreno y unidad. En el movil, tocar una las pliega (las dos) o despliega. */
export function Cards({ tile }: { tile: TileVM }) {
  const [folded, toggleFold] = useFold('cards');
  return (
    <div class={`cards ${folded ? 'folded' : ''}`} onClick={toggleFold} aria-expanded={!folded}>
      <TerrainCard tile={tile} folded={folded} />
      {tile.unit && <UnitCard unit={tile.unit} folded={folded} />}
    </div>
  );
}
