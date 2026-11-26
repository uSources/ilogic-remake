import { joinSentences, percent, type HelpTexts, type KeyLabels, type RuleFacts } from '../help';

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
    `Orders: with a unit (or a group) selected, pick “Order: attack, capture or hold there” in its wheel (right-click), or right-click the tile itself (keyboard: ${keys.orderAttack}, ${keys.orderCapture} or ${keys.orderDefend}), then the tile. To travel somewhere over several turns, tap a free tile out of its reach: it sets off now and keeps going on its own every turn (moving it yourself cancels it). The unit shows its order’s letter (A, C, D; I when travelling over several turns) and a blue flag marks the tile it is heading to, showing the unit’s picture or, if it goes with its squad, the squad’s key. Point at a unit with an order to see what it will do when you end the turn: a pale arrow with its path, a red frame on the unit it will attack or a gold one on the building it will capture (“Show orders” or ${keys.intents}: all of them). At the end of each turn, units with an order that you haven’t used carry it out by themselves; once done they stay put waiting for another. “Cancel order” (or ${keys.orderCancel}) removes it. To pick several: drag a box with the left button, Shift + click or double-click one (all of its type); touch: “Pick several” in the wheel (press and hold). With several, a click on a tile takes them there and on an enemy they attack it; their bar gives orders and “Form squad” (Alfa, Bravo...). Ctrl + number makes the selection that key’s group and the number alone picks it again (twice: the camera goes to it). To pick a whole squad: its key (1-9) or “Pick its squad” in the wheel of one of its units. A squad with the same order moves in formation: fast units wait for slow ones (unless they can hit something in range) and, near the destination or the enemy, each fights on its own. An order to a whole squad belongs to the squad; to only some of its units, those go on their own and rejoin the squad’s order once done. If you start a capture by hand with a unit that had an order, it keeps capturing until done.`,
  ],
  colorsTitle: 'Map colours',
  // The 3D view's colors and controls: only what it does today (what the 2D had and is still missing, in docs/IDEAS.md).
  colors: (_keys: KeyLabels) => [
    ['#2e7dff', 'Where the selected unit can move (blue slabs with a light edge)'],
    ['#ff4d45', 'How far it attacks (red frames; a bullseye on enemies in range)'],
    [
      '#d8262a',
      'Enemy threat: where enemies can reach (red veil with an edge); pointing at one of your units, a red arrow from each enemy that could attack it',
    ],
    [
      '#ffd447',
      'The pointed tile (four yellow corners); hover a moment and its card shows its defense, what it costs to enter and what it pays',
    ],
  ],
  controlsTitle: 'Controls',
  unitsTitle: 'Units',
  topicNotes: {
    goal: 'How to win and the rules of the match',
    colors: 'What each colour on the board means',
    controls: 'Keyboard, mouse and touch',
    units: 'Price, movement, range and vision',
  },
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
    [
      'Attack forecast',
      'Alt: the full card',
      'Hover the enemy: a chip with the damage above it (gold if it will most likely be destroyed, with a skull and % if it can fall) and one with the counterattack at your unit’s feet; its life bar shows in stripes what it would lose',
    ],
    [
      'Buy',
      '—',
      'Click a free factory, city or airport of yours: what it builds shows up on the right with its price, and a click (or Enter) buys. What you cannot afford is greyed out with what is missing; at the bottom, the highlighted one shows how it moves, its range, what it is strong and weak against and how much you will have left',
    ],
    [
      'Capture when already on it, repair, unload',
      'Enter (the highlighted one)',
      'The chips next to the selected unit: they only show up when there is something like that to do',
    ],
    [
      'Wait',
      '—',
      'On its own: after moving, if it can do nothing else; if it can, when you leave it (click elsewhere, on it or on another unit)',
    ],
    ['Orders, squads, wait there, disband', '—', 'The wheel: right-click (or press and hold) the unit or the group'],
    [
      'Order on a tile',
      keys.orderHere,
      'Right-click the tile with something selected: attack the enemy, capture the building or hold there',
    ],
    ['Let go of the unit', keys.cancel, 'Click it again'],
    ['Undo the last move', `Ctrl+Z (or ${keys.cancel} while selected)`, '“Undo” in the wheel'],
    ['Next unit that has not moved', keys.nextUnit, '“N not moved”, under “End turn”'],
    ['Tile details', 'Alt (all of them)', 'Bottom left, when you point at it (touch: tap it)'],
    ['See where enemies can reach', keys.threat, '“Show enemy threat” in the pause (top right)'],
    ['Move the camera', 'Arrows / WASD', 'Drag with the middle button, mouse at the edge or drag with a finger'],
    ['Turn the camera', '—', 'Drag with the right button'],
    ['Zoom', `${keys.zoomIn} / ${keys.zoomOut}`, 'Wheel'],
    [
      'Minimap',
      `${keys.minimap} (open or close)`,
      'Click or drag on it: the camera goes there. The white box is what you see. It grows with the mouse over it; by touch, the first tap enlarges it and the next one moves the camera',
    ],
    [
      'End turn',
      keys.endTurn,
      'Bottom-right button. With units that have not moved, the first press makes them hop so you see them and asks again (“End anyway?”)',
    ],
    [
      'Two people on this screen',
      'Enter (on the notice)',
      'Rival “Another person” in Skirmish: when your turn ends the game is covered until the other one presses “Start my turn”. Each one only sees their own side and finds the camera where they left it',
    ],
  ],

  close: 'Close',
};
