export interface RestTimerNotifier {
  notifyFinished(): void;
}

/** Web-only adapter. Native clients can provide haptic/sound/notification adapters. */
export const webRestTimerNotifier: RestTimerNotifier = {
  notifyFinished() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate([150, 80, 150]);
    } catch {
      // Vibration is optional and must never affect the timer lifecycle.
    }
  }
};
