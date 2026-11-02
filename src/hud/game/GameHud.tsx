import { Pause } from '../menus/Pause';
import type { UIState } from '../state';
import { Cards } from './Cards';
import { CombatPanel } from './Combat';
import { Forecast } from './Forecast';
import { EnemyGeneral, GeneralPanel } from './GeneralPanel';
import { LabPanel } from './LabPanel';
import { Minimap } from './Minimap';
import { MissionPanel } from './MissionPanel';
import { MoveTip } from './MoveTip';
import { PopMenu } from './PopMenu';
import { SelectionPanel } from './SelectionPanel';
import { TopBar } from './TopBar';
import { Tray } from './Tray';

/**
 * Interfaz de la partida: que panel sale y donde. Cada panel esta en su fichero de game/ y su estilo
 * en styles/ (ver hud.css); un panel nuevo se añade aqui, en el orden en que se apila.
 */
export function GameHud({ s }: { s: UIState }) {
  const showCards = !s.busy && s.turn === 'player' && s.tile;
  // Laboratorio de animaciones: solo su panel y lo que enseña un combate (el resto estorba).
  if (s.lab)
    return (
      <>
        <LabPanel l={s.lab} busy={s.busy} />
        {s.combat && <CombatPanel c={s.combat} />}
      </>
    );
  return (
    <>
      <TopBar s={s} />
      {s.general && <GeneralPanel g={s.general} mine={s.turn === 'player'} />}
      {s.enemyGeneral && <EnemyGeneral g={s.enemyGeneral} />}
      {s.mission && s.turn === 'player' && <MissionPanel m={s.mission} />}
      {s.hint && <div class="hintline">{s.hint}</div>}
      {s.selection && !s.busy ? <SelectionPanel sel={s.selection} /> : showCards && <Cards tile={s.tile!} />}
      <div class="side">
        {s.minimap && s.minimapOn && <Minimap m={s.minimap} view={s.minimapView} />}
        {!s.busy && s.turn === 'player' && (
          <Tray idle={s.idle} threat={s.threat} intents={s.intents} anyCommand={s.anyCommand} squads={s.squads} multi={s.multi} />
        )}
      </div>
      {s.moveTip && <MoveTip m={s.moveTip} />}
      {s.forecast && <Forecast f={s.forecast} />}
      {s.combat && <CombatPanel c={s.combat} />}
      {s.menu && (s.menu.kind === 'game' ? <Pause m={s.menu} /> : <PopMenu m={s.menu} />)}
    </>
  );
}
