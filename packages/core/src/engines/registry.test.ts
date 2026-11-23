import { describe, expect, it } from 'vitest';

import { jdFromCalendar } from '../time.js';
import { NBodySimulation } from './nbody.js';
import { ENGINES } from './registry.js';
import type { EngineId } from './types.js';

describe('engine registry position cache', () => {
  it('reuses the exact PositionSet instance for repeated same-date queries across all engines', () => {
    const jd = jdFromCalendar(2026, 6, 15);
    for (const id of Object.keys(ENGINES) as EngineId[]) {
      const first = ENGINES[id].positionsAt(jd);
      const second = ENGINES[id].positionsAt(jd);
      expect(second, id).toBe(first);
    }
  });

  it('bounds cache memory and still returns identical positions after eviction', () => {
    const base = jdFromCalendar(2026, 1, 1);
    const initial = ENGINES.keplerian.positionsAt(base);
    const marsInitial = initial.get('mars')!;

    // Fill past the 16-entry FIFO bound so `base` is evicted.
    for (let i = 1; i <= 20; i++) {
      ENGINES.keplerian.positionsAt(base + i);
    }

    const recomputed = ENGINES.keplerian.positionsAt(base);
    expect(recomputed).not.toBe(initial);
    expect(recomputed.get('mars')).toEqual(marsInitial);
  });

  it('reuses the last N-body statesAt snapshot when queried repeatedly at one instant', () => {
    const sim = new NBodySimulation();
    const jd = jdFromCalendar(2026, 7, 1);
    const first = sim.statesAt(jd);
    const second = sim.statesAt(jd);
    expect(second).toBe(first);

    const moved = sim.statesAt(jd + 1);
    expect(moved).not.toBe(first);
  });
});
