/**
 * The view configuration, carried in the URL.
 *
 * What a lecturer wants to hand round is not a screenshot but a *setup*: this
 * model, seen from there, centred on that. Those five fields go in the address
 * bar so the link in a slide deck reopens the same arrangement.
 *
 * Kept in the **hash** rather than the query string, for two reasons. The app is
 * served as static files from a host with no backend, so a path or query the
 * server has never heard of risks a 404 on reload; and a hash change never
 * reaches the network. The keys are spelled out rather than minified because a
 * readable URL is itself a small piece of documentation.
 *
 * Deliberately *not* included: the date, the zoom, the theme and the language.
 * The first two would freeze a link to a moment and a magnification when what is
 * being shared is an arrangement; the last two are the reader's preference, not
 * the author's, and a link that silently repainted someone's interface would be
 * rude. Adding the date later is a two-line change if it turns out to be wanted.
 */

import { BODY_IDS, type BodyId } from '../core/bodies';
import { MODES, type EngineId, type ModeId } from '../core/engines/types';
import type { SphereCentre } from './store';

export interface UrlState {
  mode: ModeId;
  engineId: EngineId;
  frameOrigin: BodyId;
  observationPoint: BodyId;
  sphereCentre: SphereCentre;
}

const KEY = {
  mode: 'model',
  engine: 'type',
  frame: 'centre',
  observer: 'observer',
  sphere: 'sphere',
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

  return state;
}

export function encodeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  params.set(KEY.mode, state.mode);
  params.set(KEY.engine, state.engineId);
  params.set(KEY.frame, state.frameOrigin);
  params.set(KEY.observer, state.observationPoint);
  params.set(KEY.sphere, state.sphereCentre);
  return `#${params.toString()}`;
}

/**
 * Put the configuration in the address bar.
 *
 * `replaceState`, not `pushState`: these controls are meant to be swept through
 * while comparing models, and one history entry per click would bury whatever
 * page the reader arrived from under a hundred of them.
 */
export function writeUrlState(state: UrlState): void {
  const encoded = encodeUrlState(state);
  if (encoded === window.location.hash) return;
  window.history.replaceState(null, '', encoded);
}
