/**
 * On-demand `requestAnimationFrame` controller.
 *
 * Runs strictly while `playing` is true (zero idle callbacks when paused) and
 * guards against re-entrant `sync()` calls fired from inside `onTick` — e.g.
 * when `store.tick()` notifies subscribers that also call `loop.sync()`.
 * Without that re-entrancy guard, each frame schedules two next frames and
 * exponentially multiplies into a callback storm.
 */

export interface AnimationLoopOptions {
  maxFrameSeconds: number;
  onTick: (elapsedSeconds: number) => void;
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

export interface AnimationLoop {
  /** Reconcile scheduling with `playing`. Safe to invoke re-entrantly from `onTick`. */
  sync(playing: boolean): void;
  /** True iff exactly one animation frame is currently pending. */
  readonly hasPendingFrame: boolean;
}

export function createAnimationLoop(options: AnimationLoopOptions): AnimationLoop {
  const {
    maxFrameSeconds,
    onTick,
    requestFrame = (cb) => requestAnimationFrame(cb),
    cancelFrame = (id) => cancelAnimationFrame(id),
  } = options;

  let running = false;
  let inFrame = false;
  let rafId: number | null = null;
  let previousTimestamp: number | null = null;

  const schedule = (): void => {
    if (!running || inFrame || rafId !== null) return;
    rafId = requestFrame(onFrame);
  };

  function onFrame(timestamp: number): void {
    rafId = null;
    if (!running) {
      previousTimestamp = null;
      return;
    }

    const elapsedSeconds =
      previousTimestamp === null
        ? 0
        : Math.min(Math.max(0, (timestamp - previousTimestamp) / 1000), maxFrameSeconds);
    previousTimestamp = timestamp;

    inFrame = true;
    try {
      if (elapsedSeconds > 0) onTick(elapsedSeconds);
    } finally {
      inFrame = false;
    }

    if (running) {
      schedule();
    } else {
      previousTimestamp = null;
    }
  }

  return {
    sync(playing: boolean): void {
      running = playing;
      if (playing) {
        schedule();
      } else {
        previousTimestamp = null;
        if (rafId !== null) {
          cancelFrame(rafId);
          rafId = null;
        }
      }
    },
    get hasPendingFrame(): boolean {
      return rafId !== null;
    },
  };
}
