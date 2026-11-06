import type { MatchSettings } from '../../core/model';
import { controlZoneSide, joinSentences, percent, type HelpTexts } from '../help';

const capture = (rules: MatchSettings) =>
  `Capturar va por puntos: un edificio tiene ${rules.capturePoints} (la Base ${rules.hqCapturePoints}) y cada turno la unidad le resta su vida ÷ 10. Si se mueve o la destruyen, se pierde lo avanzado. Al llegar a 0 pasa a ser tuyo.`;

const counterattack = (rules: MatchSettings) =>
  rules.counterattack
    ? 'Al atacar, si el defensor sobrevive y te alcanza, responde con la vida que le queda. Las unidades a distancia ni contraatacan ni reciben contraataque.'
    : 'No hay contraataque: atacar primero sale gratis.';

const veterancy = (rules: MatchSettings) =>
  rules.veterancy
    ? `Veteranía: una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas). Cada estrella da +${percent(rules.vetBonus)} % de acierto y de defensa: a una veterana dañada le compensa curarse antes que comprar otra. Al unir dos unidades se queda la más veterana.`
    : '';

const attackBonuses = (rules: MatchSettings) =>
  joinSentences(
    rules.bounty > 0 ? `Botín: al destruir una unidad cobras el ${percent(rules.bounty)} % de su precio.` : '',
    rules.flankBonus > 0
      ? `Flanqueo: contra una unidad que ya ha recibido un ataque ese día aciertas un ${percent(rules.flankBonus)} % más. Ataca en grupo.`
      : '',
    rules.noHealUnderFire
      ? 'Bajo fuego: una unidad que ha recibido un ataque ese día no se cura esa noche (lleva una señal roja abajo a la izquierda).'
      : '',
  );

const armyLimits = (rules: MatchSettings) =>
  joinSentences(
    rules.commandPoints !== null
      ? `Puntos de mando: tu ejército no puede pasar de ${rules.commandPoints}. La infantería ocupa 1 y los vehículos y aviones grandes hasta 5 (lo pone al comprar).`
      : '',
    rules.upkeep > 0
      ? `Mantenimiento: cada ronda pagas el ${percent(rules.upkeep)} % del precio de tus unidades. Si no te llega, no pagas más.`
      : '',
  );

const controlPoints = (rules: MatchSettings) =>
  rules.controlPoints > 0
    ? `Puntos de control: zonas de ${controlZoneSide(rules)}×${controlZoneSide(rules)} marcadas con un borde y un banderín (grises si no son de nadie). Al acabar la ronda, si dentro solo hay unidades tuyas, la zona es tuya y te da ${rules.controlIncome}; si hay de los dos bandos, está disputada y no paga a nadie; vacía, sigue pagando a quien la tenía. Pelea por ellas.`
    : '';

const ambush = (rules: MatchSettings) =>
  rules.ambush && rules.fog
    ? 'Puedes atravesar tus unidades. Con niebla, el bosque solo se ve desde al lado: si tu camino choca con un enemigo escondido, la unidad se para antes (¡emboscada!) y pierde el turno.'
    : '';

const weather = (rules: MatchSettings) =>
  rules.weather
    ? 'Clima: cada pocos días cambia el tiempo (arriba, junto al día; al pasar por encima ves sus efectos y el pronóstico). La lluvia frena a los vehículos, la nieve a todo lo que va por tierra y las tormentas a los aviones; el mal tiempo quita visión y puntería a los dos bandos.'
    : '';

/** En el orden en que salen en la ayuda. */
const ruleLines = (rules: MatchSettings): string[] => [
  capture(rules),
  counterattack(rules),
  veterancy(rules),
  attackBonuses(rules),
  armyLimits(rules),
  controlPoints(rules),
  ambush(rules),
  weather(rules),
];

