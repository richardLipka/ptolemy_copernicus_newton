/**
 * Wiring — Stage-First layout.
 *
 * Full-bleed central orrery with:
 *  - Top full-width Command Bar (models, compare, guided trials, working, notes, export, preferences)
 *  - Floating non-blocking Trial Banner (top-centre of the stage when a trial is active)
 *  - Left Settings Rail (Vantage + Equivalence Bridge, What to show, Bodies)
 *  - Right Inspector (tabbed Details | Events)
 *  - Unified Bottom Evidence Drawer (Observer's sky | Sky track | Model scorecard)
 *  - Bottom-Centre compact Time Pill (play/pause, step, clock/date/today, rate)
 *  - Bottom-Right quiet Credit & institutional marks
 */

import './render/theme/tokens.css';
import './render/theme/theme-orrery.css';
import './render/theme/theme-atelier.css';
import './render/theme/theme-nocturne.css';
import './render/theme/theme-lcars.css';
import './render/theme/theme-flightdeck.css';
import './render/theme/shell.css';
import './render/theme/layout.css';

import favMark from './assets/fav.svg?raw';
import kivMark from './assets/kiv.svg?raw';

import { BODY_IDS } from '@orrery/core/bodies';
import { ENGINES } from '@orrery/core/engines/registry';
import { MODES, type EngineId, type ModeId } from '@orrery/core/engines/types';
import {
  buildLongitudeTrack,
  trackCycleDays,
  trackWindowDays,
} from '@orrery/core/longitudeTrack';
import { dateFromJd } from '@orrery/core/time';
import { precessionSinceJ2000 } from '@orrery/core/zodiac';
import { formatDateTime, setLocale, t } from './i18n/i18n';
import { renderEventPanel } from './render/event-panel/eventPanel';
import { createEvidenceDrawer } from './render/evidence/evidenceDrawer';
import { renderScorecard } from './render/evidence/scorecard';
import { renderInfoPanel } from './render/info-panel/infoPanel';
import { createOrrery, type OrrerySource } from './render/orrery/orrery';
import { applyTheme } from './render/theme/themes';
import { renderTrackStrip, type GhostTrackEntry } from './render/track/trackStrip';
import { createAnimationLoop } from './state/animationLoop';
import { applyNotes } from './state/preferences';
import { COMPARISON_ENGINES, recentredHarnessAvailable } from './state/selectors';
import { store, type RightTab } from './state/store';
import { encodeUrlState, readUrlState, writeUrlState } from './state/urlState';
import { renderCalculationOverlay } from './ui/calculationOverlay';
import { renderControls } from './ui/controls';
import { el, select, toggleButton, wireRovingFocus } from './ui/dom';
import { renderTimeDock } from './ui/timeDock';
import { renderTopBar } from './ui/topBar';
import { renderTrialBanner } from './ui/trials';
import { renderWelcome } from './ui/welcome';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

const app: HTMLDivElement = root;

setLocale(store.get().locale);
applyTheme(store.get().theme);
applyNotes(store.get().showNotes);
document.title = t('app.title');

// --- structure -----------------------------------------------------------

const commandBarHost = document.createElement('div');
commandBarHost.className = 'command-bar-host';

const field = document.createElement('div');
field.className = 'stage__field';

const primaryPane = el('div', 'stage__pane stage__pane--primary');
const primaryBar = el('div', 'pane-bar pane-bar--label');
primaryBar.hidden = true;
const primaryCanvas = el('div', 'stage__canvas');
primaryPane.append(primaryBar, primaryCanvas);

const secondaryPane = el('div', 'stage__pane stage__pane--secondary');
secondaryPane.hidden = true;
const secondaryBar = el('div', 'pane-bar pane-bar--controls');
const secondaryCanvas = el('div', 'stage__canvas');
secondaryPane.append(secondaryBar, secondaryCanvas);

field.append(primaryPane, secondaryPane);

const trialBannerHost = document.createElement('div');
trialBannerHost.className = 'trial-banner-host';
trialBannerHost.hidden = true;

const dockLeft = document.createElement('div');
dockLeft.className = 'dock dock--left';

