/**
 * The slim bar of global switches, top right: language and theme.
 *
 * Kept to one row of compact controls so it hugs the corner without competing
 * with the selected-body panel directly beneath it. Neither switch affects the
 * simulation, which is why they sit apart from everything that does.
 */

import { LOCALES, t, type Locale } from '../i18n/i18n';
import { THEMES, type ThemeId } from '../render/theme/themes';
import type { Store } from '../state/store';
import { el, toggleButton } from './dom';

export function renderTopBar(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const bar = el('div', 'topbar');

  const locales = el('div', 'topbar__group segmented');
  for (const locale of LOCALES) {
    locales.appendChild(
      toggleButton(t(`locale.${locale}.short`), state.locale === locale, () =>
        store.setLocale(locale as Locale),
      ),
    );
  }
  bar.appendChild(locales);

  bar.appendChild(el('div', 'topbar__divider'));

  const themes = el('div', 'topbar__group segmented');
  for (const theme of THEMES) {
    const button = toggleButton(t(`theme.${theme}.short`), state.theme === theme, () =>
      store.setTheme(theme as ThemeId),
    );
    button.title = t(`theme.${theme}`);
    themes.appendChild(button);
  }
  bar.appendChild(themes);
  bar.appendChild(el('div', 'topbar__divider'));

  // Explanatory prose is a reading preference, so it sits with the other two.
  const notes = toggleButton('ⓘ', state.showNotes, () => store.toggleNotes());
  notes.title = t('notes.toggle');
  notes.setAttribute('aria-label', t('notes.toggle'));
  bar.appendChild(notes);

  container.appendChild(bar);
}
