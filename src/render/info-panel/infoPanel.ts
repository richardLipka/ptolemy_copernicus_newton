/**
 * Details of the selected body.
 *
 * The phase disc is the same CSS technique as the map markers at a larger size.
 *
 * Note what it does *not* show: switching to the epicyclic Ptolemaic engine
 * does not turn Venus into a permanent crescent. Ptolemy's construction fixes
 * angles, not distances — his epicycle ratio lets Venus reach the far side of
 * its epicycle and appear full. What forbade a full Venus was the nested-sphere
 * cosmology built around that construction, in which Venus's shell lay wholly
 * inside the Sun's, and this engine does not model the nesting.
 *
 * That is the actual historical point, and a sharper one than the usual
 * telling: Galileo's observation was decisive precisely because it attacked
 * the one thing the geocentric longitude machinery had never been able to
 * speak to. See `core/venus-phases.test.ts`.
 */

import { AU_IN_KM, BODIES, type BodyId } from '../../core/bodies';
import { apparentLongitudeRate, solarElongation } from '../../core/coordinates';
import type { EngineId } from '../../core/engines/types';
import { illuminationOf, phaseName } from '../../core/illumination';
import { t, bodyName, formatNumber } from '../../i18n/i18n';
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
  // The lit fraction depends on nothing but the Sun-body-observer angle, and
  // both historical constructions were fitted to reproduce that triangle, so
  // they agree more closely than their reputations suggest. Mercury is the
  // exception and worth selecting: the models part company by around twenty
  // percentage points there, because its eccentricity of 0.21 defeats both a
  // circle and an epicycle.
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

  // With a ghost model selected, the gap between the two predictions is the
  // number the whole app is built to surface.
  if (state.ghostEngineId) {
    const ghostPositions = ENGINES[state.ghostEngineId].positionsAt(state.julianDate);
    const ghostBody = ghostPositions.get(selected);
    const activeBody = view.positions.get(selected);
    const ghostObserver = ghostPositions.get(state.observationPoint);
    const activeObserver = view.positions.get(state.observationPoint);

    if (ghostBody && activeBody && ghostObserver && activeObserver) {
      const separationAu = Math.hypot(
        ghostBody.x - ghostObserver.x - (activeBody.x - activeObserver.x),
        ghostBody.y - ghostObserver.y - (activeBody.y - activeObserver.y),
        ghostBody.z - ghostObserver.z - (activeBody.z - activeObserver.z),
      );
      card.appendChild(
        readout(
          t('info.modelError'),
          `${formatNumber(separationAu * AU_IN_KM / 1e6, 2)} mil. km`,
        ),
      );
    }
  }

  container.appendChild(card);
}
