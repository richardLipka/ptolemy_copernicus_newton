/**
 * Top Command Bar: the four world-systems, comparison picker, guided trials,
 * calculation working, export, notes toggle, and preferences.
 *
 * Promotes the app's core epistemic controls (models, cross-model comparison,
 * and decisive trials) out of the settings cog into one compact top toolbar,
 * leaving the gear strictly for set-once preferences (language, look, zodiac).
 */

import { DEMONSTRATIONS, type DemonstrationTheme } from '@orrery/core/demonstrations';
import { MODES, type EngineId, type ModeId } from '@orrery/core/engines/types';
import { dateFromJd } from '@orrery/core/time';
import { LOCALES, formatDate, t, type Locale } from '../i18n/i18n';
import { buildMapSvg } from '../render/export/mapSvg';
import { THEMES, type ThemeId } from '../render/theme/themes';
import { COMPARISON_ENGINES } from '../state/selectors';
import type { GhostSelection, Store, TopPopover } from '../state/store';
import type { ZodiacScheme } from '@orrery/core/zodiac';
import { el, linked, panel, select, toggleButton, wireRovingFocus } from './dom';
import { exportButtonRow } from './exportButtons';
import { launchTrial } from './trials';

/** Engine id to the colour token compare-all tints it with. */
const MODEL_TOKEN: Partial<Record<EngineId, string>> = {
  'ptolemaic-epicyclic': 'ptolemy',
  'ptolemaic-almagest': 'ptolemy',
  'ptolemaic-reframe': 'ptolemy',
  copernican: 'copernicus',
  circular: 'copernicus',
  keplerian: 'kepler',
  nbody: 'newton',
};

/**
 * Every engine available as a single ghost comparison against `activeEngineId`,
 * across all four models (excluding the currently active engine itself).
 */
export function availableGhostEngines(activeEngineId: EngineId): EngineId[] {
  const engines: EngineId[] = [];
  for (const mode of Object.values(MODES)) {
    for (const engineId of mode.engines) {
      if (engineId === activeEngineId) continue;
      if (engines.includes(engineId)) continue;
      engines.push(engineId);
    }
  }
  return engines;
}

/** One labelled row of mutually exclusive buttons inside a popover. */
function choiceRow<T extends string>(
  label: string,
  options: readonly { id: T; label: string; title?: string }[],
  current: T,
  choose: (id: T) => void,
): HTMLDivElement {
  const wrapper = el('div', 'settings__group');
  wrapper.appendChild(el('span', 'settings__label', label));
  const row = el('div', 'segmented');
  for (const option of options) {
    const button = toggleButton(option.label, current === option.id, () => choose(option.id));
    if (option.title) button.title = option.title;
    row.appendChild(button);
  }
  wrapper.appendChild(row);
  return wrapper;
}

function popoverTrigger(
  label: string,
  popoverId: TopPopover,
  store: Store,
  options: { className?: string; title?: string; activeHighlight?: boolean } = {},
): HTMLButtonElement {
  const open = store.get().activePopover === popoverId;
  const button = el('button', options.className, label);
  button.type = 'button';
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-controls', `popover-${popoverId}`);
  button.dataset.popoverTrigger = popoverId;
  if (options.activeHighlight) button.dataset.active = 'on';
  if (options.title) {
    button.title = options.title;
    button.setAttribute('aria-label', options.title);
  }
  button.addEventListener('click', () =>
    store.setTopPopover(store.get().activePopover === popoverId ? null : popoverId),
  );
  return button;
}

