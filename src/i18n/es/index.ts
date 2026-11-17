import { turn } from './turn';
import { actions } from './actions';
import { cards } from './cards';
import { combat } from './combat';
import { economy } from './economy';
import { orders } from './orders';
import { weather } from './weather';
import { options } from './options';
import { menu } from './menu';
import { newGame } from './newGame';
import { online } from './online';
import { lab } from './lab';

/** Los textos por tema, para encontrarlos; `t()` busca en todos a la vez (ES). */
export const ES_BY_FEATURE = { turn, actions, cards, combat, economy, orders, weather, options, menu, newGame, online, lab };

export const ES = {
  ...turn,
  ...actions,
  ...cards,
  ...combat,
  ...economy,
  ...orders,
  ...weather,
  ...options,
  ...menu,
  ...newGame,
  ...online,
  ...lab,
};

export type TextKey = keyof typeof ES;
