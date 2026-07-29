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
import { phaseName } from '../../core/illumination';
import { t, bodyName, formatNumber } from '../../i18n/i18n';
import { ENGINES, type Store } from '../../state/store';
import { buildView } from '../../state/selectors';
import { el, panel, readout } from '../../ui/dom';

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
    const disc = el('div', 'phase-disc');
    disc.style.setProperty('--tint', `var(--body-${selected})`);
    const shadow = el('div', 'phase-disc__shadow');
    shadow.style.setProperty('--shadow-edge', String(1 - body.illumination.illuminatedFraction));
    shadow.style.setProperty('--sun-angle', '0');
    disc.appendChild(shadow);
    card.appendChild(disc);

    card.appendChild(
      readout(t('info.phase'), t(`phase.${phaseName(body.illumination)}`)),
    );
    card.appendChild(
      readout(
        t('info.illuminated'),
        `${formatNumber(body.illumination.illuminatedFraction * 100, 0)} %`,
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
