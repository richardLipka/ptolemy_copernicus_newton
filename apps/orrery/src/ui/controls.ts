/**
 * The floating control panels.
 *
 * Each dock is rebuilt wholesale when the state it shows changes, which is cheap
 * at this size and avoids a second source of truth about which option is
 * selected. The instrument, where rebuilding would be expensive, updates in
 * place instead.
 */

import { BODIES, BODY_IDS, type BodyId } from '@orrery/core/bodies';
import { MODES, type EngineId, type ModeId } from '@orrery/core/engines/types';
import { dateFromJd } from '@orrery/core/time';
import { formatNumber, t } from '../i18n/i18n';
import type { GhostSelection, ScaleMode, SphereCentre, Store } from '../state/store';
import {
  COMPARISON_ENGINES,
  buildRecentredHarness,
  focusViewFor,
  recentredHarnessAvailable,
  recentredHarnessBlockedBy,
} from '../state/selectors';
import { el, field, note, panel, select, toggleButton } from './dom';
import { exportButtonRow } from './exportButtons';
import { buildMapSvg } from '../render/export/mapSvg';

const bodyOptions = (): { value: BodyId; label: string }[] =>
  BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) }));

/** Engine id to the colour token compare-all tints it with. */
const MODEL_TOKEN: Partial<Record<EngineId, string>> = {
  'ptolemaic-epicyclic': 'ptolemy',
  circular: 'copernicus',
  keplerian: 'kepler',
  nbody: 'newton',
};

/** The left dock: which model, seen from where, and what to draw over it. */
/**
 * Double-click on a body chip, tracked by hand rather than by the DOM.
 *
 * A `dblclick` listener cannot work here. The first click selects the body,
 * which rebuilds the whole control panel, so the element the second click lands
 * on is a *different node* from the one the first hit — and the browser only
 * raises `dblclick` for two clicks on the same element. Keeping the timing in
 * module state is what survives the rebuild.
 *
 * 400ms is the usual platform threshold. Erring long is the safer direction: a
 * slow second click merely toggles the selection off, which is what a single
 * click does anyway.
 */
const DOUBLE_CLICK_MS = 400;

let lastChipClick: { id: BodyId; at: number } | null = null;

