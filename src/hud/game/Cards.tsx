import { imgUrl } from '../../assets';
import { fmtNum, t } from '../../settings';
import { FoldMark, useFold } from '../common/fold';
import { stars } from '../common/format';
import { Icon } from '../common/Icon';
import type { TileVM, UnitVM } from '../vm/tile';

type Owner = 'you' | 'enemy' | 'neutral' | 'unknown';

/** Color y nombre del dueño de un edificio o de un punto de control. */
const ownerColor = (o: Owner) => (o === 'you' ? 'var(--blue)' : o === 'enemy' ? 'var(--red-soft)' : 'var(--muted)');
const ownerText = (o: Owner) => (o === 'you' ? t('you') : o === 'enemy' ? t('enemy') : o === 'neutral' ? t('neutral') : t('unknown'));

/** Vida en 10 bloques (dorados con 30 o menos). */
function Blocks({ life, team }: { life: number; team: 0 | 1 }) {
  const n = Math.ceil(Math.max(0, life) / 10);
  const color = team === 0 ? 'var(--blue)' : 'var(--red)';
  return (
    <div class="blocks" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span style={i < n ? { background: life <= 30 && i < n ? 'var(--gold)' : color } : undefined} />
      ))}
    </div>
  );
}

function UnitCard({ u, folded = false }: { u: UnitVM; folded?: boolean }) {
  return (
    <div class="px unitcard">
      <FoldMark folded={folded} />
      <div class="head">
        <Icon k={u.icon} alt={u.name} cls="px-icon portrait" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span class="name">
            {u.name}
            {u.rank ? (
              <span class="rank" title={t('veteran')}>
                {' ' + stars(u.rank)}
              </span>
            ) : null}
          </span>
          <span style={{ fontSize: 13, color: u.team === 0 ? 'var(--blue)' : 'var(--red-soft)' }}>
            {u.team === 0 ? t('you') : t('enemy')}
          </span>
          {folded ? null : u.chips ? (
            <span class="chips">
              {u.chips.map((c) => (
                <span class="chip" title={c.title} key={c.icon}>
                  <Icon k={c.icon} alt={c.title} cls="px-icon ico" />
                  <span class="num">{c.text}</span>
                </span>
              ))}
            </span>
          ) : (
            <span class="muted" style={{ fontSize: 13 }}>
              {u.stats}
            </span>
          )}
        </div>
      </div>
      <div class="meter" title={t('hp')}>
        <Icon k="ui/vida" alt={t('hp')} />
        <Blocks life={u.life} team={u.team} />
        <span class="v">{u.life}</span>
      </div>
      {!folded && (u.order || u.squad) && (
        <span style={{ fontSize: 13, color: '#5fd6c6' }}>
          {[u.squad && `${t('squad')} ${u.squad}`, u.detached && t('detached'), u.order].filter(Boolean).join(' · ')}
        </span>
      )}
      {!folded && u.noHeal && <span style={{ fontSize: 13, color: 'var(--red-soft)' }}>{t('noHeal')}</span>}
      {!folded && u.cargo && (
        <span class="muted" style={{ fontSize: 13 }}>
          {u.cargo}
        </span>
      )}
      {!folded && u.abilities && u.abilities.length > 0 && (
        <ul class="abilities" aria-label={t('abilities')}>
          {u.abilities.map((a) => (
            <li title={a.desc}>
              <span class="gold">{a.name}</span>
              <span class="muted">{a.desc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TerrainCard({ tile, folded = false }: { tile: TileVM; folded?: boolean }) {
  const defStars = Math.max(0, Math.min(4, Math.round(tile.terrain.defense / 10)));
  const b = tile.building;
  return (
    <div class="px terrain">
      <FoldMark folded={folded} />
      {b ? (
        <div class="bld">
          <Icon k={b.icon} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span class="name" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
              {b.name}
            </span>
            <span style={{ color: ownerColor(b.owner), fontSize: 13 }}>{ownerText(b.owner)}</span>
          </div>
        </div>
      ) : (
        <span class="swatch" style={{ backgroundImage: `url(${imgUrl(tile.terrain.key)})` }} />
      )}
      <span class="tname" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
        {tile.terrain.name}
      </span>
      {!folded && (
        <>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}
            title={`${t('defense')} ${tile.terrain.defense}%`}
          >
            <Icon k="ui/defensa" alt={t('defense')} cls="px-icon ico" />
            <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{stars(defStars) + '☆'.repeat(4 - defStars)}</span>
          </div>
          {tile.terrain.cost && (
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}
              title={t('stepCostTitle')}
            >
              <Icon k="ui/movimiento" alt={t('stepCost')} cls="px-icon ico" />
              <span>
                {t('onFoot')} {tile.terrain.cost.foot ?? '—'} · {t('byVehicle')} {tile.terrain.cost.vehicle ?? '—'}
              </span>
            </div>
          )}
          {b?.capture && (
            <div class="capbar" title={`${t('captureLeft')}: ${b.capture.left}/${b.capture.total}`}>
              <Icon k="ui/captura" alt={t('capturing')} cls="px-icon ico" />
              <div class="blocks">
                <span style={{ flex: b.capture.total - b.capture.left, background: b.capture.team === 0 ? 'var(--blue)' : 'var(--red)' }} />
                <span style={{ flex: b.capture.left }} />
              </div>
              <span class="num" style={{ fontSize: 12 }}>
                {b.capture.left}
              </span>
            </div>
          )}
          {b && b.income > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }} title={t('income')}>
              <Icon k="ui/dinero" alt={t('income')} cls="px-icon ico" />
              <span>+{fmtNum(b.income)}</span>
            </div>
          )}
          {tile.point && (
            <div class="cpoint" title={t('controlPointHelp')}>
              {imgUrl(tile.point.icon) && <Icon k={tile.point.icon} cls="px-icon ico" />}
              <span style={{ color: ownerColor(tile.point.owner) }}>
                {t('controlPoint')} · {ownerText(tile.point.owner)}
                {tile.point.contested ? ` · ${t('contested')}` : ''}
              </span>
              <span>+{fmtNum(tile.point.income)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Fichas de abajo: terreno y unidad. En el movil, tocar una las pliega (las dos) o despliega. */
export function Cards({ tile }: { tile: TileVM }) {
  const [folded, toggleFold] = useFold('cards');
  return (
    <div class={`cards ${folded ? 'folded' : ''}`} onClick={toggleFold} aria-expanded={!folded}>
      <TerrainCard tile={tile} folded={folded} />
      {tile.unit && <UnitCard u={tile.unit} folded={folded} />}
    </div>
  );
}