const controlsHost = document.createElement('div');
controlsHost.style.display = 'contents';
dockLeft.appendChild(controlsHost);

// Right inspector: one unified card with ARIA tablist (`Details` | `Events`).
const dockRight = document.createElement('div');
dockRight.className = 'dock dock--right';

const inspectorCard = el('section', 'panel inspector');
const rightTablist = el('div', 'tablist inspector__tabs');
rightTablist.setAttribute('role', 'tablist');
rightTablist.setAttribute('focusgroup', 'tablist nomemory');
rightTablist.setAttribute('aria-label', t('right.tabs'));

const RIGHT_TABS: readonly RightTab[] = ['inspect', 'events'];
const rightTabButtons = new Map<RightTab, HTMLButtonElement>();
for (const tab of RIGHT_TABS) {
  const btn = el('button', 'tablist__tab', t(`right.tab.${tab}`));
  btn.type = 'button';
  btn.id = `inspector-tab-${tab}`;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', 'false');
  btn.addEventListener('click', () => store.setRightTab(tab));
  rightTabButtons.set(tab, btn);
  rightTablist.appendChild(btn);
}
wireRovingFocus(rightTablist, '[role="tab"]', { activateOnFocus: true });

const infoHost = el('div', 'inspector__pane');
infoHost.setAttribute('role', 'tabpanel');
infoHost.setAttribute('aria-labelledby', 'inspector-tab-inspect');

const eventsHost = el('div', 'inspector__pane');
eventsHost.setAttribute('role', 'tabpanel');
eventsHost.setAttribute('aria-labelledby', 'inspector-tab-events');
eventsHost.hidden = true;

inspectorCard.append(rightTablist, infoHost, eventsHost);
dockRight.appendChild(inspectorCard);

// Bottom-centre compact timing pill.
const dockBottomCenter = document.createElement('div');
dockBottomCenter.className = 'dock dock--bottom-center';

const timeDockHost = document.createElement('div');
timeDockHost.style.display = 'contents';
dockBottomCenter.appendChild(timeDockHost);

// Bottom-right quiet credit & university marks.
const dockBottomRight = document.createElement('div');
dockBottomRight.className = 'dock dock--bottom-right dock--credit';

const credit = el('footer', 'credit');
credit.append(`${t('footer.copyright', { year: new Date().getFullYear() })} · `);

const contactLink = el('a', undefined, 'lipka@fav.zcu.cz');
contactLink.href = 'mailto:lipka@fav.zcu.cz';
credit.append(contactLink, ' · ');

const homeLink = el('a', undefined, 'home.zcu.cz/~lipka');
homeLink.href = 'https://home.zcu.cz/~lipka/';
homeLink.target = '_blank';
homeLink.rel = 'noopener noreferrer';
credit.appendChild(homeLink);

const marks = el('div', 'credit__marks');
for (const [markup, href, label, extra] of [
  [favMark, 'https://www.fav.zcu.cz/', 'Fakulta aplikovaných věd ZČU', ''],
  [
    kivMark,
    'https://www.kiv.zcu.cz/',
    'Katedra informatiky a výpočetní techniky',
    ' credit__mark--wordmark',
  ],
] as const) {
  const link = el('a', `credit__mark${extra}`);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = label;
  link.setAttribute('aria-label', label);
  link.innerHTML = markup;
  link.firstElementChild?.setAttribute('aria-hidden', 'true');
  link.firstElementChild?.setAttribute('focusable', 'false');
  marks.appendChild(link);
}
credit.appendChild(marks);
dockBottomRight.appendChild(credit);

// Unified bottom evidence drawer (Observer's sky | Sky track | Model scorecard).
const evidenceHost = document.createElement('div');
evidenceHost.className = 'evidence-host';
evidenceHost.hidden = true;

/** Wrapper the narrow-viewport rules turn into a stacked column. */
const dockStack = document.createElement('div');
dockStack.className = 'dock-stack';
dockStack.append(dockBottomCenter, dockLeft, dockRight, dockBottomRight);

const overlayHost = document.createElement('div');
overlayHost.className = 'overlay';
overlayHost.hidden = true;

