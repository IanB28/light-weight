export interface RestTimerNotifier {
  schedule(endAt: number): void;
  cancel(): void;
  notifyForegroundFinished(): void;
}

/** Web-only adapter. Native clients can provide haptic/sound/notification adapters. */
export const webRestTimerNotifier: RestTimerNotifier = {
  schedule() {
    // The web runtime refreshes against restEndsAt; native can schedule OS notifications here.
  },
  cancel() {
    // No web notification is scheduled.
  },
  notifyForegroundFinished() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate([150, 80, 150]);
    } catch {
      // Vibration is optional and must never affect the timer lifecycle.
    }
  }
};