export function renderControls(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  // --- model ------------------------------------------------------------

  const modelPanel = panel(t('mode.label'));

  // Two rows of two: four model names do not fit across one dock-width row.
  const modeRow = el('div', 'segmented segmented--grid');
  for (const mode of Object.keys(MODES) as ModeId[]) {
    const button = toggleButton(t(`mode.${mode}`), state.mode === mode, () =>
      store.setMode(mode),
    );
    modeRow.appendChild(button);
  }
  modelPanel.appendChild(modeRow);

  const availableEngines = MODES[state.mode].engines;
  if (availableEngines.length > 1) {
    modelPanel.appendChild(
      field(
        t('engine.label'),
        select(
          availableEngines.map((id) => ({ value: id, label: t(`engine.${id}`) })),
          state.engineId,
          (id) => store.setEngine(id),
        ),
      ),
    );
  }

  modelPanel.appendChild(
    note(t(`engine.help.${state.engineId}`)),
  );

  // Ghost overlay: any engine other than the active one.

  // --- vantage ----------------------------------------------------------

  const vantagePanel = panel(t('frame.label'));
  vantagePanel.appendChild(
    field(
      t('frame.label'),
      select(bodyOptions(), state.frameOrigin, (id) => store.setFrameOrigin(id)),
      t('frame.hint'),
    ),
  );
  vantagePanel.appendChild(
    field(
      t('observer.label'),
      select(bodyOptions(), state.observationPoint, (id) =>
        store.setObservationPoint(id),
      ),
      t('observer.hint'),
    ),
  );

  /*
   * What the celestial sphere is drawn around, directly under the observer it
   * answers to.
   *
   * Concentric with the map is the traditional orrery arrangement; around the
   * observer is where the sky actually belongs, and is the only way to get
   * straight sight-lines in a heliocentric view. It spent a while behind the
   * cog with the set-once preferences and does not belong there: it is a
   * question about the vantage, and the vantage is chosen here.
   */
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
  vantagePanel.appendChild(centreRow);
  vantagePanel.appendChild(
    note(
      state.sphereCentre === 'observer'
        ? t('view.sphere.observerHint')
        : t('view.sphere.frameHint'),
    ),
  );

  // --- bodies -----------------------------------------------------------
  //
  // A legend that is also a control. The map colours every body and nothing
  // named them, so a newcomer had to hover to find out which dot was Saturn;
  // making the swatches selectable means the panel earns its space rather than
  // being decoration, and gives the keyboard a way to reach a body too.

  const bodyPanel = panel(t('bodies.label'));
  const chips = el('div', 'chips');
  for (const id of BODY_IDS) {
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
      // Cleared on the second, so a triple click is not read as two doubles.
      lastChipClick = second ? null : { id, at: now };

      if (second) {
        // The view moves; the stationary point does not. Which body the model is
        // built around is a claim about the model, not about where the reader
        // happens to be looking.
        const view = focusViewFor(store.get(), id);
        store.selectBody(id);
        store.setZoom(view.zoom);
        store.panTo(view.centreOn.x, view.centreOn.y);
        return;
      }
      store.selectBody(store.get().selectedBody === id ? null : id);
    });
    chips.appendChild(chip);
  }
  bodyPanel.appendChild(chips);
  // A note rather than a tooltip on each chip: a title attribute becomes the
  // button's accessible name, which would leave all eight reading as the same
  // sentence instead of as the body they name.
  bodyPanel.appendChild(note(t('bodies.focusHint')));

  // --- harness ----------------------------------------------------------
  //
  // Everything drawn over the bodies themselves, each switchable on its own.
  // Grouping them makes it clear they are all optional annotation rather than
  // part of the model.

  const harnessPanel = panel(t('harness.label'));

  // A two-column block rather than a wrapping row: with three or four toggles of
  // uneven label length, a flex row left a ragged right edge. An odd one out
  // spans both columns so the block always ends square.
  const toggles = el('div', 'toggle-grid');
  toggles.append(
    toggleButton(t('view.orbits'), state.showOrbits, () => store.toggle('showOrbits')),
    toggleButton(t('view.track'), state.showTrack, () => store.toggle('showTrack')),
    toggleButton(t('view.sky'), state.showSky, () => store.toggle('showSky')),
    toggleButton(t('view.sightlines'), state.showSightLines, () =>
      store.toggle('showSightLines'),
    ),
  );

  // Every model that builds a position from something shows its machinery here:
  // circles for Ptolemy and Copernicus, force and velocity vectors for Newton.
  // Only the Earth-centred reframe has none, since it borrows finished positions
  // rather than deriving them.
  // One label across all models: what it shows differs (circles for the
  // geometric constructions, force vectors for Newton) but it is the same idea —
  // the machinery behind the position — so it gets the same name.
  const hasMachinery = Boolean(store.engine.construction ?? store.engine.dynamics);
  if (hasMachinery) {
    toggles.appendChild(
      toggleButton(t('view.construction'), state.showConstruction, () =>
        store.toggle('showConstruction'),
      ),
    );
  }

  /*
   * The recentred harness, offered only when it has something to say: a
   * heliocentric construction, and something other than the Sun held still.
   * It is the one control in this panel that depends on the frame origin, which
   * is why it can appear and vanish as that picker moves.
   */
  if (recentredHarnessAvailable(state)) {
    toggles.appendChild(
      toggleButton(t('view.recentred'), state.showRecentredHarness, () =>
        store.toggle('showRecentredHarness'),
      ),
    );
  }

  harnessPanel.appendChild(toggles);

  /*
   * Scale sits with the overlays rather than in a panel of its own.
   *
   * It is not a preference to be set once and forgotten — swapping a compressed
   * map for an honest one is a thing a lecturer does mid-sentence — so it stays
   * on screen while the zodiac choices went behind the cog. And it belongs
   * here: like the switches above it, it changes what the map shows without
   * touching what the model computes.
   */
  const scaleRow = el('div', 'segmented');
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
  harnessPanel.appendChild(note(t('view.scaleHint')));
  harnessPanel.appendChild(note(t('view.zoomHint')));

  if (state.showOrbits) {
    // Status rather than explanation — how much history exists right now — so it
    // stays visible when the prose is collapsed.
    const trailNote = el(
      'p',
      'note note--live',
      store.trails.size < 2
        ? t('harness.trailsEmpty')
        : t('harness.trailsRecorded', {
            days: formatNumber(store.trails.spanDays, 0),
            step: formatNumber(store.trails.stepDays, 2),
          }),
    );
    harnessPanel.appendChild(trailNote);

    const clear = el('button', undefined, t('harness.clearTrails'));
    clear.type = 'button';
    clear.disabled = store.trails.size === 0;
    clear.style.width = '100%';
    clear.addEventListener('click', () => store.clearTrails());
    harnessPanel.appendChild(clear);
  }

  // The sight-line runs observer → body → zodiac. It bends at the body whenever
  // the observer is not the frame origin, and the compressed scale makes that
  // bend large; at true scale it nearly vanishes. Worth saying, since a 27° bend
  // otherwise looks like a defect rather than a consequence of the scale.
  // Not restricted to the concentric sphere any more: sight-lines are now drawn
  // through the body in both sphere modes, so the kink can appear in either.
  if (
    state.showSightLines &&
    state.observationPoint !== state.frameOrigin &&
    state.scaleMode === 'compressed'
  ) {
    harnessPanel.appendChild(note(t('harness.sightlineBend')));
  }

  if (recentredHarnessAvailable(state) && state.showRecentredHarness) {
    const harness = buildRecentredHarness(state, state.selectedBody!);
    if (harness) {
      // Three cases: one leg (the Sun), and the two orders of two legs.
      const wording =
        harness.epicycleBody === null
          ? 'view.recentredSunOnly'
          : harness.jointIsSun
            ? 'view.recentredSunJoint'
            : 'view.recentredEmptyJoint';

      harnessPanel.appendChild(
        note(
          // Cases, because Czech needs them: the two that appear after "the
          // orbit of" are genitive, and the one that is the subject of its own
          // sentence is not.
          t(wording, {
            deferent: t(`body.${harness.deferentBody}.genitive`),
            epicycle: harness.epicycleBody ? t(`body.${harness.epicycleBody}`) : '',
            origin: t(`body.${state.frameOrigin}.genitive`),
          }),
        ),
      );

      /*
       * The Ptolemaic reading, and only where it is true.
       *
       * With Jupiter held still and Mars selected the figure is still two
       * orbits composed, but it is nobody's historical model and saying
       * otherwise would be the one genuinely misleading thing this overlay
       * could do. So the claim about Ptolemy is made only when the stationary
       * body is the Earth, which is the case he was describing.
       */
      if (state.frameOrigin === 'earth' && harness.epicycleBody !== null) {
        harnessPanel.appendChild(
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

  const blocked = recentredHarnessBlockedBy(state);
  if (blocked) {
    harnessPanel.appendChild(
      note(
        t('view.recentredNoOrbit', {
          body: t(`body.${blocked}`),
          parent: t(`body.${BODIES[blocked].parent ?? 'sun'}.genitive`),
        }),
      ),
    );
  }

  if (hasMachinery && state.showConstruction) {
    // Each model's machinery needs its own key: the Ptolemaic legend names a
    // deferent, an epicycle and an equant, none of which Kepler has. The Moon
    // needs one of its own again — its ellipse is reconstructed from the motion
    // rather than being what produced it, and it visibly wanders.
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

    // The legend names the parts; the map itself will describe any one of them,
    // with its figures for the date on screen. Worth saying once — a reader who
    // does not know the notes are there will never go looking for them.
    if (state.selectedBody) {
      harnessPanel.appendChild(note(t('harness.hoverNote')));
    }

    // Under the compressed scale a circle not centred on the frame origin does
    // not project to a circle, which rather undercuts "circles upon circles".
    // Say so, and point at the toggle that fixes it.
    if (store.engine.construction && state.selectedBody && state.scaleMode === 'compressed') {
      harnessPanel.appendChild(note(t('view.constructionScaleWarning')));
    }
  }

  /*
   * How wide a band to show, offered only while there is one.
   *
   * Three jumps beside a continuous zoom, because they answer three different
   * questions: forty degrees is more than a whole constellation and is where a
   * planet's progress against the stars reads; twelve is a good look at a close
   * pairing; four is what it takes to watch a conjunction actually separate,
   * the closest of them being a fifth of a degree apart. Anything between comes
   * from the wheel over the band itself.
   */
  if (state.showSky) {
    const fields = el('div', 'field');
    fields.appendChild(el('label', 'field__label', t('sky.field')));

    const choices = el('div', 'button-row');
    for (const width of [40, 12, 4]) {
      const button = el('button', undefined, t(`sky.field.${width}`));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.skyField === width));
      button.addEventListener('click', () => store.setSkyField(width));
      choices.appendChild(button);
    }
    fields.appendChild(choices);
    harnessPanel.appendChild(fields);

    // Shown or hidden by the explanations switch, which the CSS handles for
    // every `.note` in the app — no panel decides that for itself.
    harnessPanel.appendChild(note(t('sky.zoomNote')));
    harnessPanel.appendChild(note(t('sky.note')));
    harnessPanel.appendChild(note(t('sky.starsNote')));
  }

  /*
   * One column, read straight down: which model, held still about what, showing
   * what, of which body.
   *
   * It was briefly two, with the zodiac settings alone in the second — but
   * those have gone behind the cog with the other things nobody sets twice, and
   * a column holding one short panel beside a scrolling one was the worse half
   * of the trade. One column also lets the dock be narrower, which is what buys
   * the map its space back.
   *
   * Appended here rather than as each panel is built, because the order wanted
   * on screen is not the order they are cheapest to build in: "what to show" is
   * constructed last and belongs third.
   */
  container.append(modelPanel, vantagePanel, harnessPanel, bodyPanel);
}


/**
 * Saving the map, in its own corner and deliberately quiet.
 *
 * It sat in the left dock as a full panel, level with the controls that decide
 * what the map *is*. It is not that kind of thing: nobody sets up a view by
 * reaching for it, and it was taking the eye every time. So it lives at the
 * bottom-left instead, faint until pointed at, with the title carried by the
 * buttons rather than a heading above them.
 *
 * Its own render rather than part of `renderControls`, because it now has its
 * own dock — and because it answers to nothing at all: the map is rebuilt from
 * `store.get()` at the moment of the click, so this never needs rebuilding for
 * a change of zoom or date.
 */
export function renderMapExport(container: HTMLElement, store: Store): void {
  container.replaceChildren();

  const exportPanel = panel();
  exportPanel.classList.add('panel--quiet');
  // The prose that used to sit under it as a note. There is no room for a
  // paragraph in a corner strip, and the corner is the point — but the
  // explanation is still worth having a click away from being needed.
  exportPanel.title = t('export.mapNote');
  exportPanel.appendChild(el('span', 'export__label', t('export.mapTitle')));
  exportPanel.appendChild(
    exportButtonRow(
      (width, height) =>
        buildMapSvg({ width, height, state: store.get(), trails: store.trails.all() }),
      () => {
        const current = store.get();
        return [
          'orrery',
          current.engineId,
          current.selectedBody,
          current.scaleMode,
          dateFromJd(current.julianDate).toISOString().slice(0, 10),
        ];
      },
      () => {
        const field = document.querySelector<HTMLElement>('.stage__field');
        return { width: field?.clientWidth || 800, height: field?.clientHeight || 800 };
      },
    ),
  );
  container.appendChild(exportPanel);
}

/**
 * Which model to draw faintly beside the running one, and its key.
 *
 * Exported because it lives in the selected-body panel now rather than in the
 * dock: comparing two models is a question about what is on screen, not a
 * setting for how the screen is arranged, and the left column was the longer
 * for holding it.
 */
export function comparisonField(store: Store): DocumentFragment {
  const state = store.get();
  const fragment = document.createDocumentFragment();

  const ghostChoices: { value: string; label: string }[] = [
    { value: '', label: t('ghost.none') },
  ];
  const mode = MODES[state.mode];
  if (mode) {
    for (const engineId of mode.engines) {
      if (engineId === state.engineId) continue;
      if (ghostChoices.some((choice) => choice.value === engineId)) continue;
      ghostChoices.push({ value: engineId, label: t(`engine.${engineId}`) });
    }
  }
  // Four models now, so "one other" is a narrower question than it used to be.
  ghostChoices.splice(1, 0, { value: 'all', label: t('ghost.all') });

  fragment.appendChild(
    field(
      t('ghost.label'),
      select(ghostChoices, state.ghostEngineId ?? '', (value) =>
        store.setGhostEngine(value === '' ? null : (value as GhostSelection)),
      ),
      t('ghost.hint'),
    ),
  );

  // With three ghosts on the map, tinted per model, the map needs a key.
  if (state.ghostEngineId === 'all') {
    const legend = el('div', 'chips chips--legend');
    for (const engineId of COMPARISON_ENGINES) {
      if (engineId === state.engineId) continue;
      const item = el('span', 'chip chip--static');
      item.style.setProperty('--tint', `var(--model-${MODEL_TOKEN[engineId]})`);
      item.append(el('span', 'chip__swatch'), el('span', undefined, t(`engine.${engineId}`)));
      legend.appendChild(item);
    }
    fragment.appendChild(legend);
  }

  return fragment;
}

/** The button that opens the calculation and demonstrations overlay. */
export function calculationButton(store: Store): HTMLButtonElement {
  const button = el('button', 'wide-button', t('calc.open'));
  button.type = 'button';
  button.addEventListener('click', () => store.setCalculationOpen(true));
  return button;
}

/** The constellation figures switch, which draws on the sphere rather than the map. */
export function starFiguresToggle(store: Store): HTMLButtonElement {
  return toggleButton(t('view.figures'), store.get().showStarFigures, () =>
    store.toggle('showStarFigures'),
  );
}
