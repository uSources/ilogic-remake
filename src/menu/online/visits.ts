/**
 * Para lo que acaba despues de esperar al servidor: quien empieza a esperar apunta la visita de
 * entonces (`current`) y, al llegar la respuesta, solo sigue si aun es la misma (`isCurrent`). Al
 * salir o volver a empezar (`next`), lo que estaba en marcha ya no toca nada. Lo usan la lista de
 * «Jugar en línea» (cancelar una busqueda) y `RoomWatch` (sus rondas de preguntas).
 */
export class Visits {
  private count = 0;

  current(): number {
    return this.count;
  }

  /** Empieza otra visita: lo que llevaba la de antes ya no vale. */
  next(): void {
    this.count++;
  }

  isCurrent(visit: number): boolean {
    return visit === this.count;
  }
}
