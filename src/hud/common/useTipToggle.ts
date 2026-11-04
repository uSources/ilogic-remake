import { useState } from 'preact/compat';

/** Desglose: se abre al pasar el raton (CSS) o al tocarlo, y se cierra al tocarlo otra vez. */
export function useTipToggle(): [boolean, () => void, (e: PointerEvent) => void] {
  const [open, setOpen] = useState(false);
  // Salir con el raton lo cierra; con el dedo no (el navegador "sale" al levantarlo, justo tras abrirlo).
  const leave = (event: PointerEvent) => event.pointerType === 'mouse' && setOpen(false);
  return [open, () => setOpen((isOpen) => !isOpen), leave];
}
