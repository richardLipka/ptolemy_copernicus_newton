/**
 * Detection of conjunctions, oppositions, and stations.
 *
 * Every event here is defined as a zero crossing of some angle, so detection
 * is uniform: sample coarsely, find where the sign flips, then bisect to
 * refine. The only care needed is that the sampling step stays well below the
 * period of the quantity being tracked, or a crossing can be stepped over.
 *
 * Events are resolved against each engine separately, which is what makes
 * `compareAcrossModels` possible: asking all three models to name the date of
 * the same conjunction turns an abstract argument about their merits into a
 * number of days.
 */

import type { BodyId } from './bodies';
import { apparentLongitude } from './coordinates';
import type { EngineId, PositionSet } from './engines/types';
import { angleDiffDeg } from './vec';

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
  /** Largest disagreement between any two engines, days. */
  spreadDays: number;
}

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

  for (const [engineId, positionsAt] of engines) {
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

  const dates = [...predictions.values()];
  const spreadDays = dates.length > 1 ? Math.max(...dates) - Math.min(...dates) : 0;

  return { event: reference, predictions, spreadDays };
}

/** Every event of interest in a window, ordered by date. */
export function scanEvents(
  positionsAt: PositionsAt,
  bodies: readonly BodyId[],
  options: ScanOptions,
): AstronomicalEvent[] {
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