function renderComparePopover(store: Store): HTMLElement {
  const state = store.get();
  const menu = panel();
  menu.classList.add('command-popover', 'command-popover--compare');
  menu.id = 'popover-compare';

  menu.appendChild(el('div', 'settings__label', t('ghost.label')));
  menu.appendChild(el('p', 'note note--live', t('ghost.hint')));

  const list = el('div', 'popover-list');

  const addOption = (
    value: GhostSelection,
    label: string,
    tintToken?: string,
  ): void => {
    const selected = state.ghostEngineId === value;
    const btn = el('button', 'popover-option');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(selected));
    if (tintToken) {
      const dot = el('span', 'chip__swatch');
      dot.style.setProperty('--tint', `var(--model-${tintToken})`);
      btn.appendChild(dot);
    }
    btn.appendChild(el('span', undefined, label));
    btn.addEventListener('click', () => {
      store.setGhostEngine(value);
      store.setTopPopover(null);
    });
    list.appendChild(btn);
  };

  addOption(null, t('ghost.none'));
  addOption('all', t('ghost.all'));

  for (const engineId of availableGhostEngines(state.engineId)) {
    addOption(engineId, t(`engine.${engineId}`), MODEL_TOKEN[engineId]);
  }

  menu.appendChild(list);

  if (state.ghostEngineId === 'all') {
    const legend = el('div', 'chips chips--legend');
    for (const engineId of COMPARISON_ENGINES) {
      if (engineId === state.engineId) continue;
      const item = el('span', 'chip chip--static');
      item.style.setProperty('--tint', `var(--model-${MODEL_TOKEN[engineId]})`);
      item.append(el('span', 'chip__swatch'), el('span', undefined, t(`engine.${engineId}`)));
      legend.appendChild(item);
    }
    menu.appendChild(legend);
  }

  return menu;
}

function renderTrialsPopover(store: Store): HTMLElement {
  const state = store.get();
  const menu = panel();
  menu.classList.add('command-popover', 'command-popover--trials');
  menu.id = 'popover-trials';

  menu.appendChild(el('div', 'popover-heading', t('trials.title')));
  menu.appendChild(el('p', 'note note--live', t('calc.demonstrations.intro')));

  const groups: readonly DemonstrationTheme[] = ['equivalence', 'prediction'];
  for (const theme of groups) {
    const trials = DEMONSTRATIONS.filter((item) => item.theme === theme);
    if (trials.length === 0) continue;

    const section = el('div', 'trials-section');
    section.appendChild(el('div', 'settings__label', t(`trials.group.${theme}`)));

    const grid = el('div', 'trials-grid');
    for (const demo of trials) {
      const card = el('button', 'demo');
      card.type = 'button';
      if (state.activeTrialId === demo.id) card.dataset.active = 'on';
      card.append(
        el('span', 'demo__date', formatDate(dateFromJd(demo.jd))),
        el('span', 'demo__title', t(`demo.${demo.id}`)),
        linked('span', 'demo__note', t(`demo.${demo.id}.note`)),
      );
      card.addEventListener('click', () => launchTrial(store, demo));
      grid.appendChild(card);
    }
    section.appendChild(grid);
    menu.appendChild(section);
  }

  return menu;
}

