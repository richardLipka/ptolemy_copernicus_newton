/**
 * The left settings rail: Vantage (chair & eye + equivalence bridge),
 * Map & Views (layers, scale, observer evidence), and Bodies.
 *
 * Every control group is laid out on strict symmetric grids (2-column pairs,
 * 3-column triads, 2x2 layers, 2x4 classical bodies) with zero resting prose
 * walls. Each panel carries an inline `?` button that toggles its contextual
 * explanations on demand (or reveals them all together via the top-bar `ⓘ`).
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
import { el, note, select, toggleButton } from './dom';

const bodyOptions = (): { value: BodyId; label: string }[] =>
  BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) }));

const CLASSICAL_BODIES: readonly BodyId[] = BODY_IDS.filter((id) => !BODIES[id].satellite);
const MOON_BODIES: readonly BodyId[] = BODY_IDS.filter((id) => Boolean(BODIES[id].satellite));

const DOUBLE_CLICK_MS = 400;
let lastChipClick: { id: BodyId; at: number } | null = null;

/** Per-panel on-demand help overrides, reset whenever global `ⓘ` toggles. */
const helpOverrides = new Map<string, boolean>();
let lastGlobalNotes: boolean | null = null;

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

function createPanelWithHelp(
  id: string,
  title: string,
  globalNotesOn: boolean,
  onToggleHelp: () => void,
): { container: HTMLDivElement; attachHelp: (texts: string[]) => void } {
  const container = el('div', 'panel');
  const header = el('div', 'panel__header');
  header.appendChild(el('h2', 'panel__title', title));

  const expanded = helpOverrides.get(id) ?? globalNotesOn;
  const helpBtn = el('button', 'panel__help-btn', '?');
  helpBtn.type = 'button';
  helpBtn.title = t('help.toggle');
  helpBtn.setAttribute('aria-label', `${title}: ${t('help.toggle')}`);
  helpBtn.setAttribute('aria-expanded', String(expanded));
  helpBtn.addEventListener('click', () => {
    helpOverrides.set(id, !expanded);
    onToggleHelp();
  });
  header.appendChild(helpBtn);
  container.appendChild(header);

  const attachHelp = (texts: string[]): void => {
    const clean = texts.filter((text) => text.trim().length > 0);
    if (!expanded || clean.length === 0) return;
    const box = el('div', 'panel__help');
    for (const text of clean) {
      box.appendChild(note(text, 'note note--live'));
    }
    container.appendChild(box);
  };

  return { container, attachHelp };
}

function compactField(label: string, control: HTMLElement): HTMLDivElement {
  const wrap = el('div', 'field field--compact');
  wrap.append(el('label', 'field__label', label), control);
  return wrap;
}

