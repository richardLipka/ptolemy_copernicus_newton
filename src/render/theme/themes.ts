/**
 * Themes.
 *
 * A theme is a `data-theme` value on the root element and a block of custom
 * properties in a stylesheet — nothing more. No component reads the theme, so
 * adding a look means adding one CSS file and one entry here.
 */

export const THEMES = ['orrery', 'atelier', 'nocturne', 'lcars'] as const;

export type ThemeId = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeId = 'orrery';

const STORAGE_KEY = 'orrery.theme';

const isTheme = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/**
 * Read the stored preference.
 *
 * Guarded like the locale's: the app is served as static files from a host with
 * no backend, and localStorage may be disabled or full. Losing a preference is
 * not worth an exception.
 */
export function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies; it just will not be remembered.
  }
}
