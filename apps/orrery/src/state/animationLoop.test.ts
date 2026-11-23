import { describe, expect, it } from 'vitest';

import { createAnimationLoop } from './animationLoop';

interface FakeScheduler {
  requestFrame: (cb: (timestamp: number) => void) => number;
  cancelFrame: (id: number) => void;
  pendingCount: () => number;
  flushNext: (timestamp: number) => void;
}

function createFakeScheduler(): FakeScheduler {
  let nextId = 1;
  const pending = new Map<number, (timestamp: number) => void>();

  return {
    requestFrame(cb) {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancelFrame(id) {
      pending.delete(id);
    },
    pendingCount() {
      return pending.size;
    },
    flushNext(timestamp) {
      // Snapshot currently queued callbacks, matching browser vsync semantics.
      const batch = [...pending.entries()];
      pending.clear();
      for (const [, cb] of batch) cb(timestamp);
    },
  };
}

describe('createAnimationLoop', () => {
  it('never schedules duplicate frames when sync(true) is called re-entrantly inside onTick', () => {
    const scheduler = createFakeScheduler();
    const deltas: number[] = [];

    const loop = createAnimationLoop({
      maxFrameSeconds: 0.1,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      onTick(dt) {
        deltas.push(dt);
        // Mirrors `store.tick()` -> `store.patch()` -> `syncAnimationLoop()`.
        loop.sync(true);
      },
    });

    loop.sync(true);
    expect(scheduler.pendingCount()).toBe(1);

    // Run 30 consecutive 60 Hz frames; pending count must stay strictly 1.
    for (let i = 0; i < 30; i++) {
      scheduler.flushNext(1000 + i * 16);
      expect(scheduler.pendingCount(), `frame ${i}`).toBe(1);
    }

    // First frame establishes the baseline timestamp; the remaining 29 advance
    // at 0.016 s each with zero multiplication.
    expect(deltas).toHaveLength(29);
    for (const dt of deltas) {
      expect(dt).toBeCloseTo(0.016, 6);
    }
  });

  it('schedules zero frames when paused and cancels pending frames cleanly', () => {
    const scheduler = createFakeScheduler();
    const deltas: number[] = [];

    const loop = createAnimationLoop({
      maxFrameSeconds: 0.1,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      onTick: (dt) => deltas.push(dt),
    });

    loop.sync(false);
    expect(scheduler.pendingCount()).toBe(0);
    expect(loop.hasPendingFrame).toBe(false);

    loop.sync(true);
    expect(scheduler.pendingCount()).toBe(1);
    expect(loop.hasPendingFrame).toBe(true);

    loop.sync(false);
    expect(scheduler.pendingCount()).toBe(0);
    expect(loop.hasPendingFrame).toBe(false);
    expect(deltas).toHaveLength(0);
  });

  it('stops cleanly if onTick pauses playback (e.g. hitting MIN_JD or MAX_JD)', () => {
    const scheduler = createFakeScheduler();
    let ticks = 0;

    const loop = createAnimationLoop({
      maxFrameSeconds: 0.1,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      onTick() {
        ticks++;
        if (ticks === 2) loop.sync(false);
      },
    });

    loop.sync(true);
    scheduler.flushNext(1000); // baseline
    scheduler.flushNext(1016); // tick 1
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.flushNext(1032); // tick 2 pauses
    expect(ticks).toBe(2);
    expect(scheduler.pendingCount()).toBe(0);
    expect(loop.hasPendingFrame).toBe(false);
  });

  it('clamps large frame gaps and ignores non-monotonic timestamps', () => {
    const scheduler = createFakeScheduler();
    const deltas: number[] = [];

    const loop = createAnimationLoop({
      maxFrameSeconds: 0.1,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      onTick: (dt) => deltas.push(dt),
    });

    loop.sync(true);
    scheduler.flushNext(1000); // baseline
    scheduler.flushNext(995); // non-monotonic timestamp -> 0 s, skipped
    scheduler.flushNext(5000); // tab-hidden gap -> clamped to 0.1 s

    expect(deltas).toEqual([0.1]);
  });
});
