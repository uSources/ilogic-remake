import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OnlineSeatVM, OnlineVM, OptionRowVM } from '../vm/menus';

const hover = (id: string) => () => ui.actions.onlineHover(id);
const pick = (id: string) => () => ui.actions.onlinePick(id);

function Row({ row, focus }: { row: OptionRowVM; focus: string }) {
  return <Seg row={row} sel={focus === row.id} onHover={hover(row.id)} onSet={(i) => ui.actions.onlineSet(row.id, i)} />;
}

/** El menu: crear, entrar y las salas apuntadas. */
function OnlineMenu({ online }: { online: OnlineVM }) {
  const focus = online.focus;
  return (
    <div class="on-menu">
      <p class="ng-note">{t('onlineNote')}</p>
      <div class="card-btns on-main">
        <Btn sel={focus === 'create'} cls="px-btn start" onHover={hover('create')} onPick={pick('create')}>
          {t('onlineCreate')}
        </Btn>
        <Btn sel={focus === 'join'} onHover={hover('join')} onPick={pick('join')}>
          {t('onlineJoin')}
        </Btn>
      </div>
      <span class="label">{t('onlineMyRooms')}</span>
      {online.rooms.length === 0 && <span class="muted small">{t('onlineNoRooms')}</span>}
      {online.rooms.map((room) => (
        <div class="on-room" key={room.code}>
          <span class="on-code">{room.code}</span>
          <span class="muted small">{room.summary}</span>
          <Btn
            sel={focus === `room-${room.code}`}
            cls="px-btn plain"
            onHover={hover(`room-${room.code}`)}
            onPick={pick(`room-${room.code}`)}
          >
            {t('onlineRejoin')}
          </Btn>
          <Btn sel={focus === `forget-${room.code}`} cls="link" onHover={hover(`forget-${room.code}`)} onPick={pick(`forget-${room.code}`)}>
            {t('onlineForget')}
          </Btn>
        </div>
      ))}
    </div>
  );
}

