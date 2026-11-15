/**
 * El panel del playground (HTML a mano: es una herramienta, no el juego): que modelos ver y de que
 * lado, que animacion, a que velocidad, la torreta, el clima, girar la camara y recargar los modelos
 * recien exportados. Cada control solo llama a su accion; quien la cumple es main.ts.
 */
import type { OwnerSide } from '../../ui/sides';
import type { UnitClip } from '../glbModels';
import type { ModelDetails } from './stage';

/** Lo que piden los controles. */
export interface PanelActions {
  /** 'units', 'buildings' o el id de un modelo. */
  view(choice: string): void;
  side(side: OwnerSide): void;
  play(clip: UnitClip): void;
  repeatFire(on: boolean): void;
  speed(multiplier: number): void;
  togglePause(): boolean;
  step(): void;
  aim(degrees: number): void;
  weather(kind: string | null): void;
  orbit(on: boolean): void;
  reload(): void;
}

/** Lo que se puede elegir: los ids de unidades y edificios del contenido. */
export interface Catalog {
  units: readonly string[];
  buildings: readonly string[];
}

const CLIPS: readonly UnitClip[] = ['idle', 'drive', 'fire'];
const SIDES: readonly [OwnerSide, string][] = [
  ['own', 'Azul'],
  ['enemy', 'Rojo'],
  ['neutral', 'Gris'],
];
const WEATHERS = ['Clear', 'Rain', 'Snow', 'Storm', 'Sandstorm'];

const STYLE = `
  html, body { margin: 0; height: 100%; overflow: hidden; background: #bfe6ff; font: 13px 'Pixelify Sans', sans-serif; }
  #stage { position: fixed; inset: 0 300px 0 0; }
  #panel { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; overflow-y: auto; box-sizing: border-box;
    padding: 12px; background: #141a2b; color: #e8ecf6; }
  #panel h2 { font: 12px 'Silkscreen', monospace; color: #ffd447; margin: 14px 0 6px; }
  #panel h2:first-child { margin-top: 0; }
  #panel .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  #panel button, #panel select { font: inherit; color: inherit; background: #26304a; border: 1px solid #3a4870;
    border-radius: 3px; padding: 3px 7px; cursor: pointer; }
  #panel button:hover { background: #33416a; }
  #panel button.on { background: #2f74d6; border-color: #6fb0f2; }
  #panel input[type=range] { flex: 1; }
  #panel label { display: flex; gap: 6px; align-items: center; }
  #panel .value { min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
  #panel .info { background: #0c1120; border-radius: 4px; padding: 8px; line-height: 1.5; white-space: pre-wrap; }
  #panel code { font: 11px monospace; color: #9fe3ff; }
`;

/** Los estilos de la pagina: van antes de crear el mundo, que mide su hueco al nacer. */
export function installStyle(): void {
  document.head.append(element('style', { text: STYLE }));
}

export class Panel {
  private readonly root: HTMLElement;
  private readonly info: HTMLElement;
  private readonly choices = new Map<string, HTMLButtonElement>();
  private readonly sideButtons = new Map<OwnerSide, HTMLButtonElement>();
  private readonly clipButtons = new Map<UnitClip, HTMLButtonElement>();

  constructor(
    root: HTMLElement,
    catalog: Catalog,
    private readonly actions: PanelActions,
  ) {
    this.root = root;
    this.section('Ver', this.viewButtons(catalog));
    this.section('Lado', this.sideRow());
    this.section('Animacion', this.clipRow(), this.fireRepeat());
    this.section('Tiempo', this.speedRow(), this.pauseRow());
    this.section(
      'Torreta',
      this.slider('Angulo', -180, 180, 0, 'º', (value) => actions.aim(value)),
    );
    this.section('Luz', this.weatherRow(), this.orbitToggle());
    this.section('Modelos', this.reloadRow());
    this.info = element('div', { className: 'info' });
    this.section('Detalles', this.info);
  }

  /** Marca lo que se esta viendo, el lado y la animacion (para que el panel diga lo que hay). */
  mark(view: string, side: OwnerSide, clip: UnitClip): void {
    for (const [choice, button] of this.choices) button.classList.toggle('on', choice === view);
    for (const [option, button] of this.sideButtons) button.classList.toggle('on', option === side);
    for (const [option, button] of this.clipButtons) button.classList.toggle('on', option === clip);
  }

  /** Lo que se sabe del modelo elegido (o una ayuda si no hay ninguno). */
  showDetails(details: ModelDetails | null, note: string): void {
    this.info.replaceChildren(details ? detailsText(details) : 'Toca un modelo para ver sus datos.', element('br'), note);
  }

  private section(title: string, ...content: HTMLElement[]): void {
    this.root.append(element('h2', { text: title }), ...content);
  }

