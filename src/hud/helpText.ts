import { settings } from '../settings';

/** Contenido de la ayuda ("Cómo se juega"), en los dos idiomas. */
const HELP = {
  es: {
    title: 'Cómo se juega',
    goalTitle: 'Objetivo',
    goal: [
      'Gana quien neutraliza la Base enemiga. Para quitarle un edificio al rival hay que capturarlo dos veces: primero queda neutral y luego pasa a ser tuyo.',
      'Cada edificio tuyo da dinero al final de cada ronda. Con él compras unidades en fábricas, ciudades y aeropuertos libres.',
      'Sobre un edificio propio, tus unidades se reparan y repostan al empezar la ronda.',
    ],
    colorsTitle: 'Colores del mapa',
    colors: [
      ['#3aa8ff', 'Adonde puede ir la unidad elegida'],
      ['#ff4d45', 'Objetivos de ataque / amenaza enemiga (T)'],
      ['#b15cff', 'Unirse con otra unidad igual (suma la vida)'],
      ['#2fd3c3', 'Subir a un transporte'],
      ['#ff8a3d', 'Alcance de la unidad señalada (Enter o clic derecho sobre ella)'],
    ],
    controlsTitle: 'Controles',
    head: ['Acción', 'Teclado', 'Ratón / táctil'],
    controls: [
      ['Mover el cursor', 'Flechas / WASD', 'Pasar por encima / tocar'],
      ['Aceptar', 'Enter / Espacio', 'Clic / segundo toque'],
      ['Atrás', 'Esc / Retroceso', 'Clic derecho / tocar fuera'],
      ['Ver alcance de una unidad', 'Enter sobre ella', 'Clic derecho / pulsación larga'],
      ['Siguiente unidad sin mover', 'Tab', 'Bandeja de abajo'],
      ['Amenaza enemiga', 'T', 'Botón de la bandeja'],
      ['Minimapa', 'M', 'Clic en él para ir'],
      ['Mover el mapa', '—', 'Arrastrar'],
      ['Zoom', '+ / −', 'Rueda / pellizcar'],
      ['Fin del turno', 'E', 'Botón de arriba'],
      ['Esta ayuda', 'H', 'Menú de partida'],
    ],
    close: 'Cerrar',
  },
  en: {
    title: 'How to play',
    goalTitle: 'Goal',
    goal: [
      'You win by neutralising the enemy HQ. To take a building from the enemy you capture it twice: first it turns neutral, then it becomes yours.',
      'Each of your buildings pays you at the end of every round. Spend it on units at your free factories, cities and airports.',
      'Units standing on one of your buildings are repaired and refuelled at the start of the round.',
    ],
    colorsTitle: 'Map colours',
    colors: [
      ['#3aa8ff', 'Where the selected unit can move'],
      ['#ff4d45', 'Attack targets / enemy threat (T)'],
      ['#b15cff', 'Join an identical unit (adds up HP)'],
      ['#2fd3c3', 'Board a transport'],
      ['#ff8a3d', 'Range of the inspected unit (Enter or right-click on it)'],
    ],
    controlsTitle: 'Controls',
    head: ['Action', 'Keyboard', 'Mouse / touch'],
    controls: [
      ['Move the cursor', 'Arrows / WASD', 'Hover / tap'],
      ['Accept', 'Enter / Space', 'Click / second tap'],
      ['Back', 'Esc / Backspace', 'Right-click / tap outside'],
      ['Inspect a unit’s range', 'Enter on it', 'Right-click / long press'],
      ['Next unmoved unit', 'Tab', 'Tray at the bottom'],
      ['Enemy threat', 'T', 'Tray button'],
      ['Minimap', 'M', 'Click it to jump'],
      ['Pan the map', '—', 'Drag'],
      ['Zoom', '+ / −', 'Wheel / pinch'],
      ['End turn', 'E', 'Top button'],
      ['This help', 'H', 'Game menu'],
    ],
    close: 'Close',
  },
};

export const helpText = () => HELP[settings.lang];
