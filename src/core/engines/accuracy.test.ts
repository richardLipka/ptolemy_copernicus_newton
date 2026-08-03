/**
 * Cross-model accuracy comparison.
 *
 * These assertions encode the app's central historical claim, so a regression
 * here means the demonstration itself has broken.
 *
 * **The claim changed once Copernicus was modelled properly.** For a long time
 * this file asserted that Ptolemy predicted the superior planets better than
 * Copernicus — measured, and true, but only of a Copernicus who never existed.
 * The engine it tested put every planet on a *concentric* circle, and the 13°
 * error at Mars that followed was being read as the cost of using circles
 * instead of ellipses. *De revolutionibus* is eccentrics and epicyclets from end
 * to end; with those in place the error falls to a third of a degree.
 *
 * What survives is the part that actually mattered historically, and it is
 * sharper than the old claim: **heliocentrism bought no accuracy**. Copernicus's
 * construction is about as good as Ptolemy's, cost about as much to work by
 * hand, and needed roughly as many circles. It took Kepler's ellipse to make the
 * difference, and Kepler's ellipse is not heliocentrism — it is a change of
 * shape that could only be seen once the Sun was at the centre.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { apparentLongitude } from '../coordinates';
import { jdFromCalendar } from '../time';
import { angleDiffDeg } from '../vec';
import { circularPositions } from './circular';
import { copernicanPositions } from './copernican';
import { keplerianPositions } from './keplerian';
import { vsop87Positions } from './vsop87';
import { ptolemaicEpicyclicPositions } from './ptolemaic';

const SAMPLE_JDS = [1600, 1700, 1800, 1900, 2000, 2100, 2250, 2400].map((year) =>
  jdFromCalendar(year, 1, 1),
);

function worstError(
  body: BodyId,
  positionsAt: (jd: number) => ReturnType<typeof keplerianPositions>,
): number {
  let worst = 0;
  for (const jd of SAMPLE_JDS) {
    const truth = apparentLongitude(vsop87Positions(jd), 'earth', body);
    const modelled = apparentLongitude(positionsAt(jd), 'earth', body);
    worst = Math.max(worst, Math.abs(angleDiffDeg(modelled, truth)));
  }
  return worst;
}

const PLANETS: readonly BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

describe('heliocentrism on its own bought nothing', () => {
  /**
   * The two geometries land in the same bracket — a fraction of a degree to a
   * few degrees — which is the honest form of the old claim.
   *
   * A caveat this test cannot remove, and which the docs repeat: the comparison
   * is **not symmetric**. The Ptolemaic engine runs on Almagest parameters and
   * so carries his measurement errors; the Copernican engine runs on modern
   * ones and so shows his construction at its best. Copernicus's own figures
   * were no better than Ptolemy's, so the real *Prutenic Tables* were not the
   * improvement these numbers suggest. Read this as "the same order", never as
   * "Copernicus won".
   */
  it('puts both constructions within a few degrees, and neither runs away', () => {
    for (const body of PLANETS) {
      expect(worstError(body, ptolemaicEpicyclicPositions), body).toBeLessThan(8);
      expect(worstError(body, copernicanPositions), body).toBeLessThan(8);
    }
  });

  it('leaves Ptolemy comfortably usable on Mars, as it was for centuries', () => {
    expect(worstError('mars', ptolemaicEpicyclicPositions)).toBeLessThan(4);
  });
});

describe('the eccentric is what Copernicus actually built', () => {
  /**
   * The correction this file exists to record. Measured worst-case, 1600–2400:
   *
   *   body      concentric   eccentric + epicyclet
   *   mercury       6.12°                    0.80°
   *   venus         0.57°                    0.01°
   *   mars         13.47°                    0.33°
   *   jupiter       6.94°                    0.13°
   *   saturn        6.12°                    0.28°
   */
  it('beats the concentric-circle caricature on every planet', () => {
    for (const body of PLANETS) {
      expect(worstError(body, copernicanPositions), body).toBeLessThan(
        worstError(body, circularPositions),
      );
    }
  });

  it('turns thirteen degrees of Martian error into a third of one', () => {
    expect(worstError('mars', circularPositions)).toBeGreaterThan(10);
    expect(worstError('mars', copernicanPositions)).toBeLessThan(1);
  });

  /**
   * The construction matches an ellipse to first order in e, so what is left is
   * the second-order term — and it should track e² across bodies whose
   * eccentricities differ by a factor of thirty. Mercury (e = 0.206) must
   * therefore be far the worst and Venus (e = 0.007) far the best.
   *
   * This is the test that would catch the bisection being mis-implemented: get
   * the 3/2 and 1/2 shares wrong and the error stops scaling this way.
   */
  it('leaves an error that scales with the square of the eccentricity', () => {
    const mercury = worstError('mercury', copernicanPositions);
    const venus = worstError('venus', copernicanPositions);
    const mars = worstError('mars', copernicanPositions);

    expect(venus).toBeLessThan(mars);
    expect(mars).toBeLessThan(mercury);
    // e² differs by ~900× between Mercury and Venus; the errors follow.
    expect(mercury / venus).toBeGreaterThan(20);
  });
});

