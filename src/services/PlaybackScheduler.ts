import { SchedulerConfig } from '../types/audio';

export interface SchedulerState {
  running: boolean;
  schedulerDriftMs: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  lookaheadMs: 120,
  tickMs: 25,
  queueDepth: 2,
};

/**
 * Schedules callbacks using AudioContext time as source-of-truth.
 */
export class PlaybackScheduler {
  private readonly audioContext: AudioContext;
  private config: SchedulerConfig;
  private timerId: number | null = null;
  private nextEventTime = 0;
  private running = false;
  private driftMs = 0;
  private driftSmoothing = 0.25;

  constructor(audioContext: AudioContext, config?: Partial<SchedulerConfig>) {
    this.audioContext = audioContext;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
    };
  }

  public setConfig(config: Partial<SchedulerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  public getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  public getState(): SchedulerState {
    return {
      running: this.running,
      schedulerDriftMs: this.driftMs,
    };
  }

  public start(
    onEvent: (scheduledTime: number) => void,
    getIntervalMs: () => number
  ): void {
    this.stop();
    this.running = true;
    this.nextEventTime = this.audioContext.currentTime + 0.02;

    const tick = () => {
      if (!this.running) return;

      const now = this.audioContext.currentTime;
      const horizon = now + this.config.lookaheadMs / 1000;
      let queued = 0;

      while (this.nextEventTime <= horizon && queued < this.config.queueDepth) {
        const scheduledTime = this.nextEventTime;
        const actual = this.audioContext.currentTime;
        const drift = Math.max(0, (actual - scheduledTime) * 1000);
        this.driftMs = this.driftMs * (1 - this.driftSmoothing) + drift * this.driftSmoothing;
        onEvent(scheduledTime);

        const intervalMs = Math.max(1, getIntervalMs());
        this.nextEventTime += intervalMs / 1000;
        queued += 1;
      }
    };

    tick();
    this.timerId = window.setInterval(tick, this.config.tickMs);
  }

  public stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
