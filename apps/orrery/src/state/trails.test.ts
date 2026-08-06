/**
 * The trail log is the app's memory of where the bodies have been, so its
 * failure modes are quiet ones: silently dropping history, growing without
 * bound, or keeping entries from a model that no longer applies.
 */

import { describe, expect, it } from 'vitest';

import { keplerianPositions } from '@orrery/core/engines/keplerian';
import { jdFromCalendar } from '@orrery/core/time';
import { TrailLog } from './trails';

const START = jdFromCalendar(2026, 1, 1);
const at = (jd: number) => keplerianPositions(jd);

/** Feed the log a run of dates at a fixed cadence. */
function run(log: TrailLog, count: number, stepDays: number, from = START): void {
  for (let i = 0; i < count; i++) {
    const jd = from + i * stepDays;
    log.record(jd, at(jd));
  }
}

describe('TrailLog', () => {
  it('records nothing until the clock has moved far enough', () => {
    const log = new TrailLog(100, 1);
    log.record(START, at(START));
    // Ten offers inside one day's worth of movement.
    for (let i = 1; i <= 10; i++) log.record(START + i * 0.05, at(START));
    expect(log.size).toBe(1);

    log.record(START + 1, at(START + 1));
    expect(log.size).toBe(2);
  });

  it('keeps resolution independent of how often it is offered samples', () => {
    const dense = new TrailLog(1000, 0.5);
    const sparse = new TrailLog(1000, 0.5);

    // The same 50 days, offered at very different frame rates.
    run(dense, 5000, 0.01);
    run(sparse, 100, 0.5);

    expect(dense.size).toBe(sparse.size);
  });

  it('never exceeds its capacity', () => {
    const log = new TrailLog(50, 0.25);
    run(log, 4000, 0.25);
    expect(log.size).toBeLessThanOrEqual(50);
  });

  it('trades resolution for reach rather than forgetting the past', () => {
    const log = new TrailLog(50, 0.25);

    run(log, 40, 0.25);
    const early = { span: log.spanDays, step: log.stepDays };

    run(log, 4000, 0.25, START + 10);
    const late = { span: log.spanDays, step: log.stepDays };

    // Much more time covered, at a coarser step. That is the whole bargain:
    // Saturn's circuit becomes visible if you run long enough, recorded less
    // finely than the first few weeks were.
    expect(late.span).toBeGreaterThan(early.span * 10);
    expect(late.step).toBeGreaterThan(early.step);
  });

  it('keeps the newest sample through decimation', () => {
    const log = new TrailLog(20, 0.25);
    run(log, 2001, 0.25);

    // The end of the log may trail the clock by up to one step, since that is
    // the recording cadence — but never by more. The renderer closes that last
    // gap by joining the final sample to the body's live position, or the trail
    // would visibly detach from the planet it belongs to.
    const newest = log.all()[log.size - 1]!.jd;
    expect(START + 500 - newest).toBeLessThanOrEqual(log.stepDays);
  });

  it('keeps samples in chronological order', () => {
    const log = new TrailLog(40, 0.25);
    run(log, 1000, 0.25);
    const jds = log.all().map((sample) => sample.jd);
    for (let i = 1; i < jds.length; i++) {
      expect(jds[i]!).toBeGreaterThan(jds[i - 1]!);
    }
  });

  it('records while running backwards', () => {
    const log = new TrailLog(100, 1);
    for (let i = 0; i < 10; i++) {
      const jd = START - i * 2;
      log.record(jd, at(jd));
    }
    expect(log.size).toBe(10);
  });

  it('forgets everything on reset, and says so via the generation', () => {
    const log = new TrailLog(100, 1);
    run(log, 20, 1);
    const before = log.generation;

    log.reset();
    expect(log.size).toBe(0);
    expect(log.spanDays).toBe(0);
    expect(log.generation).toBeGreaterThan(before);
  });

  it('restores the fine step after a reset', () => {
    const log = new TrailLog(20, 0.25);
    run(log, 2000, 0.25);
    expect(log.stepDays).toBeGreaterThan(0.25);

    log.reset();
    expect(log.stepDays).toBe(0.25);
  });

  it('does not churn the generation when reset while already empty', () => {
    const log = new TrailLog();
    const before = log.generation;
    log.reset();
    log.reset();
    expect(log.generation).toBe(before);
  });

  it('signals reprojection without discarding history', () => {
    const log = new TrailLog(100, 1);
    run(log, 20, 1);
    const before = log.generation;

    log.invalidateProjection();
    expect(log.generation).toBeGreaterThan(before);
    expect(log.size).toBe(20);
  });

  it('retains whole snapshots, so history can be recentred later', () => {
    const log = new TrailLog(100, 1);
    run(log, 5, 1);

    // Every sample must carry all the bodies, not just one, or recentring on a
    // different body would have nothing to measure against.
    for (const sample of log.all()) {
      expect(sample.positions.get('earth')).toBeDefined();
      expect(sample.positions.get('mars')).toBeDefined();
      expect(sample.positions.get('sun')).toBeDefined();
    }
  });
});
