/**
 * Apparent longitude against time — the record an observer actually keeps.
 *
 * Everything else in this app is a plan view: the solar system seen from
 * outside, which is a thing nobody has ever seen. What was *observed*, for two
 * thousand years before anyone left the ground, is a body's position among the
 * fixed stars on a series of nights. Babylonian tablets, Ptolemy's own data and
 * Tycho's are all lists of that one number against a date.
 *
 * Plotted, it is where retrograde motion stops being a word and becomes a shape:
 * the curve climbs steadily, hesitates, doubles back, hesitates again, and
 * resumes. Both of the systems this app compares were built to reproduce that
 * shape and nothing else, so it is the fairest ground to compare them on — and
 * until now the app named retrograde motion in a list without ever drawing it.
 *
 * The track is deliberately model-agnostic: hand it any engine's `positionsAt`
 * and it plots what that model predicts an observer would have recorded.
 */

import { BODIES, type BodyId } from './bodies.js';
import { apparentLongitude } from './coordinates.js';
import type { PositionSet } from './engines/types.js';

/**
 * The Moon's own period, days. Not in `bodies.ts`, which holds heliocentric
 * elements only.
 *
 * **Sidereal, not synodic.** The strip plots position against the *stars*, and
 * that circuit takes 27.32 days. The familiar 29.53-day month is the Moon's
 * cycle relative to the Sun — it governs the phases, and using it here would
 * stretch the window by two days for no reason connected to what is drawn.
 */
const SIDEREAL_MONTH = 27.321661;

/** A year in days, the fallback window when a period cannot be worked out. */
const DEFAULT_WINDOW = 365.25;

/**
 * How much of the curve to show, as a multiple of the synodic period.
 *
 * Slightly over one, so a full retrograde episode is always framed with its
 * approach and departure either side of it rather than clipped at an edge.
 */
const WINDOW_SHARE = 1.15;

/** Sensible bounds, so the Moon does not get 30 days and Saturn 30 years. */
const MIN_WINDOW = 45;
const MAX_WINDOW = 2200;

/**
 * Most cycles worth crowding onto one strip.
 *
 * The 45-day floor was set with the Moon in mind, whose cycle is 27 days, and it
 * is far too generous for anything quicker: Io laps Jupiter every 1.77 days, so
 * the floor alone gave it **twenty-five** orbits in one strip — a sawtooth so
 * dense it read as hatching, with a tenth of its segments discarded at the seam.
 *
 * A ceiling in cycles rather than in days is what the floor was always reaching
 * for. It leaves every planet untouched, because none of them comes close to
 * four cycles in the window they already get, and it leaves the Moon on its 45
 * days for the same reason.
 */
const MAX_CYCLES_SHOWN = 4;

export interface TrackPoint {
  jd: number;
  /** Apparent ecliptic longitude, degrees in [0, 360). */
  longitude: number;
}

export interface TrackSegment {
  from: TrackPoint;
  to: TrackPoint;
  /** True where the body is moving backwards against the stars. */
  retrograde: boolean;
}

/** Where the apparent motion reverses — the moment Ptolemy's epicycle explains. */
export interface TrackStation {
  jd: number;
  longitude: number;
  /** True when direct motion is ending and retrograde beginning. */
  toRetrograde: boolean;
}

export interface LongitudeTrack {
  startJd: number;
  endJd: number;
  /**
   * Drawable pieces of the curve. Segments that cross the 360°/0° seam are
   * *omitted* rather than drawn: on a 0–360 axis they would sweep right across
   * the plot and read as an instantaneous jump the sky never makes.
   */
  segments: TrackSegment[];
  stations: TrackStation[];
}

/**
 * Period of a body about its own primary, days.
 *
 * The Galileans and Titan carry their own, since the whole point of them is the
 * Laplace resonance between those periods. The Moon's is not in `bodies.ts`,
 * which otherwise holds heliocentric elements only, so it is named here.
 */
function satellitePeriodDays(id: BodyId): number {
  return BODIES[id].satellite?.periodDays ?? SIDEREAL_MONTH;
}

