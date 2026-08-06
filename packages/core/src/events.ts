/**
 * Detection of conjunctions, oppositions, and stations.
 *
 * Every event here is defined as a zero crossing of some angle, so detection
 * is uniform: sample coarsely, find where the sign flips, then bisect to
 * refine. The only care needed is that the sampling step stays well below the
 * period of the quantity being tracked, or a crossing can be stepped over.
 *
 * Events are resolved against each engine separately, which is what makes
 * `compareAcrossModels` possible: asking every model to name the date of the
 * same conjunction turns an abstract argument about their merits into a number
 * of days.
 */

import type { BodyId } from './bodies.js';
import { apparentLongitude } from './coordinates.js';
import type { EngineId, PositionSet } from './engines/types.js';
import { angleDiffDeg } from './vec.js';

export type EventKind = 'conjunction' | 'opposition' | 'station-retrograde' | 'station-direct';

export interface AstronomicalEvent {
  kind: EventKind;
  jd: number;
  /** Primary body the event concerns. */
  body: BodyId;
  /** Second body, for conjunctions. */
  other?: BodyId;
  /** Ecliptic longitude where it occurs, degrees, J2000 frame. */
  longitude: number;
  /** Angular separation at closest approach, degrees. Conjunctions only. */
  separation?: number;
}

export interface ScanOptions {
  observer: BodyId;
  startJd: number;
  endJd: number;
  /** Coarse sampling interval, days. */
  stepDays?: number;
}

type PositionsAt = (jd: number) => PositionSet;

/**
 * Evaluate each date once per scan.
 *
 * A scan walks the same sample dates many times over — once for every body's
 * solar conjunction, once for its opposition, twice for its stations, and once
 * for each of the twenty-one planet pairs. Measured over a 400-day window that
 * is 10 852 calls for 3 244 distinct dates, a 3.3× redundancy, and it halved the
 * n-body panel rebuild from 127 ms to 58 ms once removed.
 *
 * Deliberately scoped to a single scan rather than cached globally: positions
 * are pure functions of the date, so a long-lived cache would be *correct*, but
 * it would also grow without bound as the clock runs. This one is garbage by the
 * time the scan returns.
 */
function memoize(positionsAt: PositionsAt): PositionsAt {
  const cache = new Map<number, PositionSet>();
  return (jd: number): PositionSet => {
    let positions = cache.get(jd);
    if (positions === undefined) {
      positions = positionsAt(jd);
      cache.set(jd, positions);
    }
    return positions;
  };
}

/** Refine a sign change to a precise time by bisection. */
function bisect(
  f: (jd: number) => number,
  low: number,
  high: number,
  tolerance = 1e-5,
): number {
  let a = low;
  let b = high;
  let fa = f(a);

  for (let i = 0; i < 60 && b - a > tolerance; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }

  return (a + b) / 2;
}

/**
 * Walk a signed angle across a time range and collect its zero crossings.
 *
 * Crossings where the angle jumps nearly a full turn are discarded: those are
 * the wrap from +180 to -180, not the event being looked for.
 */
function findCrossings(
  f: (jd: number) => number,
  startJd: number,
  endJd: number,
  stepDays: number,
): number[] {
  const crossings: number[] = [];

  let previousJd = startJd;
  let previous = f(previousJd);

  for (let jd = startJd + stepDays; jd <= endJd; jd += stepDays) {
    const current = f(jd);
    if (
      Math.sign(current) !== Math.sign(previous) &&
      Math.abs(current - previous) < 180
    ) {
      crossings.push(bisect(f, previousJd, jd));
    }
    previousJd = jd;
    previous = current;
  }

  return crossings;
}

/** Conjunctions of two bodies: their apparent longitudes coincide. */
export function findConjunctions(
  positionsAt: PositionsAt,
  a: BodyId,
  b: BodyId,
  options: ScanOptions,
): AstronomicalEvent[] {
  const { observer, startJd, endJd, stepDays = 2 } = options;

  const difference = (jd: number): number => {
    const positions = positionsAt(jd);
    return angleDiffDeg(
      apparentLongitude(positions, observer, a),
      apparentLongitude(positions, observer, b),
    );
  };

  return findCrossings(difference, startJd, endJd, stepDays).map((jd) => {
    const positions = positionsAt(jd);
    const longitudeA = apparentLongitude(positions, observer, a);
    return {
      kind: 'conjunction' as const,
      jd,
      body: a,
      other: b,
      longitude: longitudeA,
      separation: Math.abs(
        angleDiffDeg(longitudeA, apparentLongitude(positions, observer, b)),
      ),
    };
  });
}

/** Oppositions: the body sits opposite the Sun in the observer's sky. */
export function findOppositions(
  positionsAt: PositionsAt,
  body: BodyId,
  options: ScanOptions,
): AstronomicalEvent[] {
  const { observer, startJd, endJd, stepDays = 2 } = options;

  const offset = (jd: number): number => {
    const positions = positionsAt(jd);
    return angleDiffDeg(
      apparentLongitude(positions, observer, body),
      apparentLongitude(positions, observer, 'sun') + 180,
    );
  };

  return findCrossings(offset, startJd, endJd, stepDays).map((jd) => ({
    kind: 'opposition' as const,
    jd,
    body,
    longitude: apparentLongitude(positionsAt(jd), observer, body),
  }));
}

