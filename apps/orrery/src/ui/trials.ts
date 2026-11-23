/**
 * Guided Trials — entering a historical test and keeping a non-blocking
 * takeaway card on screen while the reader experiments.
 */

import { DEMONSTRATIONS, type Demonstration } from '@orrery/core/demonstrations';
import { dateFromJd } from '@orrery/core/time';
import { formatDate, t } from '../i18n/i18n';
import { focusViewFor } from '../state/selectors';
import type { Store } from '../state/store';
import { el, linked } from './dom';

/** Apply a demonstration and zoom onto its target system when requested. */
export function launchTrial(store: Store, demonstration: Demonstration): void {
  store.applyDemonstration(demonstration);
  if (demonstration.focusBody) {
    const view = focusViewFor(store.get(), demonstration.body);
    store.setZoom(view.zoom);
    store.panTo(view.centreOn.x, view.centreOn.y);
  }
}

interface TrialAction {
  label: string;
  run: () => void;
}

function actionsForTrial(trial: Demonstration, store: Store): TrialAction[] {
  const state = store.get();
  const actions: TrialAction[] = [];

  const switchAction = (targetMode: 'ptolemy' | 'copernicus' | 'kepler' | 'newton'): TrialAction => ({
    label: t('trials.action.switchTo', { model: t(`mode.${targetMode}`) }),
    run: () => store.setMode(targetMode),
  });

  switch (trial.id) {
    case 'mars-composition-2027':
      actions.push(switchAction(state.mode === 'ptolemy' ? 'kepler' : 'ptolemy'));
      actions.push({
        label: t('trials.action.openScorecard'),
        run: () => store.setEvidenceTab('scorecard'),
      });
      break;

    case 'mars-opposition-1602':
      actions.push(switchAction(state.mode === 'kepler' ? 'copernicus' : 'kepler'));
      if (state.evidenceTab !== 'track') {
        actions.push({
          label: t('evidence.track'),
          run: () => store.setEvidenceTab('track'),
        });
      }
      break;

    case 'venus-phases-1610':
      actions.push(switchAction(state.mode === 'ptolemy' ? 'kepler' : 'ptolemy'));
      if (state.evidenceTab !== 'sky') {
        actions.push({
          label: t('trials.action.openSky'),
          run: () => store.setEvidenceTab('sky'),
        });
      }
      actions.push({
        label: t('trials.action.openScorecard'),
        run: () => store.setEvidenceTab('scorecard'),
      });
      break;

    case 'galilean-moons-1610':
      actions.push(switchAction(state.mode === 'newton' ? 'ptolemy' : 'newton'));
      actions.push({
        label: t('trials.action.focus'),
        run: () => {
          const view = focusViewFor(store.get(), 'jupiter');
          store.selectBody('jupiter');
          store.setZoom(view.zoom);
          store.panTo(view.centreOn.x, view.centreOn.y);
        },
      });
      break;

    case 'mercury-transit-1631':
      actions.push(switchAction(state.mode === 'ptolemy' ? 'kepler' : 'ptolemy'));
      if (state.evidenceTab !== 'sky' || state.skyField > 4) {
        actions.push({
          label: t('trials.action.openSky'),
          run: () => {
            store.setSkyField(1);
            store.setEvidenceTab('sky');
          },
        });
      }
      break;

    case 'great-conjunction-1603':
    case 'great-conjunction-2020':
      actions.push(switchAction(state.mode === 'ptolemy' ? 'kepler' : 'ptolemy'));
      if (state.ghostEngineId !== 'all') {
        actions.push({
          label: t('trials.action.compareAll'),
          run: () => store.setGhostEngine('all'),
        });
      }
      break;

    case 'lunar-perturbation-2026':
      actions.push(switchAction(state.mode === 'newton' ? 'kepler' : 'newton'));
      if (!state.playing) {
        actions.push({
          label: t('trials.action.play'),
          run: () => {
            store.setRate(5);
            store.play();
          },
        });
      }
      break;
  }

  const index = DEMONSTRATIONS.findIndex((item) => item.id === trial.id);
  const next = DEMONSTRATIONS[(index + 1) % DEMONSTRATIONS.length];
  if (next) {
    actions.push({
      label: `${t('trials.next')} ›`,
      run: () => launchTrial(store, next),
    });
  }

  return actions;
}

/**
 * Floating, non-blocking Trial Banner anchored at the top-centre of the stage.
 * Always dismissible and compact so the map stays unobstructed.
 */
export function renderTrialBanner(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const trial = state.activeTrialId
    ? DEMONSTRATIONS.find((item) => item.id === state.activeTrialId) ?? null
    : null;

  if (!trial) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const card = el('aside', 'trial-banner panel');
  card.setAttribute('aria-label', t(`demo.${trial.id}`));

  const header = el('div', 'trial-banner__head');
  const titleGroup = el('div', 'trial-banner__title-group');
  const badge = el(
    'span',
    `trial-banner__badge trial-banner__badge--${trial.theme}`,
    t(`trials.badge.${trial.theme}`),
  );
  const title = el('strong', 'trial-banner__title', t(`demo.${trial.id}`));
  const date = el('span', 'trial-banner__date', formatDate(dateFromJd(trial.jd)));
  titleGroup.append(badge, title, date);

  const close = el('button', 'trial-banner__close', '×');
  close.type = 'button';
  close.title = t('trials.dismiss');
  close.setAttribute('aria-label', t('trials.dismiss'));
  close.addEventListener('click', () => store.dismissTrial());

  header.append(titleGroup, close);
  card.appendChild(header);

  card.appendChild(linked('p', 'trial-banner__note', t(`demo.${trial.id}.note`)));

  const actions = el('div', 'trial-banner__actions');
  for (const action of actionsForTrial(trial, store)) {
    const button = el('button', 'trial-banner__action', action.label);
    button.type = 'button';
    button.addEventListener('click', action.run);
    actions.appendChild(button);
  }
  card.appendChild(actions);

  container.appendChild(card);
}
