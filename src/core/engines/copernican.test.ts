/**
 * The Copernican construction, checked against the geometry it claims.
 *
 * The engine's whole justification is that Copernicus's bisection — deferent
 * centre at 3/2·ae, epicyclet of 1/2·ae turning at twice the mean anomaly —
 * reproduces an ellipse to first order in e. That is a checkable statement, and
 * these tests check it rather than take the accuracy figures on trust: if the
 * shares were wrong, or the epicyclet turned at the wrong rate, the apsides
 * would land in the wrong place and the error would stop scaling as e².
 */

import { describe, expect, it } from 'vitest';

import { BODIES, type BodyId } from '../bodies';
import { jdFromCalendar } from '../time';
import { length, sub, type Vec3 } from '../vec';
import {
  copernicanConstruction,
  copernicanHeliocentricAt,
  copernicanPositions,
} from './copernican';
import { elementsAt, meanAnomalyAt } from './keplerian';

const PLANETS: readonly BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const JD = jdFromCalendar(1543, 5, 24);

/** Distance from the Sun, which sits at the origin of this engine's frame. */
const solarDistance = (v: Vec3): number => length(v);

const model = (body: BodyId) => BODIES[body].orbit!;

/**
 * Least and greatest distance from the Sun over a *whole* revolution.
 *
 * The period is taken from the body's own semi-major axis rather than assumed:
 * a fixed window long enough for Mars leaves Saturn short of perihelion, which
 * is exactly the way a first version of this test managed to accuse the engine
 * of a 5% error it did not have.
 */
function apsidalDistances(body: BodyId): { near: number; far: number } {
  const model = BODIES[body].orbit!;
  const periodDays = 365.25 * elementsAt(JD, model).a ** 1.5;

  let near = Infinity;
  let far = 0;
  for (let step = 0; step <= 3000; step++) {
    const r = solarDistance(copernicanHeliocentricAt(JD + (periodDays * step) / 3000, model));
    near = Math.min(near, r);
    far = Math.max(far, r);
  }
  return { near, far };
}

describe('the orbit is an eccentric, not a circle about the Sun', () => {
  /**
   * The defining property. A concentric circle keeps the same distance all the
   * way round; an eccentric does not, and the spread must be 2ae.
   */
  it('varies its distance from the Sun by twice the eccentricity', () => {
    for (const body of PLANETS) {
      const { near, far } = apsidalDistances(body);
      const el = elementsAt(JD, model(body));
      expect((far - near) / (2 * el.a * el.e), body).toBeCloseTo(1, 2);
    }
  });

  /**
   * And the apsides are not merely close but *exact*. At M = 0 the three pieces
   * sum to a − (3/2)ae + (1/2)ae = a(1 − e), and at M = 180° to a(1 + e) — the
   * bisection is chosen precisely so they do. Only the sampling grid keeps this
   * from being an equality.
   */
  it('reaches perihelion and aphelion at exactly the right distances', () => {
    for (const body of PLANETS) {
      const { near, far } = apsidalDistances(body);
      const el = elementsAt(JD, model(body));

      // Four decimals would need a finer grid than 3000 steps: Saturn's is 3.6
      // days wide and the distance barely moves near an apse.
      expect(near / (el.a * (1 - el.e)), body).toBeCloseTo(1, 3);
      expect(far / (el.a * (1 + el.e)), body).toBeCloseTo(1, 3);
    }
  });
});

describe('the construction Copernicus described', () => {
  it('displaces the deferent centre from the Sun by 3/2 of ae', () => {
    for (const body of PLANETS) {
      const construction = copernicanConstruction(JD, body)!;
      const centre = construction.markers.find((m) => m.role === 'centre')!.at;
      const el = elementsAt(JD, BODIES[body].orbit!);

      expect(solarDistance(centre), body).toBeCloseTo(1.5 * el.a * el.e, 9);
    }
  });

  it('gives the epicyclet a third of the deferent offset', () => {
    for (const body of PLANETS) {
      const construction = copernicanConstruction(JD, body)!;
      const deferent = construction.circles.find((c) => c.role === 'deferent')!;
      const epicyclet = construction.circles.find((c) => c.role === 'epicycle')!;
      const el = elementsAt(JD, BODIES[body].orbit!);

      expect(deferent.radius, body).toBeCloseTo(el.a, 9);
      expect(epicyclet.radius, body).toBeCloseTo(0.5 * el.a * el.e, 9);
      // 1/2 against 3/2 — the bisection, seen directly.
      expect(epicyclet.radius / (1.5 * el.a * el.e), body).toBeCloseTo(1 / 3, 9);
    }
  });

  /**
   * The epicyclet is what makes this Copernicus rather than a bare eccentric,
   * and it is *small*: a fifth of the Ptolemaic epicycle for Mars, whose ratio
   * to the deferent is 0.658. That size difference is the case
   * De revolutionibus actually makes — simpler machinery, not better numbers.
   */
  it('is far smaller than the epicycle Ptolemy needed', () => {
    const construction = copernicanConstruction(JD, 'mars')!;
    const deferent = construction.circles.find((c) => c.role === 'deferent')!;
    const epicyclet = construction.circles.find((c) => c.role === 'epicycle')!;

    expect(epicyclet.radius / deferent.radius).toBeLessThan(0.1);
  });

  it('puts the planet where the engine puts it', () => {
    // The harness must not drift from the positions the map draws.
    for (const body of PLANETS) {
      const construction = copernicanConstruction(JD, body)!;
      const arm = construction.arms.find((a) => a.role === 'epicycle-arm')!;
      const position = copernicanPositions(JD).get(body)!;

      expect(length(sub(arm.to, position)), body).toBeCloseTo(0, 9);
    }
  });

  it('hangs the Moon construction off Earth, not off the Sun', () => {
    const construction = copernicanConstruction(JD, 'moon')!;
    const centre = construction.markers.find((m) => m.role === 'centre')!.at;
    const earth = copernicanPositions(JD).get('earth')!;

    // Within the lunar orbit of Earth, and nowhere near the Sun.
    expect(length(sub(centre, earth))).toBeLessThan(0.01);
    expect(solarDistance(centre)).toBeGreaterThan(0.9);
  });

  it('draws nothing for the Sun', () => {
    expect(copernicanConstruction(JD, 'sun')).toBeNull();
  });
});

describe('the epicyclet turns at twice the mean anomaly', () => {
  /**
   * At perihelion and aphelion alike the epicyclet must point back along the
   * apsidal line — that is what puts the planet at a(1−e) and a(1+e) — and it
   * only does so if it turns at 2M. At quadrature it points across it.
   */
  it('returns the planet to the apsidal line at both apsides', () => {
    const model = BODIES.mars.orbit!;

    let atPerihelion = Infinity;
    let atAphelion = Infinity;
    let perihelionDay = 0;
    let aphelionDay = 0;

    for (let day = 0; day < 700; day += 0.5) {
      const m = Math.abs(meanAnomalyAt(JD + day, model));
      if (m < atPerihelion) {
        atPerihelion = m;
        perihelionDay = day;
      }
      if (Math.abs(180 - m) < atAphelion) {
        atAphelion = Math.abs(180 - m);
        aphelionDay = day;
      }
    }

    const el = elementsAt(JD, model);
    expect(solarDistance(copernicanHeliocentricAt(JD + perihelionDay, model))).toBeCloseTo(
      el.a * (1 - el.e),
      3,
    );
    expect(solarDistance(copernicanHeliocentricAt(JD + aphelionDay, model))).toBeCloseTo(
      el.a * (1 + el.e),
      3,
    );
  });
});
