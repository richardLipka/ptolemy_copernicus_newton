/**
 * The floating control panels.
 *
 * Each dock is rebuilt wholesale when the state it shows changes, which is cheap
 * at this size and avoids a second source of truth about which option is
 * selected. The instrument, where rebuilding would be expensive, updates in
 * place instead.
 */

import { BODY_IDS, type BodyId } from '../core/bodies';
import { MODES, type EngineId, type ModeId } from '../core/engines/types';
import type { ZodiacScheme } from '../core/zodiac';
import { formatNumber, t } from '../i18n/i18n';
import type { ScaleMode, SphereCentre, Store } from '../state/store';
import { el, field, panel, select, toggleButton } from './dom';

const bodyOptions = (): { value: BodyId; label: string }[] =>
  BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) }));

/** The left dock: which model, seen from where, and what to draw over it. */
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
    el('p', 'note', t(`engine.help.${state.engineId}`)),
  );

  // Ghost overlay: any engine other than the active one.
  const ghostChoices: { value: string; label: string }[] = [
    { value: '', label: t('ghost.none') },
  ];
  for (const mode of Object.values(MODES)) {
    for (const engineId of mode.engines) {
      if (engineId === state.engineId) continue;
      if (ghostChoices.some((choice) => choice.value === engineId)) continue;
      ghostChoices.push({ value: engineId, label: t(`engine.${engineId}`) });
    }
  }

  modelPanel.appendChild(
    field(
      t('ghost.label'),
      select(ghostChoices, state.ghostEngineId ?? '', (value) =>
        store.setGhostEngine(value === '' ? null : (value as EngineId)),
      ),
      t('ghost.hint'),
    ),
  );

  container.appendChild(modelPanel);

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
  container.appendChild(vantagePanel);

  // --- view -------------------------------------------------------------

  const viewPanel = panel(t('view.zodiac.label'));

  const schemeRow = el('div', 'segmented');
  const schemes: { id: ZodiacScheme; label: string }[] = [
    { id: 'signs', label: t('view.zodiac.signs') },
    { id: 'constellations', label: t('view.zodiac.constellations') },
  ];
  for (const scheme of schemes) {
    schemeRow.appendChild(
      toggleButton(scheme.label, state.zodiacScheme === scheme.id, () =>
        store.setZodiacScheme(scheme.id),
      ),
    );
  }
  viewPanel.appendChild(schemeRow);

  // What the sphere is drawn around. Concentric with the map is the traditional
  // orrery arrangement; around the observer is where the sky actually belongs,
  // and is the only way to get straight sight-lines in a heliocentric view.
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
  viewPanel.appendChild(centreRow);
  viewPanel.appendChild(
    el(
      'p',
      'note',
      state.sphereCentre === 'observer'
        ? t('view.sphere.observerHint')
        : t('view.sphere.frameHint'),
    ),
  );

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
  viewPanel.appendChild(scaleRow);
  viewPanel.appendChild(el('p', 'note', t('view.scaleHint')));

  // The wheel has no visible affordance, so it needs saying — as does the way
  // back. Deliberately static: putting the live magnification here would tie the
  // controls to a value that changes on every wheel tick, and rebuilding the
  // panels through a gesture is exactly the trap the clock readout fell into.
  viewPanel.appendChild(el('p', 'note', t('view.zoomHint')));

  container.appendChild(viewPanel);

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
    toggleButton(t('view.sightlines'), state.showSightLines, () =>
      store.toggle('showSightLines'),
    ),
    toggleButton(t('view.figures'), state.showStarFigures, () =>
      store.toggle('showStarFigures'),
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

  harnessPanel.appendChild(toggles);

  if (state.showOrbits) {
    const trailNote = el(
      'p',
      'note',
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
  if (
    state.showSightLines &&
    state.sphereCentre === 'frame' &&
    state.observationPoint !== state.frameOrigin &&
    state.scaleMode === 'compressed'
  ) {
    harnessPanel.appendChild(el('p', 'note', t('harness.sightlineBend')));
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
      el('p', 'note', !state.selectedBody ? t('view.constructionHint') : t(legend)),
    );

    // Under the compressed scale a circle not centred on the frame origin does
    // not project to a circle, which rather undercuts "circles upon circles".
    // Say so, and point at the toggle that fixes it.
    if (store.engine.construction && state.selectedBody && state.scaleMode === 'compressed') {
      harnessPanel.appendChild(el('p', 'note', t('view.constructionScaleWarning')));
    }
  }

  container.appendChild(harnessPanel);
}
