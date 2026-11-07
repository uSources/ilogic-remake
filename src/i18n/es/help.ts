import { controlZoneSide, joinSentences, percent, type HelpTexts, type KeyLabels, type RuleFacts } from '../help';

const capture = ({ settings }: RuleFacts) =>
  `Capturar va por puntos: un edificio tiene ${settings.capturePoints} (la Base ${settings.hqCapturePoints}) y cada turno la unidad le resta su vida ÷ 10. Si se mueve o la destruyen, se pierde lo avanzado. Al llegar a 0 pasa a ser tuyo.`;

const counterattack = ({ on }: RuleFacts) =>
  on('counterattack')
    ? 'Al atacar, si el defensor sobrevive y te alcanza, responde con la vida que le queda. Las unidades a distancia ni contraatacan ni reciben contraataque.'
    : 'No hay contraataque: atacar primero sale gratis.';

const veterancy = ({ settings, on }: RuleFacts) =>
  on('veterancy')
    ? `Veteranía: una unidad que destruye enemigos gana estrellas (1, 3 y 6 bajas). Cada estrella da +${percent(settings.vetBonus)} % de acierto y de defensa: a una veterana dañada le compensa curarse antes que comprar otra. Al unir dos unidades se queda la más veterana.`
    : '';

const attackBonuses = ({ settings, on }: RuleFacts) =>
  joinSentences(
    on('bounty') ? `Botín: al destruir una unidad cobras el ${percent(settings.bounty)} % de su precio.` : '',
    on('flank')
      ? `Flanqueo: contra una unidad que ya ha recibido un ataque ese día aciertas un ${percent(settings.flankBonus)} % más. Ataca en grupo.`
      : '',
    on('noHealUnderFire')
      ? 'Bajo fuego: una unidad que ha recibido un ataque ese día no se cura esa noche (lleva una señal roja abajo a la izquierda).'
      : '',
  );

const armyLimits = ({ settings, on }: RuleFacts) =>
  joinSentences(
    settings.commandPoints !== null
      ? `Puntos de mando: tu ejército no puede pasar de ${settings.commandPoints}. La infantería ocupa 1 y los vehículos y aviones grandes hasta 5 (lo pone al comprar).`
      : '',
    on('upkeep')
      ? `Mantenimiento: cada ronda pagas el ${percent(settings.upkeep)} % del precio de tus unidades. Si no te llega, no pagas más.`
      : '',
  );

const controlPoints = ({ settings, on }: RuleFacts) =>
  on('controlPoints')
    ? `Puntos de control: zonas de ${controlZoneSide(settings)}×${controlZoneSide(settings)} marcadas con un borde y un banderín (grises si no son de nadie). Al acabar la ronda, si dentro solo hay unidades tuyas, la zona es tuya y te da ${settings.controlIncome}; si hay de los dos bandos, está disputada y no paga a nadie; vacía, sigue pagando a quien la tenía. Pelea por ellas.`
    : '';

const ambush = ({ on }: RuleFacts) =>
  on('ambush') && !on('noFog')
    ? 'Puedes atravesar tus unidades. Con niebla, el bosque solo se ve desde al lado: si tu camino choca con un enemigo escondido, la unidad se para antes (¡emboscada!) y pierde el turno.'
    : '';

// [CAMBIO] Los edificios propios ven a su alrededor (radios en src/core/content/buildings.json).
const buildingVision = ({ on }: RuleFacts) =>
  on('noFog')
    ? ''
    : 'Tus edificios también vigilan a su alrededor: la Base y la fortaleza 3 casillas, las fábricas y los aeropuertos 2, las ciudades y los pozos 1.';

const weather = ({ on }: RuleFacts) =>
  on('weather')
    ? 'Clima: cada pocos días cambia el tiempo (arriba, junto al día; al pasar por encima ves sus efectos y el pronóstico). La lluvia frena a los vehículos, la nieve a todo lo que va por tierra y las tormentas a los aviones; el mal tiempo quita visión y puntería a los dos bandos.'
    : '';

/** En el orden en que salen en la ayuda. */
const ruleLines = (facts: RuleFacts): string[] => [
  capture(facts),
  counterattack(facts),
  veterancy(facts),
  attackBonuses(facts),
  armyLimits(facts),
  controlPoints(facts),
  ambush(facts),
  buildingVision(facts),
  weather(facts),
];