function renderExportPopover(store: Store): HTMLElement {
  const menu = panel();
  menu.classList.add('command-popover', 'command-popover--export');
  menu.id = 'popover-export';

  menu.appendChild(el('div', 'settings__label', t('export.mapTitle')));
  menu.appendChild(el('p', 'note note--live', t('export.mapNote')));
  menu.appendChild(
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

  return menu;
}

function renderSettingsPopover(store: Store): HTMLElement {
  const state = store.get();
  const menu = panel();
  menu.classList.add('command-popover', 'command-popover--settings');
  menu.id = 'popover-settings';

  menu.appendChild(
    choiceRow(
      t('locale.label'),
      LOCALES.map((locale) => ({ id: locale, label: t(`locale.${locale}.short`) })),
      state.locale,
      (locale) => store.setLocale(locale as Locale),
    ),
  );

  menu.appendChild(
    choiceRow(
      t('theme.label'),
      THEMES.map((theme) => ({
        id: theme,
        label: t(`theme.${theme}.short`),
        title: t(`theme.${theme}`),
      })),
      state.theme,
      (theme) => store.setTheme(theme as ThemeId),
    ),
  );

  menu.appendChild(
    choiceRow<ZodiacScheme>(
      t('view.zodiac.label'),
      [
        { id: 'signs', label: t('view.zodiac.signs') },
        { id: 'constellations', label: t('view.zodiac.constellations') },
      ],
      state.zodiacScheme,
      (scheme) => store.setZodiacScheme(scheme),
    ),
  );

  return menu;
}

export function renderTopBar(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const bar = el('header', 'command-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('focusgroup', 'toolbar wrap');
  bar.setAttribute('aria-label', t('toolbar.label'));

  // --- Brand + 4-model chronological timeline ----------------------------

  const brand = el('h1', 'command-bar__brand', 'Orrery');
  brand.title = `${t('app.title')} · ${t('app.subtitle')}`;
  bar.appendChild(brand);

  const modelGroup = el('div', 'command-bar__group');
  modelGroup.setAttribute('role', 'group');
  modelGroup.setAttribute('aria-label', t('toolbar.models'));

  const modeStrip = el('div', 'segmented segmented--inline');
  for (const mode of Object.keys(MODES) as ModeId[]) {
    const button = el('button', 'mode-pill');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.mode === mode));
    // Show inline model colour dots whenever comparing all 4 models so the bar
    // doubles as a zero-height legend.
    if (state.ghostEngineId === 'all') {
      const dot = el('span', 'chip__swatch');
      dot.style.setProperty('--tint', `var(--model-${mode})`);
      button.appendChild(dot);
    }
    button.appendChild(el('span', undefined, t(`mode.${mode}`)));
    button.addEventListener('click', () => store.setMode(mode));
    modeStrip.appendChild(button);
  }
  modelGroup.appendChild(modeStrip);

  const availableEngines = MODES[state.mode].engines;
  if (availableEngines.length > 1) {
    const variantSelect = select(
      availableEngines.map((id) => ({ value: id, label: t(`engine.${id}`) })),
      state.engineId,
      (id) => store.setEngine(id),
    );
    variantSelect.className = 'command-bar__variant';
    variantSelect.setAttribute('aria-label', t('engine.label'));
    modelGroup.appendChild(variantSelect);
  }
  bar.appendChild(modelGroup);

  const sep1 = el('span', 'command-bar__sep');
  sep1.setAttribute('role', 'separator');
  sep1.setAttribute('aria-orientation', 'vertical');
  bar.appendChild(sep1);

  // --- Comparison, Guided Trials, Calculation Working --------------------

  const inquiryGroup = el('div', 'command-bar__group');
  inquiryGroup.setAttribute('role', 'group');
  inquiryGroup.setAttribute('aria-label', t('toolbar.compare'));

  const compareLabel =
    state.ghostEngineId === 'all'
      ? t('toolbar.compareAll')
      : state.ghostEngineId
        ? t('toolbar.compareActive', { model: t(`engine.${state.ghostEngineId}`) })
        : t('toolbar.compare');

  inquiryGroup.appendChild(
    popoverTrigger(compareLabel, 'compare', store, {
      className: 'command-bar__btn',
      activeHighlight: state.ghostEngineId !== null,
    }),
  );

  inquiryGroup.appendChild(
    popoverTrigger(`★ ${t('toolbar.trials')}`, 'trials', store, {
      className: 'command-bar__btn',
      activeHighlight: state.activeTrialId !== null,
    }),
  );

  const workingBtn = el('button', 'command-bar__btn', `∑ ${t('toolbar.working')}`);
  workingBtn.type = 'button';
  workingBtn.title = t('calc.title');
  workingBtn.addEventListener('click', () => {
    store.setTopPopover(null);
    store.setCalculationOpen(true);
  });
  inquiryGroup.appendChild(workingBtn);

  bar.appendChild(inquiryGroup);

  // --- Utilities: Notes, Export, Preferences -----------------------------

  const utilGroup = el('div', 'command-bar__group command-bar__group--end');
  utilGroup.setAttribute('role', 'group');
  utilGroup.setAttribute('aria-label', t('toolbar.utilities'));

  const notes = toggleButton('ⓘ', state.showNotes, () => store.toggleNotes());
  notes.className = 'command-bar__icon';
  notes.title = t('notes.toggle');
  notes.setAttribute('aria-label', t('notes.toggle'));
  utilGroup.appendChild(notes);

  utilGroup.appendChild(
    popoverTrigger(t('toolbar.export'), 'export', store, {
      className: 'command-bar__btn',
      title: t('export.mapTitle'),
    }),
  );

  utilGroup.appendChild(
    popoverTrigger('⚙', 'settings', store, {
      className: 'command-bar__icon',
      title: t('settings.label'),
    }),
  );

  bar.appendChild(utilGroup);
  container.appendChild(bar);

  wireRovingFocus(bar, 'button, select');

  if (!state.activePopover) return;

  let popover: HTMLElement;
  switch (state.activePopover) {
    case 'compare':
      popover = renderComparePopover(store);
      break;
    case 'trials':
      popover = renderTrialsPopover(store);
      break;
    case 'export':
      popover = renderExportPopover(store);
      break;
    case 'settings':
      popover = renderSettingsPopover(store);
      break;
  }

  container.appendChild(popover);
}