const welcomeHost = document.createElement('div');
welcomeHost.className = 'overlay overlay--welcome';
welcomeHost.hidden = true;

root.append(
  commandBarHost,
  field,
  trialBannerHost,
  evidenceHost,
  dockStack,
  overlayHost,
  welcomeHost,
);

const splitSource: OrrerySource = {
  get: () => {
    const s = store.get();
    return {
      ...s,
      mode: s.splitMode,
      engineId: s.splitEngineId,
      frameOrigin: s.splitFrameOrigin,
      showRecentredHarness: s.splitShowRecentredHarness,
      ghostEngineId: null,
      zoom: s.splitZoom,
      panX: s.splitPanX,
      panY: s.splitPanY,
    };
  },
  trails: store.splitTrails,
  selectBody: (id) => store.selectBody(id),
};

const orrery = createOrrery(primaryCanvas, store);
const splitOrrery = createOrrery(secondaryCanvas, splitSource);
const evidenceDrawer = createEvidenceDrawer(evidenceHost, store);

function renderSplitBars(): void {
  const state = store.get();
  if (!state.splitView) {
    primaryBar.replaceChildren();
    secondaryBar.replaceChildren();
    return;
  }

  const primaryInner = el('div', 'pane-bar__inner');
  primaryInner.appendChild(
    el(
      'span',
      'pane-bar__label',
      t('split.primaryLabel', {
        model: t(`mode.${state.mode}`),
        origin: t(`body.${state.frameOrigin}`),
      }),
    ),
  );
  primaryBar.replaceChildren(primaryInner);

  const secondaryInner = el('div', 'pane-bar__inner');

  const modelSelect = select(
    (Object.keys(MODES) as ModeId[]).map((id) => ({ value: id, label: t(`mode.${id}`) })),
    state.splitMode,
    (mode) => store.setSplitMode(mode),
  );
  modelSelect.className = 'pane-bar__select';
  modelSelect.setAttribute('aria-label', t('split.paneModel'));
  secondaryInner.appendChild(modelSelect);

  const variants = MODES[state.splitMode].engines;
  if (variants.length > 1) {
    const variantSelect = select(
      variants.map((id) => ({ value: id, label: t(`engine.${id}`) })),
      state.splitEngineId,
      (id) => store.setSplitEngine(id),
    );
    variantSelect.className = 'pane-bar__select';
    variantSelect.setAttribute('aria-label', t('engine.label'));
    secondaryInner.appendChild(variantSelect);
  }

  const originSelect = select(
    BODY_IDS.map((id) => ({ value: id, label: t(`body.${id}`) })),
    state.splitFrameOrigin,
    (id) => store.setSplitFrameOrigin(id),
  );
  originSelect.className = 'pane-bar__select';
  originSelect.setAttribute('aria-label', t('split.paneOrigin'));
  secondaryInner.appendChild(originSelect);

  if (recentredHarnessAvailable(splitSource.get())) {
    const compBtn = toggleButton(
      t('view.recentred'),
      state.splitShowRecentredHarness,
      () => store.toggleSplitRecentredHarness(),
    );
    compBtn.className = 'pane-bar__btn';
    secondaryInner.appendChild(compBtn);
  }

  const swapBtn = el('button', 'pane-bar__btn pane-bar__btn--icon', '⇄');
  swapBtn.type = 'button';
  swapBtn.title = t('split.swap');
  swapBtn.setAttribute('aria-label', t('split.swap'));
  swapBtn.addEventListener('click', () => store.swapSplitPanes());
  secondaryInner.appendChild(swapBtn);

  const closeBtn = el('button', 'pane-bar__btn pane-bar__btn--icon', '×');
  closeBtn.type = 'button';
  closeBtn.title = t('split.close');
  closeBtn.setAttribute('aria-label', t('split.close'));
  closeBtn.addEventListener('click', () => store.toggleSplitView());
  secondaryInner.appendChild(closeBtn);

  secondaryBar.replaceChildren(secondaryInner);
}

