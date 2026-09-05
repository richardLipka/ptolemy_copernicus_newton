/**
 * The corner switches, top right.
 *
 * Two buttons now, not eight. Language, look, and the two choices about how the
 * zodiac ring is drawn are all set once and then never touched again — eleven
 * permanent buttons, five of them for the theme alone — so they moved behind a
 * cog. What stays on the bar is the cog and the explanations toggle, which is a
 * reading preference people genuinely flip mid-task.
 *
 * Nothing here affects the simulation, which is why it all sits apart from the
 * controls that do.
 */

import { LOCALES, t, type Locale } from '../i18n/i18n';
import { THEMES, type ThemeId } from '../render/theme/themes';
import type { SphereCentre, Store } from '../state/store';
import type { ZodiacScheme } from '@orrery/core/zodiac';
import { el, panel, toggleButton } from './dom';

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

  /*
   * What the sphere is drawn around. Concentric with the map is the traditional
   * orrery arrangement; around the observer is where the sky actually belongs,
   * and is the only way to get straight sight-lines in a heliocentric view.
   */
  menu.appendChild(
    choiceRow<SphereCentre>(
      t('view.sphere.label'),
      [
        { id: 'frame', label: t('view.sphere.frame') },
        { id: 'observer', label: t('view.sphere.observer') },
      ],
      state.sphereCentre,
      (centre) => store.setSphereCentre(centre),
    ),
  );

  container.appendChild(menu);
}