/** Orbital period about the Sun, days, or null where the body has no orbit. */
function heliocentricPeriodDays(id: BodyId): number | null {
  if (id === 'sun') return null;
  if (id === 'moon') return null;
  const orbit = BODIES[id].orbit;
  if (!orbit) return null;
  // Kepler's third law in solar units: T in years is a^(3/2).
  return orbit.epoch.a ** 1.5 * 365.256363;
}

/**
 * How long one full cycle of `target`'s apparent motion takes, seen from
 * `observer`. Days, unclamped and unscaled — the physical quantity.
 *
 * The synodic period, because the apparent motion — including the retrograde
 * loop — repeats on the beat between the two bodies' orbits rather than on
 * either one alone. That is why Mars loops every 780 days and not every 687.
 */
export function trackCycleDays(observer: BodyId, target: BodyId): number {
  if (observer === target) return DEFAULT_WINDOW;

  // A moon seen from its own primary runs on its own period, with no beat:
  // there is no second orbit for it to beat against.
  if (BODIES[target].parent === observer) return satellitePeriodDays(target);

  const observerPeriod = heliocentricPeriodDays(observer);
  const targetPeriod = heliocentricPeriodDays(target);

  // The Sun's apparent circuit is the observer's own year, and vice versa.
  if (target === 'sun') return observerPeriod ?? DEFAULT_WINDOW;
  if (observer === 'sun') return targetPeriod ?? DEFAULT_WINDOW;

  if (observerPeriod === null || targetPeriod === null) return DEFAULT_WINDOW;

  const beat = Math.abs(1 / targetPeriod - 1 / observerPeriod);
  if (beat < 1e-9) return DEFAULT_WINDOW;
  return 1 / beat;
}

/**
 * How wide the strip should be to frame that cycle.
 *
 * A little over one cycle, so a retrograde episode is framed whole with its
 * approach and departure either side rather than clipped at an edge — and
 * bounded, because Io's 1.77 days would be unreadable and Saturn's cycle seen
 * from Jupiter would be decades.
 *
 * **The window is not the cycle**, and the view says so: `trackCycleDays` is
 * what a reader should take away, and showing only the window invites exactly
 * the question of why Saturn reads 435 days when its synodic period is 378.
 */
export function trackWindowDays(observer: BodyId, target: BodyId): number {
  const cycle = trackCycleDays(observer, target);
  const wanted = cycle * WINDOW_SHARE;
  const bounded = Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, wanted));
  // The floor may not buy more than a few cycles: past that the curve stops
  // being a shape and becomes a texture.
  return Math.min(bounded, cycle * MAX_CYCLES_SHOWN);
}

/**
 * Sample `target`'s apparent longitude from `observer` across a window.
 *
 * `positionsAt` is whichever model is running, so the curve is that model's
 * claim about what would have been recorded — which is the point of being able
 * to switch models underneath it.
 */
export function buildLongitudeTrack(
  positionsAt: (jd: number) => PositionSet,
  centreJd: number,
  observer: BodyId,
  target: BodyId,
  windowDays: number,
  samples = 240,
): LongitudeTrack {
  const startJd = centreJd - windowDays / 2;
  const endJd = centreJd + windowDays / 2;

  if (observer === target || samples < 2) {
    return { startJd, endJd, segments: [], stations: [] };
  }

  const step = windowDays / (samples - 1);
  const points: TrackPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const jd = startJd + i * step;
    points.push({ jd, longitude: apparentLongitude(positionsAt(jd), observer, target) });
  }

  const segments: TrackSegment[] = [];
  const stations: TrackStation[] = [];
  let previousDirection = 0;

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const raw = to.longitude - from.longitude;

    /*
     * A step of more than half a circle is the seam, not real motion: no body
     * here moves 180° between samples. Reading the direction from the wrapped
     * value recovers which way it was actually going.
     */
    const wrapped = Math.abs(raw) > 180;
    const delta = wrapped ? raw - Math.sign(raw) * 360 : raw;
    const direction = Math.sign(delta);

    if (!wrapped) segments.push({ from, to, retrograde: delta < 0 });

    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      // The reversal happened between the two samples; the midpoint is as good
      // a claim as the sampling supports, and the panel says so.
      stations.push({
        jd: (from.jd + to.jd) / 2,
        longitude: from.longitude,
        toRetrograde: direction < 0,
      });
    }
    if (direction !== 0) previousDirection = direction;
  }

  return { startJd, endJd, segments, stations };
}
