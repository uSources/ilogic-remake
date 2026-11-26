import { Icon } from '../common/Icon';
import { useAltHeld } from '../common/useAltHeld';
import { t } from '../../settings';
import type { ChosenStatVM, ChosenUnitVM } from '../vm/tile';
import { LifeBar, SquadAndOrder, UnitName, UnitNotes } from './TileParts';

/** «Mueve 3»: el nombre suave y la cifra clara (sin cifra, como «No ataca», solo el nombre). */
function Stat({ stat }: { stat: ChosenStatVM }) {
  return (
    <span class="cu-stat">
      {stat.label} {stat.value && <b>{stat.value}</b>}
    </span>
  );
}

/**
 * La unidad elegida, abajo a la izquierda (lienzo «Todo en estilo C», tablero 8; decidido con el
 * usuario el 26-11-2026): retrato, nombre, su vida con lo que mueve, alcanza y ve, y en dorado lo que
 * sabe hacer. Mientras esta elegida sustituye a lo de bajo el cursor, tambien con su bocadillo abierto.
 * Con Alt, ademas, su escuadra y su orden, su carga y sus habilidades explicadas.
 */
export function ChosenUnit({ chosen }: { chosen: ChosenUnitVM }) {
  const isDetailed = useAltHeld();
  const { unit } = chosen;
  return (
    <section class={`cursor-info chosen-unit ${isDetailed ? 'detailed' : ''}`} aria-label={t('chosenUnit')}>
      <Icon k={unit.icon} alt="" cls="px-icon ci-portrait cu-portrait" />
      <div class="ci-text">
        <UnitName unit={unit} />
        <div class="cu-stats">
          <LifeBar life={unit.life} />
          {chosen.stats.map((stat) => (
            <Stat key={stat.label} stat={stat} />
          ))}
        </div>
        {chosen.skills.length > 0 && <span class="cu-skills">{chosen.skills.join(' · ')}</span>}
        {isDetailed && <SquadAndOrder unit={unit} />}
        {isDetailed && <UnitNotes unit={unit} />}
      </div>
    </section>
  );
}
