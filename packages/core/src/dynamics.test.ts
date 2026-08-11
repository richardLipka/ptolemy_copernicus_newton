/**
 * Newton's forces, checked against figures that can be looked up.
 *
 * These vectors are the app's claim about *why* a body moves, so they are worth
 * pinning to known quantities rather than merely to themselves.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from './bodies.js';
import { massInKg, dynamicsOf } from './dynamics.js';
import { nbodyDynamics, sharedSimulation } from './engines/nbody.js';
import { jdFromCalendar } from './time.js';
import { dot, length, sub } from './vec.js';

const JD = jdFromCalendar(2026, 1, 1);

describe('masses derived from GM', () => {
  it('recovers the accepted values', () => {
    // Nominal masses, kg. GM is what is actually measured; dividing by G is the
    // least accurate step, so a few significant figures is all that is claimed.
    expect(massInKg('sun')).toBeCloseTo(1.9885e30, -27);
    expect(massInKg('earth') / 5.9722e24).toBeCloseTo(1, 3);
    expect(massInKg('jupiter') / 1.8982e27).toBeCloseTo(1, 3);
    expect(massInKg('moon') / 7.346e22).toBeCloseTo(1, 3);
  });

  it('reproduces the Sun-to-Earth mass ratio', () => {
    expect(massInKg('sun') / massInKg('earth')).toBeCloseTo(332_946, -3);
  });
});

describe('forces on Earth', () => {
  const dynamics = () => nbodyDynamics(JD, 'earth')!;

  it('is pulled hardest by the Sun, then the Moon, then Jupiter', () => {
    const order = dynamics().pulls.map((pull) => pull.source);
    expect(order.slice(0, 3)).toEqual(['sun', 'moon', 'jupiter']);
  });

  it('feels about 3.5e22 N from the Sun', () => {
    const sun = dynamics().pulls.find((pull) => pull.source === 'sun')!;
    expect(sun.newtons / 3.54e22).toBeCloseTo(1, 1);
  });

  it('feels about 2e20 N from the Moon', () => {
    const moon = dynamics().pulls.find((pull) => pull.source === 'moon')!;
    expect(moon.newtons / 1.98e20).toBeCloseTo(1, 0);
  });

  it('is held overwhelmingly by the Sun — the two-body problem justified', () => {
    // The Sun accounts for the great majority of the total pull, which is why
    // treating orbits as two-body ellipses works as well as it does.
    expect(dynamics().pulls[0]!.share).toBeGreaterThan(0.98);
  });

  it('obeys the inverse square law, in SI units', () => {
    // Checked against GM/r² at Earth's actual distance rather than against the
    // textbook 5.93e-3 m/s², which is the figure at a mean distance of 1 AU.
    // On 1 January Earth is near perihelion at 0.983 AU, so the true value is
    // 5.93e-3 / 0.983² = 6.13e-3 — and asserting the mean would have "failed"
    // against correct arithmetic.
    const sun = dynamics().pulls.find((pull) => pull.source === 'sun')!;
    const states = sharedSimulation().statesAt(JD);
    const distanceAu = length(
      sub(states.positions.get('sun')!, states.positions.get('earth')!),
    );

    const AU_IN_METRES = 1.495_978_707e11;
    const GM_SUN_SI = 1.327_124_4e20;
    const toMetresPerSecond2 = AU_IN_METRES / 86_400 ** 2;
    const expected = GM_SUN_SI / (distanceAu * AU_IN_METRES) ** 2;

    expect(sun.acceleration * toMetresPerSecond2).toBeCloseTo(expected, 8);
    // And in the right ballpark for somewhere near 1 AU.
    expect(sun.acceleration * toMetresPerSecond2).toBeGreaterThan(5.7e-3);
    expect(sun.acceleration * toMetresPerSecond2).toBeLessThan(6.3e-3);
  });

  it('has a net force pointing very nearly at the Sun', () => {
    const states = sharedSimulation().statesAt(JD);
    const toSun = sub(states.positions.get('sun')!, states.positions.get('earth')!);
    const unitToSun = { ...toSun };
    const distance = length(toSun);
    unitToSun.x /= distance;
    unitToSun.y /= distance;
    unitToSun.z /= distance;

    const net = dynamics().netDirection;
    const angle = (Math.acos(Math.min(1, dot(net, unitToSun))) * 180) / Math.PI;
    // The Moon drags it off true by a fraction of a degree.
    expect(angle).toBeLessThan(1);
  });

  /**
   * The README quotes a figure here, and a quoted figure rots. It once read
   * 99.5%, which is the *year's maximum* rather than a typical value: the
   * Moon's share swings with its distance, so the Sun's runs 99.33–99.51 across
   * 2026 and sits at 99.44 in the middle. Bounds, not a point.
   */
  it('leaves the Sun at 99.4% of the pull on Earth, give or take a tenth', () => {
    const share = dynamics().pulls[0]!.share * 100;
    expect(share).toBeGreaterThan(99.3);
    expect(share).toBeLessThan(99.55);
  });

  it('orbits at about 29.8 km/s', () => {
    // Earth's mean orbital speed. The n-body frame is the system barycentre, so
    // this is barycentric rather than heliocentric, but the difference is tiny.
    expect(dynamics().speedKmPerSecond).toBeCloseTo(29.8, 0);
  });
});

