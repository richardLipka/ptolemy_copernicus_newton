/**
 * The left settings rail: Vantage (chair & eye + equivalence bridge),
 * Map & Views (machinery, overlays, scale, observer evidence), and Bodies.
 *
 * Model selection, Ghost comparison, Guided Trials, Calculation Working, and
 * Map Export now live in the Top Command Bar, keeping this rail compact and
 * scannable without scrolling on standard laptop viewports.
 */

import { BODIES, BODY_IDS, type BodyId } from '@orrery/core/bodies';
import { formatNumber, t } from '../i18n/i18n';
import type { EvidenceTab, ScaleMode, SphereCentre, Store } from '../state/store';
import {
  buildRecentredHarness,
  focusViewFor,
  recentredHarnessAvailable,
  recentredHarnessBlockedBy,
} from '../state/selectors';
import { el, field, note, panel, select, toggleButton } from './dom';

const bodyOptions = (): { value: BodyId; label: string }[] =>
  BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) }));

const CLASSICAL_BODIES: readonly BodyId[] = BODY_IDS.filter((id) => !BODIES[id].satellite);
const MOON_BODIES: readonly BodyId[] = BODY_IDS.filter((id) => Boolean(BODIES[id].satellite));

const DOUBLE_CLICK_MS = 400;
let lastChipClick: { id: BodyId; at: number } | null = null;

function machineryLabelFor(store: Store): string {
  const state = store.get();
  if (store.engine.dynamics) return t('view.machinery.newton');
  if (state.engineId === 'keplerian') return t('view.machinery.kepler');
  if (state.engineId === 'copernican') return t('view.machinery.copernican');
  if (state.engineId === 'ptolemaic-epicyclic' || state.engineId === 'ptolemaic-almagest') {
    return t('view.machinery.ptolemaic');
  }
  return t('view.construction');
}

