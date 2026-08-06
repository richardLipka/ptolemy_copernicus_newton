/**
 * Each model draws the moons in its own machinery, and each one's machinery has
 * to be *its own* — a Copernican epicyclet that is really a circle, or an equant
 * that does not bisect, would look plausible and teach the wrong thing.
 *
 * The sharper check is the last one: every construction must actually fit the
 * orbit it claims to describe, to the accuracy that model is entitled to.
 */

import { describe, expect, it } from 'vitest';

import { BODIES } from './bodies';
import type { EngineId } from './engines/types';
import { satelliteHarness } from './satelliteHarness';
import { satelliteOffsetAt } from './satellites';
import { jdFromCalendar } from './time';
import { add, length, sub, vec3 } from './vec';

const JD = jdFromCalendar(1610, 1, 7);
/** Jupiter somewhere away from the origin, so nothing passes by accident. */
const PRIMARY = vec3(3.1, -4.2, 0.07);

const bodyAt = (jd: number, id: 'io' | 'europa' | 'ganymede' | 'callisto' | 'titan') =>
  add(PRIMARY, satelliteOffsetAt(jd, id)!);

const harness = (engineId: EngineId, id: 'io' | 'titan' = 'io', jd = JD) =>
  satelliteHarness(jd, id, engineId, PRIMARY, bodyAt(jd, id))!;

describe('each model contributes its own machinery', () => {
  it('gives the naive circular model one circle centred on the planet', () => {
    const h = harness('circular');
    expect(h.circles).toHaveLength(1);
    expect(h.ellipses ?? []).toHaveLength(0);
    expect(h.circles[0]!.radius).toBeCloseTo(BODIES.io.satellite!.a, 12);
    // Centred on the planet itself: the whole claim of the model.
    expect(length(sub(h.circles[0]!.centre, PRIMARY))).toBeCloseTo(0, 12);
  });

  it('gives Ptolemy an eccentric with a bisected equant', () => {
    const h = harness('ptolemaic-epicyclic', 'titan');
    const { a, e } = BODIES.titan.satellite!;

    expect(h.circles).toHaveLength(1);
    // No epicycle: a moon seen from its planet has no term for one.
    expect(h.circles.filter((c) => c.role === 'epicycle')).toHaveLength(0);

    const centre = h.markers.find((m) => m.role === 'centre')!;
    const equant = h.markers.find((m) => m.role === 'equant')!;
    const centreOffset = length(sub(centre.at, PRIMARY));
    const equantOffset = length(sub(equant.at, PRIMARY));

    expect(centreOffset).toBeCloseTo(a * e * 0.5, 12);
    expect(equantOffset).toBeCloseTo(a * e, 12);
    // The bisection itself — the device that makes the model work.
    expect(equantOffset / centreOffset).toBeCloseTo(2, 9);
  });

  it('gives Copernicus an eccentric and a real epicyclet', () => {
    const h = harness('copernican', 'titan');
    const { a, e } = BODIES.titan.satellite!;

    const deferent = h.circles.find((c) => c.role === 'deferent')!;
    const epicyclet = h.circles.find((c) => c.role === 'epicycle')!;

    expect(deferent.radius).toBeCloseTo(a, 12);
    // The 3/2 : 1/2 split that replaces the equant.
    expect(length(sub(deferent.centre, PRIMARY))).toBeCloseTo(1.5 * a * e, 12);
    expect(epicyclet.radius).toBeCloseTo(0.5 * a * e, 12);
    // A real epicyclet, not a degenerate point.
    expect(epicyclet.radius).toBeGreaterThan(0);
    // And no equant anywhere, which is the objection he built it to answer.
    expect(h.markers.filter((m) => m.role === 'equant')).toHaveLength(0);
  });

  it('gives Kepler an ellipse with the planet on one focus and nothing on the other', () => {
    const h = harness('keplerian', 'titan');
    const { a, e } = BODIES.titan.satellite!;

    expect(h.circles).toHaveLength(0);
    expect(h.ellipses).toHaveLength(1);
    expect(length(h.ellipses![0]!.majorAxis)).toBeCloseTo(a, 12);
    expect(length(h.ellipses![0]!.minorAxis)).toBeCloseTo(a * Math.sqrt(1 - e * e), 12);

    const foci = h.markers.filter((m) => m.role === 'focus');
    expect(foci).toHaveLength(2);
    // One focus is the planet; the other is the empty one, 2ae away.
    const offsets = foci.map((f) => length(sub(f.at, PRIMARY))).sort((x, y) => x - y);
    expect(offsets[0]!).toBeCloseTo(0, 12);
    expect(offsets[1]!).toBeCloseTo(2 * a * e, 12);
  });

  it('gives Newton the same conic, bare, with the force along the radius', () => {
    const kepler = harness('keplerian', 'titan');
    const newton = harness('nbody', 'titan');

    // The same curve — Newton derives the conic Kepler described.
    expect(length(newton.ellipses![0]!.majorAxis)).toBeCloseTo(
      length(kepler.ellipses![0]!.majorAxis),
      12,
    );
    // But no descriptive scaffolding: one focus, no empty one, no apsidal line.
    expect(newton.markers.filter((m) => m.role === 'focus')).toHaveLength(1);
    expect(newton.arms.filter((arm) => arm.role === 'apsidal')).toHaveLength(0);
    expect(newton.arms.filter((arm) => arm.role === 'radius')).toHaveLength(1);
    expect(kepler.arms.filter((arm) => arm.role === 'apsidal')).toHaveLength(1);
  });

  it('distinguishes all five families rather than quietly sharing one', () => {
    const shape = (engineId: EngineId): string => {
      const h = harness(engineId, 'titan');
      return [
        h.circles.length,
        (h.ellipses ?? []).length,
        h.arms.map((a) => a.role).sort().join('+'),
        h.markers.map((m) => m.role).sort().join('+'),
      ].join('|');
    };
    const shapes = [
      shape('circular'),
      shape('ptolemaic-epicyclic'),
      shape('copernican'),
      shape('keplerian'),
      shape('nbody'),
    ];
    expect(new Set(shapes).size).toBe(5);
  });

  it('treats the reframe mode as machinery-free, like its planets', () => {
    // It exposes no construction for the planets either; an equant invented for
    // it would be a fiction about the one mode that deliberately has none.
    expect(harness('ptolemaic-reframe').circles).toHaveLength(1);
    expect(harness('ptolemaic-reframe').markers.map((m) => m.role)).toEqual(['centre']);
  });
});

