/**
 * Single source of truth.
 *
 * A plain pub/sub store rather than a framework: the render layer's whole job
 * is to write CSS custom properties onto a fixed set of DOM nodes, which needs
 * change notification and nothing else.
 *
 * Switching models deliberately preserves everything except the engine. The
 * comparison the app exists to make is only honest if nothing else moves when
 * you flip between Ptolemy and Newton.
 */

import type { BodyId } from '../core/bodies';
import { circularEngine } from '../core/engines/circular';
import { keplerianEngine } from '../core/engines/keplerian';
import { nbodyEngine } from '../core/engines/nbody';
import {
  ptolemaicEpicyclicEngine,
  ptolemaicReframeEngine,
} from '../core/engines/ptolemaic';
import { MODES, type Engine, type EngineId, type ModeId } from '../core/engines/types';
import { SimulationClock, clampJd, jdFromDate } from '../core/time';
import type { ZodiacScheme } from '../core/zodiac';
import { getLocale, setLocale, type Locale } from '../i18n/i18n';
import { TrailLog } from './trails';

export const ENGINES: Record<EngineId, Engine> = {
  keplerian: keplerianEngine,
  circular: circularEngine,
  'ptolemaic-reframe': ptolemaicReframeEngine,
  'ptolemaic-epicyclic': ptolemaicEpicyclicEngine,
  nbody: nbodyEngine,
};

export type ScaleMode = 'compressed' | 'true';

export interface State {
  mode: ModeId;
  engineId: EngineId;
  /** Second model drawn faintly for comparison, or null. */
  ghostEngineId: EngineId | null;
  frameOrigin: BodyId;
  observationPoint: BodyId;
  selectedBody: BodyId | null;
  zodiacScheme: ZodiacScheme;
  scaleMode: ScaleMode;
  showOrbits: boolean;
  showSightLines: boolean;
  showStarFigures: boolean;
  /** Draw the selected body's deferent, epicycle and equant. */
  showConstruction: boolean;
  locale: Locale;
  /** Mirrors the clock so subscribers see time changes like any other change. */
  julianDate: number;
  playing: boolean;
  rateDaysPerSecond: number;
}

type Listener = (state: State) => void;

export class Store {
  readonly clock: SimulationClock;
  /** Where the bodies have been. Orbits are drawn from this, not predicted. */
  readonly trails = new TrailLog();
  private state: State;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.clock = new SimulationClock(jdFromDate(new Date()), 1);

    this.state = {
      mode: 'newton',
      engineId: 'nbody',
      ghostEngineId: null,
      frameOrigin: 'sun',
      observationPoint: 'earth',
      selectedBody: null,
      zodiacScheme: 'signs',
      scaleMode: 'compressed',
      showOrbits: true,
      showSightLines: true,
      showStarFigures: true,
      showConstruction: true,
      locale: getLocale(),
      julianDate: this.clock.julianDate,
      playing: false,
      rateDaysPerSecond: 1,
    };
  }

  get(): Readonly<State> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private patch(changes: Partial<State>): void {
    this.state = { ...this.state, ...changes };
    this.emit();
  }

  /**
   * Change model.
   *
   * The frame origin moves to the mode's canonical centre — Earth for Ptolemy,
   * the Sun for the other two — because that arrangement *is* what each model
   * asserts, and opening Ptolemy with the Sun at the middle would misrepresent
   * it. Everything else survives the switch: same date, same observer, same
   * selection, same toggles.
   *
   * Isolating the engine's contribution with the frame held fixed is what the
   * ghost overlay is for, and the frame picker stays free in every mode.
   */
  setMode(mode: ModeId): void {
    const engineId = MODES[mode].engines[0]!;
    const ghost = this.state.ghostEngineId === engineId ? null : this.state.ghostEngineId;
    // A trail records one model's history; carrying it into another would
    // attribute positions to an engine that never produced them.
    this.trails.reset();
    this.patch({
      mode,
      engineId,
      ghostEngineId: ghost,
      frameOrigin: MODES[mode].defaultFrameOrigin,
    });
  }

  setEngine(engineId: EngineId): void {
    const ghost = this.state.ghostEngineId === engineId ? null : this.state.ghostEngineId;
    this.trails.reset();
    this.patch({ engineId, ghostEngineId: ghost });
  }

  clearTrails(): void {
    this.trails.reset();
    this.emit();
  }

  setGhostEngine(engineId: EngineId | null): void {
    this.patch({ ghostEngineId: engineId === this.state.engineId ? null : engineId });
  }

  /**
   * Recentre the map. The trail survives: whole snapshots are logged, so the
   * recorded history simply reprojects about the new origin — the same past,
   * seen from a different chair.
   */
  setFrameOrigin(frameOrigin: BodyId): void {
    this.trails.invalidateProjection();
    this.patch({ frameOrigin });
  }

  setObservationPoint(observationPoint: BodyId): void {
    this.patch({ observationPoint });
  }

  selectBody(selectedBody: BodyId | null): void {
    this.patch({ selectedBody });
  }

  setZodiacScheme(zodiacScheme: ZodiacScheme): void {
    this.patch({ zodiacScheme });
  }

  setScaleMode(scaleMode: ScaleMode): void {
    this.trails.invalidateProjection();
    this.patch({ scaleMode });
  }

  toggle(
    key: 'showOrbits' | 'showSightLines' | 'showStarFigures' | 'showConstruction',
  ): void {
    this.patch({ [key]: !this.state[key] } as Partial<State>);
  }

  setLocale(locale: Locale): void {
    setLocale(locale);
    this.patch({ locale });
  }

  // --- time -------------------------------------------------------------

  /**
   * Jump to a date. The trail is discarded, because the bodies did not travel
   * from where they were to where they now are — a line joining the two would
   * be a path nothing ever took.
   */
  setJulianDate(jd: number): void {
    this.clock.setJd(jd);
    this.trails.reset();
    this.patch({ julianDate: this.clock.julianDate });
  }

  /** Nudge the clock. Small and continuous, so the trail keeps building. */
  stepDays(days: number): void {
    this.clock.step(days);
    this.recordTrail();
    this.patch({ julianDate: this.clock.julianDate });
  }

  setRate(rateDaysPerSecond: number): void {
    this.clock.setRate(rateDaysPerSecond);
    this.patch({ rateDaysPerSecond });
  }

  play(): void {
    this.clock.play();
    this.patch({ playing: true });
  }

  pause(): void {
    this.clock.pause();
    this.patch({ playing: false });
  }

  togglePlay(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  /** Advance the clock by elapsed real time. Called from the animation loop. */
  tick(realSeconds: number): void {
    if (!this.state.playing) return;
    this.clock.advance(realSeconds);
    this.recordTrail();
    this.patch({ julianDate: this.clock.julianDate });
  }

  /**
   * Offer the current positions to the log.
   *
   * The engine is evaluated here rather than in the renderer so that history is
   * recorded even when nothing is drawn — trails switched off, or the tab in
   * the background — and the record stays continuous either way.
   */
  private recordTrail(): void {
    this.trails.record(
      this.clock.julianDate,
      ENGINES[this.state.engineId].positionsAt(this.clock.julianDate),
    );
  }

  jumpToDate(date: Date): void {
    this.setJulianDate(clampJd(jdFromDate(date)));
  }

  // --- derived ----------------------------------------------------------

  get engine(): Engine {
    return ENGINES[this.state.engineId];
  }

  get ghostEngine(): Engine | null {
    return this.state.ghostEngineId ? ENGINES[this.state.ghostEngineId] : null;
  }
}

export const store = new Store();
