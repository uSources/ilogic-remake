import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { GameEvent, GameEventOf, IncomeSource, Pos } from '@core/model';
import { seededRng } from '@core/util/random';
import type { SoundName } from '../src/audio/sounds';
import type { EffectStage, PieceClip, PieceLookup, PieceStage, PuffKind, ShownPiece, SoundStage, Spot } from '../src/view3d/ports/stage';
import { incomeSpotsOf, stepsOf, type BoardLookup } from '../src/view3d/systems/events/eventSteps';
import type { Surface } from '../src/view3d/systems/sound/soundCues';
import type { AnimationStep } from '../src/view3d/systems/events/steps';
import { playEvents, runSteps } from '../src/view3d/systems/events/timeline';
import { act, blankState, diceFrom, ENEMY, fight, PLAYER, unitTypeNamed } from './helpers';

/** Los sucesos animados sin navegador: que pasos lleva cada uno (datos) y que se pide a los puertos al cumplirlos. */

const SHOOTER = 1;
const TARGET = 2;

/** Las piezas que hay, como se ven y a que distancia se disparan. */
class FakeLookup implements PieceLookup {
  constructor(
    private readonly pieces: Readonly<Record<number, ShownPiece>>,
    private readonly distance = 1,
  ) {}
  pieceOf(uid: number): ShownPiece | null {
    return this.pieces[uid] ?? null;
  }
  shotDistance(): number {
    return this.distance;
  }
}

/** Una pieza que se ve; sin clase de unidad conocida, suena como las de su forma de moverse. */
const shown = (motion: ShownPiece['motion'], unitType = 'Unknown'): ShownPiece => ({ unitType, motion, isVisible: true });
const hidden = (motion: ShownPiece['motion'], unitType = 'Unknown'): ShownPiece => ({ unitType, motion, isVisible: false });

const kindsOf = (steps: readonly AnimationStep[]): string[] =>
  steps.map((step) => (step.kind === 'together' ? `together(${kindsOf(step.steps).join(',')})` : step.kind));

function moveEvent(path: Pos[]): GameEvent {
  return { kind: 'move', actor: PLAYER, uid: SHOOTER, path };
}

/** Un ataque de verdad (por las reglas) con el resultado que se le diga. */
function attackEvent(result: Partial<Pick<GameEventOf<'attack'>, 'damage' | 'killed' | 'counter' | 'attackerKilled'>>): GameEvent {
  const s = blankState();
  const attacker = newUnit(s, unitTypeNamed('Tank'), PLAYER, { x: 5, y: 5 });
  const defender = newUnit(s, unitTypeNamed('Soldier'), ENEMY, { x: 6, y: 5 });
  const event = fight(s, attacker, defender, diceFrom(seededRng(1)));
  return { ...event, attacker: SHOOTER, target: TARGET, damage: 30, killed: false, counter: 0, attackerKilled: false, ...result };
}

function captureEvent(left: number): GameEvent {
  return { kind: 'capture', actor: PLAYER, uid: SHOOTER, at: { x: 3, y: 3 }, owner: PLAYER, left, total: 20 };
}

