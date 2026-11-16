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
    `Órdenes: con una unidad (o un grupo) elegida, «Orden: atacar, capturar o defender allí» en su barra (con el teclado, ${keys.orderAttack}, ${keys.orderCapture} o ${keys.orderDefend}) y luego la casilla. La unidad lleva la letra de su orden (A, C, D; I si va a un sitio en varios turnos). Al señalar una unidad con orden ves lo que hará al terminar el turno: una flecha clara con el camino, un marco rojo sobre la unidad a la que va a atacar o uno dorado sobre el edificio que va a capturar («Ver órdenes» o ${keys.intents}: las de todas). Al terminar cada turno, las que tienen orden y no has usado la cumplen solas; al cumplirla se quedan quietas esperando otra. «Cancelar orden» (o ${keys.orderCancel}) la quita. Para elegir varias: un recuadro arrastrando con el botón izquierdo, Mayúsculas + clic o doble clic en una (todas las de su tipo); con el dedo, «Elegir varias», abajo. Con varias, un clic en una casilla las lleva allí y en un enemigo le atacan; su barra da órdenes y «Formar escuadra» (Alfa, Bravo...). Ctrl + número hace con lo elegido el grupo de esa tecla y el número solo lo vuelve a elegir (dos veces, la cámara va hasta él). Las escuadras salen abajo, junto a «Sin mover»: tócalas para elegirlas. Una escuadra con la misma orden va en formación: las rápidas esperan a las lentas (salvo para atacar algo a tiro) y, cerca del destino o del enemigo, cada una lucha por su cuenta. Una orden a toda la escuadra es de la escuadra; a solo algunas de sus unidades, esas van por su cuenta y, al cumplirla, vuelven solas a la orden de la escuadra. Si empiezas a capturar a mano con una unidad que tenía orden, sigue capturando hasta acabar.`,
  ],
  colorsTitle: 'Colores del mapa',
  // Los colores y los controles de la vista 3D: solo lo que hace hoy (lo que tenia el 2D y aun falta, en docs/IDEAS.md).
  colors: (_keys: KeyLabels) => [
    ['#4fc3ff', 'Adonde puede ir la unidad elegida'],
    ['#ff4d45', 'Objetivos de ataque'],
    ['#ffd447', 'La casilla señalada'],
  ],
  controlsTitle: 'Controles',
  head: ['Acción', 'Teclado', 'Ratón / táctil'],
  controls: (keys: KeyLabels) => [
    ['Elegir una unidad', '—', 'Clic en ella'],
    [
      'Elegir varias',
      '—',
      'Recuadro arrastrando con el botón izquierdo; Mayúsculas + clic suma o quita una; doble clic: todas las de ese tipo que se ven. Con varias, un clic las lleva allí o ataca a un enemigo',
    ],
    [
      'Moverla',
      '—',
      'Clic en una casilla azul (al pasar por encima, la flecha del camino y su fantasma donde llega; el camino sigue al ratón)',
    ],
    [
      'Atacar, capturar, unir, subir',
      '—',
      'Con la unidad elegida, clic en el objetivo: un enemigo en rojo, un edificio (va y captura), un transporte (sube) o una unidad igual (se une)',
    ],
    ['Esperar, reparar, desembarcar, deshacer...', 'Enter (la señalada)', 'La barra junto a la unidad elegida: solo sale lo que vale ahí'],
    ['Soltar la unidad', keys.cancel, 'Clic en ella otra vez'],
    ['Deshacer el último movimiento', keys.cancel, '«Deshacer» en la barra'],
    ['Siguiente unidad sin mover', keys.nextUnit, '—'],
    ['Mover la cámara', 'Flechas / WASD', 'Arrastrar con el botón central, el ratón en el borde o arrastrar con el dedo'],
    ['Girar la cámara', '—', 'Arrastrar con el botón derecho'],
    ['Zoom', `${keys.zoomIn} / ${keys.zoomOut}`, 'Rueda'],
    ['Fin del turno', keys.endTurn, 'Botón de arriba'],
  ],

  close: 'Cerrar',
};