// Keep CSS stage insets synced to the actual rendered heights of the top bar,
// bottom-centre time pill, and bottom-right credit so wrapping on mid-size
// screens never creates gaps or overlaps.
const observeHeight = (element: HTMLElement, variable: string): void => {
  new ResizeObserver(() => {
    const height = Math.ceil(element.getBoundingClientRect().height);
    if (height > 0) app.style.setProperty(variable, `${height}px`);
  }).observe(element);
};
observeHeight(commandBarHost, '--bar-height');
observeHeight(dockBottomCenter, '--time-pill-height');
observeHeight(dockBottomRight, '--credit-reserve');

/** Handed back by the time dock so the clock can update without a rebuild. */
let dateInput: HTMLInputElement | null = null;
let clockReadout: HTMLElement | null = null;

function syncRightTabs(): void {
  const active = store.get().rightTab;
  rightTablist.setAttribute('aria-label', t('right.tabs'));
  for (const tab of RIGHT_TABS) {
    const btn = rightTabButtons.get(tab)!;
    const selected = active === tab;
    btn.textContent = t(`right.tab.${tab}`);
    btn.setAttribute('aria-selected', String(selected));
    btn.toggleAttribute('focusgroupstart', selected);
  }
  infoHost.hidden = active !== 'inspect';
  eventsHost.hidden = active !== 'events';
}

// --- update budgets ------------------------------------------------------

const INFO_BUDGET_MS = 200;
const EVENT_BUDGET_MS = 600;
const EVENT_RESCAN_DAYS = 25;

function controlsSignature(): string {
  const state = store.get();
  return [
    state.mode,
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.sphereCentre,
    state.scaleMode,
    state.showOrbits,
    state.showSightLines,
    state.showStarFigures,
    state.showConstruction,
    state.showRecentredHarness,
    state.evidenceTab,
    state.rightTab,
    state.activePopover,
    state.activeTrialId,
    state.showMoons,
    state.splitView,
    state.splitMode,
    state.splitEngineId,
    state.splitFrameOrigin,
    state.splitShowRecentredHarness,
    state.skyField,
    state.selectedBody,
    state.locale,
    state.theme,
    state.showNotes,
    state.playing,
    state.rateDaysPerSecond,
  ].join('|');
}

function overlaySignature(): string {
  const state = store.get();
  return [
    state.showCalculation,
    state.showWelcome,
    state.selectedBody,
    state.observationPoint,
    state.locale,
  ].join('|');
}

const OVERLAY_BUDGET_MS = 250;
let lastOverlay = '';
let lastOverlayAt = 0;

function contextSignature(): string {
  const state = store.get();
  return [
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.scaleMode,
    state.locale,
    state.theme,
  ].join('|');
}

let lastControls = '';
let lastContext = '';
let lastRing = '';
let lastSplitRing = '';
let lastSelected: string | null = null;
let lastRightTab: RightTab | null = null;
let lastEvidenceTab: string | null = null;

let lastInfoAt = 0;
let lastInfoJd = Number.NaN;
let lastScorecardAt = 0;
let lastScorecardJd = Number.NaN;
let lastEventAt = 0;
let lastEventScanJd = Number.NaN;
let eventsRendered = false;

let lastTrackSignature = '';

function renderTrack(): void {
  const state = store.get();
  if (state.evidenceTab !== 'track') return;

  if (!state.selectedBody) {
    evidenceDrawer.trackPane.replaceChildren(
      el('p', 'note note--live track-host__empty', t('track.none')),
    );
    lastTrackSignature = '';
    return;
  }

  const signature = [
    state.selectedBody,
    state.observationPoint,
    state.engineId,
    state.ghostEngineId,
    state.zodiacScheme,
    state.locale,
    Math.round(state.julianDate),
  ].join('|');
  if (signature === lastTrackSignature) return;
  lastTrackSignature = signature;

  const observer = state.observationPoint;
  const target = state.selectedBody;
  const windowDays = trackWindowDays(observer, target);

  const ghostEngines: EngineId[] =
    state.ghostEngineId === 'all'
      ? COMPARISON_ENGINES.filter((id) => id !== state.engineId)
      : state.ghostEngineId && state.ghostEngineId !== state.engineId
        ? [state.ghostEngineId]
        : [];

  const ghostTracks: GhostTrackEntry[] = ghostEngines.map((engineId) => ({
    engineId,
    track: buildLongitudeTrack(
      ENGINES[engineId].positionsAt,
      state.julianDate,
      observer,
      target,
      windowDays,
    ),
  }));

  renderTrackStrip(evidenceDrawer.trackPane, {
    track: buildLongitudeTrack(
      ENGINES[state.engineId].positionsAt,
      state.julianDate,
      observer,
      target,
      windowDays,
    ),
    ghostTracks,
    target,
    observer,
    julianDate: state.julianDate,
    cycleDays: trackCycleDays(observer, target),
    zodiacScheme: state.zodiacScheme,
    precession:
      state.zodiacScheme === 'signs' ? -precessionSinceJ2000(state.julianDate) : 0,
  });
}

