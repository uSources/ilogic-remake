/**
 * Cumple los pasos de una animacion (steps.ts) uno tras otro, pidiendoselos a los puertos del motor
 * (ports/stage.ts) y al sonido. No sabe de three.js: se prueba con puertos falsos.
 */
import type { SoundPort } from '../../../audio/sounds';
import type { GameEvent } from '../../../core/model';
import type { EffectStage, PieceLookup, PieceStage } from '../../ports/stage';
import { stepsOf, type DayLookup } from './eventSteps';
import type { AnimationStep, AnimationStepKind, StepOf } from './steps';

/** A quien se le piden los pasos. */
export interface Stages {
  pieces: PieceStage;
  effects: EffectStage;
  sounds: SoundPort;
}

type StepRunners = { readonly [K in AnimationStepKind]: (step: StepOf<K>, stages: Stages) => Promise<void> | void };

const STEP_RUNNERS: StepRunners = {
  sound: (step, { sounds }) => sounds.play(step.sound),
  clip: (step, { pieces }) => pieces.playClip(step.uid, step.clip),
  walk: (step, { pieces }) => pieces.walk(step.uid, step.from, step.to),
  aim: (step, { pieces }) => pieces.aim(step.uid, step.target),
  recoil: (step, { pieces }) => pieces.recoil(step.uid),
  shake: (step, { pieces }) => pieces.shake(step.uid),
  hop: (step, { pieces }) => pieces.hop(step.uid),
  fall: (step, { pieces }) => pieces.fall(step.uid, step.leavesWreck),
  projectile: (step, { effects }) => effects.projectile(step.from, step.to, step.isArc),
  sparks: (step, { effects }) => effects.sparks(step.at, step.power),
  text: (step, { effects }) => effects.text(step.at, step.text, step.color),
  puff: (step, { effects }) => effects.puff(step.puff, step.at, step.count),
  scorch: (step, { effects }) => effects.scorch(step.at),
  together: async (step, stages) => void (await Promise.all(step.steps.map((inner) => runStep(inner, stages)))),
};

type AnyStepRunner = (step: AnimationStep, stages: Stages) => Promise<void> | void;

async function runStep(step: AnimationStep, stages: Stages): Promise<void> {
  // TypeScript no sabe que la entrada de cada clase recibe un paso de esa misma clase.
  const run = STEP_RUNNERS[step.kind] as AnyStepRunner;
  await run(step, stages);
}

/** Cumple los pasos en orden: cada uno empieza cuando acaba el anterior. */
export async function runSteps(steps: readonly AnimationStep[], stages: Stages): Promise<void> {
  for (const step of steps) await runStep(step, stages);
}

/** Lo que hace falta para enseñar sucesos: los puertos, como estan las piezas y lo del dia (lo que se cobra). */
export interface EventStages extends Stages {
  lookup: PieceLookup;
  day?: DayLookup;
}

/** Anima los sucesos uno tras otro; los pasos de cada uno se deciden al llegarle (con las piezas como esten entonces). */
export async function playEvents(events: readonly GameEvent[], stages: EventStages): Promise<void> {
  for (const event of events) await runSteps(stepsOf(event, stages.lookup, stages.day ?? null), stages);
}
