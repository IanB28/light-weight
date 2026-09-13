/**
 * Screen Wake Lock API helper.
 * Keeps the mobile device screen awake during workouts so athletes don't need
 * to unlock their phone between sets.
 */

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

let wakeLock: WakeLockSentinelLike | null = null;

export async function requestWakeLock(): Promise<boolean> {
  if (typeof navigator !== 'undefined') {
  const wakeLockApi = (navigator as unknown as WakeLockNavigator).wakeLock;
    if (!wakeLockApi || wakeLock?.released === false) return Boolean(wakeLock && !wakeLock.released);
    try {
      wakeLock = await wakeLockApi.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      return true;
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      return false;
    }
  }
  return false;
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      console.warn('Wake Lock release error:', err);
    }
  }
}