export const help: HelpTexts = {
  title: 'Cómo se juega',
  goalTitle: 'Objetivo',
  goalIntro: 'Gana quien conquista la Base enemiga.',
  ruleLines,
  goalBasics: [
    'Cada edificio tuyo da dinero al final de cada ronda. Con él compras unidades en fábricas, ciudades y aeropuertos libres.',
    'Sobre un edificio propio, tus unidades se reparan al empezar la ronda. El camión de suministros repara a los vehículos y aviones de al lado.',
    'Órdenes: con una unidad (o un grupo) elegida, clic derecho en la casilla de destino (con el dedo, mantenerla pulsada; con el teclado, F) y eliges «Atacar, Capturar o Defender allí». También desde el menú de la unidad: «Orden: …» y luego la casilla. Una bandera marca el destino y la unidad lleva la letra de la orden (A, C o D). Al terminar cada turno, las que tienen orden y no has usado la cumplen solas; al cumplirla se quedan quietas esperando otra. «Cancelar orden» la quita. Con un recuadro (arrastrando desde fuera de tus unidades), Mayúsculas + clic o doble clic en una (todas las de su tipo) eliges varias (con el dedo, «Elegir varias», abajo); clic derecho en un destino las lleva allí y Ctrl + número hace con ellas el grupo de esa tecla: puedes darles una orden o formar una escuadra (Alfa, Bravo...). Las escuadras salen abajo, junto a «Sin mover»: tócalas para darles órdenes o cambiarles el nombre. Una escuadra con la misma orden va en formación: las rápidas esperan a las lentas (salvo para atacar algo a tiro) y, cerca del destino o del enemigo, cada una lucha por su cuenta. Al señalar una unidad con orden ves lo que hará al terminar el turno: una flecha clara con el camino, un marco rojo sobre la unidad a la que va a atacar o uno dorado sobre el edificio que va a capturar («Ver órdenes» o V: las de todas). Una orden a toda la escuadra es de la escuadra; a solo algunas de sus unidades, esas van destacadas (raya naranja) y, al cumplirla, vuelven solas a la orden de la escuadra. Si empiezas a capturar a mano con una unidad que tenía orden, sigue capturando hasta acabar.',
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
    ['Elegir varias', '—', 'Recuadro arrastrando desde fuera de tus unidades; Mayúsculas + clic añade o quita; dedo: «Elegir varias»'],
    ['Todas las de un tipo en pantalla', '—', 'Doble clic (o Ctrl + clic) en una'],
    ['Soltar lo elegido', 'Esc', 'Clic en una casilla vacía'],
    [
      'Mandar a lo elegido (mover, atacar, capturar, subir…)',
      'Enter en el destino',
      'Clic derecho en el destino: el puntero dice qué hará',
    ],
    ['Dejarlo como orden, sin mover ahora', '—', 'Mayúsculas + clic derecho'],
    ['Todas las acciones (órdenes, escuadra…)', 'F', 'Alt + clic derecho / mantener pulsado el destino'],
    ['Orden a lo elegido y luego la casilla', 'Q atacar · C capturar · G defender (X: quitar orden)', 'Menú de la casilla'],
    ['Pasar por las elegidas', 'Tab', 'Panel de abajo: clic solo esa, Mayúsculas la quita, Ctrl su tipo'],
    [
      'Hacer un grupo (escuadra) con lo elegido',
      'Ctrl + 1 … 9 (Mayúsculas + número: añadir)',
      'Elegir varias, «Órdenes» y «Formar escuadra»',
    ],
    ['Elegir un grupo / ir a él', '1 … 9 (dos veces: la cámara va allí)', 'Su botón en la bandeja (dos veces: ir)'],
    [
      'Dar una orden',
      'Elegirla (Enter), F en el destino',
      'Elegirla (o varias: Ctrl + clic o recuadro) y clic derecho en el destino (dedo: mantener pulsado el destino)',
    ],
    ['Mover el cursor', 'Flechas / WASD', 'Pasar por encima / tocar'],
    ['Aceptar', 'Enter / Espacio', 'Clic / segundo toque'],
    ['Atrás', 'Esc / Retroceso', 'Clic derecho (sin nada elegido) / tocar fuera'],
    ['Ver alcance de una unidad', 'Enter sobre ella', 'Clic derecho / pulsación larga (sin nada elegido)'],
    ['Siguiente unidad sin mover', 'Tab', 'Bandeja de abajo'],
    ['Amenaza enemiga', 'T', 'Botón de la bandeja'],
    ['Qué harán las unidades con orden', 'V', 'Botón «Ver órdenes» de la bandeja'],
    ['Minimapa', 'M', 'Clic en él para ir'],
    ['Mover el mapa', '—', 'Arrastrar con el botón derecho o la rueda; borde de la pantalla; dedo: arrastrar'],
    ['Zoom', '+ / −', 'Rueda / pellizcar'],
    ['Fin del turno', 'E (dos veces si quedan unidades sin mover)', 'Botón de arriba: enseña cuántas quedan'],
    ['Esta ayuda', 'H', 'Menú de partida'],
    ['Repetir el turno enemigo, rendirse', '—', 'Menú de partida'],
  ],
  close: 'Cerrar',
};
