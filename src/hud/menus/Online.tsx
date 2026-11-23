/**
 * El HTML de «Jugar en línea» (Preact): dibuja `OnlineVM` tal como lo publica OnlineScreen
 * (src/menu/online/) y le devuelve lo que se toca por `ui.actions` (onlineHover, onlinePick,
 * onlineSet, onlineText). Tres vistas, una por modo: el menu (crear, unirse con el codigo y «Mis
 * partidas» con su estado), crear partida y el vestibulo. Sin logica: lo que se puede pulsar y lo que
 * dice cada fila ya viene decidido en el VM.
 */
import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OnlineLobbyVM, OnlineRoomVM, OnlineSeatVM, OnlineVM, OptionRowVM } from '../vm/menus';

const hover = (id: string) => () => ui.actions.onlineHover(id);
const pick = (id: string) => () => ui.actions.onlinePick(id);

function Row({ row, focus }: { row: OptionRowVM; focus: string }) {
  return <Seg row={row} sel={focus === row.id} onHover={hover(row.id)} onSet={(i) => ui.actions.onlineSet(row.id, i)} />;
}

/** Crear partida y unirse con el codigo, uno al lado del otro (uno encima del otro en el movil). */
function StartBoxes({ online }: { online: OnlineVM }) {
  const { focus, code } = online;
  return (
    <div class="on-start">
      <div class="on-box">
        <span class="label">{t('onlineCreate')}</span>
        <p class="ng-note">{t('onlineCreateNote')}</p>
        <Btn sel={focus === 'create'} cls="px-btn start" onHover={hover('create')} onPick={pick('create')}>
          {t('onlineCreate')} ▸
        </Btn>
      </div>
      <div class="on-box">
        <span class="label">{t('onlineJoin')}</span>
        <p class="ng-note">{t('onlineJoinNote')}</p>
        <div class="ng-coderow">
          <input
            class={`ng-code on-code-input ${code.error ? 'bad' : ''} ${focus === 'codeText' ? 'focus' : ''}`}
            value={code.text}
            placeholder={t('onlineJoinHint')}
            spellcheck={false}
            autocomplete="off"
            aria-label={t('onlineJoin')}
            onFocus={hover('codeText')}
            onMouseEnter={hover('codeText')}
            onInput={(event) => ui.actions.onlineText(event.currentTarget.value)}
          />
          <Btn sel={focus === 'codeGo'} disabled={online.busy} onHover={hover('codeGo')} onPick={pick('codeGo')}>
            {t('onlineJoinGo')}
          </Btn>
        </div>
        {code.error && <span class="bad-note">{code.error}</span>}
      </div>
    </div>
  );
}

function RoomRow({ room, focus }: { room: OnlineRoomVM; focus: string }) {
  const enterId = `room-${room.code}`;
  const forgetId = `forget-${room.code}`;
  return (
    <div class={`on-room ${room.state}`}>
      <span class={`on-state ${room.state}`}>{room.title}</span>
      <div class="on-room-info">
        <span class="on-code">{room.code}</span>
        <span class="muted small">{room.detail}</span>
      </div>
      <div class="on-room-actions">
        {room.enter && (
          <Btn
            sel={focus === enterId}
            cls={room.state === 'yourTurn' ? 'px-btn' : 'px-btn plain'}
            onHover={hover(enterId)}
            onPick={pick(enterId)}
          >
            {room.enter}
          </Btn>
        )}
        <Btn sel={focus === forgetId} cls="link" onHover={hover(forgetId)} onPick={pick(forgetId)}>
          {t('onlineForget')}
        </Btn>
      </div>
    </div>
  );
}

/** El menu: crear, unirse y las salas apuntadas, con lo que pide hacer algo arriba. */
function OnlineMenu({ online }: { online: OnlineVM }) {
  return (
    <div class="on-menu">
      <StartBoxes online={online} />
      <span class="label">{t('onlineMyRooms')}</span>
      {online.rooms.length === 0 && <span class="muted small">{t('onlineNoRooms')}</span>}
      <div class="on-rooms">
        {online.rooms.map((room) => (
          <RoomRow key={room.code} room={room} focus={online.focus} />
        ))}
      </div>
    </div>
  );
}

/** Los ajustes de las reglas (los de «Nueva partida»). */
function Presets({ online }: { online: OnlineVM }) {
  const { create, focus } = online;
  return (
    <div class="presets">
      {create.presets.map((preset) => {
        const id = `preset-${preset.id}`;
        return (
          <Btn
            key={preset.id}
            sel={focus === id}
            cls={`preset ${create.preset === preset.id ? 'on' : ''}`}
            onHover={hover(id)}
            onPick={pick(id)}
          >
            {preset.label}
          </Btn>
        );
      })}
    </div>
  );
}

