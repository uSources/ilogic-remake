import { useEffect, useRef } from 'preact/compat';
import { t } from '../../settings';
import type { UIState } from '../state';
import { ui } from '../store';
import type { MinimapVM } from '../vm/minimap';

// ---------------------------------------------------------------------------
// Minimapa: 4 px por casilla, niebla oscurecida, edificios y unidades de colores
// ---------------------------------------------------------------------------

const MM = 4;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const TEAM_COLOR = ['#3aa8ff', '#ff4d45'] as const;

export function Minimap({ m, view }: { m: MinimapVM; view: UIState['minimapView'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        ctx.fillStyle = hex(m.terrain[y * m.w + x] ?? 0);
        ctx.fillRect(x * MM, y * MM, MM, MM);
      }
    ctx.fillStyle = 'rgba(5,8,12,0.45)';
    for (let x = 0; x < m.w; x++) for (let y = 0; y < m.h; y++) if (!m.fog[x]?.[y]) ctx.fillRect(x * MM, y * MM, MM, MM);
    for (const b of m.buildings) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(b.x * MM, b.y * MM, MM, MM);
      ctx.fillStyle = b.owner === null ? '#c9d2e3' : TEAM_COLOR[b.owner];
      ctx.fillRect(b.x * MM + 1, b.y * MM + 1, MM - 2, MM - 2);
    }
    // [CAMBIO] Puntos de control: borde dorado y dentro el color de su dueño.
    for (const c of m.points ?? []) {
      // La zona de 3×3 (MM px por casilla) con borde dorado y el color del dueño dentro.
      const r = c.r;
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect((c.x - r) * MM - 1, (c.y - r) * MM - 1, (2 * r + 1) * MM + 2, (2 * r + 1) * MM + 2);
      ctx.fillStyle = c.owner === null ? '#c9d2e3' : TEAM_COLOR[c.owner];
      ctx.fillRect((c.x - r) * MM, (c.y - r) * MM, (2 * r + 1) * MM, (2 * r + 1) * MM);
    }
    for (const u of m.units) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(u.x * MM, u.y * MM, MM, MM);
      ctx.fillStyle = u.team === 0 ? '#8fd0ff' : '#ff8a80';
      ctx.fillRect(u.x * MM + 1, u.y * MM + 1, MM - 2, MM - 2);
    }
  }, [m]);
  const jump = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    ui.actions.minimapJump(((e.clientX - r.left) / r.width) * m.w, ((e.clientY - r.top) / r.height) * m.h);
  };
  const kx = 100 / m.w,
    ky = 100 / m.h;
  return (
    <div class="px minimap" title={t('minimap')}>
      <div
        class="mm-wrap"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) jump(e);
        }}
      >
        <canvas ref={ref} width={m.w * MM} height={m.h * MM} />
        <span
          class="mm-view"
          style={{ left: `${view.x * kx}%`, top: `${view.y * ky}%`, width: `${view.w * kx}%`, height: `${view.h * ky}%` }}
        />
      </div>
    </div>
  );
}
