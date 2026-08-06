/**
 * The first-run welcome.
 *
 * Without it a newcomer arrives to four panels of controls, a ring of Latin
 * names and no indication of what the app is *for* — every affordance visible
 * and no entry point. This says what the thing is in three sentences, points at
 * the demonstrations as the way in, and names the two keys a presenter needs.
 *
 * Shown once per browser and never again; dismissing it is recorded in
 * localStorage. It deliberately does not appear from a shared link's
 * configuration, only from having never been seen.
 */

import { t } from '../i18n/i18n';
import type { Store } from '../state/store';
import { el } from './dom';

export function renderWelcome(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  if (!state.showWelcome) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const sheet = el('div', 'overlay__sheet overlay__sheet--narrow');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', t('welcome.title'));

  sheet.append(
    el('h2', 'overlay__title', t('welcome.title')),
    el('p', 'welcome__lede', t('welcome.lede')),
  );

  const points = el('ul', 'welcome__points');
  for (const key of ['welcome.point.models', 'welcome.point.centre', 'welcome.point.demos']) {
    points.appendChild(el('li', undefined, t(key)));
  }
  sheet.appendChild(points);

  sheet.appendChild(el('p', 'welcome__keys', t('welcome.keys')));

  const actions = el('div', 'welcome__actions');

  // The demonstrations are the best way in, so the primary action goes there
  // rather than merely dismissing.
  const explore = el('button', undefined, t('welcome.start'));
  explore.type = 'button';
  explore.addEventListener('click', () => {
    store.dismissWelcome();
    store.setCalculationOpen(true);
  });

  const dismiss = el('button', undefined, t('welcome.dismiss'));
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => store.dismissWelcome());

  actions.append(explore, dismiss);
  sheet.appendChild(actions);

  container.appendChild(sheet);
  explore.focus();
}
