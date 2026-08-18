/**
 * Details of the selected body.
 *
 * The phase disc is the same CSS technique as the map markers at a larger size.
 *
 * Select Venus and switch between the epicyclic engine and Newton to re-run the
 * observation that broke the geocentric system. Ptolemy's deferents are scaled
 * to his nested spheres, so Venus is penned inside the Sun's shell and never
 * exceeds 44% lit: the model says crescent where the sky says full.
 *
 * That is the sharper form of the historical point. On *longitude* the two
 * systems were in the same bracket — see `core/engines/accuracy.test.ts` — so
 * the argument could never be settled on where the planets appear. It was
 * settled on how they are *lit*, which is the one thing the angular machinery
 * had never been able to speak to.
 */

import { BODIES, type BodyId } from '@orrery/core/bodies';
import {
  apparentLongitude,
  apparentLongitudeRate,
  relativePosition,
  solarElongation,
} from '@orrery/core/coordinates';
import { inDeferentParts } from '@orrery/core/engines/ptolemaicUnits';
import type { EngineId } from '@orrery/core/engines/types';
import { illuminationOf, phaseName } from '@orrery/core/illumination';
import { t, bodyName, formatExponent, formatNumber, formatShare } from '../../i18n/i18n';
import { angleDiffDeg } from '@orrery/core/vec';
import { ENGINES } from '@orrery/core/engines/registry';
import type { Store } from '../../state/store';
import { buildView } from '../../state/selectors';
import { el, panel, readout } from '../../ui/dom';

/** One engine per model, for the side-by-side phase figures. */
const PHASE_COMPARISON_ENGINES: readonly EngineId[] = [
  'nbody',
  'keplerian',
  'circular',
  'ptolemaic-epicyclic',
];

