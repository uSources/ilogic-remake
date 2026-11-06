import type { MatchSettings } from '../../core/model';
import { controlZoneSide, joinSentences, percent, type HelpTexts } from '../help';

const capture = (rules: MatchSettings) =>
  `Capturing takes points: a building has ${rules.capturePoints} (the HQ ${rules.hqCapturePoints}) and each turn the unit removes its HP ÷ 10. If it moves or is destroyed, the progress is lost. At 0 it becomes yours.`;

const counterattack = (rules: MatchSettings) =>
  rules.counterattack
    ? 'When you attack, a defender that survives and can reach you strikes back with the HP it has left. Ranged units neither counter nor get countered.'
    : 'There is no counterattack: striking first is free.';

const veterancy = (rules: MatchSettings) =>
  rules.veterancy
    ? `Veterancy: units that destroy enemies earn stars (1, 3 and 6 kills). Each star gives +${percent(rules.vetBonus)} % hit chance and defence, so a damaged veteran is worth healing rather than replacing. Joining two units keeps the more veteran one.`
    : '';

const attackBonuses = (rules: MatchSettings) =>
  joinSentences(
    rules.bounty > 0 ? `Bounty: destroying a unit pays you ${percent(rules.bounty)} % of its price.` : '',
    rules.flankBonus > 0
      ? `Flanking: against a unit that has already been attacked that day you hit ${percent(rules.flankBonus)} % more. Attack together.`
      : '',
    rules.noHealUnderFire ? 'Under fire: a unit attacked that day does not heal that night (it shows a red mark at the bottom left).' : '',
  );

const armyLimits = (rules: MatchSettings) =>
  joinSentences(
    rules.commandPoints !== null
      ? `Command points: your army can't go over ${rules.commandPoints}. Infantry takes 1 and big vehicles and aircraft up to 5 (shown when buying).`
      : '',
    rules.upkeep > 0
      ? `Upkeep: every round you pay ${percent(rules.upkeep)} % of your units' price. If you can't afford it, you just pay what you have.`
      : '',
  );

const controlPoints = (rules: MatchSettings) =>
  rules.controlPoints > 0
    ? `Control points: ${controlZoneSide(rules)}×${controlZoneSide(rules)} zones marked with a border and a flag (grey if nobody holds them). At the end of the round, if only your units are inside, the zone is yours and pays you ${rules.controlIncome}; if both sides have units inside, it is contested and pays nobody; empty, it keeps paying whoever held it. Fight for them.`
    : '';

const ambush = (rules: MatchSettings) =>
  rules.ambush && rules.fog
    ? 'You can move through your own units. With fog, woods are only visible from next to them: if your path runs into a hidden enemy, the unit stops short (ambush!) and loses its turn.'
    : '';

const weather = (rules: MatchSettings) =>
  rules.weather
    ? 'Weather: every few days it changes (top, next to the day; hover it to see its effects and the forecast). Rain slows vehicles, snow slows everything on the ground and storms slow aircraft; bad weather costs both sides vision and aim.'
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
  title: 'How to play',
  goalTitle: 'Goal',
  goalIntro: 'You win by taking the enemy HQ.',
  ruleLines,
  goalBasics: [
    'Each of your buildings pays you at the end of every round. Spend it on units at your free factories, cities and airports.',
    'Units standing on one of your buildings are repaired at the start of the round. The supply truck repairs adjacent vehicles and aircraft.',
    'Orders: with a unit (or a group) selected, right-click the destination tile (touch: hold it; keyboard: F) and pick “Attack, Capture or Hold there”. Also from the unit’s menu: “Order: …”, then the tile. A flag marks the destination and the unit shows the order’s letter (A, C or D). At the end of each turn, units with an order that you haven’t used carry it out by themselves; once done they stay put waiting for another. “Cancel order” removes it. A box (dragging from outside your units), Shift + click or double-click one (all of its type) picks several units (touch: “Pick several”, at the bottom); right-click a destination takes them there and Ctrl + number makes them that key’s group: give them an order or form a squad (Alfa, Bravo...). Squads appear at the bottom next to “Not moved”: tap one to give it orders or rename it. A squad with the same order moves in formation: fast units wait for slow ones (unless they can hit something in range) and, near the destination or the enemy, each fights on its own. Point at a unit with an order to see what it will do when you end the turn: a pale arrow with its path, a red frame on the unit it will attack or a gold one on the building it will capture (“Show orders” or V: all of them). An order to a whole squad belongs to the squad; to only some of its units, those go detached (orange stripe) and rejoin the squad’s order once done. If you start a capture by hand with a unit that had an order, it keeps capturing until done.',
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
    ['Pick several', '—', 'Drag a box from outside your units; Shift + click adds or removes; touch: “Pick several”'],
    ['All of one type on screen', '—', 'Double-click (or Ctrl + click) one'],
    ['Clear the selection', 'Esc', 'Click an empty tile'],
    [
      'Command the selection (move, attack, capture, board…)',
      'Enter on the destination',
      'Right-click the destination: the pointer shows what it will do',
    ],
    ['Leave it as an order, without moving now', '—', 'Shift + right-click'],
    ['All actions (orders, squad…)', 'F', 'Alt + right-click / hold the destination'],
    ['Order the selection, then pick the tile', 'Q attack · C capture · G hold (X: clear order)', 'Tile menu'],
    ['Go through the selected units', 'Tab', 'Bottom panel: click only that one, Shift removes it, Ctrl its type'],
    ['Make a group (squad) from the selection', 'Ctrl + 1 … 9 (Shift + number: add)', 'Pick several, “Orders”, then “Form squad”'],
    ['Select a group / jump to it', '1 … 9 (twice: camera goes there)', 'Its tray button (twice: jump)'],
    [
      'Give an order',
      'Select it (Enter), F on the destination',
      'Select it (or several: Ctrl + click or box) and right-click the destination (touch: hold the destination)',
    ],
    ['Move the cursor', 'Arrows / WASD', 'Hover / tap'],
    ['Accept', 'Enter / Space', 'Click / second tap'],
    ['Back', 'Esc / Backspace', 'Right-click (nothing selected) / tap outside'],
    ['Inspect a unit’s range', 'Enter on it', 'Right-click / long press (nothing selected)'],
    ['Next unmoved unit', 'Tab', 'Tray at the bottom'],
    ['Enemy threat', 'T', 'Tray button'],
    ['What units with orders will do', 'V', '“Show orders” tray button'],
    ['Minimap', 'M', 'Click it to jump'],
    ['Pan the map', '—', 'Drag with the right button or the wheel; screen edge; touch: drag'],
    ['Zoom', '+ / −', 'Wheel / pinch'],
    ['End turn', 'E (twice if units have not moved)', 'Top button: shows how many are left'],
    ['This help', 'H', 'Game menu'],
    ['Replay the enemy turn, surrender', '—', 'Game menu'],
  ],
  close: 'Close',
};