/** Crear sala: la vista previa del mapa, las opciones, los asientos y los relojes. */
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
        <div class="ng-groups">
          {create.groups.map((group) => (
            <div class="ng-group" key={group.title}>
              <span class="label">{group.title}</span>
              {group.rows.map((row) => (
                <Row key={row.id} row={row} focus={focus} />
              ))}
            </div>
          ))}
          <div class="ng-group">
            <span class="label">{t('onlineTeams')}</span>
            {create.seats.map((rows, index) => (
              <div class="on-seat" key={index}>
                {rows.map((row) => (
                  <Row key={row.id} row={row} focus={focus} />
                ))}
              </div>
            ))}
          </div>
          <div class="ng-group">
            {create.timers.map((row) => (
              <Row key={row.id} row={row} focus={focus} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function JoinRoom({ online }: { online: OnlineVM }) {
  const { join, focus } = online;
  return (
    <div class="on-join">
      <input
        class={`ng-code on-invite ${join.error ? 'bad' : ''} ${focus === 'joinText' ? 'focus' : ''}`}
        value={join.text}
        placeholder={t('onlineJoinHint')}
        spellcheck={false}
        autocomplete="off"
        aria-label={t('onlineJoin')}
        onFocus={hover('joinText')}
        onMouseEnter={hover('joinText')}
        onInput={(event) => ui.actions.onlineText(event.currentTarget.value)}
      />
      {join.error && <span class="bad-note">{join.error}</span>}
    </div>
  );
}

function SeatRow({ seat, focus }: { seat: OnlineSeatVM; focus: string }) {
  const who = seat.kind === 'ai' ? t('onlineSeatAi') : seat.isMe ? t('onlineYou') : t('onlineSeatPerson');
  const presence = seat.kind === 'ai' ? '' : seat.joined ? t('onlineIn') : t('onlineOut');
  return (
    <div class={`on-lobby-seat ${seat.joined || seat.kind === 'ai' ? 'in' : 'out'}`}>
      <span class="on-seat-name">
        {seat.label}
        {seat.general && <span class="muted small"> · {seat.general}</span>}
      </span>
      <span class="muted small">
        {who}
        {presence && ` · ${presence}`}
      </span>
      {seat.invite && (
        <Btn sel={focus === `copy-${seat.seat}`} cls="px-btn plain" onHover={hover(`copy-${seat.seat}`)} onPick={pick(`copy-${seat.seat}`)}>
          {t('onlineCopy')}
        </Btn>
      )}
      {seat.invite && typeof navigator.share === 'function' && (
        <Btn
          sel={focus === `share-${seat.seat}`}
          cls="px-btn plain"
          onHover={hover(`share-${seat.seat}`)}
          onPick={pick(`share-${seat.seat}`)}
        >
          {t('onlineShare')}
        </Btn>
      )}
      {seat.canHandToAi && (
        <Btn sel={focus === `ai-${seat.seat}`} cls="px-btn plain" onHover={hover(`ai-${seat.seat}`)} onPick={pick(`ai-${seat.seat}`)}>
          {t('onlineHandToAi')}
        </Btn>
      )}
    </div>
  );
}

/** El vestibulo: el codigo, quien esta y los enlaces. */
function Lobby({ online }: { online: OnlineVM }) {
  const lobby = online.lobby;
  if (!lobby) return null;
  return (
    <div class="on-lobby">
      <div class="on-lobby-head">
        <span class="label">{t('onlineCode')}</span>
        <span class="on-code big">{lobby.code}</span>
        <span class="muted small">
          {lobby.status} · {lobby.connection}
        </span>
      </div>
      {lobby.seats.some((seat) => seat.invite) && <span class="label">{t('onlineInvites')}</span>}
      {lobby.seats.map((seat) => (
        <SeatRow key={seat.seat} seat={seat} focus={online.focus} />
      ))}
      <p class="ng-note">{lobby.note}</p>
    </div>
  );
}

const BODY: Record<OnlineVM['mode'], (online: OnlineVM) => preact.JSX.Element | null> = {
  menu: (online) => <OnlineMenu online={online} />,
  create: (online) => <CreateRoom online={online} />,
  join: (online) => <JoinRoom online={online} />,
  lobby: (online) => <Lobby online={online} />,
};

/** Jugar en línea: el menu, crear sala, entrar con enlace o el vestibulo de una sala. */
export function Online({ s }: { s: UIState }) {
  const online = s.online;
  const focus = online.focus;
  const isLobby = online.mode === 'lobby';
  return (
    <div class="px newgame2 online" role="dialog" aria-label={t('online')}>
      <span class="htitle">{isLobby && online.lobby ? `${t('onlineRoom')} ${online.lobby.code}` : t('online')}</span>
      {online.error && <span class="bad-note on-error">{online.error}</span>}
      {online.busy && <span class="muted small">{online.mode === 'create' ? t('onlineCreating') : t('onlineConnecting')}</span>}
      {BODY[online.mode](online)}
      <div class="ng-foot">
        <Btn
          sel={focus === 'back' || focus === 'leave'}
          cls="px-btn plain"
          onHover={hover(isLobby ? 'leave' : 'back')}
          onPick={pick(isLobby ? 'leave' : 'back')}
        >
          {isLobby ? t('onlineLeave') : t('back')} <span class="key">Esc</span>
        </Btn>
        {online.mode === 'create' && (
          <Btn sel={focus === 'start'} cls="px-btn start" disabled={online.busy} onHover={hover('start')} onPick={pick('start')}>
            {t('onlineCreate')}
          </Btn>
        )}
        {online.mode === 'join' && (
          <Btn sel={focus === 'joinGo'} cls="px-btn start" disabled={online.busy} onHover={hover('joinGo')} onPick={pick('joinGo')}>
            {t('onlineJoinGo')}
          </Btn>
        )}
      </div>
    </div>
  );
}
