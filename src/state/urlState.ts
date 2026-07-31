/**
 * The view configuration, carried in the URL.
 *
 * What a lecturer wants to hand round is not a screenshot but a *setup*: this
 * model, seen from there, centred on that, on that day. Those six fields go in
 * the address bar so a link in a slide deck reopens the same arrangement.
 *
 * Kept in the **hash** rather than the query string, for two reasons. The app is
 * served as static files from a host with no backend, so a path or query the
 * server has never heard of risks a 404 on reload; and a hash change never
 * reaches the network. The keys are spelled out rather than minified because a
 * readable URL is itself a small piece of documentation.
 *
 * Still *not* included: the zoom, the theme and the language. Zoom is a way of
 * looking rather than a thing to look at, and the other two are the reader's
 * preference — a link that silently repainted someone's interface, or switched
 * their language, would be rude.
 */

import { BODY_IDS, type BodyId } from '../core/bodies';
import { MODES, type EngineId, type ModeId } from '../core/engines/types';
import { MAX_JD, MIN_JD, dateFromJd, jdFromDate } from '../core/time';
import type { SphereCentre } from './store';

/**
 * Every field is optional, in both directions.
 *
 * A link may carry any subset — hand-written, truncated by a mail client, or
 * produced by an older version that had fewer fields — and each is applied on
 * its own, leaving anything absent as the reader found it.
 */
export interface UrlState {
  mode: ModeId;
  engineId: EngineId;
  frameOrigin: BodyId;
  observationPoint: BodyId;
  sphereCentre: SphereCentre;
  julianDate: number;
}

const KEY = {
  mode: 'model',
  engine: 'type',
  frame: 'centre',
  observer: 'observer',
  sphere: 'sphere',
  date: 'date',
} as const;

const isMode = (value: string): value is ModeId =>
  Object.prototype.hasOwnProperty.call(MODES, value);

const isBody = (value: string): value is BodyId =>
  (BODY_IDS as readonly string[]).includes(value);

const isSphereCentre = (value: string): value is SphereCentre =>
  value === 'frame' || value === 'observer';

/**
 * Read whatever the URL offers, discarding anything that does not make sense.
 *
 * A hand-edited or truncated link must degrade to a working app rather than a
 * broken one, so every field is validated independently and a bad one is simply
 * dropped. The engine is checked against its *mode* as well as against the list
 * of engines: `model=newton&type=circular` names two real things that cannot be
 * combined, and silently keeping it would leave the mode buttons disagreeing
 * with what is on screen.
 */
export function readUrlState(hash: string = window.location.hash): Partial<UrlState> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: Partial<UrlState> = {};

  const mode = params.get(KEY.mode);
  if (mode && isMode(mode)) state.mode = mode;

  const engine = params.get(KEY.engine);
  if (engine) {
    const withinMode = state.mode ? MODES[state.mode].engines : null;
    const valid = withinMode
      ? withinMode.includes(engine as EngineId)
      : Object.values(MODES).some((m) => m.engines.includes(engine as EngineId));
    if (valid) state.engineId = engine as EngineId;
  }

  const frame = params.get(KEY.frame);
  if (frame && isBody(frame)) state.frameOrigin = frame;

  const observer = params.get(KEY.observer);
  if (observer && isBody(observer)) state.observationPoint = observer;

  const sphere = params.get(KEY.sphere);
  if (sphere && isSphereCentre(sphere)) state.sphereCentre = sphere;

  const date = params.get(KEY.date);
  if (date) {
    const jd = jdFromIsoDate(date);
    if (jd !== null) state.julianDate = jd;
  }

  return state;
}

/**
 * A calendar date, to the day.
 *
 * Written as `2026-07-31` rather than as a Julian Date, which would be exact but
 * unreadable, and a URL that says what it means is worth a few hours of
 * precision. Day resolution is enough for what gets shared — a conjunction, an
 * opposition, a retrograde arc — and matches the date field in the controls.
 */
function jdFromIsoDate(text: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const jd = jdFromDate(parsed);
  // Outside the range the engines are valid over, a date is worse than none.
  if (jd < MIN_JD || jd > MAX_JD) return null;
  return jd;
}

const isoDateFromJd = (jd: number): string =>
  dateFromJd(jd).toISOString().slice(0, 10);

/** Encode whatever is given; absent fields are simply left out. */
export function encodeUrlState(state: Partial<UrlState>): string {
  const params = new URLSearchParams();
  if (state.mode) params.set(KEY.mode, state.mode);
  if (state.engineId) params.set(KEY.engine, state.engineId);
  if (state.frameOrigin) params.set(KEY.frame, state.frameOrigin);
  if (state.observationPoint) params.set(KEY.observer, state.observationPoint);
  if (state.sphereCentre) params.set(KEY.sphere, state.sphereCentre);
  if (state.julianDate !== undefined) {
    params.set(KEY.date, isoDateFromJd(state.julianDate));
  }
  return `#${params.toString()}`;
}

/**
 * Put the configuration in the address bar.
 *
 * `replaceState`, not `pushState`: these controls are meant to be swept through
 * while comparing models, and one history entry per click would bury whatever
 * page the reader arrived from under a hundred of them.
 */
export function writeUrlState(state: Partial<UrlState>): void {
  const encoded = encodeUrlState(state);
  if (encoded === window.location.hash) return;
  window.history.replaceState(null, '', encoded);
}