export function renderControls(container: HTMLElement, store: Store): void {
  const state = store.get();
  if (lastGlobalNotes !== null && lastGlobalNotes !== state.showNotes) {
    helpOverrides.clear();
  }
  lastGlobalNotes = state.showNotes;
  container.replaceChildren();
  const redraw = (): void => renderControls(container, store);

  // --- 1. Vantage (symmetric 2-col selects, 3-col presets, 2-col sphere) -

  const vantage = createPanelWithHelp('vantage', t('vantage.label'), state.showNotes, redraw);
  const vantageHelp: string[] = [t('frame.hint'), t('observer.hint')];

  const vantageGrid = el('div', 'vantage-grid');
  vantageGrid.append(
    compactField(
      t('frame.label'),
      select(bodyOptions(), state.frameOrigin, (id) => store.setFrameOrigin(id)),
    ),
    compactField(
      t('observer.label'),
      select(bodyOptions(), state.observationPoint, (id) =>
        store.setObservationPoint(id),
      ),
    ),
  );
  vantage.container.appendChild(vantageGrid);

  // Symmetric 3-column quick stationary-point presets.
  const quickFrames = el('div', 'grid-3');
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
    btn.className = 'grid-btn';
    quickFrames.appendChild(btn);
  }
  vantage.container.appendChild(quickFrames);

  // Symmetric 2-column celestial sphere switch.
  const centreRow = el('div', 'segmented segmented--two');
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
  vantage.container.appendChild(compactField(t('view.sphere.label'), centreRow));
  vantageHelp.push(
    state.sphereCentre === 'observer'
      ? t('view.sphere.observerHint')
      : t('view.sphere.frameHint'),
  );

  // Contextual Equivalence Bridge (full-width balanced CTA + equation box).
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
    vantage.container.appendChild(cta);
  } else if (recentredHarnessAvailable(state)) {
    const compBtn = toggleButton(
      `⇄ ${t('view.recentred')}`,
      state.showRecentredHarness,
      () => store.toggle('showRecentredHarness'),
    );
    compBtn.className = 'equivalence-cta';
    vantage.container.appendChild(compBtn);

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
        vantage.container.appendChild(box);

        const wording =
          harness.epicycleBody === null
            ? 'view.recentredSunOnly'
            : harness.jointIsSun
              ? 'view.recentredSunJoint'
              : 'view.recentredEmptyJoint';
        vantageHelp.push(
          t(wording, {
            deferent: t(`body.${harness.deferentBody}.genitive`),
            epicycle: harness.epicycleBody ? t(`body.${harness.epicycleBody}`) : '',
            origin: t(`body.${state.frameOrigin}.genitive`),
          }),
        );
        if (state.frameOrigin === 'earth' && harness.epicycleBody !== null) {
          vantageHelp.push(
            t(
              harness.jointIsSun
                ? 'view.recentredPtolemyInferior'
                : 'view.recentredPtolemySuperior',
            ),
          );
        }
      }
    }
  } else {
    const blocked = recentredHarnessBlockedBy(state);
    if (blocked) {
      vantageHelp.push(
        t('view.recentredNoOrbit', {
          body: t(`body.${blocked}`),
          parent: t(`body.${BODIES[blocked].parent ?? 'sun'}.genitive`),
        }),
      );
    }
  }

  vantage.attachHelp(vantageHelp);

  // --- 2. What to show (symmetric 2x2 layers, 2-col scale, 3-col evidence)

  const layers = createPanelWithHelp('layers', t('harness.label'), state.showNotes, redraw);
  const layersHelp: string[] = [t(`engine.help.${state.engineId}`)];

  const hasMachinery = Boolean(store.engine.construction ?? store.engine.dynamics);
  const layerGrid = el('div', hasMachinery ? 'grid-2' : 'grid-3');

  if (hasMachinery) {
    const machBtn = toggleButton(machineryLabelFor(store), state.showConstruction, () =>
      store.toggle('showConstruction'),
    );
    machBtn.className = 'grid-btn';
    layerGrid.appendChild(machBtn);
  }

  for (const [label, pressed, onClick] of [
    [t('view.sightlines'), state.showSightLines, () => store.toggle('showSightLines')],
    [t('view.orbits'), state.showOrbits, () => store.toggle('showOrbits')],
    [t('view.figures'), state.showStarFigures, () => store.toggle('showStarFigures')],
  ] as const) {
    const btn = toggleButton(label, pressed, onClick);
    btn.className = 'grid-btn';
    layerGrid.appendChild(btn);
  }

  layers.container.appendChild(layerGrid);

  if (state.showOrbits && store.trails.size > 0) {
    const trailBar = el('div', 'trail-bar');
    trailBar.appendChild(
      el(
        'span',
        'trail-bar__meta',
        `${formatNumber(store.trails.spanDays, 0)} ${t('harness.unit.days')}`,
      ),
    );
    const clear = el('button', 'trail-bar__clear', `✕ ${t('harness.clearTrails')}`);
    clear.type = 'button';
    clear.addEventListener('click', () => store.clearTrails());
    trailBar.appendChild(clear);
    layers.container.appendChild(trailBar);
  }

  // Symmetric 2-column scale switch.
  const scaleRow = el('div', 'segmented segmented--two segmented--compact');
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
  layers.container.appendChild(scaleRow);

  // Symmetric 3-column Observer's Evidence drawer launchers.
  const evidenceBlock = el('div', 'evidence-launch');
  evidenceBlock.appendChild(el('span', 'field__label', t('evidence.label')));
  const evidenceRow = el('div', 'grid-3');
  const evidenceTabs: { id: EvidenceTab; label: string; title: string }[] = [
    { id: 'sky', label: t('evidence.sky.short'), title: t('evidence.sky') },
    { id: 'track', label: t('evidence.track.short'), title: t('evidence.track') },
    { id: 'scorecard', label: t('evidence.scorecard.short'), title: t('evidence.scorecard') },
  ];
  for (const tab of evidenceTabs) {
    const btn = toggleButton(tab.label, state.evidenceTab === tab.id, () =>
      store.setEvidenceTab(state.evidenceTab === tab.id ? null : tab.id),
    );
    btn.className = 'grid-btn';
    btn.title = tab.title;
    evidenceRow.appendChild(btn);
  }
  evidenceBlock.appendChild(evidenceRow);
  layers.container.appendChild(evidenceBlock);

  // Contextual explanations shown strictly on demand (`?` or `ⓘ`).
  if (state.showOrbits) {
    layersHelp.push(
      store.trails.size < 2
        ? t('harness.trailsEmpty')
        : t('harness.trailsRecorded', {
            days: formatNumber(store.trails.spanDays, 0),
            step: formatNumber(store.trails.stepDays, 2),
          }),
    );
  }
  layersHelp.push(t('view.scaleHint'), t('view.zoomHint'));

  if (
    state.showSightLines &&
    state.observationPoint !== state.frameOrigin &&
    state.scaleMode === 'compressed'
  ) {
    layersHelp.push(t('harness.sightlineBend'));
  }

  if (hasMachinery && state.showConstruction) {
    const legend = store.engine.dynamics
      ? 'view.forcesLegend'
      : state.engineId !== 'keplerian'
        ? 'view.constructionLegend'
        : state.selectedBody === 'moon'
          ? 'view.osculatingLegend'
          : 'view.ellipseLegend';

    layersHelp.push(!state.selectedBody ? t('view.constructionHint') : t(legend));
    if (state.selectedBody) layersHelp.push(t('harness.hoverNote'));
    if (store.engine.construction && state.selectedBody && state.scaleMode === 'compressed') {
      layersHelp.push(t('view.constructionScaleWarning'));
    }
  }

  layers.attachHelp(layersHelp);

  // --- 3. Bodies (symmetric 2x4 classical grid + full-width moons drawer)

  const bodies = createPanelWithHelp('bodies', t('bodies.label'), state.showNotes, redraw);

  const makeChip = (id: BodyId, wide = false): HTMLButtonElement => {
    const chip = el('button', wide ? 'chip chip--grid chip--wide' : 'chip chip--grid');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(state.selectedBody === id));
    chip.style.setProperty('--tint', `var(--body-${id})`);
    chip.append(el('span', 'chip__swatch'), el('span', 'chip__name', t(`body.${id}`)));
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

  const classicalGrid = el('div', 'bodies-grid');
  for (const id of CLASSICAL_BODIES) classicalGrid.appendChild(makeChip(id));
  bodies.container.appendChild(classicalGrid);

  const moonSystemSelected =
    state.selectedBody !== null &&
    (state.selectedBody === 'jupiter' ||
      state.selectedBody === 'saturn' ||
      Boolean(BODIES[state.selectedBody].satellite));
  const moonsExpanded = state.showMoons || moonSystemSelected;

  const moonToggle = el(
    'button',
    'moons-toggle',
    moonsExpanded ? t('bodies.moonsHide') : t('bodies.moonsMore'),
  );
  moonToggle.type = 'button';
  moonToggle.setAttribute('aria-expanded', String(moonsExpanded));
  moonToggle.addEventListener('click', () => store.toggleMoons());
  bodies.container.appendChild(moonToggle);

  if (moonsExpanded) {
    const moonGrid = el('div', 'bodies-grid bodies-grid--moons');
    // 4 Galilean moons fill 2x2 cleanly; Saturn's Titan spans the row below.
    for (const id of MOON_BODIES) {
      moonGrid.appendChild(makeChip(id, id === 'titan'));
    }
    bodies.container.appendChild(moonGrid);
  }

  bodies.attachHelp([t('bodies.focusHint')]);

  container.append(vantage.container, layers.container, bodies.container);
}
