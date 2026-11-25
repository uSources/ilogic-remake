/**
 * Un ejercito de juguete: un soldado y un tanque de un bando, como en la tarjeta de «Nueva partida».
 * Lo usan las pantallas en linea («¡Rival encontrado!», la tarjeta «En línea» de Inicio, «Buscar
 * rival» y cada equipo del vestibulo). Estilo en styles/base/toy.css (`.army`).
 */
import { imgUrl } from '../../assets';

/** El color de los dibujos: azul (`b`), rojo (`r`) o gris (`i`: aun no hay nadie). */
export type ArmyPaint = 'b' | 'r' | 'i';

/** El soldado y el tanque; el rival (por defecto, el rojo), de espejo, para que mire al azul. */
export function Army({ paint, mirrored = paint === 'r', cls = '' }: { paint: ArmyPaint; mirrored?: boolean; cls?: string }) {
  return (
    <div class={`army ${mirrored ? 'mirrored' : ''} ${cls}`} aria-hidden="true">
      <img class="px-icon soldier" src={imgUrl(`${paint}_Soldier`)} alt="" />
      <img class="px-icon tank" src={imgUrl(`${paint}_Tank`)} alt="" />
    </div>
  );
}

/** «VS» entre dos ejercitos. */
export function Versus({ cls = '' }: { cls?: string }) {
  return (
    <span class={`versus ${cls}`} aria-hidden="true">
      VS
    </span>
  );
}

/** Los dos ejercitos frente a frente, azul contra rojo (la tarjeta «En línea» de Inicio). */
export function Faceoff() {
  return (
    <div class="faceoff" aria-hidden="true">
      <Army paint="b" />
      <Versus />
      <Army paint="r" />
    </div>
  );
}
