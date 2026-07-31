/**
 * Preferences that persist but are not worth putting in a shared link.
 *
 * The same guarded-localStorage pattern as the theme and the locale: the app is
 * served as static files from a host with no backend, storage may be disabled or
 * full, and losing a preference is never worth an exception.
 *
 * These are deliberately *not* in `urlState.ts`. A link that silently collapsed
 * someone's explanatory text, or re-ran a welcome they had already dismissed,
 * would be presumptuous in the same way one that repainted their theme would be.
 */

const NOTES_KEY = 'orrery.notes';
const WELCOME_KEY = 'orrery.welcomed';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The setting still applies for this session; it just will not be remembered.
  }
}

/**
 * Whether the explanatory prose is shown.
 *
 * Off by default. The controls carry a great deal of good standing text, and for
 * anyone past their first few minutes it is a long scroll between them and the
 * control they actually wanted. The prose is one button away, and the welcome
 * says so.
 */
export const readStoredNotes = (): boolean => read(NOTES_KEY) === 'on';

export function applyNotes(showNotes: boolean): void {
  document.documentElement.dataset.notes = showNotes ? 'on' : 'off';
  write(NOTES_KEY, showNotes ? 'on' : 'off');
}

/** Whether this browser has seen the welcome. */
export const hasBeenWelcomed = (): boolean => read(WELCOME_KEY) === 'yes';

export const rememberWelcome = (): void => write(WELCOME_KEY, 'yes');
