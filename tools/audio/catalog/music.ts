/** La musica nueva: las dos pistas de 2013 (`menu`, `game`) se quedan; esto es lo que se añade. */
import { jingle, music, type SoundSpec } from './spec';

const TRACKS: SoundSpec[] = [
  music('game_plains', 90, 'Bright and confident march in a major key'),
  music('game_desert', 90, 'Hot and dusty march with hand drums and a hint of middle eastern scales'),
  music('game_forest', 90, 'Adventurous march with woodwinds and light strings'),
  music('game_swamp', 90, 'Mysterious slow march with low clarinets and muted brass'),
  music('game_snowy', 90, 'Brave march with glockenspiel and cold high strings'),
  music('briefing', 60, 'Calm and thoughtful planning theme, soft snare roll and low brass'),
  music('enemy_turn', 60, 'Tense waiting theme with low strings and timpani, cautious'),
];

/** Al acabar una partida o una mision. */
const JINGLES: SoundSpec[] = [
  jingle('jingle_victory', 'Triumphant fanfare with trumpets ending on a cymbal crash'),
  jingle('jingle_defeat', 'Sad descending brass phrase, slow, ending on a low note'),
  jingle('jingle_draw', 'Unresolved brass phrase that stops on a questioning chord, neither happy nor sad'),
  jingle('jingle_mission_complete', 'Proud fanfare with trumpets and a snare drum roll, ending on a bright major chord'),
  jingle('jingle_mission_failed', 'Somber muted trumpet phrase over a soft drum roll, ending low'),
];

export const MUSIC_SOUNDS: readonly SoundSpec[] = [...TRACKS, ...JINGLES];
