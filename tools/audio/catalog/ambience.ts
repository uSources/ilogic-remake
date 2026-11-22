/**
 * Los ambientes, bucles flojos debajo de todo (src/audio/ambientNames.ts): los de zona suenan desde un
 * sitio del mapa (la costa, un bosque), asi que van en mono; los de fondo (uno por tema y otro por clima,
 * encima) no tienen sitio y van en estereo.
 */
import { ambient, effect, zone, type SoundSpec } from './spec';

const ZONES: SoundSpec[] = [
  zone('amb_sea', 'Gentle waves lapping on a sandy shore close by, soft splashes and a seagull now and then'),
  zone('amb_woods', 'A small grove of trees nearby: leaves rustling, a woodpecker and a few songbirds'),
  zone('amb_meadow', 'A meadow up close: crickets chirping, bees buzzing past and tall grass swaying'),
  zone('amb_dunes', 'Sand dunes: dry wind sweeping over the sand with a fine sand hiss'),
  zone('amb_peaks', 'A rocky mountain peak: cold wind whistling between the rocks and small pebbles trickling down'),
  zone('amb_snowfield', 'An open snowfield: soft cold wind over the snow and a faint icy creak'),
  zone('amb_marsh', 'A marsh nearby: frogs croaking, insects buzzing and mud bubbling in still water'),
  zone('amb_factory', 'A small factory working: steady machinery hum, rhythmic metal stamping and hissing steam'),
  zone('amb_oil_pump', 'An oil pumpjack working: the slow rhythmic creak and clank of the pump over a low motor hum'),
];

const THEME_BEDS: SoundSpec[] = [
  ambient('amb_plains', 'Open grassland on a sunny day: light breeze through tall grass, songbirds and crickets in the distance'),
  ambient('amb_desert', 'Hot desert: dry wind blowing over sand dunes, faint sand hiss, very sparse'),
  ambient('amb_forest', 'Forest by day: leaves rustling in the wind, a woodpecker and many birds singing in the distance'),
  ambient('amb_swamp', 'Swamp: croaking frogs, buzzing insects, slow bubbling mud and still water'),
  ambient('amb_snowy', 'Snowy plain: a light icy breeze, soft and steady, with a fine hiss of drifting snow'),
];

/** El clima va encima del tema; los truenos sueltos, con la tormenta y al azar, son un efecto. */
const WEATHER: SoundSpec[] = [
  ambient('amb_rain', 'Steady rain falling on grass and puddles, no thunder'),
  ambient('amb_storm', 'Heavy rainstorm with strong gusty wind, no thunder'),
  ambient('amb_snowfall', 'Soft snowfall with a light hushed wind, very quiet'),
  ambient('amb_sandstorm', 'Sandstorm: strong gusting wind carrying sand that hisses against rocks'),
  effect('thunder', 4, 'often', 'Thunder clap followed by a long rolling rumble in the distance'),
];

export const AMBIENCE_SOUNDS: readonly SoundSpec[] = [...ZONES, ...THEME_BEDS, ...WEATHER];
