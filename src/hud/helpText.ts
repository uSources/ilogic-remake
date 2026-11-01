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
      'ATTACK_ES',
      'ARMY_ES',
      'CONTROL_ES',
      'MOVE_ES',
      'WEATHER_ES',
      'Cada edificio tuyo da dinero al final de cada ronda. Con él compras unidades en fábricas, ciudades y aeropuertos libres.',
      'Sobre un edificio propio, tus unidades se reparan al empezar la ronda. El camión de suministros repara a los vehículos y aviones de al lado.',
      'Órdenes: en el menú de una unidad, «Orden: atacar, capturar o defender allí» y luego eliges la casilla. Una bandera marca el destino y la unidad lleva la letra de la orden (A, C o D). Al terminar cada turno, las que tienen orden y no has usado la cumplen solas; al cumplirla se quedan quietas esperando otra. «Cancelar orden» la quita. Con Mayúsculas + recuadro (o con «Elegir varias», abajo) eliges varias: puedes darles una orden o formar una escuadra (Alfa, Bravo...). Las escuadras salen abajo, junto a «Sin mover»: tócalas para darles órdenes o cambiarles el nombre.',
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
      ['Mover una unidad', 'Enter, flechas, Enter', 'Arrastrar y soltar (dedo: tocar la unidad y el destino)'],
      ['Mover y esperar', 'Mayúsculas + Enter', 'Mayúsculas al soltar, o doble clic'],
      ['Atacar, capturar, unir, subir', 'Enter sobre el objetivo', 'Soltar encima (dedo: tocarlo; atacar, dos toques)'],
      ['Quitar la última casilla del camino', 'Retroceso', '—'],
      ['Deshacer el último movimiento', 'Ctrl+Z', '—'],
      ['Orden de varios turnos', '—', 'Soltar lejos, fuera del alcance (dedo: mantener antes de arrastrar)'],
      ['Mover en grupo', '—', 'Mayúsculas + recuadro, luego clic'],
      [
        'Dar una orden',
        'Enter dos veces sobre ella, Orden, Enter en el destino',
        'Clic (o toque) dos veces sobre ella, Orden, el destino; varias: Mayúsculas + recuadro o «Elegir varias»',
      ],
      ['Mover el cursor', 'Flechas / WASD', 'Pasar por encima / tocar'],
      ['Aceptar', 'Enter / Espacio', 'Clic / segundo toque'],
      ['Atrás', 'Esc / Retroceso', 'Clic derecho / tocar fuera'],
      ['Ver alcance de una unidad', 'Enter sobre ella', 'Clic derecho / pulsación larga'],
      ['Siguiente unidad sin mover', 'Tab', 'Bandeja de abajo'],
      ['Amenaza enemiga', 'T', 'Botón de la bandeja'],
      ['Minimapa', 'M', 'Clic en él para ir'],
      ['Mover el mapa', '—', 'Arrastrar (fuera de tus unidades)'],
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
      'ATTACK_EN',
      'ARMY_EN',
      'CONTROL_EN',
      'MOVE_EN',
      'WEATHER_EN',
      'Each of your buildings pays you at the end of every round. Spend it on units at your free factories, cities and airports.',
      'Units standing on one of your buildings are repaired at the start of the round. The supply truck repairs adjacent vehicles and aircraft.',
      'Orders: in a unit’s menu, “Order: attack, capture or hold there”, then pick the tile. A flag marks the destination and the unit shows the order’s letter (A, C or D). At the end of each turn, units with an order that you haven’t used carry it out by themselves; once done they stay put waiting for another. “Cancel order” removes it. Shift + box (or “Pick several”, at the bottom) picks several units: give them an order or form a squad (Alfa, Bravo...). Squads appear at the bottom next to “Not moved”: tap one to give it orders or rename it.',
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
      ['Move a unit', 'Enter, arrows, Enter', 'Drag and drop (touch: tap the unit, then the destination)'],
      ['Move and wait', 'Shift + Enter', 'Shift on drop, or double-click'],
      ['Attack, capture, join, board', 'Enter on the target', 'Drop on it (touch: tap it; attack: tap twice)'],
      ['Remove the last path tile', 'Backspace', '—'],
      ['Undo the last move', 'Ctrl+Z', '—'],
      ['Multi-turn order', '—', 'Drop far, out of range (touch: hold before dragging)'],
      ['Group move', '—', 'Shift + box, then click'],
      [
        'Give an order',
        'Enter twice on it, Order, Enter on the destination',
        'Click (or tap) it twice, Order, the destination; several: Shift + box or “Pick several”',
      ],
      ['Move the cursor', 'Arrows / WASD', 'Hover / tap'],
      ['Accept', 'Enter / Space', 'Click / second tap'],
      ['Back', 'Esc / Backspace', 'Right-click / tap outside'],
      ['Inspect a unit’s range', 'Enter on it', 'Right-click / long press'],
      ['Next unmoved unit', 'Tab', 'Tray at the bottom'],
      ['Enemy threat', 'T', 'Tray button'],
      ['Minimap', 'M', 'Click it to jump'],
      ['Pan the map', '—', 'Drag (not from your units)'],
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
    WEATHER_ES: RULES.weather
      ? 'Clima: cada pocos días cambia el tiempo (arriba, junto al día; al pasar por encima ves sus efectos y el pronóstico). La lluvia frena a los vehículos, la nieve a todo lo que va por tierra y las tormentas a los aviones; el mal tiempo quita visión y puntería a los dos bandos.'
      : '',
    VET_ES: RULES.veterancy
      ? `Veteranía: una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas). Cada estrella da +${Math.round(RULES.vetBonus * 100)} % de acierto y de defensa: a una veterana dañada le compensa curarse antes que comprar otra. Al unir dos unidades se queda la más veterana.`
      : '',
    ATTACK_ES: [
      RULES.bounty > 0 ? `Botín: al destruir una unidad cobras el ${Math.round(RULES.bounty * 100)} % de su precio.` : '',
      RULES.flankBonus > 0
        ? `Flanqueo: contra una unidad que ya ha recibido un ataque ese día aciertas un ${Math.round(RULES.flankBonus * 100)} % más. Ataca en grupo.`
        : '',
      RULES.noHealUnderFire
        ? 'Bajo fuego: una unidad que ha recibido un ataque ese día no se cura esa noche (lleva una señal roja abajo a la izquierda).'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    CONTROL_ES:
      RULES.controlPoints > 0
        ? `Puntos de control: zonas de ${2 * RULES.controlRadius + 1}×${2 * RULES.controlRadius + 1} marcadas con un borde y un banderín (grises si no son de nadie). Al acabar la ronda, si dentro solo hay unidades tuyas, la zona es tuya y te da ${RULES.controlIncome}; si hay de los dos bandos, está disputada y no paga a nadie; vacía, sigue pagando a quien la tenía. Pelea por ellas.`
        : '',
    ARMY_ES: [
      RULES.commandPoints !== null
        ? `Puntos de mando: tu ejército no puede pasar de ${RULES.commandPoints}. La infantería ocupa 1 y los vehículos y aviones grandes hasta 5 (lo pone al comprar).`
        : '',
      RULES.upkeep > 0
        ? `Mantenimiento: cada ronda pagas el ${Math.round(RULES.upkeep * 100)} % del precio de tus unidades. Si no te llega, no pagas más.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
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
    WEATHER_EN: RULES.weather
      ? 'Weather: every few days it changes (top, next to the day; hover it to see its effects and the forecast). Rain slows vehicles, snow slows everything on the ground and storms slow aircraft; bad weather costs both sides vision and aim.'
      : '',
    VET_EN: RULES.veterancy
      ? `Veterancy: units that destroy enemies earn stars (1, 3 and 6 kills). Each star gives +${Math.round(RULES.vetBonus * 100)} % hit chance and defence, so a damaged veteran is worth healing rather than replacing. Joining two units keeps the more veteran one.`
      : '',
    ATTACK_EN: [
      RULES.bounty > 0 ? `Bounty: destroying a unit pays you ${Math.round(RULES.bounty * 100)} % of its price.` : '',
      RULES.flankBonus > 0
        ? `Flanking: against a unit that has already been attacked that day you hit ${Math.round(RULES.flankBonus * 100)} % more. Attack together.`
        : '',
      RULES.noHealUnderFire
        ? 'Under fire: a unit attacked that day does not heal that night (it shows a red mark at the bottom left).'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    CONTROL_EN:
      RULES.controlPoints > 0
        ? `Control points: ${2 * RULES.controlRadius + 1}×${2 * RULES.controlRadius + 1} zones marked with a border and a flag (grey if nobody holds them). At the end of the round, if only your units are inside, the zone is yours and pays you ${RULES.controlIncome}; if both sides have units inside, it is contested and pays nobody; empty, it keeps paying whoever held it. Fight for them.`
        : '',
    ARMY_EN: [
      RULES.commandPoints !== null
        ? `Command points: your army can't go over ${RULES.commandPoints}. Infantry takes 1 and big vehicles and aircraft up to 5 (shown when buying).`
        : '',
      RULES.upkeep > 0
        ? `Upkeep: every round you pay ${Math.round(RULES.upkeep * 100)} % of your units' price. If you can't afford it, you just pay what you have.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
  return lang === 'es' ? es : en;
}

export const helpText = () => {
  const h = HELP[settings.lang];
  const lines = ruleLines(settings.lang);
  return { ...h, goal: h.goal.map((g) => lines[g] ?? g).filter(Boolean) };
};
