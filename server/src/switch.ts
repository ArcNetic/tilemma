import type { LeanRunner, RunOutcome } from "./runner.js";

/** Serves from a fallback runner until a better one is ready, then switches to it without a restart. */
export class SwitchableRunner implements LeanRunner {
  private current: LeanRunner;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly fallback: LeanRunner) {
    this.current = fallback;
  }

  get kind(): LeanRunner["kind"] {
    return this.current.kind;
  }

  run(source: string): Promise<RunOutcome> {
    return this.current.run(source);
  }

  version(): Promise<string> {
    return this.current.version();
  }

  isWarm(): boolean {
    return this.current.isWarm();
  }

  /** Requests already running on the old runner finish there; new ones go to `next`. */
  promote(next: LeanRunner): void {
    this.current = next;
  }

  /** Registers something to stop when the runner shuts down, such as a background retry. */
  onShutdown(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  shutdown(): void {
    for (const cleanup of this.cleanups) cleanup();
    if (this.current !== this.fallback) this.current.shutdown?.();
    this.fallback.shutdown?.();
  }
}

export type WarmCandidate = LeanRunner & {
  warmUp(): Promise<boolean>;
  lastFailure(): string | undefined;
};

export type PromoterOptions = {
  /** Wait between attempts. */
  intervalMs: number;
  maxAttempts: number;
  log: (message: string) => void;
};

/**
 * Keeps trying to start a warm runner that failed at boot (for example because the first load of the
 * Lean library was slow) and hands it to the switchable runner as soon as it works.
 */
export class WarmPromoter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private stopped = false;
  private promoted = false;

  constructor(
    private readonly candidate: WarmCandidate,
    private readonly target: SwitchableRunner,
    private readonly options: PromoterOptions,
  ) {}

  start(): void {
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (!this.promoted) this.candidate.shutdown?.();
  }

  get attemptCount(): number {
    return this.attempts;
  }

  private schedule(): void {
    this.timer = setTimeout(() => void this.attempt(), this.options.intervalMs);
    // A pending retry must not keep the process alive.
    this.timer.unref?.();
  }

  private async attempt(): Promise<void> {
    if (this.stopped) return;
    this.attempts += 1;
    const ok = await this.candidate.warmUp();
    if (this.stopped) {
      this.candidate.shutdown?.();
      return;
    }
    if (ok) {
      this.promoted = true;
      this.target.promote(this.candidate);
      this.options.log("Warm runner is ready; checks now use it.");
      return;
    }
    const reason = this.candidate.lastFailure() ?? "unknown reason";
    if (this.attempts < this.options.maxAttempts) {
      this.options.log(`Warm runner not ready yet (try ${this.attempts} of ${this.options.maxAttempts}): ${reason}`);
      this.schedule();
    } else {
      this.options.log(`Giving up on the warm runner after ${this.attempts} tries: ${reason}. The cold runner stays in use.`);
      this.candidate.shutdown?.();
    }
  }
}