function render(): void {
  const state = store.get();
  const now = performance.now();
  const context = contextSignature();
  const contextChanged = context !== lastContext;
  lastContext = context;

  app.dataset.split = state.splitView ? 'on' : 'off';
  primaryBar.hidden = !state.splitView;
  secondaryPane.hidden = !state.splitView;

  orrery.update();
  if (state.splitView) {
    splitOrrery.update();
  }

  const evidenceOpen = state.evidenceTab !== null;
  evidenceHost.hidden = !evidenceOpen;
  app.dataset.evidence = evidenceOpen ? 'on' : 'off';
  if (state.evidenceTab) {
    app.dataset.evidenceTab = state.evidenceTab;
  } else {
    delete app.dataset.evidenceTab;
  }

  const evidenceSwitched = state.evidenceTab !== lastEvidenceTab;
  lastEvidenceTab = state.evidenceTab;

  if (state.evidenceTab === 'sky') {
    evidenceDrawer.skyStrip.update();
  } else if (state.evidenceTab === 'track') {
    renderTrack();
  } else if (
    state.evidenceTab === 'scorecard' &&
    (evidenceSwitched ||
      contextChanged ||
      state.selectedBody !== lastSelected ||
      (!state.playing && state.julianDate !== lastScorecardJd) ||
      now - lastScorecardAt > INFO_BUDGET_MS)
  ) {
    lastScorecardAt = now;
    lastScorecardJd = state.julianDate;
    renderScorecard(evidenceDrawer.scorecardPane, store);
  }

  const reading = formatDateTime(dateFromJd(state.julianDate));
  if (clockReadout && clockReadout.textContent !== reading) {
    clockReadout.textContent = reading;
  }

  if (dateInput && document.activeElement !== dateInput) {
    const value = dateFromJd(state.julianDate).toISOString().slice(0, 10);
    if (dateInput.value !== value) dateInput.value = value;
  }

  const ring = `${state.zodiacScheme}|${state.locale}|${Math.round(state.julianDate / 3652.5)}`;
  if (ring !== lastRing) {
    lastRing = ring;
    orrery.rebuildRing();
  }
  if (state.splitView && ring !== lastSplitRing) {
    lastSplitRing = ring;
    splitOrrery.rebuildRing();
  }

  const controls = controlsSignature();
  if (controls !== lastControls) {
    lastControls = controls;
    renderTopBar(commandBarHost, store);
    renderTrialBanner(trialBannerHost, store);
    renderControls(controlsHost, store);
    renderSplitBars();
    evidenceDrawer.syncHeader();
    syncRightTabs();
    const dock = renderTimeDock(timeDockHost, store);
    dateInput = dock.dateInput;
    clockReadout = dock.clock;
    clockReadout.textContent = reading;
    document.title = t('app.title');
  }

  const overlay = overlaySignature();
  if (
    overlay !== lastOverlay ||
    (state.showCalculation && now - lastOverlayAt > OVERLAY_BUDGET_MS)
  ) {
    lastOverlay = overlay;
    lastOverlayAt = now;
    renderCalculationOverlay(overlayHost, store);
    renderWelcome(welcomeHost, store);
  }

  const rightTabSwitched = state.rightTab !== lastRightTab;
  lastRightTab = state.rightTab;

  if (
    state.rightTab === 'inspect' &&
    (rightTabSwitched ||
      contextChanged ||
      state.selectedBody !== lastSelected ||
      (!state.playing && state.julianDate !== lastInfoJd) ||
      now - lastInfoAt > INFO_BUDGET_MS)
  ) {
    lastInfoAt = now;
    lastInfoJd = state.julianDate;
    lastSelected = state.selectedBody;
    renderInfoPanel(infoHost, store);
  } else if (state.selectedBody !== lastSelected) {
    lastSelected = state.selectedBody;
  }

  if (state.rightTab === 'events') {
    const drifted =
      Number.isNaN(lastEventScanJd) ||
      Math.abs(state.julianDate - lastEventScanJd) > EVENT_RESCAN_DAYS;
    const withinBudget = eventsRendered && !rightTabSwitched && now - lastEventAt <= EVENT_BUDGET_MS;
    if ((!eventsRendered || contextChanged || drifted) && !withinBudget) {
      eventsRendered = true;
      lastEventAt = now;
      lastEventScanJd = state.julianDate;
      renderEventPanel(eventsHost, store, {
        onJump: (jd) => {
          lastEventScanJd = jd;
          store.setJulianDate(jd);
        },
      });
    }
  }
}

