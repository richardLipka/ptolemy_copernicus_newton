/**
 * Wiring.
 *
 * Two update paths, deliberately separated by cost. The instrument updates in
 * place every animation frame; the panels and the traced orbit paths rebuild
 * only when something they depend on actually changes. Orbit tracing evaluates
 * the engine a few hundred times and event scanning a few hundred more, so
 * neither belongs on the animation path.
 */

import './render/theme/theme.css';
import './render/theme/layout.css';

import { createOrrery } from './render/orrery/orrery';
import { renderEventPanel } from './render/event-panel/eventPanel';
import { renderInfoPanel } from './render/info-panel/infoPanel';
import { renderControls } from './ui/controls';
import { dateFromJd } from './core/time';
import { formatDateTime, setLocale, t } from './i18n/i18n';
import { store } from './state/store';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

setLocale(store.get().locale);
document.title = t('app.title');

const stage = document.createElement('div');
stage.className = 'stage';

const sidebar = document.createElement('aside');
sidebar.className = 'sidebar';

const masthead = document.createElement('header');
masthead.className = 'masthead';
const clock = document.createElement('div');
clock.className = 'clock';

const controlsHost = document.createElement('div');
const infoHost = document.createElement('div');
const eventsHost = document.createElement('div');

/** Kept so the running clock can update the field without rebuilding it. */
let dateInput: HTMLInputElement | null = null;

sidebar.append(masthead, clock, controlsHost, infoHost, eventsHost);
root.append(stage, sidebar);

const orrery = createOrrery(stage, store);

function renderMasthead(): void {
  masthead.replaceChildren();
  const title = document.createElement('h1');
  title.className = 'masthead__title';
  title.textContent = t('app.title');
  const subtitle = document.createElement('p');
  subtitle.className = 'masthead__subtitle';
  subtitle.textContent = t('app.subtitle');
  masthead.append(title, subtitle);
}

/**
 * Rebuild budgets, in wall-clock milliseconds.
 *
 * Throttling against simulated time does not work: the rate control makes
 * simulated days pass arbitrarily fast, so a "once per simulated day" budget
 * becomes once per frame at 400 days/s. Real elapsed time is the only measure
 * that holds however fast the clock is spun.
 */
const INFO_BUDGET_MS = 200;
const EVENT_BUDGET_MS = 600;

/** How far the date may drift before the event window is rescanned, days. */
const EVENT_RESCAN_DAYS = 25;

/**
 * What the controls depend on — deliberately *not* the date.
 *
 * The controls contain the only interactive elements in the app, and replacing
 * a button mid-gesture swallows the click that was meant for it. While the
 * clock ran, this signature changed every simulated day and tore down the
 * transport controls underneath the pointer, which is why the stop button
 * appeared not to work. Nothing here may vary with time.
 */
function controlsSignature(): string {
  const state = store.get();
  return [
    state.mode,
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.scaleMode,
    state.showOrbits,
    state.showSightLines,
    state.showStarFigures,
    state.showConstruction,
    state.selectedBody,
    state.locale,
    state.playing,
    state.rateDaysPerSecond,
  ].join('|');
}

/** What the read-only panels depend on, excluding the date. */
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
  ].join('|');
}

let lastControls = '';
let lastContext = '';
let lastRing = '';
let lastSelected: string | null = null;

let lastInfoAt = 0;
let lastEventAt = 0;
let lastEventScanJd = Number.NaN;

function render(): void {
  const state = store.get();
  const now = performance.now();
  const context = contextSignature();
  const contextChanged = context !== lastContext;
  lastContext = context;

  clock.textContent = formatDateTime(dateFromJd(state.julianDate));
  orrery.update();

  // The date input is updated in place rather than rebuilt, so that typing
  // into it is not interrupted by the clock.
  if (dateInput && document.activeElement !== dateInput) {
    const value = dateFromJd(state.julianDate).toISOString().slice(0, 10);
    if (dateInput.value !== value) dateInput.value = value;
  }

  const ring = `${state.zodiacScheme}|${state.locale}|${Math.round(state.julianDate / 3652.5)}`;
  if (ring !== lastRing) {
    lastRing = ring;
    orrery.rebuildRing();
  }

  const controls = controlsSignature();
  if (controls !== lastControls) {
    lastControls = controls;
    renderMasthead();
    dateInput = renderControls(controlsHost, store);
    document.title = t('app.title');
  }

  if (contextChanged || state.selectedBody !== lastSelected || now - lastInfoAt > INFO_BUDGET_MS) {
    lastInfoAt = now;
    lastSelected = state.selectedBody;
    renderInfoPanel(infoHost, store);
  }

  // Event scanning evaluates the engine several hundred times, so it is driven
  // by how far the date has actually moved rather than by every change to it.
  const drifted =
    Number.isNaN(lastEventScanJd) ||
    Math.abs(state.julianDate - lastEventScanJd) > EVENT_RESCAN_DAYS;
  if ((contextChanged || drifted) && now - lastEventAt > EVENT_BUDGET_MS) {
    lastEventAt = now;
    lastEventScanJd = state.julianDate;
    renderEventPanel(eventsHost, store);
  }
}

store.subscribe(render);

/**
 * Longest real interval a single frame may represent, seconds.
 *
 * Browsers suspend animation frames in a hidden tab, so the first frame after
 * one is revealed reports the entire time it spent hidden. Left unclamped, that
 * whole interval is multiplied by the time rate: a minute in another tab at 400
 * days a second would jump the clock by sixty-five years and, worse, do it in
 * one step the n-body integrator would have to swallow whole.
 *
 * Clamping means simulated time pauses while the tab is away rather than
 * catching up, which is also the more useful behaviour.
 */
const MAX_FRAME_SECONDS = 0.1;

let previousTimestamp = performance.now();
function frame(timestamp: number): void {
  const elapsedSeconds = Math.min(
    (timestamp - previousTimestamp) / 1000,
    MAX_FRAME_SECONDS,
  );
  previousTimestamp = timestamp;
  store.tick(elapsedSeconds);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

render();
