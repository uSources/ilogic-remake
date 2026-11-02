import { imgUrl } from '../../assets';

/** Dibujo del atlas por su clave (o un hueco del mismo tamaño si no existe). */
export function Icon({ k, alt = '', cls = 'px-icon' }: { k: string | null | undefined; alt?: string; cls?: string }) {
  const src = imgUrl(k);
  return src ? <img class={cls} src={src} alt={alt} draggable={false} /> : <span class={cls} />;
}