// --- zoom ----------------------------------------------------------------

const MAP_GESTURE_EXCLUDED =
  '.dock, .command-bar-host, .command-popover, .overlay, .trial-banner-host, .evidence-host, .pane-bar';

const overTheMap = (target: EventTarget | null): boolean =>
  !(target as Element | null)?.closest(MAP_GESTURE_EXCLUDED);

const inSecondaryPane = (target: EventTarget | null): boolean =>
  Boolean((target as Element | null)?.closest('.stage__pane--secondary'));

const ZOOM_SENSITIVITY = 0.0016;
const DELTA_TO_PIXELS = [1, 16, 400];
const KEY_ZOOM_STEP = 1.5;

root.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    if (!overTheMap(event.target)) return;
    event.preventDefault();
    const pixels = event.deltaY * (DELTA_TO_PIXELS[event.deltaMode] ?? 1);
    const factor = Math.exp(-pixels * ZOOM_SENSITIVITY);
    if (inSecondaryPane(event.target)) store.zoomSplitBy(factor);
    else store.zoomBy(factor);
  },
  { passive: false },
);

root.addEventListener('dblclick', (event: MouseEvent) => {
  if (!overTheMap(event.target)) return;
  if (inSecondaryPane(event.target)) store.resetSplitZoom();
  else store.resetZoom();
});

// --- panning -------------------------------------------------------------

const DRAG_THRESHOLD_PX = 3;

let dragPointer: number | null = null;
let dragPane: 'primary' | 'secondary' = 'primary';
let dragX = 0;
let dragY = 0;
let dragging = false;

const instrumentElFor = (pane: 'primary' | 'secondary'): HTMLElement | null =>
  (pane === 'secondary' ? secondaryCanvas : primaryCanvas).querySelector('.instrument');

root.addEventListener('pointerdown', (event: PointerEvent) => {
  const target = event.target as Element | null;
  if (!overTheMap(target)) return;
  if (event.button !== 0) return;

  dragPointer = event.pointerId;
  dragPane = inSecondaryPane(target) ? 'secondary' : 'primary';
  dragX = event.clientX;
  dragY = event.clientY;
  dragging = false;
});

root.addEventListener('pointermove', (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return;

  const dx = event.clientX - dragX;
  const dy = event.clientY - dragY;

  if (!dragging) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragging = true;
    instrumentElFor(dragPane)?.setAttribute('data-dragging', 'on');

    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // Without capture the drag still works.
    }
  }

  dragX = event.clientX;
  dragY = event.clientY;

  if (dragPane === 'secondary') {
    const unit = splitOrrery.unitPx();
    if (unit > 0) store.panSplitBy(dx / unit, dy / unit);
  } else {
    const unit = orrery.unitPx();
    if (unit > 0) store.panBy(dx / unit, dy / unit);
  }
});

