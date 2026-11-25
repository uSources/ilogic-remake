/**
 * El HTML de «Jugar en línea» (Preact): dibuja `OnlineVM` tal como lo publica OnlineScreen
 * (src/menu/online/) y le devuelve lo que se toca por `ui.actions` (onlineHover, onlinePick,
 * onlineSet, onlineText). Como el lienzo de diseño «Ilogic · Rediseño de Jugar en línea»: el menu es
 * una barra arriba (volver, el titulo y la conexion) y tres tarjetas lado a lado, «Buscar rival»
 * (azul contra rojo), «Con amigos» (un enlace) y «Mis partidas»; la sala, el codigo en teclas y una
 * ficha por equipo frente a frente; buscando rival, «Tú» contra un «?» que late. Crear sala es un
 * panel, como «Nueva partida». En el movil, una tarjeta encima de otra y lo que te toca, arriba.
 * Sin logica: lo que se puede pulsar (con su foco) y lo que dice cada cosa ya viene decidido en el VM.
 */
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { imgUrl } from '../../assets';
import { t } from '../../settings';
import { Army, Versus, type ArmyPaint } from '../common/Army';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OnlineLobbyVM, OnlineRoomVM, OnlineSeatVM, OnlineVM, OptionRowVM } from '../vm/menus';

const hover = (id: string) => () => ui.actions.onlineHover(id);
const pick = (id: string) => () => ui.actions.onlinePick(id);

/** La tarjeta esta elegida si lo esta algo de dentro. */
const cardSel = (focus: string, ids: string[]): string => (ids.includes(focus) ? 'sel' : '');

function Row({ row, focus }: { row: OptionRowVM; focus: string }) {
  return <Seg row={row} sel={focus === row.id} onHover={hover(row.id)} onSet={(i) => ui.actions.onlineSet(row.id, i)} />;
}

// --- Piezas -----------------------------------------------------------------------------------------

