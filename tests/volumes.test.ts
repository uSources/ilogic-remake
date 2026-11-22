import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUMES,
  gainOf,
  isAudible,
  MAX_LEVEL,
  parseVolumes,
  VOLUME_CHANNELS,
  withLevel,
  withMuteToggled,
} from '../src/audio/volumes';
import { parseSaved } from '../src/settings';

describe('volumenes de Opciones', () => {
  it('al maximo suena como siempre y callado no suena, aunque guarde su volumen', () => {
    expect(gainOf({ level: MAX_LEVEL, muted: false })).toBe(1);
    expect(gainOf({ level: MAX_LEVEL, muted: true })).toBe(0);
    expect(gainOf({ level: 0, muted: false })).toBe(0);
  });

  it('a mitad de deslizador suena a la mitad de fuerte (un cuarto de la onda), no casi igual que arriba', () => {
    expect(gainOf({ level: 50, muted: false })).toBeCloseTo(0.25);
    expect(gainOf({ level: 80, muted: false })).toBeGreaterThan(gainOf({ level: 50, muted: false }));
  });

  it('un canal se oye si ni el general ni el suyo estan callados o a cero', () => {
    const volumes = DEFAULT_VOLUMES;
    expect(isAudible(volumes, 'effects')).toBe(true);
    expect(isAudible(withMuteToggled(volumes, 'master'), 'effects')).toBe(false);
    expect(isAudible(withLevel(volumes, 'effects', 0), 'effects')).toBe(false);
    expect(isAudible(withLevel(volumes, 'effects', 0), 'voices')).toBe(true);
  });

  it('la musica empieza callada, como antes; lo demas, al maximo', () => {
    expect(isAudible(DEFAULT_VOLUMES, 'music')).toBe(false);
    for (const channel of VOLUME_CHANNELS.filter((channel) => channel !== 'music'))
      expect(isAudible(DEFAULT_VOLUMES, channel), channel).toBe(true);
  });

  it('mover el volumen lo deja entre 0 y el maximo y le quita el silencio', () => {
    const muted = withMuteToggled(DEFAULT_VOLUMES, 'voices');
    expect(withLevel(muted, 'voices', 40).voices).toEqual({ level: 40, muted: false });
    expect(withLevel(muted, 'voices', 140).voices.level).toBe(MAX_LEVEL);
    expect(withLevel(muted, 'voices', -10).voices.level).toBe(0);
  });

  it('callar y volver a poner un canal no cambia su volumen ni el de los demas', () => {
    const quieter = withLevel(DEFAULT_VOLUMES, 'ambience', 30);
    const toggledTwice = withMuteToggled(withMuteToggled(quieter, 'ambience'), 'ambience');
    expect(toggledTwice).toEqual(quieter);
    expect(withMuteToggled(quieter, 'ambience').effects).toEqual(quieter.effects);
  });
});

describe('volumenes guardados', () => {
  it('sin nada guardado, o con algo que no son volumenes, los de por defecto', () => {
    expect(parseVolumes(undefined)).toEqual(DEFAULT_VOLUMES);
    expect(parseVolumes('alto')).toEqual(DEFAULT_VOLUMES);
    expect(parseSaved({}).volumes).toEqual(DEFAULT_VOLUMES);
  });

  it('cada canal y cada campo se comprueban por separado', () => {
    const volumes = parseVolumes({
      music: { level: 55, muted: false },
      effects: { level: 'mucho', muted: true },
      voices: { level: 250 },
      nothing: 3,
    });
    expect(volumes.music).toEqual({ level: 55, muted: false });
    expect(volumes.effects).toEqual({ level: DEFAULT_VOLUMES.effects.level, muted: true });
    expect(volumes.voices).toEqual({ level: MAX_LEVEL, muted: false });
    expect(volumes.interface).toEqual(DEFAULT_VOLUMES.interface);
    expect(Object.keys(volumes).sort()).toEqual([...VOLUME_CHANNELS].sort());
  });

  it('lo que se guarda se lee igual', () => {
    const changed = withMuteToggled(withLevel(DEFAULT_VOLUMES, 'master', 70), 'interface');
    expect(parseVolumes(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  });
});