describe('pasos de cada suceso', () => {
  it('moverse: marcha, un paso con su sonido por casilla y vuelve a quedarse quieta', () => {
    const steps = stepsOf(
      moveEvent([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
      new FakeLookup({ [SHOOTER]: shown('drive') }),
    );
    expect(kindsOf(steps)).toEqual(['clip', 'sound', 'walk', 'sound', 'walk', 'clip']);
    expect(steps[1]).toEqual({ kind: 'sound', sound: 'step_drive', at: { kind: 'feet', uid: SHOOTER } });
    expect(steps[4]).toEqual({ kind: 'walk', uid: SHOOTER, from: { x: 1, y: 0 }, to: { x: 2, y: 0 } });
  });

  it('el jeep arranca el motor antes de la primera casilla; el tanque no', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const jeep = stepsOf(moveEvent(path), new FakeLookup({ [SHOOTER]: shown('drive', 'Car') }));
    expect(kindsOf(jeep)).toEqual(['clip', 'sound', 'sound', 'walk', 'clip']);
    expect(jeep[1]).toEqual({ kind: 'sound', sound: 'engine_start_jeep', at: { kind: 'feet', uid: SHOOTER } });
    expect(jeep[2]).toMatchObject({ kind: 'sound', sound: 'step_jeep' });
    const tank = stepsOf(moveEvent(path), new FakeLookup({ [SHOOTER]: shown('drive', 'Tank') }));
    expect(kindsOf(tank)).toEqual(['clip', 'sound', 'walk', 'clip']);
  });

  it('lo que la niebla tapa no se anima', () => {
    const lookup = new FakeLookup({ [SHOOTER]: hidden('march') });
    expect(
      stepsOf(
        moveEvent([
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]),
        lookup,
      ),
    ).toEqual([]);
    expect(stepsOf(captureEvent(5), lookup)).toEqual([]);
  });

  it('atacar: apunta, dispara, el blanco recibe el golpe', () => {
    const steps = stepsOf(attackEvent({}), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }));
    expect(kindsOf(steps)).toEqual([
      'lifeShown',
      'lifeShown',
      'aim',
      'sound',
      'puff',
      'together(recoil,projectile)',
      'sound',
      'together(sparks,shake,lifeLoss,text)',
    ]);
    expect(steps).toContainEqual({ kind: 'sound', sound: 'shot_cannon', at: { kind: 'muzzle', uid: SHOOTER } });
    expect(steps).toContainEqual({ kind: 'sound', sound: 'hit_infantry', at: { kind: 'muzzle', uid: TARGET } });
    expect(steps.at(-1)).toMatchObject({ steps: expect.arrayContaining([expect.objectContaining({ kind: 'text', text: '−30' })]) });
  });

  it('de lejos el disparo va en arco y el proyectil silba al caer', () => {
    const steps = stepsOf(attackEvent({}), new FakeLookup({ [SHOOTER]: shown('drive', 'Artillery'), [TARGET]: shown('march') }, 2));
    expect(steps).toContainEqual({ kind: 'sound', sound: 'shot_artillery', at: { kind: 'muzzle', uid: SHOOTER } });
    expect(steps).toContainEqual({ kind: 'sound', sound: 'shell_incoming', at: { kind: 'muzzle', uid: TARGET } });
    expect(steps).toContainEqual(
      expect.objectContaining({ kind: 'together', steps: expect.arrayContaining([expect.objectContaining({ isArc: true })]) }),
    );
  });

  it('si cae, estalla y se va (la infanteria, sin restos)', () => {
    const steps = stepsOf(attackEvent({ killed: true }), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }));
    expect(kindsOf(steps).slice(-4)).toEqual(['sound', 'scorch', 'together(explosion,sparks,fall)', 'puff']);
    expect(steps.at(-2)).toMatchObject({
      steps: [{ kind: 'explosion', size: 0.65 }, expect.anything(), { kind: 'fall', uid: TARGET, leavesWreck: false }],
    });
  });

  it('la vida baja desde la de antes del combate: el blanco con el golpe, el atacante con el contraataque', () => {
    const steps = stepsOf(attackEvent({ counter: 10 }), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }));
    const drains = steps.flatMap((step) => (step.kind === 'together' ? step.steps : [step])).filter((step) => step.kind === 'lifeLoss');
    expect(drains).toEqual([
      { kind: 'lifeLoss', uid: TARGET, from: 100, to: 70 },
      { kind: 'lifeLoss', uid: SHOOTER, from: 100, to: 90 },
    ]);
  });

  it('el contraataque va despues, del blanco al atacante', () => {
    const steps = stepsOf(attackEvent({ counter: 10 }), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }));
    const aims = steps.filter((step) => step.kind === 'aim');
    expect(aims).toEqual([
      { kind: 'aim', uid: SHOOTER, target: TARGET },
      { kind: 'aim', uid: TARGET, target: SHOOTER },
    ]);
  });

  it('un atacante que no se ve no dispara, pero el golpe se ve', () => {
    const steps = stepsOf(attackEvent({}), new FakeLookup({ [SHOOTER]: hidden('drive'), [TARGET]: shown('march') }));
    expect(kindsOf(steps)).toEqual(['lifeShown', 'lifeShown', 'sound', 'together(sparks,shake,lifeLoss,text)']);
  });

  it('capturar: lo que le queda, o el edificio ya es suyo', () => {
    const lookup = new FakeLookup({ [SHOOTER]: shown('march') });
    expect(stepsOf(captureEvent(5), lookup)[0]).toEqual({
      kind: 'sound',
      sound: 'capture',
      at: expect.objectContaining({ kind: 'tile', pos: { x: 3, y: 3 } }),
    });
    expect(stepsOf(captureEvent(5), lookup)[1]).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ text: '5/20' })]),
    });
    expect(stepsOf(captureEvent(0), lookup)[0]).toEqual({
      kind: 'sound',
      sound: 'capture_done',
      at: expect.objectContaining({ kind: 'tile', pos: { x: 3, y: 3 } }),
    });
  });

  it('los sucesos sin entrada no se animan', () => {
    expect(stepsOf({ kind: 'wait', actor: PLAYER, uid: SHOOTER }, new FakeLookup({ [SHOOTER]: shown('march') }))).toEqual([]);
  });
});