/**
 * The Moon is the case worth quoting, and the easiest to quote wrongly.
 *
 * The Sun outpulls the Earth here — the Moon orbits the Earth anyway, because
 * the pair fall toward the Sun together — but by how much is not a constant.
 * The Moon's distance from Earth varies by a tenth over a month, and the pull
 * goes as the square, so the ratio breathes between about 1.85 and 2.55. The
 * README once said "more than twice as hard", which is false at perigee, and
 * gave 69.5%/30.5% for what is really a 65–72% band.
 */
describe('forces on the Moon', () => {
  const shares = (jd: number) => {
    const pulls = nbodyDynamics(jd, 'moon')!.pulls;
    const sun = pulls.find((pull) => pull.source === 'sun')!;
    const earth = pulls.find((pull) => pull.source === 'earth')!;
    return { sun: sun.share * 100, ratio: sun.newtons / earth.newtons };
  };

  it('is pulled harder by the Sun than by the Earth, all month long', () => {
    for (let day = 0; day < 30; day++) {
      expect(shares(JD + day).ratio, `day ${day}`).toBeGreaterThan(1);
    }
  });

  it('keeps that ratio inside 1.8–2.6, so "twice" is an average and not a floor', () => {
    const ratios = Array.from({ length: 365 }, (_, day) => shares(JD + day).ratio);
    expect(Math.min(...ratios)).toBeGreaterThan(1.8);
    expect(Math.min(...ratios)).toBeLessThan(2);
    expect(Math.max(...ratios)).toBeLessThan(2.6);
  });

  it('puts the Sun near 69% of the total pull, within a band of a few points', () => {
    const sunShares = Array.from({ length: 365 }, (_, day) => shares(JD + day).sun);
    expect(Math.min(...sunShares)).toBeGreaterThan(64);
    expect(Math.max(...sunShares)).toBeLessThan(72);
  });
});

describe('velocity across the system', () => {
  it('has inner planets moving faster than outer ones', () => {
    // Kepler's third law falling out of an integration that was never told it.
    const speeds = (['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'] as BodyId[])
      .map((id) => nbodyDynamics(JD, id)!.speedKmPerSecond);

    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]!, `body ${i}`).toBeLessThan(speeds[i - 1]!);
    }
  });

  it('keeps each speed inside its orbit’s perihelion-aphelion range', () => {
    // Bounds rather than mean speeds, because the speed at any one date depends
    // on where in an eccentric orbit the body happens to be. Mercury's own
    // range is 38.9 to 59.0 km/s — quoting its 47 km/s mean as an expectation
    // would fail against perfectly correct arithmetic.
    const bounds: Partial<Record<BodyId, [number, number]>> = {
      mercury: [38.5, 59.3],
      venus: [34.7, 35.3],
      earth: [29.2, 30.4],
      mars: [21.9, 26.6],
      jupiter: [12.4, 13.8],
      saturn: [9.0, 10.3],
    };

    for (const [id, [low, high]] of Object.entries(bounds) as [
      BodyId,
      [number, number],
    ][]) {
      const speed = nbodyDynamics(JD, id)!.speedKmPerSecond;
      expect(speed, `${id} lower`).toBeGreaterThan(low);
      expect(speed, `${id} upper`).toBeLessThan(high);
    }
  });
});

describe('the Moon is the interesting case', () => {
  it('is pulled about twice as hard by the Sun as by Earth', () => {
    // The often-surprising fact that the Moon's path is more curved by the Sun
    // than by Earth, yet it still orbits Earth — because Earth and Moon are
    // falling toward the Sun together.
    const pulls = nbodyDynamics(JD, 'moon')!.pulls;
    const sun = pulls.find((pull) => pull.source === 'sun')!;
    const earth = pulls.find((pull) => pull.source === 'earth')!;
    expect(sun.newtons / earth.newtons).toBeGreaterThan(1.9);
    expect(sun.newtons / earth.newtons).toBeLessThan(2.4);
  });
});

describe('shape of the result', () => {
  it('lists every other body exactly once, strongest first', () => {
    const pulls = nbodyDynamics(JD, 'mars')!.pulls;
    expect(pulls).toHaveLength(7);
    expect(new Set(pulls.map((p) => p.source)).size).toBe(7);
    expect(pulls.some((p) => p.source === 'mars')).toBe(false);
    for (let i = 1; i < pulls.length; i++) {
      expect(pulls[i]!.newtons).toBeLessThanOrEqual(pulls[i - 1]!.newtons);
    }
  });

  it('has shares summing to one', () => {
    const total = nbodyDynamics(JD, 'venus')!.pulls.reduce((s, p) => s + p.share, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('gives unit direction vectors', () => {
    for (const pull of nbodyDynamics(JD, 'jupiter')!.pulls) {
      expect(length(pull.direction)).toBeCloseTo(1, 12);
    }
  });

  it('returns null for a body the states do not contain', () => {
    expect(
      dynamicsOf({ positions: new Map(), velocities: new Map() }, 'earth'),
    ).toBeNull();
  });
});
