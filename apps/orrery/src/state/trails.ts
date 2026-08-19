/**
 * A log of where the bodies have actually been.
 *
 * Orbits are not computed ahead of time. Each entry is a snapshot the
 * simulation genuinely passed through, so a trail is evidence rather than
 * prediction: it cannot show a shape the engine did not produce, and an orbit
 * that closes on itself has demonstrably closed rather than been drawn closed.
 *
 * Whole snapshots are kept, not screen points, so that recentring the map or
 * switching between compressed and true scale redraws the existing history
 * instead of discarding it.
 *
 * Each past position is plotted against the frame origin *as it was at that
 * moment*, not where the origin is now. That is what makes an Earth-centred
 * Mars trace the retrograde rosette: every point is geocentric for its own
 * date, exactly as an observer would have recorded it.
 */

import type { PositionSet } from '@orrery/core/engines/types';

export interface TrailSample {
  jd: number;
  positions: PositionSet;
}

/**
 * Snapshots retained per log.
 *
 * Bounds both memory and the DOM: every sample becomes a line segment for each
 * body drawn, so this figure times the number of bodies is the element count
 * the renderer has to carry.
 */
const DEFAULT_CAPACITY = 150;

/** Initial minimum spacing between snapshots, days. */
const DEFAULT_STEP_DAYS = 0.25;

export class TrailLog {
  private samples: TrailSample[] = [];
  private minStepDays: number;
  /**
   * Bumped whenever existing entries move on screen, so the renderer knows to
   * redraw the whole trail rather than just append to it.
   */
  private revision = 0;

  constructor(
    private readonly capacity: number = DEFAULT_CAPACITY,
    private readonly initialStepDays: number = DEFAULT_STEP_DAYS,
  ) {
    this.minStepDays = initialStepDays;
  }

  get generation(): number {
    return this.revision;
  }

  get size(): number {
    return this.samples.length;
  }

  /** Current spacing between snapshots, days. Coarsens as history lengthens. */
  get stepDays(): number {
    return this.minStepDays;
  }

  /** Simulated days currently covered, or zero if nothing is logged yet. */
  get spanDays(): number {
    if (this.samples.length < 2) return 0;
    return Math.abs(this.samples[this.samples.length - 1]!.jd - this.samples[0]!.jd);
  }

  all(): readonly TrailSample[] {
    return this.samples;
  }

  /**
   * Would a snapshot at this date be kept?
   *
   * Asked before one is taken, because taking one means evaluating the engine
   * for every body — and at sixty frames a second against a spacing of a
   * quarter-day, all but one frame in fifteen would have that work thrown
   * straight back out. The condition is `record`'s own, so the two cannot
   * disagree about what the log wants.
   */
  wants(jd: number): boolean {
    const last = this.samples[this.samples.length - 1];
    return !last || Math.abs(jd - last.jd) >= this.minStepDays;
  }

  /**
   * Offer a snapshot. Kept only if the clock has moved far enough since the
   * last one, so the log's resolution does not depend on the frame rate.
   *
   * Discontinuities are not detected here. The store resets the log when the
   * user jumps the date, because only the store can tell a jump from a very
   * fast run — at 400 days a second a single frame legitimately advances the
   * clock by a week.
   */
  record(jd: number, positions: PositionSet): void {
    if (!this.wants(jd)) return;

    this.samples.push({ jd, positions });
    if (this.samples.length > this.capacity) this.decimate();
  }

  /**
   * Halve the resolution, doubling the spacing.
   *
   * This is what lets a bounded log cover unbounded time. Run the clock long
   * enough and Saturn's whole circuit accumulates; it is recorded more coarsely
   * than the first few months were, which is the honest trade and the only one
   * available without either forgetting the past or growing without limit.
   */
  private decimate(): void {
    const kept: TrailSample[] = [];
    for (let i = 0; i < this.samples.length; i += 2) kept.push(this.samples[i]!);

    // The newest sample must survive, or the trail detaches from the body it
    // belongs to and lags visibly behind it.
    const newest = this.samples[this.samples.length - 1]!;
    if (kept[kept.length - 1] !== newest) kept.push(newest);

    this.samples = kept;
    this.minStepDays *= 2;
    this.revision++;
  }

  /** Forget everything. Used when the date jumps or the model changes. */
  reset(): void {
    if (this.samples.length === 0 && this.minStepDays === this.initialStepDays) return;
    this.samples = [];
    this.minStepDays = this.initialStepDays;
    this.revision++;
  }

  /** Mark existing entries as needing reprojection, without discarding them. */
  invalidateProjection(): void {
    this.revision++;
  }
}
