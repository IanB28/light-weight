import type { RestTimerNotifier } from './rest-timer-notifier.js';
import { adjustRestEnd } from './workout-time.js';

/** Platform-neutral command boundary used by the React hook and future mobile adapter. */
export class RestTimerLifecycle {
  constructor(
    private readonly notifier: RestTimerNotifier,
    private readonly now: () => number = Date.now
  ) {}

  start(seconds: number): number | null {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
    if (!safeSeconds) return null;
    const endAt = this.now() + safeSeconds * 1_000;
    this.notifier.schedule(endAt);
    return endAt;
  }

  adjust(currentEndAt: number | null, seconds: number): number | null {
    const nextEndAt = adjustRestEnd(currentEndAt, seconds, this.now());
    if (nextEndAt) this.notifier.schedule(nextEndAt);
    else this.notifier.cancel();
    return nextEndAt;
  }

  cancel(): void {
    this.notifier.cancel();
  }

  finishInForeground(): void {
    this.notifier.notifyForegroundFinished();
    this.notifier.cancel();
  }
}
