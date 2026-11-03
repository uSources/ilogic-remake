/**
 * Menu de bocadillo de la fase actual (pausa, unidad, compra, grupo, ordenes de una casilla, carga).
 * Funcion pura: la escena le pasa lo que hay elegido y publica el resultado en el store.
 */
import { RULES, UNIT } from '../../core/data';
import { missionById } from '../../core/missions';
import { unitById, unloadTiles, type BuyOption } from '../../core/rules';
import type { Building, GameState, Pos, Unit } from '../../core/types';
import { objectiveText } from '../../campaign';
import { actionById, menuActions, type ActionCtx, type ActionId } from '../../controls/actions';
import type { MenuItemVM, MenuVM } from '../../hud/store';
import { buildingLabel, fmtNum, settings, t, unitLabel, type TextKey } from '../../settings';
import { seedToCode } from '../../setup';
import { abilitiesVM, buyBlockedText, captureHintText, unitStatsText } from '../../ui/hudModels';
import { unitIconKey } from '../../ui/sprites';
import { GAME_MENU, type ActionKey, type Phase } from './types';

export interface MenuInput {
  s: GameState;
  phase: Phase;
  cursor: Pos;
  /** Unidad elegida (menu de la unidad, carga). */
  sel: Unit | null;
  /** Opciones del menu de la unidad, ya ordenadas. */
  actions: readonly ActionKey[];
  /** Fabrica de la compra y lo que se puede comprar en ella. */
  building: Building | null;
  buy: readonly BuyOption[];
  /** Unidades del grupo elegido (menu de grupo). */
  groupUnits: () => Unit[];
  /** Contexto de las acciones sin casilla con lo elegido (menu de grupo). */
  groupCtx: () => ActionCtx | null;
  /** Menu de ordenes de una casilla (fase 'orderMenu'). */
  orderMenu: { at: Pos; uids: readonly number[]; ids: readonly ActionId[] } | null;
  /** Hay un turno enemigo que repetir. */
  canReplay: boolean;
}

/** El menu sin colocar: `at` es la casilla junto a la que va el bocadillo. */
export type MenuModel = Omit<MenuVM, 'selected' | 'anchor'> & { at: Pos };

export function menuModel(i: MenuInput): MenuModel {
  let items: MenuItemVM[] = [];
  let at: Pos = i.cursor;
  let title: string | undefined;
  let subtitle: string | undefined;
  let kind: MenuVM['kind'] = 'game';
  let info: string[] | undefined;
  const s = i.s;
  switch (i.phase) {
    case 'gameMenu':
      title = `${t('day')} ${s.day}${RULES.dayLimit ? ` / ${RULES.dayLimit}` : ''}`;
      // Codigo del mapa, para volver a jugarlo (Nueva partida > Codigo del mapa).
      if (s.setup) subtitle = `${t('mapCode')}: ${seedToCode(s.setup.seed)} · ${s.setup.size}×${s.setup.size}`;
      if (s.mission) {
        const m = missionById(s.mission.id);
        if (m) info = [`${m.title[settings.lang]}: ${objectiveText(m, s)}`];
      }
      items = GAME_MENU.map((k) => ({
        id: k,
        label: t(k as TextKey),
        hint: k === 'endTurn' ? 'E' : k === 'resume' ? 'Esc' : k === 'help' ? 'H' : k === 'options' ? 'O' : undefined,
        danger: k === 'quit' || k === 'surrender',
        disabled: k === 'replay' && !i.canReplay,
      }));
      break;
    case 'unitMenu': {
      kind = 'unit';
      const sel = i.sel;
      if (sel) at = sel;
      items = i.actions.map((a) => ({
        id: a,
        label: t(a as TextKey),
        danger: a === 'delete',
        // "20→10": puntos del edificio antes y despues de capturar este turno (reglas nuevas).
        hint: a === 'capture' ? (sel ? captureHintText(s, sel) : undefined) : undefined,
      }));
      title = sel ? unitLabel(sel.type) : undefined;
      break;
    }
    case 'buy':
      kind = 'buy';
      if (i.building) {
        at = i.building;
        title = buildingLabel(i.building.type);
        subtitle = `${t('funds')}: ${fmtNum(s.funds[0])}`;
      }
      items = [
        { id: 'cancel', label: t('cancel'), icon: null },
        ...i.buy.map((o) => ({
          id: `buy${o.type}`,
          label: unitLabel(o.type),
          hint: `${o.cost}`,
          icon: unitIconKey(o.type, o.affordable),
          disabled: !o.affordable,
          detail:
            `${unitStatsText(o.type)} · ${t('vision')} ${UNIT.vision[o.type]}` +
            (RULES.commandPoints === null ? '' : ` · ${t('commandShort')} ${UNIT.command[o.type]}`) +
            abilitiesVM(o.type)
              .map((a) => ` · ${a.name}`)
              .join('') +
            (o.blocked ? ` · ${buyBlockedText(o.blocked)}` : ''),
        })),
      ];
      break;
    case 'groupMenu': {
      kind = 'unit';
      const units = i.groupUnits();
      if (units[0]) at = units[0];
      title = `${t('groupMenu')} · ${units.length}`;
      // [CAMBIO] Las acciones sin casilla del registro (controls/actions.ts); las ordenes piden despues
      // el destino. "Mover" deja el grupo elegido para el clic derecho.
      const ctx = i.groupCtx();
      items = [
        { id: 'move', label: t('groupMoveHint') },
        ...(ctx ? menuActions(ctx) : []).map((a) => ({ id: a.id, label: t(a.label as TextKey) })),
        { id: 'cancel', label: t('cancel') },
      ];
      break;
    }
    case 'orderMenu': {
      kind = 'unit';
      const o = i.orderMenu;
      if (o) {
        at = o.at;
        title = o.uids.length > 1 ? `${t('orderUnit')} · ${o.uids.length}` : t('orderUnit');
      }
      items = (o?.ids ?? []).map((id) => ({ id, label: t(actionById(id)!.label as TextKey) }));
      break;
    }
    case 'unloadPick': {
      kind = 'cargo';
      const sel = i.sel;
      if (sel) at = sel;
      const cargo = sel ? sel.cargo.map((uid) => unitById(s, uid)) : [];
      items = [
        { id: 'back', label: t('back'), icon: null },
        ...cargo.map((u, k) =>
          u
            ? {
                id: `c${k}`,
                label: unitLabel(u.type),
                icon: unitIconKey(u.type, true),
                hint: `${u.life}`,
                disabled: !unloadTiles(s, sel!, u).length,
              }
            : { id: `c${k}`, label: t('empty'), icon: null, disabled: true },
        ),
      ];
      title = t('unload');
      break;
    }
    default:
      break;
  }
  return { kind, title, subtitle, info, items, at };
}
