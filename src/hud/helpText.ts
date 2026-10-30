import { RULES } from '../core/data';
import { settings } from '../settings';

/** Contenido de la ayuda ("Cómo se juega"), en los dos idiomas. */
const HELP = {
  es: {
    title: 'Cómo se juega',
    goalTitle: 'Objetivo',
    goal: [
      'Gana quien conquista la Base enemiga.',
      'CAPTURE_ES',
      'COUNTER_ES',
      'VET_ES',
      'MOVE_ES',
      'Cada edificio tuyo da dinero al final de cada ronda. Con él compras unidades en fábricas, ciudades y aeropuertos libres.',
      'Sobre un edificio propio, tus unidades se reparan al empezar la ronda. El camión de suministros repara a los vehículos y aviones de al lado.',
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
      ['Mover una unidad', 'Enter, flechas, Enter', 'Arrastrar y soltar (dedo: mantener y arrastrar)'],
      ['Mover y esperar', 'Mayúsculas + Enter', 'Mayúsculas al soltar, o doble clic'],
      ['Atacar, capturar, unir, subir', 'Enter sobre el objetivo', 'Soltar encima'],
      ['Quitar la última casilla del camino', 'Retroceso', '—'],
      ['Deshacer el último movimiento', 'Ctrl+Z', '—'],
      ['Orden de varios turnos', '—', 'Soltar lejos, fuera del alcance'],
      ['Mover en grupo', '—', 'Mayúsculas + recuadro, luego clic'],
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
      ['Repetir el turno enemigo, rendirse', '—', 'Menú de partida'],
    ],
    close: 'Cerrar',
  },
  en: {
    title: 'How to play',
    goalTitle: 'Goal',
    goal: [
      'You win by taking the enemy HQ.',
      'CAPTURE_EN',
      'COUNTER_EN',
      'VET_EN',
      'MOVE_EN',
      'Each of your buildings pays you at the end of every round. Spend it on units at your free factories, cities and airports.',
      'Units standing on one of your buildings are repaired at the start of the round. The supply truck repairs adjacent vehicles and aircraft.',
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
      ['Move a unit', 'Enter, arrows, Enter', 'Drag and drop (touch: hold and drag)'],
      ['Move and wait', 'Shift + Enter', 'Shift on drop, or double-click'],
      ['Attack, capture, join, board', 'Enter on the target', 'Drop on it'],
      ['Remove the last path tile', 'Backspace', '—'],
      ['Undo the last move', 'Ctrl+Z', '—'],
      ['Multi-turn order', '—', 'Drop far, out of range'],
      ['Group move', '—', 'Shift + box, then click'],
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
      ['Replay the enemy turn, surrender', '—', 'Game menu'],
    ],
    close: 'Close',
  },
};

/** Frases que dependen de las reglas de la partida. */
function ruleLines(lang: 'es' | 'en'): Record<string, string> {
  const es = {
    CAPTURE_ES: `Capturar va por puntos: un edificio tiene ${RULES.capturePoints} (la Base ${RULES.hqCapturePoints}) y cada turno la unidad le resta su vida ÷ 10. Si se mueve o la destruyen, se pierde lo avanzado. Al llegar a 0 pasa a ser tuyo.`,
    COUNTER_ES: RULES.counterattack
      ? 'Al atacar, si el defensor sobrevive y te alcanza, responde con la vida que le queda. Las unidades a distancia ni contraatacan ni reciben contraataque.'
      : 'No hay contraataque: atacar primero sale gratis.',
    MOVE_ES:
      RULES.ambush && RULES.fog
        ? 'Puedes atravesar tus unidades. Con niebla, el bosque solo se ve desde al lado: si tu camino choca con un enemigo escondido, la unidad se para antes (¡emboscada!) y pierde el turno.'
        : '',
    VET_ES: RULES.veterancy
      ? 'Veteranía: una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas). Cada estrella da +5 % de acierto y de defensa; al unir dos unidades se queda la más veterana.'
      : '',
  };
  const en = {
    CAPTURE_EN: `Capturing takes points: a building has ${RULES.capturePoints} (the HQ ${RULES.hqCapturePoints}) and each turn the unit removes its HP ÷ 10. If it moves or is destroyed, the progress is lost. At 0 it becomes yours.`,
    COUNTER_EN: RULES.counterattack
      ? 'When you attack, a defender that survives and can reach you strikes back with the HP it has left. Ranged units neither counter nor get countered.'
      : 'There is no counterattack: striking first is free.',
    MOVE_EN:
      RULES.ambush && RULES.fog
        ? 'You can move through your own units. With fog, woods are only visible from next to them: if your path runs into a hidden enemy, the unit stops short (ambush!) and loses its turn.'
        : '',
    VET_EN: RULES.veterancy
      ? 'Veterancy: units that destroy enemies earn stars (1, 3 and 6 kills). Each star gives +5 % hit chance and defence; joining two units keeps the more veteran one.'
      : '',
  };
  return lang === 'es' ? es : en;
}

export const helpText = () => {
  const h = HELP[settings.lang];
  const lines = ruleLines(settings.lang);
  return { ...h, goal: h.goal.map((g) => lines[g] ?? g).filter(Boolean) };
};
