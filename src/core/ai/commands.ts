/**
 * [CAMBIO] Ordenes con destino del jugador (ver Command en types.ts): las cumple la misma IA que el
 * enemigo al terminar el turno (assistTurn), o al darlas (commandNow), y se pueden prever sin tocar
 * la partida (previewCommands, para las flechas de intencion).
 */
import { AI, UNIT } from '../data';
import { manhattan, samePos, seededRng } from '../geom';
import { moveRange } from '../rules/movement';
import { buildingAt, teamUnits, unitById } from '../rules/queries';
import { wait } from '../rules/unitActions';
import { visibility } from '../rules/visibility';
import { effectiveCommand, finishCommand } from '../squads';
import type { GameEvent, GameState, Pos, Rng, Team } from '../types';
import { aiCtx, doMove, needsRepair, type AiCtx } from './context';
import { commandOrder, commandStep, formation, formationFrom } from './formation';
import { captureHere, retreat, tryAttack } from './tactics';

/**
 * [CAMBIO] Ordenes del jugador (al terminar su turno): las unidades con orden con destino
 * (Unit.command) que siguen sin usar la cumplen. No toca las demas unidades ni compra nada.
 * Devuelve los uid de las que han cumplido su orden este turno (se quedan esperando otra).
 */
export function* assistTurn(s: GameState, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, number[]> {
  const ctx = aiCtx(team);
  const done: number[] = [];
  for (const u of commandOrder(
    s,
    teamUnits(s, ctx.me).filter((u) => effectiveCommand(s, u)),
  ))
    if (yield* unitCommandTurn(s, ctx, u.uid, rng)) done.push(u.uid);
  return done;
}

/** [CAMBIO] La unidad del jugador empieza ya su orden recien dada (si aun no se ha movido). */
export function* commandNow(s: GameState, uid: number, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, boolean> {
  return yield* unitCommandTurn(s, aiCtx(team), uid, rng);
}

/**
 * [CAMBIO] Turno de una unidad de `team` con orden con destino (ver Command en types.ts).
 * Devuelve true si la orden se ha cumplido (y la quita: la unidad se queda esperando).
 */
export function* commandTurn(s: GameState, uid: number, rng: Rng, team: Team = 0): Generator<GameEvent, boolean> {
  return yield* unitCommandTurn(s, aiCtx(team), uid, rng);
}

/** Lo de commandTurn, dentro de un turno ya empezado (`ctx`). */
function* unitCommandTurn(s: GameState, ctx: AiCtx, uid: number, rng: Rng): Generator<GameEvent, boolean> {
  const u = unitById(s, uid);
  const c = u && effectiveCommand(s, u);
  if (!u || !c || !u.active || u.carrier !== null || u.life <= 0) return false;
  const { kind, at } = c;
  const finish = () => {
    finishCommand(s, u);
    return true;
  };
  if (kind === 'capture') {
    const b = buildingAt(s, at.x, at.y);
    if (!b || b.owner === ctx.me || !UNIT.cancapt[u.type]) return finish();
    if (samePos(u, at)) {
      yield* captureHere(s, u);
      wait(u);
      return buildingAt(s, at.x, at.y)?.owner === ctx.me ? finish() : false;
    }
    const range = moveRange(s, u);
    if (yield* doMove(s, u, commandStep(s, ctx, u, at, range, formation(s, ctx, u)), range)) return false;
    if (samePos(u, at)) {
      yield* captureHere(s, u);
    } else if (!(yield* tryAttack(s, ctx, u, moveRange(s, u), rng, { stay: true, chase: false }))) wait(u);
    wait(u);
    return buildingAt(s, at.x, at.y)?.owner === ctx.me ? finish() : false;
  }
  const range = moveRange(s, u);
  if (needsRepair(u) && (yield* retreat(s, ctx, u, range))) return false;
  const near = (t: Pos) => manhattan(t, at) <= AI.GUARDRADIUS;
  const f = formation(s, ctx, u);
  const from = formationFrom(f);
  if (kind === 'defend') {
    if (yield* tryAttack(s, ctx, u, range, rng, { zone: near, from })) return false;
    if (manhattan(u, at) > 1) yield* doMove(s, u, commandStep(s, ctx, u, at, range, f), range);
    wait(u);
    return false;
  }
  // Atacar aqui: dispara a lo que tenga a tiro por el camino, sin perseguir, y avanza.
  if (yield* tryAttack(s, ctx, u, range, rng, { chase: false, from })) return false;
  if (manhattan(u, at) > 1) {
    if (yield* doMove(s, u, commandStep(s, ctx, u, at, range, f), range)) return false;
    if (!(yield* tryAttack(s, ctx, u, moveRange(s, u), rng, { stay: true, chase: false }))) wait(u);
    return false;
  }
  // Ha llegado: si no quedan enemigos a la vista cerca, la orden esta cumplida.
  wait(u);
  const vis = visibility(s, ctx.me);
  const left = s.units.some((t) => t.team !== ctx.me && t.carrier === null && vis[t.x]![t.y] && near(t));
  return left ? false : finish();
}

/** [CAMBIO] Lo que hara una unidad con orden al terminar el turno (ver previewCommands). */
export interface CommandIntent {
  /** Camino de este turno, desde donde esta (vacio si no se mueve). */
  path: Pos[];
  /** Casilla de la unidad a la que va a atacar. */
  attack?: Pos;
  /** Edificio que va a capturar (o seguir capturando). */
  capture?: Pos;
  /** Al final del camino se une a otra unidad igual (para curarse). */
  merge?: boolean;
}

/** Semilla fija de la prevision: la misma partida da siempre la misma prevision. */
const PREVIEW_SEED = 0x1d0c;

/**
 * [CAMBIO] Flechas de intencion: simula assistTurn sobre una copia de la partida y devuelve, por uid,
 * lo que hara cada unidad del bando con orden al terminar el turno. No toca `s`. Solo usa lo que el
 * bando ve: los enemigos escondidos se quitan de la copia antes de simular, asi la prevision no
 * puede delatarlos (ni como objetivo, ni por un camino que los rodee o una emboscada).
 * Es una prevision: con enemigos escondidos o la suerte del combate, el turno real puede variar.
 */
export function previewCommands(s: GameState, team: Team = 0, seed = PREVIEW_SEED): Map<number, CommandIntent> {
  const out = new Map<number, CommandIntent>();
  const actors = s.units.filter((u) => u.team === team && effectiveCommand(s, u) && u.active && u.carrier === null && u.life > 0);
  if (!actors.length) return out;
  const copy = structuredClone(s);
  const vis = visibility(copy, team);
  const hidden = new Set(copy.units.filter((u) => u.team !== team && u.carrier === null && !vis[u.x]![u.y]).map((u) => u.uid));
  if (hidden.size) copy.units = copy.units.filter((u) => !hidden.has(u.uid) && !(u.carrier !== null && hidden.has(u.carrier)));
  for (const u of actors) out.set(u.uid, { path: [] });
  const it = assistTurn(copy, seededRng(seed), team);
  for (let r = it.next(); !r.done; r = it.next()) {
    const ev = r.value;
    switch (ev.kind) {
      case 'move':
      case 'merge': {
        const i = out.get(ev.uid);
        if (!i) break;
        i.path = i.path.length ? [...i.path, ...ev.path.slice(1)] : ev.path.map((p) => ({ x: p.x, y: p.y }));
        if (ev.kind === 'merge') i.merge = true;
        break;
      }
      case 'attack': {
        const i = out.get(ev.attacker);
        if (i && !i.attack) i.attack = { x: ev.target.x, y: ev.target.y };
        break;
      }
      case 'capture': {
        const i = out.get(ev.uid);
        if (i) i.capture = { x: ev.at.x, y: ev.at.y };
        break;
      }
      default:
        break;
    }
  }
  return out;
}
