/**
 * Todo el audio que usa una partida, en un paquete que la raiz de composicion (view3d/app/main.ts) da a
 * la partida: efectos sin sitio (interfaz) y con sitio (tablero), ambientes, y el oyente y el volumen del
 * tablero, que la vista mueve con la camara.
 */
import type { LoopPort } from './ambientNames';
import { audioMixer, setChannelLevel } from './audioContext';
import { webAudioLoops } from './loops';
import { playSoundAt, recentSounds, webAudioSounds, type HeardSound } from './sfx';
import type { SoundName, SoundPort } from './sounds';
import { setListener, type ListenerPose, type Point3 } from './spatial';

export interface GameAudio {
  readonly sounds: SoundPort;
  playAt(sound: SoundName, at: Point3 | null): void;
  readonly loops: LoopPort;
  moveListener(pose: ListenerPose): void;
  /** El volumen de los efectos del tablero, de 0 a 1 de lo normal (baja al alejar la camara). */
  setBoardLevel(level: number): void;
  /** Los ultimos efectos pedidos, con lo que sono y desde donde (para comprobar sin oir). */
  recent(): readonly HeardSound[];
}

export const webAudio: GameAudio = {
  sounds: webAudioSounds,
  playAt: playSoundAt,
  loops: webAudioLoops,
  // Tambien con el audio aun cerrado: la vista solo lo mueve cuando se mueve la camara, y al abrirse
  // el audio el oyente ya tiene que estar en su sitio.
  moveListener: (pose) => {
    const mixer = audioMixer();
    if (mixer) setListener(mixer.context, pose);
  },
  setBoardLevel: (level) => setChannelLevel('effects', level),
  recent: recentSounds,
};
