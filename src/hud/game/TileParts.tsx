import { MAX_LIFE } from '../../core/data';
import { t, type TextKey } from '../../settings';
import { signed, stars } from '../common/format';
import { Icon } from '../common/Icon';
import { sidePaint } from '../../ui/sides';
import type { OwnerSide, StatChipVM } from '../vm/common';
import type { AbilityVM, TileVM, UnitVM } from '../vm/tile';

/**
 * Las piezas de lo que hay bajo el cursor (TileTip.tsx): el sitio y la unidad, cada uno con sus datos
 * en chapas. Con Alt, la unidad crece con lo que no hace falta ver siempre.
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

/** «Escuadra Alfa · Destacada · Orden: atacar allí» (lo que haya; de quien es ya va encima, en su color). */
function SquadAndOrder({ unit }: { unit: UnitVM }) {
  const parts = [unit.squad && `${t('squad')} ${unit.squad}`, unit.detached && t('detached'), unit.order].filter(Boolean);
  return parts.length > 0 ? <div class="tt-line">{parts.join(' · ')}</div> : null;
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

/** Lo de la unidad que sale con Alt: su escuadra y su orden, movimiento, alcance y vision, carga y habilidades. */
function UnitDetails({ unit }: { unit: UnitVM }) {
  return (
    <>
      <SquadAndOrder unit={unit} />
      {unit.chips && <Facts facts={unit.chips} />}
      {unit.noHeal && <div class="tt-line tt-warn">{t('noHeal')}</div>}
      {unit.cargo && <div class="tt-line">{unit.cargo}</div>}
      {unit.abilities && unit.abilities.length > 0 && <Abilities abilities={unit.abilities} />}
    </>
  );
}

/** Las pastillas de la vida: cuantas decimas le quedan, en verde, amarillo o rojo como su chapa en el tablero. */
const LIFE_STEPS = 10;
const lifeTone = (share: number): string => (share > 0.6 ? 'high' : share > 0.3 ? 'mid' : 'low');

function LifeBar({ life }: { life: number }) {
  const shown = Math.max(0, Math.round(life));
  const share = shown / MAX_LIFE;
  const filled = Math.ceil(share * LIFE_STEPS);
  return (
    <span class="ci-life" title={t('hp')}>
      {t('hp')}
      <span class={`ci-pips ${lifeTone(share)}`} aria-hidden="true">
        {Array.from({ length: LIFE_STEPS }, (_, step) => (
          <i key={step} class={step < filled ? 'on' : ''} />
        ))}
      </span>
      <span class="num">{shown}</span>
    </span>
  );
}

/** La unidad: su retrato, de quien es, su nombre (y veterania) y su vida; con Alt, ademas, sus datos. */
export function UnitPart({ unit, isDetailed }: { unit: UnitVM; isDetailed: boolean }) {
  return (
    <div class="ci-unit">
      <Icon k={unit.icon} alt="" cls="px-icon ci-portrait" />
      <div class="ci-text">
        <span class="ci-label" style={{ color: ownerColor(unit.side) }}>
          {ownerText(unit.side)}
        </span>
        <span class="ci-name">
          {unit.name}
          {unit.rank ? (
            <span class="ci-rank" title={t('veteran')}>
              {stars(unit.rank)}
            </span>
          ) : null}
        </span>
        <LifeBar life={unit.life} />
        {isDetailed && <UnitDetails unit={unit} />}
      </div>
    </div>
  );
}

/** El sitio: encima, de quien es el edificio (o «Terreno»), su nombre y lo que da. */
export function GroundPart({ tile }: { tile: TileVM }) {
  const { building, terrain } = tile;
  return (
    <div class="ci-ground">
      {building ? (
        <span class="ci-label" style={{ color: ownerColor(building.owner) }}>
          {ownerText(building.owner)}
        </span>
      ) : (
        <span class="ci-label">{t('terrainLabel')}</span>
      )}
      <span class="ci-name">{building ? building.name : terrain.name}</span>
      <Facts facts={tileFacts(tile)} />
    </div>
  );
}
