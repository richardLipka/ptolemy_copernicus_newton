/**
 * Unified bottom Observer's Evidence Drawer.
 *
 * Replaces the two colliding top/bottom strips with one tabbed drawer right
 * above the bottom-center time pill: Observer's sky, Sky track, and the live
 * 4-model Capability Scorecard. Only one evidence view is open at a time, so
 * the central map always keeps generous vertical space.
 */

import { t } from '../../i18n/i18n';
import type { EvidenceTab, Store } from '../../state/store';
import { el, wireRovingFocus } from '../../ui/dom';
import { createSkyStrip, type SkyStrip } from '../sky/skyStrip';

export interface EvidenceDrawer {
  skyStrip: SkyStrip;
  trackPane: HTMLDivElement;
  scorecardPane: HTMLDivElement;
  syncHeader(): void;
}

const TABS: readonly EvidenceTab[] = ['sky', 'track', 'scorecard'];
const SKY_FIELDS: readonly number[] = [40, 12, 4, 1];

export function createEvidenceDrawer(host: HTMLElement, store: Store): EvidenceDrawer {
  host.replaceChildren();

  const header = el('div', 'evidence__header');
  const tablist = el('div', 'tablist');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('focusgroup', 'tablist nomemory');
  tablist.setAttribute('aria-label', t('evidence.label'));

  const tabButtons = new Map<EvidenceTab, HTMLButtonElement>();
  for (const id of TABS) {
    const button = el('button', 'tablist__tab', t(`evidence.${id}`));
    button.type = 'button';
    button.id = `evidence-tab-${id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.addEventListener('click', () => store.setEvidenceTab(id));
    tabButtons.set(id, button);
    tablist.appendChild(button);
  }

  const fieldControls = el('div', 'evidence__fields');
  const fieldButtons = new Map<number, HTMLButtonElement>();
  for (const width of SKY_FIELDS) {
    const btn = el('button', 'evidence__field-btn', t(`sky.field.${width}`));
    btn.type = 'button';
    btn.addEventListener('click', () => store.setSkyField(width));
    fieldButtons.set(width, btn);
    fieldControls.appendChild(btn);
  }

  const close = el('button', 'evidence__close', '×');
  close.type = 'button';
  close.title = t('evidence.close');
  close.setAttribute('aria-label', t('evidence.close'));
  close.addEventListener('click', () => store.setEvidenceTab(null));

  header.append(tablist, fieldControls, close);

  const skyPane = el('div', 'evidence__pane');
  skyPane.setAttribute('role', 'tabpanel');
  skyPane.setAttribute('aria-labelledby', 'evidence-tab-sky');
  skyPane.hidden = true;

  const trackPane = el('div', 'evidence__pane');
  trackPane.setAttribute('role', 'tabpanel');
  trackPane.setAttribute('aria-labelledby', 'evidence-tab-track');
  trackPane.hidden = true;

  const scorecardPane = el('div', 'evidence__pane');
  scorecardPane.setAttribute('role', 'tabpanel');
  scorecardPane.setAttribute('aria-labelledby', 'evidence-tab-scorecard');
  scorecardPane.hidden = true;

  host.append(header, skyPane, trackPane, scorecardPane);
  const skyStrip = createSkyStrip(skyPane, store);

  wireRovingFocus(tablist, '[role="tab"]', { activateOnFocus: true });

  function syncHeader(): void {
    const state = store.get();
    const active = state.evidenceTab;

    tablist.setAttribute('aria-label', t('evidence.label'));
    close.title = t('evidence.close');
    close.setAttribute('aria-label', t('evidence.close'));

    for (const id of TABS) {
      const btn = tabButtons.get(id)!;
      const selected = active === id;
      btn.textContent = t(`evidence.${id}`);
      btn.setAttribute('aria-selected', String(selected));
      btn.toggleAttribute('focusgroupstart', selected);
    }

    fieldControls.hidden = active !== 'sky';
    for (const width of SKY_FIELDS) {
      const btn = fieldButtons.get(width)!;
      btn.textContent = t(`sky.field.${width}`);
      btn.setAttribute('aria-pressed', String(Math.abs(state.skyField - width) < 0.05));
    }

    skyPane.hidden = active !== 'sky';
    trackPane.hidden = active !== 'track';
    scorecardPane.hidden = active !== 'scorecard';
  }

  return { skyStrip, trackPane, scorecardPane, syncHeader };
}