describe('and what Kepler changed', () => {
  /**
   * Still the sharpest result in the app, and now honestly framed: the ellipse
   * beats *both* pre-Keplerian constructions, not merely a straw one. Kepler's
   * remaining error is the perturbation he could not have known about.
   */
  it('beats Ptolemy on every planet', () => {
    for (const body of PLANETS) {
      expect(worstError(body, keplerianPositions), body).toBeLessThan(
        worstError(body, ptolemaicEpicyclicPositions),
      );
    }
  });

  /**
   * Against a properly built Copernicus the win is decisive only where the
   * orbit is eccentric enough for his second-order term to bite. Measured:
   *
   *   body      e       Copernican   Kepler    ratio
   *   mercury   0.206      0.799°     0.0045°   178× better
   *   mars      0.093      0.329°     0.0335°    10× better
   *
   * Mercury is the extreme case in both directions, which is the tidy result:
   * the most eccentric orbit is where circles fail worst and where the ellipse
   * pays best.
   */
  it('beats Copernicus decisively where the orbit is eccentric', () => {
    for (const body of ['mercury', 'mars'] as const) {
      expect(worstError(body, keplerianPositions), body).toBeLessThan(
        worstError(body, copernicanPositions) / 5,
      );
    }
  });

  /**
   * And loses on Jupiter and Saturn — which is not a defeat for the ellipse but
   * a fact about *this* engine. It is a two-body ellipse, so it omits the mutual
   * attraction of the heaviest pair in the system, and that omission is larger
   * there than the second-order error Copernicus's circles leave behind.
   *
   * Measured: Copernican 0.130° against Kepler 0.150° at Jupiter, 0.285° against
   * 0.348° at Saturn. The two are within a quarter of each other, which is the
   * honest way to put it — the ellipse's real advantage on those planets only
   * appears once perturbation is added, and that is Newton's territory.
   */
  it('is merely comparable on Jupiter and Saturn, where it omits perturbation', () => {
    for (const body of ['jupiter', 'saturn'] as const) {
      const ratio =
        worstError(body, keplerianPositions) / worstError(body, copernicanPositions);
      expect(ratio, body).toBeGreaterThan(0.5);
      expect(ratio, body).toBeLessThan(2);
    }
  });

  it('keeps every planet inside half a degree', () => {
    for (const body of PLANETS) {
      expect(worstError(body, keplerianPositions), body).toBeLessThan(0.5);
    }
  });
});

describe('every model stays within its historical accuracy', () => {
  const bounds: Partial<Record<BodyId, { ptolemy: number; copernicus: number }>> = {
    sun: { ptolemy: 1, copernicus: 1 },
    mercury: { ptolemy: 8, copernicus: 2 },
    venus: { ptolemy: 3, copernicus: 1 },
    mars: { ptolemy: 4, copernicus: 1 },
    jupiter: { ptolemy: 2, copernicus: 1 },
    saturn: { ptolemy: 4, copernicus: 1 },
    moon: { ptolemy: 4, copernicus: 2 },
  };

  for (const [body, limit] of Object.entries(bounds) as [
    BodyId,
    { ptolemy: number; copernicus: number },
  ][]) {
    it(`bounds ${body}`, () => {
      expect(worstError(body, ptolemaicEpicyclicPositions)).toBeLessThan(limit.ptolemy);
      expect(worstError(body, copernicanPositions)).toBeLessThan(limit.copernicus);
    });
  }
});