export function renderControls(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  // --- 1. Vantage (chair & eye + geometric equivalence bridge) -----------

  const vantagePanel = panel(t('vantage.label'));

  vantagePanel.appendChild(
    field(
      t('frame.label'),
      select(bodyOptions(), state.frameOrigin, (id) => store.setFrameOrigin(id)),
      t('frame.hint'),
    ),
  );

  // Quick 1-click stationary-point presets so switching chairs takes one tap.
  const quickFrames = el('div', 'quick-row');
  const framePresets: { id: BodyId; label: string }[] = [
    { id: 'sun', label: t('body.sun') },
    { id: 'earth', label: t('body.earth') },
  ];
  if (state.selectedBody && state.selectedBody !== 'sun' && state.selectedBody !== 'earth') {
    framePresets.push({ id: state.selectedBody, label: t(`body.${state.selectedBody}`) });
  } else {
    framePresets.push({ id: 'mars', label: t('body.mars') });
  }
  for (const preset of framePresets) {
    const btn = toggleButton(preset.label, state.frameOrigin === preset.id, () =>
      store.setFrameOrigin(preset.id),
    );
    btn.className = 'quick-chip';
    quickFrames.appendChild(btn);
  }
  vantagePanel.appendChild(quickFrames);

  vantagePanel.appendChild(
    field(
      t('observer.label'),
      select(bodyOptions(), state.observationPoint, (id) =>
        store.setObservationPoint(id),
      ),
      t('observer.hint'),
    ),
  );

  const centreRow = el('div', 'segmented');
  const centres: { id: SphereCentre; label: string }[] = [
    { id: 'frame', label: t('view.sphere.frame') },
    { id: 'observer', label: t('view.sphere.observer') },
  ];
  for (const centre of centres) {
    centreRow.appendChild(
      toggleButton(centre.label, state.sphereCentre === centre.id, () =>
        store.setSphereCentre(centre.id),
      ),
    );
  }
  vantagePanel.appendChild(field(t('view.sphere.label'), centreRow));
  vantagePanel.appendChild(
    note(
      state.sphereCentre === 'observer'
        ? t('view.sphere.observerHint')
        : t('view.sphere.frameHint'),
    ),
  );

  // Contextual Equivalence Bridge: makes the hidden Composition insight
  // discoverable in one click whenever Copernicus or Kepler is running.
  const isHeliocentricConstruction =
    state.engineId === 'copernican' || state.engineId === 'keplerian';

  if (isHeliocentricConstruction && state.frameOrigin === 'sun') {
    const cta = el('button', 'equivalence-cta', `⇄ ${t('view.equivalenceCta')}`);
    cta.type = 'button';
    cta.addEventListener('click', () => {
      const current = store.get();
      store.setFrameOrigin('earth');
      if (
        !current.selectedBody ||
        current.selectedBody === 'sun' ||
        current.selectedBody === 'earth' ||
        current.selectedBody === 'moon' ||
        BODIES[current.selectedBody].satellite
      ) {
        store.selectBody('mars');
      }
      if (!store.get().showRecentredHarness) store.toggle('showRecentredHarness');
    });
    vantagePanel.appendChild(cta);
  } else if (recentredHarnessAvailable(state)) {
    const compBtn = toggleButton(
      `⇄ ${t('view.recentred')}`,
      state.showRecentredHarness,
      () => store.toggle('showRecentredHarness'),
    );
    compBtn.className = 'equivalence-cta';
    vantagePanel.appendChild(compBtn);

    if (state.showRecentredHarness && state.selectedBody) {
      const harness = buildRecentredHarness(state, state.selectedBody);
      if (harness) {
        const box = el('div', 'equivalence-box');
        const eqText =
          harness.epicycleBody === null
            ? t('view.equivalenceEquationSun', {
                origin: t(`body.${state.frameOrigin}`),
                body: t(`body.${state.selectedBody}`),
                deferent: t(`body.${harness.deferentBody}`),
              })
            : t('view.equivalenceEquation', {
                origin: t(`body.${state.frameOrigin}`),
                body: t(`body.${state.selectedBody}`),
                deferent: t(`body.${harness.deferentBody}`),
                epicycle: t(`body.${harness.epicycleBody}`),
              });
        box.appendChild(el('div', 'equivalence-box__eq', eqText));

        if (state.frameOrigin === 'earth' && harness.epicycleBody !== null) {
          box.appendChild(
            el(
              'div',
              'equivalence-box__tag',
              t(
                harness.jointIsSun
                  ? 'view.equivalenceTagInferior'
                  : 'view.equivalenceTagSuperior',
              ),
            ),
          );
        }
        vantagePanel.appendChild(box);

        // Full explanatory prose when `ⓘ` explanations are enabled.
        const wording =
          harness.epicycleBody === null
            ? 'view.recentredSunOnly'
            : harness.jointIsSun
              ? 'view.recentredSunJoint'
              : 'view.recentredEmptyJoint';
        vantagePanel.appendChild(
          note(
            t(wording, {
              deferent: t(`body.${harness.deferentBody}.genitive`),
              epicycle: harness.epicycleBody ? t(`body.${harness.epicycleBody}`) : '',
              origin: t(`body.${state.frameOrigin}.genitive`),
            }),
          ),
        );
        if (state.frameOrigin === 'earth' && harness.epicycleBody !== null) {
          vantagePanel.appendChild(
            note(
              t(
                harness.jointIsSun
                  ? 'view.recentredPtolemyInferior'
                  : 'view.recentredPtolemySuperior',
              ),
            ),
          );
        }
      }
    }
  } else {
    const blocked = recentredHarnessBlockedBy(state);
    if (blocked) {
      vantagePanel.appendChild(
        note(
          t('view.recentredNoOrbit', {
            body: t(`body.${blocked}`),
            parent: t(`body.${BODIES[blocked].parent ?? 'sun'}.genitive`),
          }),
        ),
      );
    }
  }

  // --- 2. What to show (map layers, scale, observer evidence) ------------

  const harnessPanel = panel(t('harness.label'));

  const toggles = el('div', 'toggle-grid');

  const hasMachinery = Boolean(store.engine.construction ?? store.engine.dynamics);
  if (hasMachinery) {
    toggles.appendChild(
      toggleButton(machineryLabelFor(store), state.showConstruction, () =>
        store.toggle('showConstruction'),
      ),
    );
  }

  toggles.append(
    toggleButton(t('view.sightlines'), state.showSightLines, () =>
      store.toggle('showSightLines'),
    ),
    toggleButton(t('view.orbits'), state.showOrbits, () => store.toggle('showOrbits')),
    toggleButton(t('view.figures'), state.showStarFigures, () =>
      store.toggle('showStarFigures'),
    ),
  );

  // Compact inline trail-clear button right beside the chips when trails exist.
  if (state.showOrbits && store.trails.size > 0) {
    const clear = el('button', 'chip-clear', `✕ ${t('harness.clearTrails')}`);
    clear.type = 'button';
    clear.addEventListener('click', () => store.clearTrails());
    toggles.appendChild(clear);
  }

  harnessPanel.appendChild(toggles);

  const scaleRow = el('div', 'segmented segmented--compact');
  const scales: { id: ScaleMode; label: string }[] = [
    { id: 'compressed', label: t('view.compressedScale') },
    { id: 'true', label: t('view.trueScale') },
  ];
  for (const scale of scales) {
    scaleRow.appendChild(
      toggleButton(scale.label, state.scaleMode === scale.id, () =>
        store.setScaleMode(scale.id),
      ),
    );
  }
  harnessPanel.appendChild(scaleRow);

  // Observer's Evidence drawer launchers (clearly separated from map layers).
  const evidenceBlock = el('div', 'evidence-launch');
  evidenceBlock.appendChild(el('span', 'field__label', t('evidence.label')));
  const evidenceRow = el('div', 'toggle-grid');
  const evidenceTabs: { id: EvidenceTab; label: string }[] = [
    { id: 'sky', label: t('evidence.sky') },
    { id: 'track', label: t('evidence.track') },
    { id: 'scorecard', label: t('evidence.scorecard') },
  ];
  for (const tab of evidenceTabs) {
    evidenceRow.appendChild(
      toggleButton(tab.label, state.evidenceTab === tab.id, () =>
        store.setEvidenceTab(state.evidenceTab === tab.id ? null : tab.id),
      ),
    );
  }
  evidenceBlock.appendChild(evidenceRow);
  harnessPanel.appendChild(evidenceBlock);

  if (state.showOrbits) {
    harnessPanel.appendChild(
      el(
        'p',
        'note note--live',
        store.trails.size < 2
          ? t('harness.trailsEmpty')
          : t('harness.trailsRecorded', {
              days: formatNumber(store.trails.spanDays, 0),
              step: formatNumber(store.trails.stepDays, 2),
            }),
      ),
    );
  }

  // Contextual notes (collapsed by default behind `ⓘ`).
  harnessPanel.appendChild(note(t(`engine.help.${state.engineId}`)));
  harnessPanel.appendChild(note(t('view.scaleHint')));
  harnessPanel.appendChild(note(t('view.zoomHint')));

  if (
    state.showSightLines &&
    state.observationPoint !== state.frameOrigin &&
    state.scaleMode === 'compressed'
  ) {
    harnessPanel.appendChild(note(t('harness.sightlineBend')));
  }

  if (hasMachinery && state.showConstruction) {
    const legend = store.engine.dynamics
      ? 'view.forcesLegend'
      : state.engineId !== 'keplerian'
        ? 'view.constructionLegend'
        : state.selectedBody === 'moon'
          ? 'view.osculatingLegend'
          : 'view.ellipseLegend';

    harnessPanel.appendChild(
      note(!state.selectedBody ? t('view.constructionHint') : t(legend)),
    );

    if (state.selectedBody) {
      harnessPanel.appendChild(note(t('harness.hoverNote')));
    }

    if (store.engine.construction && state.selectedBody && state.scaleMode === 'compressed') {
      harnessPanel.appendChild(note(t('view.constructionScaleWarning')));
    }
  }

  // --- 3. Bodies (hierarchical: 8 classical + collapsible 5 moons) -------

  const bodyPanel = panel(t('bodies.label'));
  const makeChip = (id: BodyId): HTMLButtonElement => {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(state.selectedBody === id));
    chip.style.setProperty('--tint', `var(--body-${id})`);
    chip.append(el('span', 'chip__swatch'), el('span', undefined, t(`body.${id}`)));
    chip.addEventListener('click', () => {
      const now = performance.now();
      const second =
        lastChipClick !== null &&
        lastChipClick.id === id &&
        now - lastChipClick.at <= DOUBLE_CLICK_MS;
      lastChipClick = second ? null : { id, at: now };

      if (second) {
        const view = focusViewFor(store.get(), id);
        store.selectBody(id);
        store.setZoom(view.zoom);
        store.panTo(view.centreOn.x, view.centreOn.y);
        return;
      }
      store.selectBody(store.get().selectedBody === id ? null : id);
    });
    return chip;
  };

  const chips = el('div', 'chips');
  for (const id of CLASSICAL_BODIES) chips.appendChild(makeChip(id));

  const moonSystemSelected =
    state.selectedBody !== null &&
    (state.selectedBody === 'jupiter' ||
      state.selectedBody === 'saturn' ||
      Boolean(BODIES[state.selectedBody].satellite));
  const moonsExpanded = state.showMoons || moonSystemSelected;

  const moonToggle = el(
    'button',
    'chip chip--more',
    moonsExpanded ? t('bodies.moonsHide') : t('bodies.moonsMore'),
  );
  moonToggle.type = 'button';
  moonToggle.setAttribute('aria-expanded', String(moonsExpanded));
  moonToggle.addEventListener('click', () => store.toggleMoons());
  chips.appendChild(moonToggle);

  bodyPanel.appendChild(chips);

  if (moonsExpanded) {
    const moonRow = el('div', 'chips chips--moons');
    for (const id of MOON_BODIES) moonRow.appendChild(makeChip(id));
    bodyPanel.appendChild(moonRow);
  }

  bodyPanel.appendChild(note(t('bodies.focusHint')));

  container.append(vantagePanel, harnessPanel, bodyPanel);
}
