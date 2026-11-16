import { useEffect, useState } from 'preact/hooks';

/** Alt pulsado (la ficha de la casilla y la prevision de combate enseñan entonces todo). */
export function useAltHeld(): boolean {
  const [isHeld, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => setHeld(event.altKey);
    const onBlur = () => setHeld(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return isHeld;
}