/** Crear partida: el mapa a un lado; al otro, quien juega, las reglas y los relojes. */
function CreateRoom({ online }: { online: OnlineVM }) {
  const { create, focus } = online;
  return (
    <div class="ng-body">
      <div class="ng-preview">
        <div class="ng-map">
          <img src={create.thumb} alt={create.mapInfo} />
        </div>
        <span class="muted small">{create.mapInfo}</span>
        <Btn sel={focus === 'reroll'} cls="px-btn plain" onHover={hover('reroll')} onPick={pick('reroll')}>
          {t('otherMap')} <span class="key">R</span>
        </Btn>
      </div>
      <div class="ng-side">
        <div class="ng-group">
          <span class="label">{t('onlinePlayers')}</span>
          {create.seats.map((row) => (
            <Row key={row.id} row={row} focus={focus} />
          ))}
        </div>
        <div class="ng-group">
          <span class="label">{t('onlineRules')}</span>
          <Presets online={online} />
          {create.options.length === 0 && <p class="ng-note">{create.presetNote}</p>}
          {create.options.map((row) => (
            <Row key={row.id} row={row} focus={focus} />
          ))}
        </div>
        <div class="ng-group">
          <span class="label">{t('onlineTime')}</span>
          {create.timers.map((row) => (
            <Row key={row.id} row={row} focus={focus} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SeatRow({ seat, focus }: { seat: OnlineSeatVM; focus: string }) {
  const id = `ai-${seat.seat}`;
  return (
    <div class={`on-lobby-seat ${seat.presence}`}>
      <span class="on-seat-name">{seat.label}</span>
      <span class="muted small">{seat.detail}</span>
      {seat.canHandToAi && (
        <Btn sel={focus === id} cls="px-btn plain" onHover={hover(id)} onPick={pick(id)}>
          {t('onlineHandToAi')}
        </Btn>
      )}
    </div>
  );
}

/** El codigo de la sala, grande, y copiar o compartir su enlace (mientras se espera a alguien). */
function Invite({ lobby, focus }: { lobby: OnlineLobbyVM; focus: string }) {
  return (
    <div class="on-invite">
      <span class="label">{lobby.canInvite ? t('onlineInvite') : t('onlineCode')}</span>
      <div class="on-invite-row">
        <span class="on-code big">{lobby.code}</span>
        {lobby.canInvite && (
          <Btn sel={focus === 'copy'} cls="px-btn" onHover={hover('copy')} onPick={pick('copy')}>
            {t('onlineCopy')}
          </Btn>
        )}
        {lobby.canInvite && lobby.canShare && (
          <Btn sel={focus === 'share'} cls="px-btn plain" onHover={hover('share')} onPick={pick('share')}>
            {t('onlineShare')}
          </Btn>
        )}
      </div>
      {lobby.canInvite && <span class="muted small on-link">{lobby.link}</span>}
    </div>
  );
}

/** El vestibulo: el codigo y el enlace para invitar, quien hay y la conexion. */
function Lobby({ online }: { online: OnlineVM }) {
  const lobby = online.lobby;
  if (!lobby) return null;
  return (
    <div class="on-lobby">
      <Invite lobby={lobby} focus={online.focus} />
      <span class="label">{t('onlinePlayers')}</span>
      {lobby.seats.map((seat) => (
        <SeatRow key={seat.seat} seat={seat} focus={online.focus} />
      ))}
      <p class="ng-note">{lobby.note}</p>
      <span class="muted small">{lobby.connection}</span>
    </div>
  );
}

const BODY: Record<OnlineVM['mode'], (online: OnlineVM) => preact.JSX.Element | null> = {
  menu: (online) => <OnlineMenu online={online} />,
  create: (online) => <CreateRoom online={online} />,
  lobby: (online) => <Lobby online={online} />,
};

/** Jugar en línea: el menu, crear partida o el vestibulo de una sala. */
export function Online({ s }: { s: UIState }) {
  const online = s.online;
  const focus = online.focus;
  const isLobby = online.mode === 'lobby';
  const isCreate = online.mode === 'create';
  return (
    <div class="px newgame2 online" role="dialog" aria-label={t('online')}>
      <span class="htitle">{isCreate ? t('onlineCreate') : t('online')}</span>
      {online.error && <span class="bad-note on-error">{online.error}</span>}
      {online.busy && <span class="muted small">{isCreate ? t('onlineCreating') : t('onlineConnecting')}</span>}
      {BODY[online.mode](online)}
      <div class="ng-foot">
        <Btn
          sel={focus === 'back' || focus === 'leave'}
          cls="px-btn plain"
          sound="ui_back"
          onHover={hover(isLobby ? 'leave' : 'back')}
          onPick={pick(isLobby ? 'leave' : 'back')}
        >
          {isLobby ? t('onlineLeave') : t('back')} <span class="key">Esc</span>
        </Btn>
        {isCreate && (
          <Btn sel={focus === 'start'} cls="px-btn start" disabled={online.busy} onHover={hover('start')} onPick={pick('start')}>
            {t('onlineCreate')}
          </Btn>
        )}
      </div>
    </div>
  );
}
