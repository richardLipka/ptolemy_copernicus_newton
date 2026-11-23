/**
 * Details of the selected body — compare-first inspector.
 *
 * Leads with the decisive visual comparisons (4-model live phase strip,
 * automatic refutation banner for Venus/Mercury, sky error vs VSOP87, and
 * Ptolemy's dimensionless deferent parts vs AU), exposes interactive machinery
 * parts that highlight the map on hover and open live measurements on click,
 * adds Newton's Moon force insight, and tucks secondary optical/physical
 * specifications behind a native `<details>` disclosure.
 */

import { BODIES, type BodyId } from '@orrery/core/bodies';
import {
  apparentLongitude,
  apparentLongitudeRate,
  relativePosition,
  solarElongation,
} from '@orrery/core/coordinates';
import { inDeferentParts } from '@orrery/core/engines/ptolemaicUnits';
import { ENGINES, REFERENCE_ENGINE_ID } from '@orrery/core/engines/registry';
import type { EngineId, ModeId } from '@orrery/core/engines/types';
import { illuminationOf, phaseName, type Illumination } from '@orrery/core/illumination';
import { dateFromJd } from '@orrery/core/time';
import { angleDiffDeg, length, sub } from '@orrery/core/vec';
import { t, bodyName, formatExponent, formatNumber, formatShare } from '../../i18n/i18n';
import { linkify } from '../../i18n/wikiLinks';
import {
  harnessCentre,
  type HarnessRole,
  type HarnessTarget,
} from '../../state/harnessMeasures';
import { buildView, focusViewFor, rawConstruction, rawRecentredHarness } from '../../state/selectors';
import type { State, Store } from '../../state/store';
import { el, note, readout } from '../../ui/dom';
import { exportButtonRow } from '../../ui/exportButtons';
import { buildPhaseSvg } from '../export/phaseSvg';
import { harnessNote } from '../orrery/harnessNotes';

/** One engine per model, for the side-by-side phase figures. */
export const PHASE_COMPARISON_ENGINES: readonly EngineId[] = [
  'nbody',
  'keplerian',
  'copernican',
  'ptolemaic-epicyclic',
];

/** Chronological order for the 4-disc visual phase strip. */
const PHASE_STRIP_MODELS: readonly { mode: ModeId; engineId: EngineId }[] = [
  { mode: 'ptolemy', engineId: 'ptolemaic-epicyclic' },
  { mode: 'copernicus', engineId: 'copernican' },
  { mode: 'kepler', engineId: 'keplerian' },
  { mode: 'newton', engineId: 'nbody' },
];

/** Persisted across 200ms playback rebuilds so disclosures do not snap shut. */
let detailsOpen = false;
let activePartKey: string | null = null;
let lastPartContext = '';

interface MachineryChip {
  key: string;
  role: HarnessRole;
  label: string;
  target: HarnessTarget;
}

function partLabel(role: HarnessRole, variant?: 'occupied' | 'empty'): string {
  if (role === 'focus') {
    return variant === 'empty'
      ? t('harness.part.focus.empty')
      : t('harness.part.focus.occupied');
  }
  switch (role) {
    case 'deferent':
      return t('harness.part.deferent');
    case 'epicycle':
      return t('harness.part.epicycle');
    case 'orbit':
      return t('harness.part.orbit');
    case 'centre':
      return t('harness.part.centre');
    case 'equant':
      return t('harness.part.equant');
    case 'deferent-arm':
      return t('harness.part.deferent-arm');
    case 'epicycle-arm':
      return t('harness.part.epicycle-arm');
    case 'radius':
      return t('harness.part.radius');
    case 'apsidal':
      return t('harness.part.apsidal');
    case 'velocity':
      return t('harness.part.velocity');
    case 'net-force':
      return t('harness.part.net-force');
    default:
      return role;
  }
}

/**
 * Enumerate the machinery parts for `selected` without calling `turnRates`
 * eagerly — full measurements are computed only for the single expanded chip.
 */