/** Iconos de trazo (los de la barra y las filas), del color del texto. */
const ICON_PATHS = {
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

function Icon({ name, size = 18 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/** Como esta la conexion: el color del punto y lo que dice. */
interface Connection {
  state: 'online' | 'offline' | 'connecting' | 'reconnecting' | 'closed';
  text: string;
}

/** La barra de arriba: volver (con su tecla), el titulo y la conexion (en el movil, solo su punto). */
function TopBar({
  backId,
  backLabel,
  title,
  connection,
  focus,
}: {
  backId: string;
  backLabel: string;
  title: string;
  connection: Connection | null;
  focus: string;
}) {
  return (
    <div class="on-topbar">
      <Btn sel={focus === backId} cls="on-back" sound="ui_back" label={backLabel} onHover={hover(backId)} onPick={pick(backId)}>
        <Icon name="back" />
        <span class="on-back-label">{backLabel}</span>
        <span class="key">Esc</span>
      </Btn>
      <h1 class="on-title">{title}</h1>
      <span class={`on-conn ${connection?.state ?? 'none'}`} role="status">
        {connection && (
          <>
            <i aria-hidden="true" />
            <span class="on-conn-text">{connection.text}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Lo que ha fallado (un enlace que no se ha podido copiar sale aqui para copiarlo a mano). */
function Problem({ online }: { online: OnlineVM }) {
  return online.error ? <p class="on-problem">{online.error}</p> : null;
}

// --- El menu -----------------------------------------------------------------------------------------

/** La pastilla de la conexion del menu: esperando al servidor, o si contesta (sin salas que mirar, nada). */
function menuConnection(online: OnlineVM): Connection | null {
  if (online.busy) return { state: 'connecting', text: t('onlineConnecting') };
  if (online.server === 'online') return { state: 'online', text: t('onlineOnline') };
  if (online.server === 'offline') return { state: 'offline', text: t('onlineOffline') };
  return null;
}

/** Buscar rival: azul contra rojo, lo que se buscara, «Buscar rival» y el enlace al otro ritmo. */
function SearchCard({ online }: { online: OnlineVM }) {
  const { focus, search } = online;
  const otherId = search.other.id;
  return (
    <div class={`px card on-card on-search ${cardSel(focus, ['search', otherId])}`}>
      <span class="label">{t('onlineSearch')}</span>
      <div class="on-mini-army" aria-hidden="true">
        <img class="px-icon" src={imgUrl('b_Tank')} alt="" />
        <img class="px-icon mirrored" src={imgUrl('r_Tank')} alt="" />
      </div>
      <div class="on-art battle" aria-hidden="true">
        <Army paint="b" />
        <Versus />
        <Army paint="r" />
      </div>
      <span class="on-card-title">{search.title}</span>
      <span class="on-card-note">{search.note}</span>
      <span class="on-card-fill" />
      <Btn sel={focus === 'search'} cls="px-btn on-big" disabled={online.busy} onHover={hover('search')} onPick={pick('search')}>
        {t('onlineSearch')} ▸
      </Btn>
      <Btn sel={focus === otherId} cls="link on-pace-link" onHover={hover(otherId)} onPick={pick(otherId)}>
        {search.other.label}
      </Btn>
    </div>
  );
}

/** Con amigos: crear una sala con sus reglas, o entrar con el codigo (o el enlace) que te han pasado. */
function FriendsCard({ online }: { online: OnlineVM }) {
  const { focus, code } = online;
  return (
    <div class={`px card on-card on-friends ${cardSel(focus, ['create', 'codeText', 'codeGo'])}`}>
      <span class="label">{t('onlineFriends')}</span>
      <div class="on-art invite">
        <Icon name="link" size={54} />
        <span>{t('onlineFriendsArt')}</span>
      </div>
      <span class="on-card-title">{t('onlineFriendsTitle')}</span>
      <span class="on-card-note">{t('onlineFriendsNote')}</span>
      <span class="on-card-fill" />
      <Btn sel={focus === 'create'} cls="px-btn plain on-big" onHover={hover('create')} onPick={pick('create')}>
        {t('onlineCreateRoom')} ▸
      </Btn>
      <div class="on-join">
        <label class="on-join-ask" for="on-code">
          {t('onlineJoinAsk')}
        </label>
        <div class="on-join-row">
          <input
            id="on-code"
            class={`on-code-input ${code.error ? 'bad' : ''} ${focus === 'codeText' ? 'focus' : ''}`}
            value={code.text}
            placeholder={t('onlineJoinPlaceholder')}
            spellcheck={false}
            autocomplete="off"
            aria-label={t('onlineJoinHint')}
            onFocus={hover('codeText')}
            onMouseEnter={hover('codeText')}
            onInput={(event) => ui.actions.onlineText(event.currentTarget.value)}
          />
          <Btn sel={focus === 'codeGo'} cls="px-btn" disabled={online.busy} onHover={hover('codeGo')} onPick={pick('codeGo')}>
            {t('onlineJoinGo')}
          </Btn>
        </div>
        {code.error && <span class="bad-note">{code.error}</span>}
      </div>
    </div>
  );
}

/** El cuadrado de cada sala: el tanque de quien juega (el tuyo si te toca), un soldado gris si se espera, o acabada / ya no existe. */
function RoomBadge({ state }: { state: OnlineRoomVM['state'] }) {
  if (state === 'ended') return <Icon name="check" size={28} />;
  if (state === 'gone') return <Icon name="close" size={24} />;
  const image = state === 'yourTurn' ? 'b_Tank' : state === 'theirTurn' ? 'r_Tank' : 'i_Soldier';
  return <img class={`px-icon ${state === 'theirTurn' ? 'mirrored' : ''}`} src={imgUrl(image)} alt="" />;
}

/** Una sala: su cuadrado, como esta (con su codigo, el dia y lo que queda), entrar y, si no se esta jugando, quitarla (la × de la esquina). */
function RoomRow({ room, focus }: { room: OnlineRoomVM; focus: string }) {
  const { enterId, forgetId } = room;
  const detail = [`${t('onlineRoom')} ${room.code}`, room.detail].filter((part) => part !== '').join(' · ');
  return (
    <div class={`on-room ${room.state}`}>
      <span class={`on-room-badge ${room.state}`} aria-hidden="true">
        <RoomBadge state={room.state} />
      </span>
      <span class="on-room-text">
        <span class="on-room-title">{room.title}</span>
        <span class="on-room-detail">{detail}</span>
      </span>
      {room.enter && enterId && (
        <Btn
          sel={focus === enterId}
          cls={room.state === 'yourTurn' ? 'px-btn on-room-go' : 'px-btn plain on-room-go'}
          onHover={hover(enterId)}
          onPick={pick(enterId)}
        >
          {room.enter}
        </Btn>
      )}
      {room.forget && forgetId && (
        <Btn sel={focus === forgetId} cls="on-x" label={room.forget} onHover={hover(forgetId)} onPick={pick(forgetId)}>
          <Icon name="close" size={14} />
        </Btn>
      )}
    </div>
  );
}

const roomIds = (rooms: OnlineRoomVM[]): string[] =>
  rooms.flatMap((room) => [room.enterId, room.forgetId]).filter((id): id is string => id !== null);

/** Mis partidas: cuantas te tocan, las salas apuntadas (lo que pide hacer algo arriba) y donde se guardan. */
function RoomsCard({ online }: { online: OnlineVM }) {
  const { focus, rooms } = online;
  const yourTurn = rooms.filter((room) => room.state === 'yourTurn').length;
  return (
    <div class={`px card on-card on-rooms-card ${cardSel(focus, roomIds(rooms))}`}>
      <div class="on-rooms-head">
        <span class="label">{t('onlineMyRooms')}</span>
        {yourTurn > 0 && <span class="on-turn-count">{t('onlineYourTurnCount').replace('{n}', String(yourTurn))}</span>}
      </div>
      <div class="on-rooms">
        {rooms.length === 0 && <span class="on-rooms-empty">{t('onlineNoRooms')}</span>}
        {rooms.map((room) => (
          <RoomRow key={room.code} room={room} focus={focus} />
        ))}
      </div>
      <span class="on-rooms-foot">{t('onlineRoomsHere')}</span>
    </div>
  );
}

/** En el movil, lo que te toca va arriba del todo, antes de las tarjetas (y sale de la lista de abajo). */
function TurnStrip({ online }: { online: OnlineVM }) {
  const mine = online.rooms.filter((room) => room.state === 'yourTurn');
  if (mine.length === 0) return null;
  return (
    <div class="on-turn-strip">
      {mine.map((room) => (
        <RoomRow key={room.code} room={room} focus={online.focus} />
      ))}
    </div>
  );
}

/** El menu: la barra, lo que ha fallado y las tres tarjetas (una encima de otra en el movil). */
function OnlineMenu({ online }: { online: OnlineVM }) {
  return (
    <div class="on-screen" role="dialog" aria-label={t('online')}>
      <TopBar backId="back" backLabel={t('onlineHome')} title={t('online')} connection={menuConnection(online)} focus={online.focus} />
      <Problem online={online} />
      <TurnStrip online={online} />
      <div class="on-grid">
        <SearchCard online={online} />
        <FriendsCard online={online} />
        <RoomsCard online={online} />
      </div>
    </div>
  );
}

// --- Crear sala ---------------------------------------------------------------------------------------

/** «Atras», con su tecla (el pie de crear sala). */
function BackButton({ id, label, focus }: { id: string; label: string; focus: string }) {
  return (
    <Btn sel={focus === id} cls="px-btn plain" sound="ui_back" onHover={hover(id)} onPick={pick(id)}>
      {label} <span class="key">Esc</span>
    </Btn>
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

/** Crear partida, como «Nueva partida»: el mapa a un lado; al otro, quien juega, las reglas y los relojes. */
function CreateRoom({ online }: { online: OnlineVM }) {
  const { create, focus } = online;
  return (
    <div class="px newgame2 online" role="dialog" aria-label={t('onlineCreate')}>
      <span class="htitle">{t('onlineCreate')}</span>
      {online.error && <span class="bad-note on-error">{online.error}</span>}
      {online.busy && <span class="muted small">{t('onlineCreating')}</span>}
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
      <div class="ng-foot">
        <BackButton id="back" label={t('back')} focus={focus} />
        <Btn sel={focus === 'start'} cls="px-btn start" disabled={online.busy} onHover={hover('start')} onPick={pick('start')}>
          {t('onlineCreate')}
        </Btn>
      </div>
    </div>
  );
}

// --- La sala y buscando rival ----------------------------------------------------------------------

/** El codigo de la sala en teclas, una por letra: se lee y se dicta sin confundirse. */
function CodeKeys({ code }: { code: string }) {
  return (
    <span class="code-keys" role="img" aria-label={code}>
      {[...code].map((letter, index) => (
        <kbd key={`${index}${letter}`}>{letter}</kbd>
      ))}
    </span>
  );
}

/** Invitar: el codigo en teclas y, al lado, compartir (o copiar) el enlace y copiar el codigo. */
function Invite({ lobby, focus }: { lobby: OnlineLobbyVM; focus: string }) {
  const linkId = lobby.canShare ? 'share' : 'copy';
  return (
    <div class="px on-invite">
      <div class="on-invite-code">
        <span class="label">{t('onlineInvite')}</span>
        <CodeKeys code={lobby.code} />
      </div>
      <div class="on-invite-btns">
        <Btn sel={focus === linkId} cls="px-btn on-big" onHover={hover(linkId)} onPick={pick(linkId)}>
          {lobby.canShare ? t('onlineShare') : t('onlineCopy')}
        </Btn>
        <Btn sel={focus === 'copyCode'} cls="px-btn plain" onHover={hover('copyCode')} onPick={pick('copyCode')}>
          {t('onlineCopyCode')}
        </Btn>
      </div>
    </div>
  );
}

/** El color de un asiento: el tuyo en azul, los demas en rojo. */
const seatPaint = (seat: OnlineSeatVM): ArmyPaint => (seat.isYou ? 'b' : 'r');

/** La cara del asiento: su tanque o, si aun no ha llegado nadie, un «?» que late. */
function SeatAvatar({ seat }: { seat: OnlineSeatVM }) {
  if (seat.presence === 'out') return <span class="on-seat-avatar on-q">?</span>;
  return (
    <span class="on-seat-avatar">
      <img class={`px-icon ${seat.isYou ? '' : 'mirrored'}`} src={imgUrl(`${seatPaint(seat)}_Tank`)} alt="" />
    </span>
  );
}

/** Un equipo: su color a la izquierda, su tanque, quien lo juega, de quien es y si esta dentro; si se puede, darselo a la IA. */
function SeatCard({ seat, focus, aiLabel }: { seat: OnlineSeatVM; focus: string; aiLabel: string }) {
  const id = seat.handToAiId;
  return (
    <div class={`on-seat ${seat.isYou ? 'own' : 'rival'} ${seat.presence}`}>
      <SeatAvatar seat={seat} />
      <span class="on-seat-text">
        <span class="on-seat-who">{seat.who}</span>
        <span class="on-seat-team">{seat.team}</span>
        {seat.status && <span class="on-seat-tag">{seat.status}</span>}
        {id && (
          <Btn sel={focus === id} cls="link on-seat-ai" onHover={hover(id)} onPick={pick(id)}>
            {aiLabel}
          </Btn>
        )}
      </span>
    </div>
  );
}

/** Los equipos frente a frente; si son dos, con «VS» en medio. */
function Seats({ lobby, focus }: { lobby: OnlineLobbyVM; focus: string }) {
  const isDuel = lobby.seats.length === 2;
  return (
    <div class="on-seats">
      {lobby.seats.map((seat, index) => (
        <Fragment key={seat.seat}>
          {isDuel && index === 1 && <Versus />}
          <SeatCard seat={seat} focus={focus} aiLabel={lobby.handToAiLabel} />
        </Fragment>
      ))}
    </div>
  );
}

/** La sala: la barra (salir, el titulo y la conexion), invitar, los equipos y cuando empieza. */
function Room({ online, lobby }: { online: OnlineVM; lobby: OnlineLobbyVM }) {
  const connection = { state: lobby.linkState, text: lobby.connection };
  return (
    <div class="on-screen on-room-screen" role="dialog" aria-label={t('online')}>
      <TopBar backId="leave" backLabel={t('onlineLeaveRoom')} title={lobby.title} connection={connection} focus={online.focus} />
      <Problem online={online} />
      {lobby.canInvite && <Invite lobby={lobby} focus={online.focus} />}
      <Seats lobby={lobby} focus={online.focus} />
      <p class="on-room-note">{online.busy ? t('onlineConnecting') : lobby.note}</p>
    </div>
  );
}

const SECONDS_PER_MINUTE = 60;

/** «0:23»: cuanto se lleva esperando; cuenta solo, segundo a segundo. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const shown = `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
  return (
    <span class="on-elapsed num" role="timer">
      {shown}
    </span>
  );
}

/** Buscando rival: el ritmo que se busca, desde cuando, tu ejercito contra un «?» y jugar contra la IA, cancelar o salir. */
function Searching({ online, lobby }: { online: OnlineVM; lobby: OnlineLobbyVM }) {
  const { focus } = online;
  const aiId = lobby.seats.find((seat) => seat.handToAiId !== null)?.handToAiId ?? null;
  return (
    <div class="on-screen on-searching-screen" role="dialog" aria-label={t('onlineSearchingTitle')}>
      <Problem online={online} />
      <div class="on-search-head">
        <span class="on-search-pace">
          <i aria-hidden="true" />
          {lobby.searching}
        </span>
        <h1 class="on-title big">{t('onlineSearchingTitle')}</h1>
        {lobby.searchingSince !== null && <Elapsed since={lobby.searchingSince} />}
      </div>
      <div class="on-duel">
        <div class="px on-duel-card own">
          <Army paint="b" />
          <span class="on-duel-text">
            <span class="on-duel-name">{t('onlineYou')}</span>
            <span class="on-duel-tag">
              {t('onlineArmyBlue')} · {t('onlineReady')}
            </span>
          </span>
        </div>
        <Versus />
        <div class="on-duel-card coming">
          <span class="on-q">?</span>
          <span class="on-duel-text">
            <span class="on-duel-name">{t('onlineRivalComingTitle')}</span>
            <span class="on-duel-note">{t('onlineRivalComingNote')}</span>
          </span>
        </div>
      </div>
      <div class="on-search-btns">
        {aiId && (
          <Btn sel={focus === aiId} cls="px-btn on-big" disabled={online.busy} onHover={hover(aiId)} onPick={pick(aiId)}>
            {lobby.handToAiLabel}
          </Btn>
        )}
        <Btn sel={focus === 'cancelSearch'} cls="px-btn plain on-big" onHover={hover('cancelSearch')} onPick={pick('cancelSearch')}>
          {t('onlineCancelSearch')}
        </Btn>
        <Btn sel={focus === 'leave'} cls="px-btn plain on-big" sound="ui_back" onHover={hover('leave')} onPick={pick('leave')}>
          {t('onlineLeave')} <span class="key">Esc</span>
        </Btn>
      </div>
      <p class="on-search-note">{online.busy ? t('onlineConnecting') : lobby.note}</p>
    </div>
  );
}

/** El vestibulo: buscando rival, o la sala. */
function Lobby({ online }: { online: OnlineVM }) {
  const { lobby } = online;
  if (!lobby) return null;
  return lobby.searching ? <Searching online={online} lobby={lobby} /> : <Room online={online} lobby={lobby} />;
}

const SCREENS: Record<OnlineVM['mode'], (props: { online: OnlineVM }) => preact.JSX.Element | null> = {
  menu: OnlineMenu,
  create: CreateRoom,
  lobby: Lobby,
};

/** Jugar en línea: el menu, crear sala o el vestibulo de una sala. */
export function Online({ s }: { s: UIState }) {
  const Screen = SCREENS[s.online.mode];
  return <Screen online={s.online} />;
}
