import { settings } from '../settings';

/**
 * Nombre de la imagen de un boton (Boton.getbuttonImage del original):
 * Botones/ + idioma + (i_ inactivo | l_ seleccionado) + (d_ opcion en ON) + Boton<nombre>
 */
export function buttonKey(name: string, opts: { selected?: boolean; inactive?: boolean; on?: boolean } = {}): string {
  const state = opts.inactive ? 'i_' : opts.selected ? 'l_' : '';
  const dep = opts.on ? 'd_' : '';
  return `Botones/${settings.lang}_${state}${dep}Boton${name}`;
}
