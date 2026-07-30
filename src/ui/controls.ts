/**
 * Controls.
 *
 * Rebuilt wholesale whenever state changes, which is cheap at this size and
 * avoids a second source of truth about which option is currently selected.
 * The instrument itself, where rebuilding would be expensive, updates in place
 * instead.
 */

import { BODY_IDS, type BodyId } from '../core/bodies';
import { MODES, type EngineId, type ModeId } from '../core/engines/types';
import { MAX_JD, MIN_JD, dateFromJd, jdFromDate } from '../core/time';
import type { ZodiacScheme } from '../core/zodiac';
import { LOCALES, formatNumber, t, type Locale } from '../i18n/i18n';
import type { ScaleMode, Store } from '../state/store';
import { el, field, panel, select, toggleButton } from './dom';

const bodyOptions = (): { value: BodyId; label: string }[] =>
  BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) }));

/** Returns the date field, which the caller updates in place as the clock runs
 *  rather than rebuilding these controls on every tick. */
export function renderControls(
  container: HTMLElement,
  store: Store,
): HTMLInputElement {
  const state = store.get();
  container.replaceChildren();

  // --- model ------------------------------------------------------------

  const modelPanel = panel(t('mode.label'));

  const modeRow = el('div', 'segmented');
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

  // --- time -------------------------------------------------------------

  const timePanel = panel(t('time.label'));

  const dateInput = el('input');
  dateInput.type = 'date';
  dateInput.valueAsDate = dateFromJd(state.julianDate);
  dateInput.min = dateFromJd(MIN_JD).toISOString().slice(0, 10);
  dateInput.max = dateFromJd(MAX_JD).toISOString().slice(0, 10);
  dateInput.addEventListener('change', () => {
    if (dateInput.valueAsDate) store.setJulianDate(jdFromDate(dateInput.valueAsDate));
  });
  timePanel.appendChild(field(t('time.jumpTo'), dateInput));

  const transport = el('div', 'button-row');
  const back = el('button', undefined, '‹');
  back.title = t('time.stepBack');
  back.addEventListener('click', () => store.stepDays(-1));

  const playPause = el('button', undefined, state.playing ? t('time.pause') : t('time.play'));
  playPause.addEventListener('click', () => store.togglePlay());

  const forward = el('button', undefined, '›');
  forward.title = t('time.stepForward');
  forward.addEventListener('click', () => store.stepDays(1));

  const today = el('button', undefined, t('time.today'));
  today.addEventListener('click', () => store.jumpToDate(new Date()));

  transport.append(back, playPause, forward, today);
  timePanel.appendChild(transport);

  const rateOptions = [0.25, 1, 5, 20, 100, 400].map((rate) => ({
    value: String(rate),
    label: `${rate} ${t('time.rate.unit')}`,
  }));
  timePanel.appendChild(
    field(
      t('time.rate'),
      select(rateOptions, String(state.rateDaysPerSecond), (value) =>
        store.setRate(Number(value)),
      ),
    ),
  );

  container.appendChild(timePanel);

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

  container.appendChild(viewPanel);

  // --- harness ----------------------------------------------------------
  //
  // Everything drawn over the bodies themselves, each switchable on its own.
  // Grouping them makes it clear they are all optional annotation rather than
  // part of the model.

  const harnessPanel = panel(t('harness.label'));

  const toggles = el('div', 'button-row');
  toggles.append(
    toggleButton(t('view.orbits'), state.showOrbits, () => store.toggle('showOrbits')),
    toggleButton(t('view.sightlines'), state.showSightLines, () =>
      store.toggle('showSightLines'),
    ),
    toggleButton(t('view.figures'), state.showStarFigures, () =>
      store.toggle('showStarFigures'),
    ),
  );

  // Only Ptolemy's epicycles and Copernicus's circles are built by
  // construction. Newton integrates and the Earth-centred reframe borrows
  // accurate positions, so neither has machinery to show.
  if (store.engine.construction) {
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
    clear.addEventListener('click', () => store.clearTrails());
    harnessPanel.appendChild(clear);
  }

  if (store.engine.construction && state.showConstruction) {
    harnessPanel.appendChild(
      el(
        'p',
        'note',
        state.selectedBody ? t('view.constructionLegend') : t('view.constructionHint'),
      ),
    );

    // Under the compressed scale a circle not centred on the frame origin does
    // not project to a circle, which rather undercuts "circles upon circles".
    // Say so, and point at the toggle that fixes it.
    if (state.selectedBody && state.scaleMode === 'compressed') {
      harnessPanel.appendChild(el('p', 'note', t('view.constructionScaleWarning')));
    }
  }

  container.appendChild(harnessPanel);

  // --- locale -----------------------------------------------------------

  const localePanel = panel(t('locale.label'));
  const localeRow = el('div', 'segmented');
  for (const locale of LOCALES) {
    localeRow.appendChild(
      toggleButton(t(`locale.${locale}`), state.locale === locale, () =>
        store.setLocale(locale as Locale),
      ),
    );
  }
  localePanel.appendChild(localeRow);
  container.appendChild(localePanel);

  return dateInput;
}
