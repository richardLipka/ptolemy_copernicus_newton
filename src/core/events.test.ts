import { describe, expect, it } from 'vitest';

import { circularPositions } from './engines/circular';
import { keplerianPositions } from './engines/keplerian';
import { NBodySimulation } from './engines/nbody';
import { ptolemaicEpicyclicPositions } from './engines/ptolemaic';
import type { EngineId, PositionSet } from './engines/types';
import {
  compareAcrossModels,
  findConjunctions,
  findOppositions,
  findStations,
} from './events';
import { calendarFromJd, jdFromCalendar } from './time';

const dateOf = (jd: number): string => {
  const c = calendarFromJd(jd);
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
};

describe('oppositions', () => {
  it('finds the recorded Mars oppositions of 2018-2025', () => {
    const found = findOppositions(keplerianPositions, 'mars', {
      observer: 'earth',
      startJd: jdFromCalendar(2018, 1, 1),
      endJd: jdFromCalendar(2025, 6, 1),
    });

    // Recorded dates, to the day.
    const expected = ['2018-07-27', '2020-10-13', '2022-12-08', '2025-01-16'];
    expect(found.map((event) => dateOf(event.jd))).toEqual(expected);
  });

  it('never reports an opposition of Venus, which cannot have one', () => {
    const found = findOppositions(keplerianPositions, 'venus', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 1, 1),
      endJd: jdFromCalendar(2024, 1, 1),
    });
    expect(found).toHaveLength(0);
  });
});

describe('conjunctions', () => {
  it('finds the 2020 great conjunction of Jupiter and Saturn', () => {
    const found = findConjunctions(keplerianPositions, 'jupiter', 'saturn', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 1, 1),
      endJd: jdFromCalendar(2021, 6, 1),
    });

    expect(found).toHaveLength(1);
    expect(dateOf(found[0]!.jd)).toBe('2020-12-22');
    // They passed about a fifth of a degree apart, closer than at any
    // conjunction since 1623.
    expect(found[0]!.separation).toBeLessThan(0.3);
  });
});

describe('stations', () => {
  it('brackets the 2020 Mars retrograde with a pair of stations', () => {
    const found = findStations(keplerianPositions, 'mars', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 8, 1),
      endJd: jdFromCalendar(2020, 12, 31),
    });

    expect(found).toHaveLength(2);
    expect(found[0]!.kind).toBe('station-retrograde');
    expect(found[1]!.kind).toBe('station-direct');

    // Mars turned retrograde on 9 September 2020 and direct again just after
    // midnight on 14 November. A station is where apparent motion crosses zero
    // shallowly, so its timing is far less sharply defined than an opposition's
    // — a day's tolerance is the honest precision here, not a fudge.
    expect(Math.abs(found[0]!.jd - jdFromCalendar(2020, 9, 9, 22))).toBeLessThan(1);
    expect(Math.abs(found[1]!.jd - jdFromCalendar(2020, 11, 14, 0, 35))).toBeLessThan(1);
  });

  it('places the retrograde arc around the opposition', () => {
    const stations = findStations(keplerianPositions, 'mars', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 8, 1),
      endJd: jdFromCalendar(2020, 12, 31),
    });
    const [opposition] = findOppositions(keplerianPositions, 'mars', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 8, 1),
      endJd: jdFromCalendar(2020, 12, 31),
    });

    expect(opposition!.jd).toBeGreaterThan(stations[0]!.jd);
    expect(opposition!.jd).toBeLessThan(stations[1]!.jd);
  });
});

describe('cross-model comparison', () => {
  it('reports how far the models disagree about one opposition', () => {
    const sim = new NBodySimulation();
    const engines = new Map<EngineId, (jd: number) => PositionSet>([
      ['nbody', (jd) => sim.positionsAt(jd)],
      ['circular', circularPositions],
      ['ptolemaic-epicyclic', ptolemaicEpicyclicPositions],
    ]);

    const [reference] = findOppositions(keplerianPositions, 'mars', {
      observer: 'earth',
      startJd: jdFromCalendar(2020, 8, 1),
      endJd: jdFromCalendar(2020, 12, 31),
    });

    const comparison = compareAcrossModels(reference!, engines, 'earth');

    expect(comparison.predictions.size).toBe(3);
    // Newton should agree with the reference to well under a day.
    expect(
      Math.abs(comparison.predictions.get('nbody')! - reference!.jd),
    ).toBeLessThan(1);
    // The historical models should visibly disagree, or there is nothing to show.
    expect(comparison.spreadDays).toBeGreaterThan(1);
    expect(comparison.spreadDays).toBeLessThan(120);
  }, 120_000);
});