/** Apunta cada cosa que se le pide al motor y al sonido, en orden; las que tardan acaban cuando se diga. */
class FakeStages implements PieceStage, EffectStage, SoundStage {
  readonly calls: string[] = [];
  private readonly waiting: (() => void)[] = [];
  holdAnimations = false;

  play(sound: SoundName): void {
    this.calls.push(`sound:${sound}`);
  }
  playClip(uid: number, clip: PieceClip): void {
    this.calls.push(`clip:${uid}:${clip}`);
  }
  walk(uid: number, _from: Pos, to: Pos): Promise<void> {
    return this.takes(`walk:${uid}:${to.x},${to.y}`);
  }
  aim(uid: number, target: number): Promise<void> {
    return this.takes(`aim:${uid}>${target}`);
  }
  recoil(uid: number): Promise<void> {
    return this.takes(`recoil:${uid}`);
  }
  shake(uid: number): Promise<void> {
    return this.takes(`shake:${uid}`);
  }
  showLife(uid: number, life: number): void {
    this.calls.push(`lifeShown:${uid}:${life}`);
  }
  drainLife(uid: number, from: number, to: number): Promise<void> {
    return this.takes(`life:${uid}:${from}>${to}`);
  }
  hop(uid: number): Promise<void> {
    return this.takes(`hop:${uid}`);
  }
  fall(uid: number): Promise<void> {
    return this.takes(`fall:${uid}`);
  }
  projectile(): Promise<void> {
    return this.takes('projectile');
  }
  sparks(): Promise<void> {
    return this.takes('sparks');
  }
  explosion(): Promise<void> {
    return this.takes('explosion');
  }
  text(_at: Spot, text: string): Promise<void> {
    return this.takes(`text:${text}`);
  }
  puff(kind: PuffKind): void {
    this.calls.push(`puff:${kind}`);
  }
  scorch(): void {
    this.calls.push('scorch');
  }
  finishAll(): void {
    for (const finish of this.waiting.splice(0)) finish();
  }
  private takes(call: string): Promise<void> {
    this.calls.push(call);
    if (!this.holdAnimations) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push(resolve));
  }
}