function collectMachineryChips(state: State, selected: BodyId, hasDynamics: boolean): MachineryChip[] {
  const chips: MachineryChip[] = [];
  const seen = new Set<string>();
  const add = (chip: MachineryChip): void => {
    if (seen.has(chip.key)) return;
    seen.add(chip.key);
    chips.push(chip);
  };

  const raw = rawConstruction(state, selected);
  if (raw) {
    const { construction, positions } = raw;
    for (const circle of construction.circles) {
      add({
        key: circle.role,
        role: circle.role,
        label: partLabel(circle.role),
        target: {},
      });
    }
    if (construction.ellipses && construction.ellipses.length > 0) {
      add({
        key: 'orbit',
        role: 'orbit',
        label: partLabel('orbit'),
        target: {},
      });
    }

    const origin = positions.get(harnessCentre(state, selected));
    const foci = construction.markers.filter((m) => m.role === 'focus').map((m) => m.at);
    const nearestFocus =
      origin && foci.length > 0
        ? foci.reduce((best, cand) =>
            length(sub(cand, origin)) < length(sub(best, origin)) ? cand : best,
          )
        : null;

    construction.markers.forEach((marker, idx) => {
      if (marker.role === 'focus') {
        const variant = nearestFocus && marker.at === nearestFocus ? 'occupied' : 'empty';
        add({
          key: `focus:${variant}`,
          role: 'focus',
          label: partLabel('focus', variant),
          target: { markerIndex: idx },
        });
      } else {
        add({
          key: marker.role,
          role: marker.role,
          label: partLabel(marker.role),
          target: { markerIndex: idx },
        });
      }
    });

    for (const arm of construction.arms) {
      add({
        key: arm.role,
        role: arm.role,
        label: partLabel(arm.role),
        target: {},
      });
    }
  }

  if (hasDynamics) {
    add({
      key: 'velocity',
      role: 'velocity',
      label: partLabel('velocity'),
      target: {},
    });
    add({
      key: 'net-force',
      role: 'net-force',
      label: partLabel('net-force'),
      target: {},
    });
  }

  if (state.showRecentredHarness) {
    const recentred = rawRecentredHarness(state, selected);
    if (recentred) {
      add({
        key: 'recentred:deferent',
        role: 'deferent',
        label: t('recentred.part.deferent', { body: bodyName(recentred.deferentBody) }),
        target: { overlay: 'recentred' },
      });
      if (recentred.epicycleBody) {
        add({
          key: 'recentred:epicycle',
          role: 'epicycle',
          label: t('recentred.part.epicycle', { body: bodyName(recentred.epicycleBody) }),
          target: { overlay: 'recentred' },
        });
      }
      add({
        key: 'recentred:apsidal',
        role: 'apsidal',
        label: t('recentred.part.apsidal', { body: bodyName(recentred.deferentBody) }),
        target: { overlay: 'recentred' },
      });
    }
  }

  return chips;
}

function buildPhaseDisc(bodyId: BodyId, illumination: Illumination, extraClass: string): HTMLDivElement {
  const lit = illumination.illuminatedFraction;
  const disc = el('div', `phase-disc ${extraClass}`);
  disc.style.setProperty('--tint', `var(--body-${bodyId})`);
  disc.dataset.side = illumination.waxing ? 'right' : 'left';
  disc.dataset.shape = lit >= 0.5 ? 'gibbous' : 'crescent';
  disc.style.setProperty('--lit-width', Math.abs(2 * lit - 1).toFixed(4));
  disc.append(el('div', 'phase-disc__half'), el('div', 'phase-disc__terminator'));
  return disc;
}

function setHarnessHover(role: HarnessRole | null, overlay?: 'recentred'): void {
  const layer = document.querySelector<HTMLElement>('.harness');
  if (!layer) return;
  if (role) {
    layer.dataset.hover = role;
    if (overlay) layer.dataset.hoverOverlay = overlay;
    else delete layer.dataset.hoverOverlay;
  } else {
    delete layer.dataset.hover;
    delete layer.dataset.hoverOverlay;
  }
}