export function renderInfoPanel(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const card = panel(t('info.title'));

  if (!state.selectedBody) {
    card.appendChild(el('p', 'note', t('info.none')));
    container.appendChild(card);
    return;
  }

  const selected: BodyId = state.selectedBody;
  const view = buildView(state);
  const body = view.bodies.find((candidate) => candidate.id === selected);
  if (!body) {
    container.appendChild(card);
    return;
  }

  card.appendChild(el('h3', 'masthead__title', bodyName(selected)));

  if (selected !== 'sun' && !body.isObserver) {
    const lit = body.illumination.illuminatedFraction;

    const disc = el('div', 'phase-disc');
    disc.style.setProperty('--tint', `var(--body-${selected})`);
    // The lit limb faces the Sun, so it sits on the side the body lies away
    // from it — the same reason a waxing Moon is lit on the right.
    disc.dataset.side = body.illumination.waxing ? 'right' : 'left';
    disc.dataset.shape = lit >= 0.5 ? 'gibbous' : 'crescent';
    // Width of the terminator ellipse, |cos i| of the disc.
    disc.style.setProperty('--lit-width', Math.abs(2 * lit - 1).toFixed(4));
    disc.appendChild(el('div', 'phase-disc__half'));
    disc.appendChild(el('div', 'phase-disc__terminator'));
    card.appendChild(disc);

    card.appendChild(
      el(
        'p',
        'phase-caption',
        // "z Marsu", not "z Mars" — the preposition takes the genitive.
        t('info.asSeenFrom', { body: bodyName(state.observationPoint, 'genitive') }),
      ),
    );

    card.appendChild(readout(t('info.phase'), t(`phase.${phaseName(body.illumination)}`)));
    card.appendChild(
      readout(t('info.illuminated'), `${formatNumber(lit * 100, 0)} %`),
    );
    card.appendChild(
      readout(
        t('info.phaseAngle'),
        `${formatNumber(body.illumination.phaseAngle, 1)}${t('info.unit.deg')}`,
      ),
    );
  }

  card.appendChild(
    readout(
      t('info.apparentPosition'),
      `${formatNumber(body.zodiac.degreesInto, 1)}° ${t(`zodiac.${body.zodiac.division.id}`)}`,
    ),
  );

  /*
   * Distances read in Ptolemy's own unit while one of his constructions is
   * running. See core/engines/ptolemaicUnits.ts: the Almagest fixes no absolute
   * distance at all, only each body's measurements in parts of its own deferent
   * of 60, so AU here would be an anachronism twice over.
   *
   * The reframe mode is excluded on purpose. It is modern positions wearing
   * geocentric dress rather than anything Ptolemy computed, so AU is exactly
   * right for it.
   */
  const inPtolemysUnits =
    state.engineId === 'ptolemaic-epicyclic' || state.engineId === 'ptolemaic-almagest';
  const parts = inPtolemysUnits
    ? (au: number): number | null => inDeferentParts(au, state.julianDate, selected)
    : (): number | null => null;

  /** A length, in whichever unit the running model actually had. */
  const distance = (au: number): string => {
    const asParts = parts(au);
    // One decimal, always: Czech takes the genitive singular after a decimal,
    // so "63,2 dílu" is right for every value the readout can show.
    if (asParts !== null) return `${formatNumber(asParts, 1)} ${t('info.unit.parts')}`;
    return `${formatNumber(au, 3)} ${t('info.unit.au')}`;
  };

  /*
   * No distance from the Sun while Ptolemy is running.
   *
   * His construction determines one length and one only: how far a body is from
   * the Earth, in parts of its own deferent. A Sun-relative distance is not a
   * quantity the Almagest contains, and the figure this app could compute for it
   * would depend on where the nested spheres were anchored — a modern choice
   * made in ptolemaic.ts, not a result of his model. Printing it beside his own
   * numbers would dress that choice up as one of his findings.
   */
  if (!inPtolemysUnits) {
    card.appendChild(readout(t('info.distanceFromSun'), distance(body.distanceFromSun)));
  }

  if (!body.isObserver) {
    card.appendChild(
      readout(t('info.distanceFromObserver'), distance(body.distanceFromObserver)),
    );
    // Said next to the figure it qualifies: a reader who does not know that each
    // body's 60 is a different length will compare these across bodies and draw
    // a conclusion the Almagest never supported.
    if (inPtolemysUnits && parts(body.distanceFromObserver) !== null) {
      card.appendChild(el('p', 'note', t('info.ptolemyParts')));
    }
    card.appendChild(
      readout(
        t('info.elongation'),
        `${formatNumber(
          Math.abs(solarElongation(view.positions, state.observationPoint, selected)),
          1,
        )}${t('info.unit.deg')}`,
      ),
    );
    card.appendChild(
      readout(
        t('info.angularDiameter'),
        `${formatNumber(body.illumination.angularDiameter, 1)}${t('info.unit.arcsec')}`,
      ),
    );

    const rate = apparentLongitudeRate(
      (jd) => ENGINES[state.engineId].positionsAt(jd),
      state.julianDate,
      state.observationPoint,
      selected,
    );
    card.appendChild(
      readout('', rate < 0 ? t('info.retrograde') : t('info.direct')),
    );
  }

  card.appendChild(
    readout(
      t('info.radius'),
      `${formatNumber(BODIES[selected].radius, 0)} ${t('info.unit.km')}`,
    ),
  );

  // Exact force magnitudes, because the drawn vector lengths are deliberately
  // not proportional — a fourth root, or nothing but the Sun would be visible.
  const dynamics = store.engine.dynamics?.(state.julianDate, selected);
  if (dynamics) {
    const table = el('div', 'comparison');
    table.appendChild(el('div', 'field__label', t('info.forces')));

    table.appendChild(
      readout(t('info.speed'), `${formatNumber(dynamics.speedKmPerSecond, 2)} km/s`),
    );
    table.appendChild(
      readout(t('info.netForce'), `${formatExponent(dynamics.netNewtons)} N`),
    );

    for (const pull of dynamics.pulls) {
      const row = el('div', 'comparison__row');
      row.appendChild(el('span', undefined, bodyName(pull.source)));
      row.appendChild(
        el(
          'span',
          'readout__value',
          `${formatExponent(pull.newtons)} N · ${formatShare(pull.share)}`,
        ),
      );
      table.appendChild(row);
    }

    table.appendChild(el('p', 'note', t('info.forceScaleNote')));
    card.appendChild(table);
  }

  // What each model makes of the phase.
  //
  // This is the one reading where the geocentric model fails outright rather
  // than approximately. With its deferents scaled to the nested spheres, Venus
  // is penned inside the Sun's shell and never passes half-lit, so at superior
  // conjunction Ptolemy says crescent where the other two say full — a whole
  // disc apart. Venus and Mercury are the bodies to select for it.
  if (selected !== 'sun' && !body.isObserver) {
    const table = el('div', 'comparison');
    table.appendChild(el('div', 'field__label', t('info.phaseByModel')));

    for (const engineId of PHASE_COMPARISON_ENGINES) {
      const positions = ENGINES[engineId].positionsAt(state.julianDate);
      const lit = illuminationOf(positions, state.observationPoint, selected)
        .illuminatedFraction;

      const row = el('div', 'comparison__row');
      row.appendChild(el('span', undefined, t(`engine.${engineId}`)));
      row.appendChild(
        el('span', 'readout__value', `${formatNumber(lit * 100, 0)} %`),
      );
      if (engineId === state.engineId) row.classList.add('comparison__row--active');
      table.appendChild(row);
    }

    card.appendChild(table);
  }

  /*
   * With a ghost model selected, how far the two disagree.
   *
   * Reported as an *angle*, not as a distance. A linear separation conflates two
   * quite different disagreements, and since the deferents were scaled to
   * Ptolemy's nested spheres the distance term swamps everything: Mars showed
   * 677 million km of "error" where the two models place it only 4.3° apart. The
   * angle is the observable quantity, the one the accuracy tests measure, and
   * the one the historical argument turned on.
   *
   * The distance disagreement is worth seeing too, but as a ratio and clearly
   * labelled as such — it is precisely what no pre-telescopic observation could
   * test, and therefore what let the two systems coexist for so long.
   */
  // Only for a single named ghost: 'all' has no one counterpart to measure
  // against, and the map is already showing the whole spread.
  if (state.ghostEngineId && state.ghostEngineId !== 'all' && !body.isObserver) {
    const ghostPositions = ENGINES[state.ghostEngineId].positionsAt(state.julianDate);

    const separation = Math.abs(
      angleDiffDeg(
        apparentLongitude(ghostPositions, state.observationPoint, selected),
        apparentLongitude(view.positions, state.observationPoint, selected),
      ),
    );
    card.appendChild(
      readout(
        t('info.modelError'),
        `${formatNumber(separation, 2)}${t('info.unit.deg')}`,
      ),
    );

    const ghostDistance = relativePosition(
      ghostPositions,
      state.observationPoint,
      selected,
    ).distance;
    if (body.distanceFromObserver > 0 && ghostDistance > 0) {
      card.appendChild(
        readout(
          t('info.modelDistanceRatio'),
          `${formatNumber(ghostDistance / body.distanceFromObserver, 2)}×`,
        ),
      );
    }
  }

  container.appendChild(card);
}