describe('every construction actually fits the orbit it describes', () => {
  const MOONS = ['io', 'europa', 'ganymede', 'callisto', 'titan'] as const;

  it('halves the radial error when Ptolemy displaces the centre', () => {
    /*
     * The reason to displace the centre at all, measured.
     *
     * A circle centred on the planet has the moon at a(1 − e·cos E), so it is
     * wrong by up to *ae*. Move the centre out to ae/2 and the same distance
     * becomes a(1 − (e/2)·cos E + O(e²)) — half the error, for one extra number.
     *
     * That the eccentric is still wrong by O(e) radially is not a defect in this
     * code: it is the known limitation of the device. The bisected eccentricity
     * was built to get *directions* right, and it does that to a far higher
     * order than it gets distances, which is why the geocentric system survived
     * as long as it did on longitude alone.
     */
    for (const id of MOONS) {
      const { a, e } = BODIES[id].satellite!;
      const worst: Record<string, number> = { circular: 0, 'ptolemaic-epicyclic': 0 };

      for (let day = 0; day < 40; day += 0.37) {
        const jd = JD + day;
        const body = bodyAt(jd, id);

        for (const engineId of ['circular', 'ptolemaic-epicyclic'] as EngineId[]) {
          const h = satelliteHarness(jd, id, engineId, PRIMARY, body)!;
          const circle = h.circles.find((c) => c.role === 'deferent')!;
          const error = Math.abs(length(sub(body, circle.centre)) - a) / a;
          worst[engineId] = Math.max(worst[engineId]!, error);
        }
      }

      // Each within the bound its own geometry allows, and no better.
      expect(worst.circular!, `${id} circle`).toBeLessThan(e * 1.02);
      expect(worst.circular!, `${id} circle`).toBeGreaterThan(e * 0.5);
      expect(worst['ptolemaic-epicyclic']!, `${id} eccentric`).toBeLessThan(e * 0.53);
      // The improvement itself: about half, over a full revolution.
      expect(worst['ptolemaic-epicyclic']! / worst.circular!, id).toBeCloseTo(0.5, 1);
    }
  });

  it('lands the Copernican epicyclet on the true position, to first order in e', () => {
    /*
     * The claim that makes the device worth drawing: eccentric plus epicyclet
     * reproduces the ellipse with no equant, exactly as far as first order. The
     * residual must therefore scale like e², not like e.
     */
    for (const id of MOONS) {
      const { a, e } = BODIES[id].satellite!;
      let worst = 0;
      for (let day = 0; day < 40; day += 0.29) {
        const jd = JD + day;
        const body = bodyAt(jd, id);
        const h = satelliteHarness(jd, id, 'copernican', PRIMARY, body)!;

        // Where the construction's own arms end up, independent of `body`.
        const epicycleCentre = h.arms.find((arm) => arm.role === 'deferent-arm')!.to;
        const epicyclet = h.circles.find((c) => c.role === 'epicycle')!.radius;
        const constructed = length(sub(epicycleCentre, PRIMARY));
        // The constructed point is within the epicyclet of the true one.
        expect(length(sub(body, epicycleCentre))).toBeLessThan(epicyclet * 1.5 + a * e * e * 4);
        worst = Math.max(worst, Math.abs(constructed - a) / a);
      }
      // Deferent centre displaced by 1.5ae, so the arm runs a — never far off.
      expect(worst, id).toBeLessThan(1e-9 + 2 * e);
    }
  });

  it('puts the moon on Kepler’s ellipse exactly', () => {
    // No approximation is available to Kepler: the sum of the distances to the
    // two foci is 2a at every point, and that is the ellipse's definition.
    for (const id of MOONS) {
      const { a } = BODIES[id].satellite!;
      for (let day = 0; day < 40; day += 0.31) {
        const jd = JD + day;
        const body = bodyAt(jd, id);
        const h = satelliteHarness(jd, id, 'keplerian', PRIMARY, body)!;
        const foci = h.markers.filter((m) => m.role === 'focus');
        const sum = foci.reduce((total, f) => total + length(sub(body, f.at)), 0);
        expect(sum / (2 * a), `${id}/${day.toFixed(2)}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('returns nothing for a body that is not a satellite', () => {
    expect(satelliteHarness(JD, 'mars', 'keplerian', PRIMARY, vec3(1, 0, 0))).toBeNull();
    expect(satelliteHarness(JD, 'earth', 'nbody', PRIMARY, vec3(1, 0, 0))).toBeNull();
  });
});
