/**
 * The corner switches, top right.
 *
 * Two buttons on the bar, not eight. Language, look and the zodiac scheme are
 * set once and then never touched again — nine permanent buttons, five of them
 * for the theme alone — so they moved behind a cog. What stays on the bar is the
 * cog and the explanations toggle, which is a reading preference people
 * genuinely flip mid-task.
 *
 * The ghost model and the calculation overlay's button are here too. They spent
 * a while in the selected-body panel, on the argument that both are about the
 * body being looked at; the trouble is that panel is where the *readings* are,
 * and with nothing selected it held nothing but those two controls. A panel of
 * figures should hold figures.
 *
 * Nothing here moves a body. The ghost draws a second model faintly beside the
 * running one and the overlay shows four models' working, which is why it all
 * sits apart from the controls that decide what the model does.
 */

import { MODES, type EngineId } from '@orrery/core/engines/types';
import { LOCALES, t, type Locale } from '../i18n/i18n';
import { THEMES, type ThemeId } from '../render/theme/themes';
import { COMPARISON_ENGINES } from '../state/selectors';
import type { GhostSelection, Store } from '../state/store';
import type { ZodiacScheme } from '@orrery/core/zodiac';
import { el, field, panel, select, toggleButton } from './dom';

/** Engine id to the colour token compare-all tints it with. */
const MODEL_TOKEN: Partial<Record<EngineId, string>> = {
  'ptolemaic-epicyclic': 'ptolemy',
  circular: 'copernicus',
  keplerian: 'kepler',
  nbody: 'newton',
};

/** One labelled row of mutually exclusive buttons. */
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

/** Which model to draw faintly beside the running one, and its key. */
function comparisonField(store: Store): DocumentFragment {
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

/**
 * The button that opens the calculation and demonstrations overlay.
 *
 * It shuts the menu on the way out. The overlay covers the stage and outranks
 * this popover, so leaving the menu open would only mean finding it still there
 * on closing the overlay, over a map the reader had gone back to.
 */
function calculationButton(store: Store): HTMLButtonElement {
  const button = el('button', 'wide-button', t('calc.open'));
  button.type = 'button';
  button.addEventListener('click', () => {
    store.setSettingsOpen(false);
    store.setCalculationOpen(true);
  });
  return button;
}

export function renderTopBar(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const bar = el('div', 'topbar');

  const settings = toggleButton('⚙', state.showSettings, () =>
    store.setSettingsOpen(!state.showSettings),
  );
  settings.title = t('settings.label');
  settings.setAttribute('aria-label', t('settings.label'));
  settings.setAttribute('aria-expanded', String(state.showSettings));
  // The menu is a sibling rather than a child, so it is named instead of nested.
  settings.setAttribute('aria-controls', 'settings-menu');
  settings.dataset.settingsToggle = '';
  bar.appendChild(settings);

  const notes = toggleButton('ⓘ', state.showNotes, () => store.toggleNotes());
  notes.title = t('notes.toggle');
  notes.setAttribute('aria-label', t('notes.toggle'));
  bar.appendChild(notes);

  container.appendChild(bar);

  if (!state.showSettings) return;

  const menu = panel();
  menu.classList.add('settings-menu');
  menu.id = 'settings-menu';

  // First, because unlike the three rows below it these two are reached for
  // while working rather than once at the start.
  const comparison = el('div', 'settings__group');
  comparison.appendChild(comparisonField(store));
  comparison.appendChild(calculationButton(store));
  menu.appendChild(comparison);

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

  container.appendChild(menu);
}