export const help: HelpTexts = {
  title: 'Cómo se juega',
  goalTitle: 'Objetivo',
  goalIntro: 'Gana quien conquista la Base enemiga.',
  ruleLines,
  goalBasics: (keys: KeyLabels) => [
    'Cada edificio tuyo da dinero al final de cada ronda. Con él compras unidades en fábricas, ciudades y aeropuertos libres.',
    'Sobre un edificio propio, tus unidades se reparan al empezar la ronda. El camión de suministros repara a los vehículos y aviones de al lado.',
    `Órdenes: con una unidad (o un grupo) elegida, clic derecho en la casilla de destino (con el dedo, mantenerla pulsada; con el teclado, ${keys.orderHere}) y eliges «Atacar, Capturar o Defender allí». También desde el menú de la unidad: «Orden: …» y luego la casilla. Una bandera marca el destino y la unidad lleva la letra de la orden (A, C o D). Al terminar cada turno, las que tienen orden y no has usado la cumplen solas; al cumplirla se quedan quietas esperando otra. «Cancelar orden» la quita. Con un recuadro (arrastrando desde fuera de tus unidades), Mayúsculas + clic o doble clic en una (todas las de su tipo) eliges varias (con el dedo, «Elegir varias», abajo); clic derecho en un destino las lleva allí y Ctrl + número hace con ellas el grupo de esa tecla: puedes darles una orden o formar una escuadra (Alfa, Bravo...). Las escuadras salen abajo, junto a «Sin mover»: tócalas para darles órdenes o cambiarles el nombre. Una escuadra con la misma orden va en formación: las rápidas esperan a las lentas (salvo para atacar algo a tiro) y, cerca del destino o del enemigo, cada una lucha por su cuenta. Al señalar una unidad con orden ves lo que hará al terminar el turno: una flecha clara con el camino, un marco rojo sobre la unidad a la que va a atacar o uno dorado sobre el edificio que va a capturar («Ver órdenes» o ${keys.intents}: las de todas). Una orden a toda la escuadra es de la escuadra; a solo algunas de sus unidades, esas van destacadas (raya naranja) y, al cumplirla, vuelven solas a la orden de la escuadra. Si empiezas a capturar a mano con una unidad que tenía orden, sigue capturando hasta acabar.`,
  ],
  colorsTitle: 'Colores del mapa',
  colors: (keys: KeyLabels) => [
    ['#3aa8ff', 'Adonde puede ir la unidad elegida'],
    ['#ff4d45', `Objetivos de ataque / amenaza enemiga (${keys.threat})`],
    ['#b15cff', 'Unirse con otra unidad igual (suma la vida)'],
    ['#2fd3c3', 'Subir a un transporte'],
    ['#ff8a3d', 'Alcance de la unidad señalada (Enter o clic derecho sobre ella)'],
  ],
  controlsTitle: 'Controles',
  head: ['Acción', 'Teclado', 'Ratón / táctil'],
  controls: (keys: KeyLabels) => [
    ['Mover una unidad', 'Enter, flechas, Enter', 'Arrastrar y soltar (dedo: tocar la unidad y el destino)'],
    ['Mover y esperar', 'Mayúsculas + Enter', 'Mayúsculas al soltar, o doble clic'],
    ['Atacar, capturar, unir, subir', 'Enter sobre el objetivo', 'Soltar encima (dedo: tocarlo; atacar, dos toques)'],
    ['Quitar la última casilla del camino', keys.stepBack, '—'],
    ['Deshacer el último movimiento', 'Ctrl+Z', '—'],
    ['Orden de varios turnos', '—', 'Soltar lejos, fuera del alcance (dedo: mantener antes de arrastrar)'],
    ['Elegir varias', '—', 'Recuadro arrastrando desde fuera de tus unidades; Mayúsculas + clic añade o quita; dedo: «Elegir varias»'],
    ['Todas las de un tipo en pantalla', '—', 'Doble clic (o Ctrl + clic) en una'],
    ['Soltar lo elegido', keys.cancel, 'Clic en una casilla vacía'],
    [
      'Mandar a lo elegido (mover, atacar, capturar, subir…)',
      'Enter en el destino',
      'Clic derecho en el destino: el puntero dice qué hará',
    ],
    ['Dejarlo como orden, sin mover ahora', '—', 'Mayúsculas + clic derecho'],
    ['Todas las acciones (órdenes, escuadra…)', keys.orderHere, 'Alt + clic derecho / mantener pulsado el destino'],
    [
      'Orden a lo elegido y luego la casilla',
      `${keys.orderAttack} atacar · ${keys.orderCapture} capturar · ${keys.orderDefend} defender (${keys.orderCancel}: quitar orden)`,
      'Menú de la casilla',
    ],
    ['Pasar por las elegidas', keys.nextUnit, 'Panel de abajo: clic solo esa, Mayúsculas la quita, Ctrl su tipo'],
    [
      'Hacer un grupo (escuadra) con lo elegido',
      'Ctrl + 1 … 9 (Mayúsculas + número: añadir)',
      'Elegir varias, «Órdenes» y «Formar escuadra»',
    ],
    ['Elegir un grupo / ir a él', '1 … 9 (dos veces: la cámara va allí)', 'Su botón en la bandeja (dos veces: ir)'],
    [
      'Dar una orden',
      `Elegirla (Enter), ${keys.orderHere} en el destino`,
      'Elegirla (o varias: Ctrl + clic o recuadro) y clic derecho en el destino (dedo: mantener pulsado el destino)',
    ],
    ['Mover el cursor', 'Flechas / WASD', 'Pasar por encima / tocar'],
    ['Aceptar', 'Enter / Espacio', 'Clic / segundo toque'],
    ['Atrás', `${keys.cancel} / ${keys.stepBack}`, 'Clic derecho (sin nada elegido) / tocar fuera'],
    ['Ver alcance de una unidad', 'Enter sobre ella', 'Clic derecho / pulsación larga (sin nada elegido)'],
    ['Siguiente unidad sin mover', keys.nextUnit, 'Bandeja de abajo'],
    ['Amenaza enemiga', keys.threat, 'Botón de la bandeja'],
    ['Qué harán las unidades con orden', keys.intents, 'Botón «Ver órdenes» de la bandeja'],
    ['Minimapa', keys.minimap, 'Clic en él para ir'],
    ['Mover el mapa', '—', 'Arrastrar con el botón derecho o la rueda; borde de la pantalla; dedo: arrastrar'],
    ['Zoom', `${keys.zoomIn} / ${keys.zoomOut}`, 'Rueda / pellizcar'],
    ['Fin del turno', `${keys.endTurn} (dos veces si quedan unidades sin mover)`, 'Botón de arriba: enseña cuántas quedan'],
    ['Esta ayuda', keys.help, 'Menú de partida'],
    ['Repetir el turno enemigo, rendirse', '—', 'Menú de partida'],
  ],
  close: 'Cerrar',
};
