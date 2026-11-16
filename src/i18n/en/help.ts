import { controlZoneSide, joinSentences, percent, type HelpTexts, type KeyLabels, type RuleFacts } from '../help';

const capture = ({ settings }: RuleFacts) =>
  `Capturing takes points: a building has ${settings.capturePoints} (the HQ ${settings.hqCapturePoints}) and each turn the unit removes its HP ÷ 10. If it moves or is destroyed, the progress is lost. At 0 it becomes yours.`;

const counterattack = ({ on }: RuleFacts) =>
  on('counterattack')
    ? 'When you attack, a defender that survives and can reach you strikes back with the HP it has left. Ranged units neither counter nor get countered.'
    : 'There is no counterattack: striking first is free.';

const veterancy = ({ settings, on }: RuleFacts) =>
  on('veterancy')
    ? `Veterancy: units that destroy enemies earn stars (1, 3 and 6 kills). Each star gives +${percent(settings.vetBonus)} % hit chance and defence, so a damaged veteran is worth healing rather than replacing. Joining two units keeps the more veteran one.`
    : '';

const attackBonuses = ({ settings, on }: RuleFacts) =>
  joinSentences(
    on('bounty') ? `Bounty: destroying a unit pays you ${percent(settings.bounty)} % of its price.` : '',
    on('flank')
      ? `Flanking: against a unit that has already been attacked that day you hit ${percent(settings.flankBonus)} % more. Attack together.`
      : '',
    on('noHealUnderFire') ? 'Under fire: a unit attacked that day does not heal that night (it shows a red mark at the bottom left).' : '',
  );

const armyLimits = ({ settings, on }: RuleFacts) =>
  joinSentences(
    settings.commandPoints !== null
      ? `Command points: your army can't go over ${settings.commandPoints}. Infantry takes 1 and big vehicles and aircraft up to 5 (shown when buying).`
      : '',
    on('upkeep')
      ? `Upkeep: every round you pay ${percent(settings.upkeep)} % of your units' price. If you can't afford it, you just pay what you have.`
      : '',
  );

const controlPoints = ({ settings, on }: RuleFacts) =>
  on('controlPoints')
    ? `Control points: ${controlZoneSide(settings)}×${controlZoneSide(settings)} zones marked with a border and a flag (grey if nobody holds them). At the end of the round, if only your units are inside, the zone is yours and pays you ${settings.controlIncome}; if both sides have units inside, it is contested and pays nobody; empty, it keeps paying whoever held it. Fight for them.`
    : '';

const ambush = ({ on }: RuleFacts) =>
  on('ambush') && !on('noFog')
    ? 'You can move through your own units. With fog, woods are only visible from next to them: if your path runs into a hidden enemy, the unit stops short (ambush!) and loses its turn.'
    : '';

// [CAMBIO] Los edificios propios ven a su alrededor (radios en src/core/content/buildings.json).
const buildingVision = ({ on }: RuleFacts) =>
  on('noFog')
    ? ''
    : 'Your buildings also keep watch around them: the HQ and the stronghold 3 tiles, factories and airports 2, cities and oil wells 1.';

const weather = ({ on }: RuleFacts) =>
  on('weather')
    ? 'Weather: every few days it changes (top, next to the day; hover it to see its effects and the forecast). Rain slows vehicles, snow slows everything on the ground and storms slow aircraft; bad weather costs both sides vision and aim.'
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
  title: 'How to play',
  goalTitle: 'Goal',
  goalIntro: 'You win by taking the enemy HQ.',
  ruleLines,
  goalBasics: (keys: KeyLabels) => [
    'Each of your buildings pays you at the end of every round. Spend it on units at your free factories, cities and airports.',
    'Units standing on one of your buildings are repaired at the start of the round. The supply truck repairs adjacent vehicles and aircraft.',
    `Orders: with a unit (or a group) selected, right-click the destination tile (touch: hold it; keyboard: ${keys.orderHere}) and pick “Attack, Capture or Hold there”. Also from the unit’s menu: “Order: …”, then the tile. A flag marks the destination and the unit shows the order’s letter (A, C or D). At the end of each turn, units with an order that you haven’t used carry it out by themselves; once done they stay put waiting for another. “Cancel order” removes it. A box (dragging from outside your units), Shift + click or double-click one (all of its type) picks several units (touch: “Pick several”, at the bottom); right-click a destination takes them there and Ctrl + number makes them that key’s group: give them an order or form a squad (Alfa, Bravo...). Squads appear at the bottom next to “Not moved”: tap one to give it orders or rename it. A squad with the same order moves in formation: fast units wait for slow ones (unless they can hit something in range) and, near the destination or the enemy, each fights on its own. Point at a unit with an order to see what it will do when you end the turn: a pale arrow with its path, a red frame on the unit it will attack or a gold one on the building it will capture (“Show orders” or ${keys.intents}: all of them). An order to a whole squad belongs to the squad; to only some of its units, those go detached (orange stripe) and rejoin the squad’s order once done. If you start a capture by hand with a unit that had an order, it keeps capturing until done.`,
  ],
  colorsTitle: 'Map colours',
  // The 3D view's colors and controls: only what it does today (what the 2D had and is still missing, in docs/IDEAS.md).
  colors: (_keys: KeyLabels) => [
    ['#4fc3ff', 'Where the selected unit can move'],
    ['#ff4d45', 'Attack targets'],
    ['#ffd447', 'The pointed tile'],
  ],
  controlsTitle: 'Controls',
  head: ['Action', 'Keyboard', 'Mouse / touch'],
  controls: (keys: KeyLabels) => [
    ['Select a unit', '—', 'Click it'],
    [
      'Select several',
      '—',
      'Drag a box with the left button; Shift + click adds or removes one; double-click: all of that type on screen. With several, a click takes them there or attacks an enemy',
    ],
    ['Move it', '—', 'Click a blue tile (hover to see the path arrow and its ghost where it ends; the path follows the mouse)'],
    [
      'Attack, capture, join, board',
      '—',
      'With the unit selected, click the target: a red enemy, a building (goes and captures), a transport (boards) or a matching unit (joins)',
    ],
    ['Wait, repair, unload, undo...', 'Enter (the highlighted one)', 'The bar next to the selected unit: only what is valid there'],
    ['Let go of the unit', keys.cancel, 'Click it again'],
    ['Undo the last move', keys.cancel, '“Undo” in the bar'],
    ['Next unit that has not moved', keys.nextUnit, '—'],
    ['Move the camera', 'Arrows / WASD', 'Drag with the middle button, mouse at the edge or drag with a finger'],
    ['Turn the camera', '—', 'Drag with the right button'],
    ['Zoom', `${keys.zoomIn} / ${keys.zoomOut}`, 'Wheel'],
    ['End turn', keys.endTurn, 'Top button'],
  ],

  close: 'Close',
};
