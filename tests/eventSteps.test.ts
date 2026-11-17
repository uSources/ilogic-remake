import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { GameEvent, GameEventOf, Pos } from '@core/model';
import { seededRng } from '@core/util/random';
import type { SoundId, SoundPort } from '../src/audio/sounds';
import type { EffectStage, PieceClip, PieceLookup, PieceStage, PuffKind, ShownPiece, Spot } from '../src/view3d/ports/stage';
import { incomeSpotsOf, stepsOf } from '../src/view3d/systems/events/eventSteps';
import type { AnimationStep } from '../src/view3d/systems/events/steps';
import { playEvents, runSteps } from '../src/view3d/systems/events/timeline';
import { blankState, diceFrom, ENEMY, fight, PLAYER, unitTypeNamed } from './helpers';

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

const shown = (motion: ShownPiece['motion']): ShownPiece => ({ motion, isVisible: true });
const hidden = (motion: ShownPiece['motion']): ShownPiece => ({ motion, isVisible: false });

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
    expect(steps[1]).toEqual({ kind: 'sound', sound: 'step_drive' });
    expect(steps[4]).toEqual({ kind: 'walk', uid: SHOOTER, from: { x: 1, y: 0 }, to: { x: 2, y: 0 } });
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
    expect(steps).toContainEqual({ kind: 'sound', sound: 'shot_cannon' });
    expect(steps.at(-1)).toMatchObject({ steps: expect.arrayContaining([expect.objectContaining({ kind: 'text', text: '−30' })]) });
  });

  it('de lejos el disparo va en arco (y suena a artilleria)', () => {
    const steps = stepsOf(attackEvent({}), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }, 2));
    expect(steps).toContainEqual({ kind: 'sound', sound: 'shot_artillery' });
    expect(steps).toContainEqual(
      expect.objectContaining({ kind: 'together', steps: expect.arrayContaining([expect.objectContaining({ isArc: true })]) }),
    );
  });

  it('si cae, estalla y se va (la infanteria, sin restos)', () => {
    const steps = stepsOf(attackEvent({ killed: true }), new FakeLookup({ [SHOOTER]: shown('drive'), [TARGET]: shown('march') }));
    expect(kindsOf(steps).slice(-5)).toEqual(['sound', 'puff', 'puff', 'scorch', 'together(sparks,fall)']);
    expect(steps.at(-1)).toMatchObject({ steps: [expect.anything(), { kind: 'fall', uid: TARGET, leavesWreck: false }] });
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
    expect(stepsOf(captureEvent(5), lookup)[0]).toEqual({ kind: 'sound', sound: 'capture' });
    expect(stepsOf(captureEvent(5), lookup)[1]).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ text: '5/20' })]),
    });
    expect(stepsOf(captureEvent(0), lookup)[0]).toEqual({ kind: 'sound', sound: 'capture_done' });
  });

  it('los sucesos sin entrada no se animan', () => {
    expect(stepsOf({ kind: 'wait', actor: PLAYER, uid: SHOOTER }, new FakeLookup({ [SHOOTER]: shown('march') }))).toEqual([]);
  });
});

/** Apunta cada cosa que se le pide al motor y al sonido, en orden; las que tardan acaban cuando se diga. */
class FakeStages implements PieceStage, EffectStage, SoundPort {
  readonly calls: string[] = [];
  private readonly waiting: (() => void)[] = [];
  holdAnimations = false;

  play(sound: SoundId): void {
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
      'sound:hit',
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
  const income = (team: number): GameEvent => ({ kind: 'income', actor: null, team, amount: 1500, source: 'buildings' });

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
    const mine = incomeSpotsOf(s, PLAYER);
    expect(mine).toContainEqual(expect.objectContaining({ pos: { x: 4, y: 4 } }));
    expect(mine).not.toContainEqual(expect.objectContaining({ pos: { x: 8, y: 8 } }));
    expect(mine.every((spot) => spot.amount > 0)).toBe(true);
  });
});