export function renderInfoPanel(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const bodyWrap = el('div', 'info-pane');

  if (!state.selectedBody) {
    bodyWrap.appendChild(note(t('info.none'), 'note note--live'));
    container.appendChild(bodyWrap);
    return;
  }

  const selected: BodyId = state.selectedBody;
  const partContext = `${selected}|${state.engineId}`;
  if (partContext !== lastPartContext) {
    lastPartContext = partContext;
    activePartKey = null;
  }

  const view = buildView(state);
  const body = view.bodies.find((candidate) => candidate.id === selected);
  if (!body) {
    container.appendChild(bodyWrap);
    return;
  }

  // --- 1. Header row: body swatch, name, motion badge, Focus & Working ---

  const head = el('div', 'info-head');
  const identity = el('div', 'info-head__id');
  const swatch = el('span', 'chip__swatch');
  swatch.style.setProperty('--tint', `var(--body-${selected})`);
  identity.append(swatch, el('h3', 'info-head__name', bodyName(selected)));

  if (!body.isObserver) {
    const rate = apparentLongitudeRate(
      (jd) => ENGINES[state.engineId].positionsAt(jd),
      state.julianDate,
      state.observationPoint,
      selected,
    );
    const motion = el(
      'span',
      `motion-badge ${rate < 0 ? 'motion-badge--retro' : 'motion-badge--direct'}`,
      rate < 0 ? t('info.retrograde') : t('info.direct'),
    );
    identity.appendChild(motion);
  }

  const actions = el('div', 'info-head__actions');
  const focusBtn = el('button', 'info-head__btn', t('info.focus'));
  focusBtn.type = 'button';
  focusBtn.addEventListener('click', () => {
    const targetView = focusViewFor(store.get(), selected);
    store.setZoom(targetView.zoom);
    store.panTo(targetView.centreOn.x, targetView.centreOn.y);
  });

  const workingBtn = el('button', 'info-head__btn', `∑ ${t('info.working')}`);
  workingBtn.type = 'button';
  workingBtn.addEventListener('click', () => store.setCalculationOpen(true));

  actions.append(focusBtn, workingBtn);
  head.append(identity, actions);
  bodyWrap.appendChild(head);

  // --- 2. 4-Model Phase Disc Strip + Refutation Callout ------------------

  if (selected !== 'sun' && !body.isObserver) {
    const phaseSection = el('section', 'info-section');

    const phaseHeader = el('div', 'info-section__head');
    phaseHeader.appendChild(el('span', 'field__label', t('info.phaseByModel')));

    const phaseExport = exportButtonRow(
      (width, height) => buildPhaseSvg({ width, height, state }),
      () => [
        'phase',
        selected,
        state.engineId,
        dateFromJd(state.julianDate).toISOString().slice(0, 10),
      ],
      () => ({ width: 480, height: 420 }),
    );
    phaseExport.classList.add('export--compact', 'export--inline');
    phaseHeader.appendChild(phaseExport);
    phaseSection.appendChild(phaseHeader);

    const strip = el('div', 'phase-strip');
    let ptolemyLit = 0;
    let keplerLit = 0;

    for (const { mode, engineId } of PHASE_STRIP_MODELS) {
      const positions = ENGINES[engineId].positionsAt(state.julianDate);
      const illum = illuminationOf(positions, state.observationPoint, selected);
      if (mode === 'ptolemy') ptolemyLit = illum.illuminatedFraction;
      if (mode === 'kepler') keplerLit = illum.illuminatedFraction;

      const item = el('button', 'phase-strip__item');
      item.type = 'button';
      item.setAttribute('aria-pressed', String(state.mode === mode));
      item.append(
        buildPhaseDisc(selected, illum, 'phase-disc--strip'),
        el('span', 'phase-strip__model', t(`mode.${mode}`)),
        el('span', 'phase-strip__pct', `${formatNumber(illum.illuminatedFraction * 100, 0)} %`),
      );
      item.addEventListener('click', () => store.setMode(mode));
      strip.appendChild(item);
    }
    phaseSection.appendChild(strip);

    phaseSection.appendChild(
      el(
        'p',
        'phase-caption',
        `${t(`phase.${phaseName(body.illumination)}`)} · ${formatNumber(body.illumination.phaseAngle, 1)}${t('info.unit.deg')} · ${t('info.asSeenFrom', { body: bodyName(state.observationPoint, 'genitive') })}`,
      ),
    );

    if (
      (selected === 'venus' || selected === 'mercury') &&
      (keplerLit >= 0.5 || keplerLit - ptolemyLit >= 0.2)
    ) {
      phaseSection.appendChild(
        el(
          'div',
          'callout callout--refutation',
          t('info.phaseRefuted', {
            body: bodyName(selected),
            max: selected === 'venus' ? '44' : '8',
            heliocentric: formatNumber(keplerLit * 100, 0),
          }),
        ),
      );
    }

    bodyWrap.appendChild(phaseSection);
  }

  // --- 3. Sky position, error vs reference, and scale/distance -----------

  const metricsSection = el('section', 'info-section');

  metricsSection.appendChild(
    readout(
      t('info.apparentPosition'),
      `${formatNumber(body.zodiac.degreesInto, 1)}° ${t(`zodiac.${body.zodiac.division.id}`)}`,
    ),
  );

  if (!body.isObserver && state.engineId !== REFERENCE_ENGINE_ID) {
    const refPositions = ENGINES[REFERENCE_ENGINE_ID].positionsAt(state.julianDate);
    const errDeg = Math.abs(
      angleDiffDeg(
        apparentLongitude(view.positions, state.observationPoint, selected),
        apparentLongitude(refPositions, state.observationPoint, selected),
      ),
    );
    metricsSection.appendChild(
      readout(
        t('info.errorVsReference'),
        `${formatNumber(errDeg, 2)}${t('info.unit.deg')}`,
      ),
    );
  }

  const inPtolemysUnits =
    state.engineId === 'ptolemaic-epicyclic' || state.engineId === 'ptolemaic-almagest';
  const parts = inPtolemysUnits
    ? (au: number): number | null => inDeferentParts(au, state.julianDate, selected)
    : (): number | null => null;

  const distance = (au: number): string => {
    const asParts = parts(au);
    if (asParts !== null) return `${formatNumber(asParts, 1)} ${t('info.unit.parts')}`;
    return `${formatNumber(au, 3)} ${t('info.unit.au')}`;
  };

  if (!body.isObserver) {
    const scaleBlock = el('div', 'comparison');
    scaleBlock.appendChild(el('div', 'field__label', t('info.distanceByModel')));

    for (const { mode, engineId } of PHASE_STRIP_MODELS) {
      const active = state.mode === mode;
      const effectiveEngine = active ? state.engineId : engineId;
      const positions =
        effectiveEngine === state.engineId
          ? view.positions
          : ENGINES[effectiveEngine].positionsAt(state.julianDate);
      const distAu = relativePosition(positions, state.observationPoint, selected).distance;
      const ptolemyUnits =
        effectiveEngine === 'ptolemaic-epicyclic' || effectiveEngine === 'ptolemaic-almagest';
      const asParts = ptolemyUnits
        ? inDeferentParts(distAu, state.julianDate, selected)
        : null;

      const row = el(
        'button',
        active ? 'comparison__row comparison__row--btn comparison__row--active' : 'comparison__row comparison__row--btn',
      );
      row.type = 'button';
      row.appendChild(el('span', undefined, t(`mode.${mode}`)));

      const val = el('span', 'readout__value');
      if (asParts !== null) {
        val.append(
          `${formatNumber(asParts, 1)} ${t('info.unit.parts')} `,
          el('span', 'pill-flag', t('info.noAbsoluteScale')),
        );
      } else {
        val.textContent = `${formatNumber(distAu, 3)} ${t('info.unit.au')}`;
      }
      row.appendChild(val);
      row.addEventListener('click', () => store.setMode(mode));
      scaleBlock.appendChild(row);
    }

    if (inPtolemysUnits && parts(body.distanceFromObserver) !== null) {
      scaleBlock.appendChild(note(t('info.ptolemyParts')));
    }
    metricsSection.appendChild(scaleBlock);
  }

  if (state.ghostEngineId && state.ghostEngineId !== 'all' && !body.isObserver) {
    const ghostPositions = ENGINES[state.ghostEngineId].positionsAt(state.julianDate);
    const separation = Math.abs(
      angleDiffDeg(
        apparentLongitude(ghostPositions, state.observationPoint, selected),
        apparentLongitude(view.positions, state.observationPoint, selected),
      ),
    );
    metricsSection.appendChild(
      readout(t('info.modelError'), `${formatNumber(separation, 2)}${t('info.unit.deg')}`),
    );

    const ghostDistance = relativePosition(
      ghostPositions,
      state.observationPoint,
      selected,
    ).distance;
    if (body.distanceFromObserver > 0 && ghostDistance > 0) {
      metricsSection.appendChild(
        readout(
          t('info.modelDistanceRatio'),
          `${formatNumber(ghostDistance / body.distanceFromObserver, 2)}×`,
        ),
      );
    }
  }

  bodyWrap.appendChild(metricsSection);

  // --- 4. Interactive Model Machinery Parts ------------------------------

  const dynamics = store.engine.dynamics?.(state.julianDate, selected);
  const machinery = collectMachineryChips(state, selected, Boolean(dynamics));

  if (machinery.length > 0) {
    const machSection = el('section', 'info-section');
    machSection.appendChild(el('div', 'field__label', t('info.machineryParts')));

    const chipRow = el('div', 'machinery-chips');
    let activeChip: MachineryChip | null = null;

    for (const chip of machinery) {
      const active = activePartKey === chip.key;
      if (active) activeChip = chip;

      const btn = el('button', 'machinery-chip', chip.label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(active));
      btn.addEventListener('mouseenter', () => setHarnessHover(chip.role, chip.target.overlay));
      btn.addEventListener('mouseleave', () => setHarnessHover(null));
      btn.addEventListener('focus', () => setHarnessHover(chip.role, chip.target.overlay));
      btn.addEventListener('blur', () => setHarnessHover(null));
      btn.addEventListener('click', () => {
        activePartKey = activePartKey === chip.key ? null : chip.key;
        setHarnessHover(activePartKey ? chip.role : null, activePartKey ? chip.target.overlay : undefined);
        renderInfoPanel(container, store);
      });
      chipRow.appendChild(btn);
    }
    machSection.appendChild(chipRow);

    if (activeChip) {
      const detailNote = harnessNote(state, selected, activeChip.role, activeChip.target);
      if (detailNote) {
        const detailCard = el('div', 'machinery-detail');
        const prose = el('p', 'machinery-detail__body');
        prose.appendChild(linkify(detailNote.body));
        detailCard.appendChild(prose);

        for (const item of detailNote.values) {
          detailCard.appendChild(readout(item.label, item.value));
        }
        machSection.appendChild(detailCard);
      }
    }

    bodyWrap.appendChild(machSection);
  }

  // --- 5. Newton Forces + Moon perturbation insight ----------------------

  if (dynamics) {
    const forceSection = el('section', 'info-section comparison');
    forceSection.appendChild(el('div', 'field__label', t('info.forces')));

    forceSection.appendChild(
      readout(t('info.speed'), `${formatNumber(dynamics.speedKmPerSecond, 2)} km/s`),
    );
    forceSection.appendChild(
      readout(t('info.netForce'), `${formatExponent(dynamics.netNewtons)} N`),
    );

    if (selected === 'moon') {
      const sunPull = dynamics.pulls.find((p) => p.source === 'sun');
      const earthPull = dynamics.pulls.find((p) => p.source === 'earth');
      if (sunPull && earthPull && earthPull.newtons > 0 && sunPull.newtons > earthPull.newtons) {
        forceSection.appendChild(
          el(
            'div',
            'callout callout--insight',
            t('info.moonForceInsight', {
              ratio: formatNumber(sunPull.newtons / earthPull.newtons, 1),
            }),
          ),
        );
      }
    }

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
      forceSection.appendChild(row);
    }

    forceSection.appendChild(note(t('info.forceScaleNote')));
    bodyWrap.appendChild(forceSection);
  }

  // --- 6. Secondary Physical & Optical Details (native <details>) --------

  const disclosure = el('details', 'details-disclosure');
  disclosure.open = detailsOpen;
  disclosure.addEventListener('toggle', () => {
    detailsOpen = disclosure.open;
  });
  disclosure.appendChild(el('summary', 'details-disclosure__summary', t('info.physicalDetails')));

  const detailsBody = el('div', 'details-disclosure__body');
  if (!inPtolemysUnits) {
    detailsBody.appendChild(readout(t('info.distanceFromSun'), distance(body.distanceFromSun)));
  }
  if (!body.isObserver) {
    detailsBody.appendChild(
      readout(
        t('info.elongation'),
        `${formatNumber(
          Math.abs(solarElongation(view.positions, state.observationPoint, selected)),
          1,
        )}${t('info.unit.deg')}`,
      ),
    );
    detailsBody.appendChild(
      readout(
        t('info.angularDiameter'),
        `${formatNumber(body.illumination.angularDiameter, 1)}${t('info.unit.arcsec')}`,
      ),
    );
  }
  detailsBody.appendChild(
    readout(
      t('info.radius'),
      `${formatNumber(BODIES[selected].radius, 0)} ${t('info.unit.km')}`,
    ),
  );
  disclosure.appendChild(detailsBody);
  bodyWrap.appendChild(disclosure);

  container.appendChild(bodyWrap);
}
