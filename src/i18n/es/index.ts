import { turn } from './turn';
import { actions } from './actions';
import { cards } from './cards';
import { combat } from './combat';
import { economy } from './economy';
import { orders } from './orders';
import { general } from './general';
import { weather } from './weather';
import { options } from './options';
import { menu } from './menu';
import { newGame } from './newGame';
import { online } from './online';

/** Los textos por tema, para encontrarlos; `t()` busca en todos a la vez (ES). */
export const ES_BY_FEATURE = { turn, actions, cards, combat, economy, orders, general, weather, options, menu, newGame, online };

export const ES = {
  ...turn,
  ...actions,
  ...cards,
  ...combat,
  ...economy,
  ...orders,
  ...general,
  ...weather,
  ...options,
  ...menu,
  ...newGame,
  ...online,
};

export type TextKey = keyof typeof ES;
