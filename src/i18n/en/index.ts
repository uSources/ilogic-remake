import type { ES } from '../es';
import type { Translation } from '../translation';
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

export const EN_BY_FEATURE = { turn, actions, cards, combat, economy, orders, general, weather, options, menu, newGame };

export const EN: Translation<typeof ES> = {
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
};