const stagesOf = (fake: FakeStages) => ({ pieces: fake, effects: fake, sounds: fake });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('la linea de tiempo', () => {
  it('cumple los pasos en orden', async () => {
    const fake = new FakeStages();
    await runSteps(
      [
        { kind: 'clip', uid: 1, clip: 'drive' },
        { kind: 'sound', sound: 'step_march' },
        { kind: 'walk', uid: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      ],
      stagesOf(fake),
    );
    expect(fake.calls).toEqual(['clip:1:drive', 'sound:step_march', 'walk:1:1,0']);
  });

  it('cada paso espera al anterior; los de `together` empiezan a la vez', async () => {
    const fake = new FakeStages();
    fake.holdAnimations = true;
    const running = runSteps(
      [
        { kind: 'hop', uid: 1 },
        {
          kind: 'together',
          steps: [
            { kind: 'shake', uid: 1 },
            { kind: 'sparks', at: { kind: 'muzzle', uid: 1 }, power: 1 },
          ],
        },
      ],
      stagesOf(fake),
    );
    await settle();
    expect(fake.calls).toEqual(['hop:1']);
    fake.finishAll();
    await settle();
    expect(fake.calls).toEqual(['hop:1', 'shake:1', 'sparks']);
    fake.finishAll();
    await running;
  });

  it('un ataque entero llega al motor como pasos', async () => {
    const fake = new FakeStages();
    const lookup = new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') });
    await playEvents([attackEvent({})], { ...stagesOf(fake), lookup });
    expect(fake.calls).toEqual([
      `lifeShown:${TARGET}:100`,
      `lifeShown:${SHOOTER}:100`,
      `aim:${SHOOTER}>${TARGET}`,
      'sound:shot_cannon',
      'puff:gunSmoke',
      `recoil:${SHOOTER}`,
      'projectile',
      'sound:hit_infantry',
      'sparks',
      `shake:${TARGET}`,
      `life:${TARGET}:100>70`,
      'text:−30',
    ]);
  });
});

describe('lo que se cobra al empezar el dia', () => {
  const lookup = new FakeLookup({});
  const spots = [
    { pos: { x: 1, y: 1 }, amount: 1000 },
    { pos: { x: 3, y: 2 }, amount: 500 },
  ];
  const day = { viewer: PLAYER, incomeSpots: () => spots };
  const income = (team: number, source: IncomeSource = 'buildings'): GameEvent => ({
    kind: 'income',
    actor: null,
    team,
    amount: 1500,
    source,
  });

  it('lo tuyo: una chapa «+N» sobre cada edificio que cobra, todas a la vez', () => {
    const steps = stepsOf(income(PLAYER), lookup, day);
    expect(kindsOf(steps)).toEqual(['sound', 'together(text,text)']);
    expect(steps.at(-1)).toMatchObject({ steps: [{ text: '+1000' }, { text: '+500', at: { kind: 'tile', pos: { x: 3, y: 2 } } }] });
  });

  it('lo de los demas no se enseña (ni sin saber quien mira)', () => {
    expect(stepsOf(income(ENEMY), lookup, day)).toEqual([]);
    expect(stepsOf(income(PLAYER), lookup)).toEqual([]);
  });

  it('cada edificio propio que paga, con lo suyo', () => {
    const s = blankState({ fog: false });
    s.buildings.push({ type: 'City', owner: PLAYER, x: 4, y: 4, capture: null }, { type: 'City', owner: ENEMY, x: 8, y: 8, capture: null });
    const mine = incomeSpotsOf(s, PLAYER, 'buildings');
    expect(mine).toContainEqual(expect.objectContaining({ pos: { x: 4, y: 4 } }));
    expect(mine).not.toContainEqual(expect.objectContaining({ pos: { x: 8, y: 8 } }));
    expect(mine.every((spot) => spot.amount > 0)).toBe(true);
  });

  it('[CAMBIO] lo de los puntos de control, aparte: una chapa sobre cada uno que te ha pagado', () => {
    const steps = stepsOf(income(PLAYER, 'controlPoints'), lookup, day);
    expect(kindsOf(steps)).toEqual(['sound', 'together(text,text)']);
  });

  it('[CAMBIO] pagan los puntos propios sin disputar (los del rival y los disputados, no)', () => {
    const s = blankState({ fog: false, controlPoints: 3, controlRadius: 1, controlIncome: 1000 });
    s.controlPoints = [
      { x: 4, y: 4, owner: PLAYER },
      { x: 12, y: 4, owner: PLAYER },
      { x: 4, y: 12, owner: ENEMY },
    ];
    newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 12, y: 5 });
    newUnit(s, unitTypeNamed('Soldier'), ENEMY, { x: 13, y: 4 });
    expect(incomeSpotsOf(s, PLAYER, 'controlPoints')).toEqual([{ pos: { x: 4, y: 4 }, amount: 1000 }]);
    expect(incomeSpotsOf(s, ENEMY, 'controlPoints')).toEqual([{ pos: { x: 4, y: 12 }, amount: 1000 }]);
  });

  it('[CAMBIO] con la partida como queda tras el fin de ronda (la que se anima), las chapas suman lo cobrado', () => {
    const s = blankState({ fog: false, controlPoints: 2, controlRadius: 1, controlIncome: 1000 });
    s.controlPoints = [
      { x: 4, y: 4, owner: null },
      { x: 12, y: 4, owner: PLAYER },
    ];
    // El de nadie se gana al acabar la ronda y ya paga; el propio, disputado, no.
    newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 4, y: 4 });
    newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 12, y: 5 });
    newUnit(s, unitTypeNamed('Soldier'), ENEMY, { x: 13, y: 4 });
    const events = act(s, ENEMY, { kind: 'endTurn' });
    const paid = events.find((event) => event.kind === 'income' && event.team === PLAYER && event.source === 'controlPoints');
    const spots = incomeSpotsOf(s, PLAYER, 'controlPoints');
    expect(spots.map((spot) => spot.pos)).toEqual([{ x: 4, y: 4 }]);
    expect(paid).toMatchObject({ amount: spots.reduce((total, spot) => total + spot.amount, 0) });
  });
});

