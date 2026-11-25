import { t, type TextKey } from '../../settings';
import { signed, stars } from '../common/format';
import { Icon } from '../common/Icon';
import { sidePaint } from '../../ui/sides';
import type { OwnerSide, StatChipVM } from '../vm/common';
import type { AbilityVM, TileVM, UnitVM } from '../vm/tile';

/**
 * Las piezas de la ficha de la casilla (TileTip.tsx): la unidad y el sitio, cada uno con sus datos
 * en chapas. Con Alt, la misma ficha crece con lo que no hace falta ver siempre.
 */

type Owner = OwnerSide | 'unknown';

/** Un dato con su icono, como una chapa: se lee sin contar ni abrir nada. */
interface Fact extends StatChipVM {
  /** El color de la cifra cuando dice de quien es (la captura, del color de quien captura). */
  color?: string;
}

/** Texto de cada lado ('Tuyo', 'Aliado', 'Enemigo'...). */
const SIDE_TEXT: Record<Owner, TextKey> = { own: 'you', ally: 'ally', enemy: 'enemy', neutral: 'neutral', unknown: 'unknown' };

const ownerColor = (owner: Owner) => sidePaint(owner, 'text');
const ownerText = (owner: Owner) => t(SIDE_TEXT[owner]);

/** Cuanto baja el acierto contra quien esta en la casilla, en %. */
const defenseText = (defense: number) => `${defense}%`;

/** Lo que cuesta entrar en una casilla: "pie 1 · veh. 2" (— donde no se puede pasar). */
const stepCostText = (cost: NonNullable<TileVM['terrain']['cost']>) =>
  `${t('onFoot')} ${cost.foot ?? '—'} · ${t('byVehicle')} ${cost.vehicle ?? '—'}`;

/**
 * Lo que da la casilla, solo lo que tiene: la defensa siempre (tambien un 0 %, que es no cubrirse),
 * lo que cuesta entrar, lo que cobra su edificio y lo que le falta por capturar.
 */
function tileFacts({ terrain, building }: TileVM): Fact[] {
  const facts: (Fact | false | undefined)[] = [
    { icon: 'ui/defensa', text: defenseText(terrain.defense), title: t('defense') },
    terrain.cost && { icon: 'ui/movimiento', text: stepCostText(terrain.cost), title: t('stepCostTitle') },
    building && building.income > 0 && { icon: 'ui/dinero', text: signed(building.income), title: t('income') },
    building?.capture && {
      icon: 'ui/captura',
      text: String(building.capture.left),
      title: t('captureLeft'),
      color: sidePaint(building.capture.side, 'text'),
    },
  ];
  return facts.filter((fact): fact is Fact => !!fact);
}

function Facts({ facts }: { facts: readonly Fact[] }) {
  return (
    <div class="tt-facts">
      {facts.map((fact) => (
        <span class="tt-fact" title={fact.title} key={fact.icon}>
          <Icon k={fact.icon} alt={fact.title} cls="px-icon ico" />
          <span class="num" style={fact.color ? { color: fact.color } : undefined}>
            {fact.text}
          </span>
        </span>
      ))}
    </div>
  );
}

function UnitRow({ unit }: { unit: UnitVM }) {
  return (
    <div class="tt-row">
      <Icon k={unit.icon} alt="" cls="px-icon tt-icon" />
      <b class="tt-name">{unit.name}</b>
      {unit.rank ? (
        <span class="tt-rank" title={t('veteran')}>
          {stars(unit.rank)}
        </span>
      ) : null}
      <span class="tt-life num" style={{ color: sidePaint(unit.side, 'text') }} title={t('hp')}>
        {Math.max(0, Math.round(unit.life))}
      </span>
    </div>
  );
}

/** "Tuyo · Escuadra Alfa · Destacada · Orden: atacar allí" (lo que haya); el lado, en su color. */
function UnitSideLine({ unit }: { unit: UnitVM }) {
  const squadAndOrder = [unit.squad && `${t('squad')} ${unit.squad}`, unit.detached && t('detached'), unit.order].filter(Boolean);
  return (
    <div class="tt-line">
      <span style={{ color: sidePaint(unit.side, 'text') }}>{ownerText(unit.side)}</span>
      {squadAndOrder.map((part) => ` · ${part}`).join('')}
    </div>
  );
}

function Abilities({ abilities }: { abilities: readonly AbilityVM[] }) {
  return (
    <ul class="tt-abilities" aria-label={t('abilities')}>
      {abilities.map((ability) => (
        <li key={ability.name}>
          <b>{ability.name}</b> {ability.desc}
        </li>
      ))}
    </ul>
  );
}

/** Lo de la unidad que sale con Alt: de quien es, su movimiento, alcance y vision, carga y habilidades. */
function UnitDetails({ unit }: { unit: UnitVM }) {
  return (
    <>
      <UnitSideLine unit={unit} />
      {unit.chips && <Facts facts={unit.chips} />}
      {unit.noHeal && <div class="tt-line tt-warn">{t('noHeal')}</div>}
      {unit.cargo && <div class="tt-line">{unit.cargo}</div>}
      {unit.abilities && unit.abilities.length > 0 && <Abilities abilities={unit.abilities} />}
    </>
  );
}

/** La unidad: nombre, veterania y vida; con Alt, ademas, sus datos. */
export function UnitPart({ unit, isDetailed }: { unit: UnitVM; isDetailed: boolean }) {
  return (
    <>
      <UnitRow unit={unit} />
      {isDetailed && <UnitDetails unit={unit} />}
    </>
  );
}

/** El edificio (con su dueño) o el terreno; bajo una unidad, mas pequeño: lo principal es ella. */
function GroundName({ tile }: { tile: TileVM }) {
  const { building, terrain, unit } = tile;
  return (
    <div class={`tt-ground ${unit ? 'under-unit' : ''}`}>
      {building ? building.name : terrain.name}
      {building && <span style={{ color: ownerColor(building.owner) }}> · {ownerText(building.owner)}</span>}
    </div>
  );
}

/** El sitio y lo que da. */
export function GroundPart({ tile }: { tile: TileVM }) {
  return (
    <>
      <GroundName tile={tile} />
      <Facts facts={tileFacts(tile)} />
    </>
  );
}