  private viewButtons(catalog: Catalog): HTMLElement {
    const row = element('div', { className: 'row' });
    const add = (choice: string, label: string) => {
      const button = buttonOf(label, () => this.actions.view(choice));
      this.choices.set(choice, button);
      row.append(button);
    };
    add('units', 'Todas las unidades');
    for (const id of catalog.units) add(id, id);
    add('buildings', 'Todos los edificios');
    for (const id of catalog.buildings) add(id, id);
    return row;
  }

  private sideRow(): HTMLElement {
    const row = element('div', { className: 'row' });
    for (const [side, label] of SIDES) {
      const button = buttonOf(label, () => this.actions.side(side));
      this.sideButtons.set(side, button);
      row.append(button);
    }
    return row;
  }

  private clipRow(): HTMLElement {
    const row = element('div', { className: 'row' });
    for (const clip of CLIPS) {
      const button = buttonOf(clip, () => this.actions.play(clip));
      this.clipButtons.set(clip, button);
      row.append(button);
    }
    return row;
  }

  private fireRepeat(): HTMLElement {
    return checkbox('Repetir el disparo', false, (on) => this.actions.repeatFire(on));
  }

  private speedRow(): HTMLElement {
    return this.slider('Velocidad', 0.05, 2, 1, '×', (value) => this.actions.speed(value), 0.05);
  }

  private pauseRow(): HTMLElement {
    const pause = buttonOf('Pausa', () => (pause.textContent = this.actions.togglePause() ? 'Seguir' : 'Pausa'));
    return row(
      pause,
      buttonOf('Un fotograma', () => this.actions.step()),
    );
  }

  private weatherRow(): HTMLElement {
    const select = element('select');
    for (const kind of WEATHERS) select.append(element('option', { text: kind }));
    select.addEventListener('change', () => this.actions.weather(select.value === 'Clear' ? null : select.value));
    return row(element('span', { text: 'Clima' }), select);
  }

  private orbitToggle(): HTMLElement {
    return checkbox('Girar la camara sola', false, (on) => this.actions.orbit(on));
  }

  private reloadRow(): HTMLElement {
    const hint = element('div', { className: 'info' });
    hint.append(
      'Tras cambiar tools/art/ashfox/models y exportar:\n',
      element('code', { text: 'ASHFOX=<cli> node tools/art/ashfox/generate.mjs --export' }),
    );
    return row(
      buttonOf('Recargar modelos (R)', () => this.actions.reload()),
      hint,
    );
  }

  private slider(
    label: string,
    min: number,
    max: number,
    start: number,
    unit: string,
    change: (value: number) => void,
    step = 1,
  ): HTMLElement {
    const input = element('input', { type: 'range' });
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(start) });
    const value = element('span', { className: 'value', text: `${start}${unit}` });
    input.addEventListener('input', () => {
      value.textContent = `${input.value}${unit}`;
      change(Number(input.value));
    });
    return row(element('span', { text: label }), input, value);
  }
}

/** El texto de los detalles: que es, cuanto mide y sus animaciones. */
function detailsText({ entry, clips, size, hasTurret }: ModelDetails): string {
  const measures = [size.x, size.y, size.z].map((value) => `${value.toFixed(2)} (${Math.round(value * 16)})`).join(' × ');
  const animations = clips.map((clip) => `${clip.name} ${clip.seconds.toFixed(2)} s`).join(', ') || 'ninguna';
  const file = `${entry.kind === 'unit' ? 'units' : 'buildings'}/${entry.id.toLowerCase()}_*.glb`;
  return [
    `${entry.id} (${entry.kind === 'unit' ? 'unidad' : 'edificio'})`,
    `Fichero: ${file}`,
    `Mide (ancho × alto × fondo, casillas y unidades de Ashfox): ${measures}`,
    `Animaciones: ${animations}`,
    `Torreta: ${hasTurret ? 'si' : 'no'}`,
  ].join('\n');
}

interface ElementOptions {
  text?: string;
  className?: string;
  type?: string;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.type && node instanceof HTMLInputElement) node.type = options.type;
  return node;
}

const row = (...children: HTMLElement[]): HTMLElement => {
  const node = element('div', { className: 'row' });
  node.append(...children);
  return node;
};

function buttonOf(label: string, onClick: () => void): HTMLButtonElement {
  const button = element('button', { text: label });
  button.addEventListener('click', onClick);
  return button;
}

function checkbox(label: string, start: boolean, change: (on: boolean) => void): HTMLElement {
  const input = element('input', { type: 'checkbox' });
  input.checked = start;
  input.addEventListener('change', () => change(input.checked));
  const wrapper = element('label');
  wrapper.append(input, label);
  return wrapper;
}