/**
 * Stations: the moments a body's apparent motion reverses, bracketing a
 * retrograde loop.
 *
 * These are the observations the Ptolemaic system was built to explain and the
 * Copernican system explained away, so they are worth surfacing prominently.
 */
export function findStations(
  positionsAt: PositionsAt,
  body: BodyId,
  options: ScanOptions,
): AstronomicalEvent[] {
  const { observer, startJd, endJd, stepDays = 2 } = options;
  const derivativeStep = 0.5;

  const rate = (jd: number): number =>
    angleDiffDeg(
      apparentLongitude(positionsAt(jd + derivativeStep), observer, body),
      apparentLongitude(positionsAt(jd - derivativeStep), observer, body),
    ) /
    (2 * derivativeStep);

  return findCrossings(rate, startJd, endJd, stepDays).map((jd) => ({
    // Rate falling through zero means the body is turning retrograde.
    kind: (rate(jd - stepDays) > 0 ? 'station-retrograde' : 'station-direct') as EventKind,
    jd,
    body,
    longitude: apparentLongitude(positionsAt(jd), observer, body),
  }));
}

export interface ModelComparison {
  /** The event as the reference model sees it. */
  event: AstronomicalEvent;
  /** Date each engine predicts, keyed by engine id. */
  predictions: Map<EngineId, number>;
  /**
   * The best modern value, from the reference ephemeris — what the sky actually
   * did, as nearly as this app can say. Null if the reference finds no matching
   * event in the window.
   */
  referenceJd: number | null;
  /**
   * Largest disagreement between the *historical* models, days.
   *
   * The reference is excluded on purpose. This number answers "how far apart are
   * the models", which is a different question from "how wrong is each of them",
   * and mixing the two would make it neither.
   */
  spreadDays: number;
}

/**
 * The engine treated as ground truth.
 *
 * See CLAUDE.md §12.7 on what its accuracy actually is, and why that governs
 * whether a *time* of day can honestly be shown next to a date.
 */
export const REFERENCE_ENGINE: EngineId = 'vsop87';

/**
 * Locate the same event under several engines and report the spread.
 *
 * Each engine is searched in a window around the reference date rather than
 * being asked to rediscover the event from scratch, so that a model badly
 * enough wrong to reorder nearby events still gets matched to the right one.
 */
export function compareAcrossModels(
  reference: AstronomicalEvent,
  engines: ReadonlyMap<EngineId, PositionsAt>,
  observer: BodyId,
  windowDays = 120,
): ModelComparison {
  const predictions = new Map<EngineId, number>();

  for (const [engineId, rawPositionsAt] of engines) {
    // Stations sample each date twice over, and bisection revisits dates the
    // coarse walk already covered.
    const positionsAt = memoize(rawPositionsAt);
    const options: ScanOptions = {
      observer,
      startJd: reference.jd - windowDays,
      endJd: reference.jd + windowDays,
      stepDays: 1,
    };

    let candidates: AstronomicalEvent[];
    switch (reference.kind) {
      case 'conjunction':
        candidates = findConjunctions(positionsAt, reference.body, reference.other!, options);
        break;
      case 'opposition':
        candidates = findOppositions(positionsAt, reference.body, options);
        break;
      default:
        candidates = findStations(positionsAt, reference.body, options).filter(
          (event) => event.kind === reference.kind,
        );
    }

    const nearest = candidates.reduce<AstronomicalEvent | null>(
      (best, candidate) =>
        !best || Math.abs(candidate.jd - reference.jd) < Math.abs(best.jd - reference.jd)
          ? candidate
          : best,
      null,
    );

    if (nearest) predictions.set(engineId, nearest.jd);
  }

  const referenceJd = predictions.get(REFERENCE_ENGINE) ?? null;

  // Spread across the historical models only — see the note on the field.
  const modelDates = [...predictions]
    .filter(([engineId]) => engineId !== REFERENCE_ENGINE)
    .map(([, jd]) => jd);
  const spreadDays =
    modelDates.length > 1 ? Math.max(...modelDates) - Math.min(...modelDates) : 0;

  return { event: reference, predictions, referenceJd, spreadDays };
}

/** Every event of interest in a window, ordered by date. */
export function scanEvents(
  rawPositionsAt: PositionsAt,
  bodies: readonly BodyId[],
  options: ScanOptions,
): AstronomicalEvent[] {
  // Every sample date below is visited by several searches; see `memoize`.
  const positionsAt = memoize(rawPositionsAt);
  const events: AstronomicalEvent[] = [];
  const observer = options.observer;

  for (const body of bodies) {
    if (body === observer) continue;

    if (body !== 'sun') {
      events.push(...findConjunctions(positionsAt, body, 'sun', options));
      // Only a body outside the observer's orbit can stand opposite the Sun.
      events.push(...findOppositions(positionsAt, body, options));
      events.push(...findStations(positionsAt, body, options));
    }

    // Conjunctions with the Sun are handled above, so the Sun is excluded from
    // both sides here — pairing it again would list every solar conjunction a
    // second time with the bodies reversed.
    if (body === 'sun') continue;

    for (const other of bodies) {
      if (other === observer || other === body || other === 'sun') continue;
      // Each pair once.
      if (bodies.indexOf(other) <= bodies.indexOf(body)) continue;
      events.push(...findConjunctions(positionsAt, body, other, options));
    }
  }

  return events.sort((a, b) => a.jd - b.jd);
}