describe('lo que suena con sitio, sin delatar lo que tapa la niebla', () => {
  const board = (seen: boolean, surface: Surface = 'grass'): BoardLookup => ({
    surfaceAt: () => surface,
    isSeen: () => seen,
    motionOf: () => 'drive',
  });
  const spawn: GameEvent = { kind: 'spawn', actor: ENEMY, uid: 9, unitType: 'Tank', team: ENEMY, at: { x: 2, y: 2 } };

  it('una compra suena en su casilla, tambien la del rival, si se ve', () => {
    const steps = stepsOf(spawn, new FakeLookup({}), null, board(true));
    expect(steps).toEqual([{ kind: 'sound', sound: 'spawn_vehicle', at: { kind: 'tile', pos: { x: 2, y: 2 }, lift: 0.3 } }]);
    expect(stepsOf(spawn, new FakeLookup({}), null, board(false))).toEqual([]);
  });

  it('los pasos suenan segun el suelo de cada casilla', () => {
    const move: GameEvent = {
      kind: 'move',
      actor: PLAYER,
      uid: SHOOTER,
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    const steps = stepsOf(move, new FakeLookup({ [SHOOTER]: shown('march', 'Soldier') }), null, board(true, 'snow'));
    expect(steps).toContainEqual({ kind: 'sound', sound: 'step_snow', at: { kind: 'feet', uid: SHOOTER } });
  });

  it('esperar solo suena si es de quien mira', () => {
    const wait = (actor: number): GameEvent => ({ kind: 'wait', actor, uid: SHOOTER });
    const lookup = new FakeLookup({ [SHOOTER]: shown('march') });
    const day = { viewer: PLAYER, incomeSpots: () => [] };
    expect(stepsOf(wait(PLAYER), lookup, day)).toEqual([{ kind: 'sound', sound: 'wait', at: { kind: 'feet', uid: SHOOTER } }]);
    expect(stepsOf(wait(ENEMY), lookup, day)).toEqual([]);
  });
});
