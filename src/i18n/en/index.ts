import type { ES } from '../es';
import type { Translation } from '../translation';
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

export const EN_BY_FEATURE = { turn, actions, cards, combat, economy, orders, weather, options, menu, newGame, online, lab };

export const EN: Translation<typeof ES> = {
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
