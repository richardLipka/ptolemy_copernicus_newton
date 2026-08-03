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

import { BODIES, type BodyId } from '../../core/bodies';
import {
  apparentLongitude,
  apparentLongitudeRate,
  relativePosition,
  solarElongation,
} from '../../core/coordinates';
import type { EngineId } from '../../core/engines/types';
import { illuminationOf, phaseName } from '../../core/illumination';
import { t, bodyName, formatNumber } from '../../i18n/i18n';
import { angleDiffDeg } from '../../core/vec';
import { ENGINES, type Store } from '../../state/store';
import { buildView } from '../../state/selectors';
import { el, panel, readout } from '../../ui/dom';

/**
 * Force magnitudes as a mantissa and a power of ten.
 *
 * They span twelve orders of magnitude between the Sun's grip and Saturn's, so
 * fixed-point notation is unreadable and locale grouping is beside the point.
 */
function formatExponent(value: number): string {
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${formatNumber(mantissa, 2)}·10${superscript(exponent)}`;
}

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const superscript = (exponent: number): string =>
  (exponent < 0 ? '⁻' : '') +
  Math.abs(exponent)
    .toString()
    .split('')
    .map((digit) => SUPERSCRIPTS[Number(digit)])
    .join('');

/** A pull's share of the total, with room for the very small ones. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent >= 1) return `${formatNumber(percent, 1)} %`;
  if (percent >= 0.001) return `${formatNumber(percent, 3)} %`;
  return '< 0,001 %';
}

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

  card.appendChild(
    readout(
      t('info.distanceFromSun'),
      `${formatNumber(body.distanceFromSun, 3)} ${t('info.unit.au')}`,
    ),
  );

  if (!body.isObserver) {
    card.appendChild(
      readout(
        t('info.distanceFromObserver'),
        `${formatNumber(body.distanceFromObserver, 3)} ${t('info.unit.au')}`,
      ),
    );
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
