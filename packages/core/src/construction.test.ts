/**
 * The drawn machinery must agree with the computed position.
 *
 * The harness is a second derivation of the same geometry, so it can silently
 * drift from the positions it claims to explain — an epicycle arm that no
 * longer reaches its planet would be a diagram of nothing. These tests tie the
 * two together.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from './bodies.js';
import { circularConstruction, circularPositions } from './engines/circular.js';
import {
  ptolemaicConstruction,
  ptolemaicEpicyclicPositions,
  ptolemaicGeometryFor,
} from './engines/ptolemaic.js';
import { nbodyEngine } from './engines/nbody.js';
import { ptolemaicReframeEngine } from './engines/ptolemaic.js';
import { jdFromCalendar } from './time.js';
import { distance, length, sub } from './vec.js';

const JDS = [
  jdFromCalendar(1600, 3, 1),
  jdFromCalendar(1890, 11, 5),
  jdFromCalendar(2026, 7, 29),
  jdFromCalendar(2399, 1, 20),
];

const PLANETS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

describe('Ptolemaic construction', () => {
  it('carries the epicycle centre on the deferent', () => {
    for (const jd of JDS) {
      for (const id of PLANETS) {
        const geometry = ptolemaicGeometryFor(jd, id)!;
        const offset = distance(geometry.epicycleCentre, geometry.deferentCentre);
        expect(offset, `${id} at ${jd}`).toBeCloseTo(geometry.deferentRadius, 9);
      }
    }
  });

  it('puts the planet on its epicycle', () => {
    for (const jd of JDS) {
      for (const id of PLANETS) {
        const geometry = ptolemaicGeometryFor(jd, id)!;
        const offset = distance(geometry.position, geometry.epicycleCentre);
        expect(offset, `${id} at ${jd}`).toBeCloseTo(geometry.epicycleRadius, 9);
      }
    }
  });

  it('places the equant as far beyond the centre as Earth is before it', () => {
    for (const id of PLANETS) {
      const geometry = ptolemaicGeometryFor(JDS[0]!, id)!;
      // Earth is the origin, so |centre| is the eccentricity and the equant
      // sits at twice it, on the same side. That symmetry is the whole device.
      expect(length(geometry.equant!)).toBeCloseTo(2 * length(geometry.deferentCentre), 9);
      const centreDirection = length(sub(geometry.equant!, geometry.deferentCentre));
      expect(centreDirection).toBeCloseTo(length(geometry.deferentCentre), 9);
    }
  });

  it('gives the Sun an eccentric with no equant, as Ptolemy did', () => {
    const geometry = ptolemaicGeometryFor(JDS[0]!, 'sun')!;
    expect(geometry.equant).toBeNull();
    expect(geometry.epicycleRadius).toBe(0);
    expect(length(geometry.deferentCentre)).toBeGreaterThan(0);
  });

  it('agrees with the positions the engine reports', () => {
    for (const jd of JDS) {
      const positions = ptolemaicEpicyclicPositions(jd);
      for (const id of [...PLANETS, 'sun', 'moon'] as BodyId[]) {
        const geometry = ptolemaicGeometryFor(jd, id)!;
        expect(distance(geometry.position, positions.get(id)!)).toBeLessThan(1e-12);
      }
    }
  });

  it('joins the equant to the epicycle centre, and that to the planet', () => {
    const jd = JDS[2]!;
    const construction = ptolemaicConstruction(jd, 'mars')!;
    const geometry = ptolemaicGeometryFor(jd, 'mars')!;

    const deferentArm = construction.arms.find((arm) => arm.role === 'deferent-arm')!;
    expect(distance(deferentArm.from, geometry.equant!)).toBeLessThan(1e-12);
    expect(distance(deferentArm.to, geometry.epicycleCentre)).toBeLessThan(1e-12);

    const epicycleArm = construction.arms.find((arm) => arm.role === 'epicycle-arm')!;
    expect(distance(epicycleArm.from, geometry.epicycleCentre)).toBeLessThan(1e-12);
    expect(distance(epicycleArm.to, geometry.position)).toBeLessThan(1e-12);
  });

  it('reproduces the epicycle-to-deferent ratios Ptolemy published', () => {
    // r/R is 1/a for a superior planet and a for an inferior one, because the
    // epicycle of one and the deferent of the other are both Earth's orbit.
    const expected: Partial<Record<BodyId, number>> = {
      mercury: 22.5 / 60,
      venus: 43.17 / 60,
      mars: 39.5 / 60,
      jupiter: 11.5 / 60,
      saturn: 6.5 / 60,
    };

    for (const [id, ratio] of Object.entries(expected) as [BodyId, number][]) {
      const geometry = ptolemaicGeometryFor(JDS[0]!, id)!;
      expect(geometry.epicycleRadius / geometry.deferentRadius).toBeCloseTo(ratio, 9);
    }
  });
});

describe('Copernican construction', () => {
  it('puts every planet on its own circle, centred on the Sun', () => {
    for (const jd of JDS) {
      const positions = circularPositions(jd);
      for (const id of PLANETS) {
        const construction = circularConstruction(jd, id)!;
        const circle = construction.circles[0]!;
        expect(length(circle.centre)).toBe(0);
        expect(distance(positions.get(id)!, circle.centre)).toBeCloseTo(circle.radius, 9);
      }
    }
  });

  it('has no equant, which is the entire simplification', () => {
    const construction = circularConstruction(JDS[0]!, 'mars')!;
    expect(construction.markers.some((marker) => marker.role === 'equant')).toBe(false);
    expect(construction.circles.some((circle) => circle.role === 'epicycle')).toBe(false);
  });
});

describe('engines without a construction', () => {
  it('expose none, rather than an empty one', () => {
    expect(nbodyEngine.construction).toBeUndefined();
    expect(ptolemaicReframeEngine.construction).toBeUndefined();
  });
});