const endDrag = (event: PointerEvent): void => {
  if (dragPointer !== event.pointerId) return;
  if (dragging && root.hasPointerCapture(event.pointerId)) {
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
  }
  dragPointer = null;
  instrumentElFor(dragPane)?.removeAttribute('data-dragging');
  setTimeout(() => {
    dragging = false;
  }, 0);
};

root.addEventListener('pointerup', endDrag);
root.addEventListener('pointercancel', endDrag);

root.addEventListener(
  'click',
  (event: MouseEvent) => {
    if (!dragging) return;
    event.stopPropagation();
    event.preventDefault();
  },
  true,
);

// --- keyboard & popover light-dismiss ------------------------------------

document.addEventListener('pointerdown', (event: PointerEvent) => {
  if (!store.get().activePopover) return;
  const target = event.target as Element | null;
  if (target?.closest('.command-popover') || target?.closest('[data-popover-trigger]')) return;
  store.setTopPopover(null);
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    const current = store.get();
    if (current.showWelcome) {
      store.dismissWelcome();
      return;
    }
    if (current.showCalculation) {
      store.setCalculationOpen(false);
      return;
    }
    if (current.activePopover) {
      store.setTopPopover(null);
      return;
    }
    if (current.activeTrialId) {
      store.dismissTrial();
      return;
    }
  }

  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const inRovingGroup = Boolean(active?.closest('[role="tablist"], [role="toolbar"]'));

  switch (event.key) {
    case ' ':
      if (active instanceof HTMLButtonElement) return;
      event.preventDefault();
      store.togglePlay();
      break;
    case 'ArrowLeft':
      if (inRovingGroup) return;
      event.preventDefault();
      store.stepDays(-1);
      break;
    case 'ArrowRight':
      if (inRovingGroup) return;
      event.preventDefault();
      store.stepDays(1);
      break;
    case '+':
    case '=':
      event.preventDefault();
      store.zoomBy(KEY_ZOOM_STEP);
      break;
    case '-':
    case '_':
      event.preventDefault();
      store.zoomBy(1 / KEY_ZOOM_STEP);
      break;
    default:
      break;
  }
});

// --- shareable configuration --------------------------------------------

let lastWrittenHash = '';
let lastUrlWriteAt = 0;
const URL_DATE_BUDGET_MS = 500;

function currentUrlState() {
  const state = store.get();
  return {
    mode: state.mode,
    engineId: state.engineId,
    frameOrigin: state.frameOrigin,
    observationPoint: state.observationPoint,
    sphereCentre: state.sphereCentre,
    julianDate: state.julianDate,
  };
}

function syncUrl(): void {
  const next = currentUrlState();
  const encoded = encodeUrlState(next);
  if (encoded === lastWrittenHash) return;

  const configurationChanged =
    encodeUrlState({ ...next, julianDate: undefined }) !==
    encodeUrlState({ ...readUrlState(lastWrittenHash), julianDate: undefined });

  const now = performance.now();
  const throttled =
    store.get().playing && !configurationChanged && now - lastUrlWriteAt < URL_DATE_BUDGET_MS;
  if (throttled) return;

  lastUrlWriteAt = now;
  lastWrittenHash = encoded;
  writeUrlState(next);
}

window.addEventListener('hashchange', () => {
  if (window.location.hash === lastWrittenHash) return;
  lastWrittenHash = window.location.hash;
  store.hydrate(readUrlState());
});

const shared = readUrlState();
if (Object.keys(shared).length > 0) store.hydrate(shared);

store.subscribe(syncUrl);
store.subscribe(render);

syncUrl();

const MAX_FRAME_SECONDS = 0.1;

// Schedule animation frames strictly while playing so paused views consume
// zero idle CPU or battery, guarded against re-entrant store notifications.
const animationLoop = createAnimationLoop({
  maxFrameSeconds: MAX_FRAME_SECONDS,
  onTick: (elapsedSeconds) => store.tick(elapsedSeconds),
});

store.subscribe((state) => animationLoop.sync(state.playing));
animationLoop.sync(store.get().playing);

render();
