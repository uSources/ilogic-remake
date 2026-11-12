/**
 * Lo que pide quien crea una sala (`POST /rooms`): una escaramuza (lo mismo que elige la pantalla,
 * `SkirmishChoices`) y, si quiere, un reloj por turno y cuanto esperar a los que faltan antes de
 * darles a la IA. Llega como JSON de fuera, asi que se comprueba campo a campo, como el protocolo
 * comprueba cada mensaje (`CLIENT_MESSAGE_SHAPES`): una tabla con una comprobacion por campo, que
 * el tipo exige completa. Los temas y los generales tienen que existir en el contenido; las reglas,
 * valer segun `SETTINGS_SCHEMA`.
 */
import { isEntryId, type GameContent } from '@core/content';
import { MAP_SIZES } from '@core/data';
import type { MatchTeam, SkirmishChoices } from '@core/match';
import type { MatchSettings } from '@core/model';
import { SETTING_NAMES, SETTINGS_SCHEMA, isValidSetting } from '@core/settingsSchema';
import { isInt, isObject } from '@core/util/validation';
import { MAX_ROOM_TEAMS, MAX_TURN_SECONDS, MAX_WAITING_SECONDS, MIN_TURN_SECONDS, MIN_WAITING_SECONDS } from './limits';

/** Lo que se pide al crear una sala. */
export interface RoomRequest {
  match: SkirmishChoices;
  /** Segundos de cada turno de una persona (si falta, sin reloj: se le espera lo que haga falta). */
  turnSeconds?: number;
  /** Segundos que se espera a los que no entran; pasados, su asiento lo juega la IA (si falta, se les espera siempre). */
  waitingSeconds?: number;
}

/** Si un campo tiene la forma que toca (con el contenido a mano, para los ids). */
type FieldCheck = (value: unknown, content: GameContent) => boolean;
/** Una comprobacion por cada campo de la forma, tambien los opcionales. */
type ShapeOf<Shape> = { readonly [Field in keyof Shape]-?: FieldCheck };

const optional =
  (check: FieldCheck): FieldCheck =>
  (value, content) =>
    value === undefined || check(value, content);

const MAX_SEED = Number.MAX_SAFE_INTEGER;
const MAX_ALLIANCE = MAX_ROOM_TEAMS;
const MAX_FUNDS = SETTINGS_SCHEMA.initialFunds.kind === 'number' ? SETTINGS_SCHEMA.initialFunds.max : 0;

const isController: FieldCheck = (value) => value === 'human' || value === 'ai';
const isGeneral: FieldCheck = (value, content) => value === null || isEntryId(content.generals, value);

const TEAM_SHAPE: ShapeOf<MatchTeam> = {
  controller: isController,
  alliance: optional((value) => isInt(value, 0, MAX_ALLIANCE)),
  funds: optional((value) => isInt(value, 0, MAX_FUNDS)),
  general: optional(isGeneral),
};

const hasShape =
  <Shape>(shape: ShapeOf<Shape>): FieldCheck =>
  (value, content) => {
    if (!isObject(value)) return false;
    const checks: Readonly<Record<string, FieldCheck>> = shape;
    const isKnownField = (field: string) => Object.hasOwn(checks, field);
    return Object.keys(value).every(isKnownField) && Object.entries(checks).every(([field, check]) => check(value[field], content));
  };

const isTeam = hasShape(TEAM_SHAPE);

/** De 2 a MAX_ROOM_TEAMS equipos, al menos uno de una persona (si no, no es una partida por la red). */
const isTeamList: FieldCheck = (value, content) =>
  Array.isArray(value) &&
  isInt(value.length, 2, MAX_ROOM_TEAMS) &&
  value.every((team) => isTeam(team, content)) &&
  value.some((team: MatchTeam) => team.controller === 'human');

/** Cambios a las reglas: solo reglas que existen, cada una con un valor que vale. */
const isSettingChanges: FieldCheck = (value) =>
  isObject(value) &&
  Object.entries(value).every(([rule, setting]) => isSettingName(rule) && isValidSetting(SETTINGS_SCHEMA[rule], setting));

const isSettingName = (rule: string): rule is keyof MatchSettings => (SETTING_NAMES as readonly string[]).includes(rule);

const MATCH_SHAPE: ShapeOf<SkirmishChoices> = {
  seed: (value) => isInt(value, 0, MAX_SEED),
  size: optional((value) => (MAP_SIZES as readonly unknown[]).includes(value)),
  theme: optional((value, content) => value === null || isEntryId(content.themes, value)),
  settingChanges: optional(isSettingChanges),
  teams: isTeamList,
  firstTeam: optional((value) => isInt(value, 0, MAX_ROOM_TEAMS - 1)),
};

const isMatch = hasShape(MATCH_SHAPE);

/** El primer equipo, si se dice, es uno de la lista. */
const hasFirstTeamInList = (match: SkirmishChoices): boolean => match.firstTeam === undefined || match.firstTeam < match.teams.length;

const REQUEST_SHAPE: ShapeOf<RoomRequest> = {
  match: (value, content) => isMatch(value, content) && hasFirstTeamInList(value as SkirmishChoices),
  turnSeconds: optional((value) => isInt(value, MIN_TURN_SECONDS, MAX_TURN_SECONDS)),
  waitingSeconds: optional((value) => isInt(value, MIN_WAITING_SECONDS, MAX_WAITING_SECONDS)),
};

const isRequest = hasShape(REQUEST_SHAPE);

/** El valor tiene la forma de lo que se pide al crear una sala, con ids que existen en `content`. */
export function isRoomRequest(value: unknown, content: GameContent): value is RoomRequest {
  return isRequest(value, content);
}
