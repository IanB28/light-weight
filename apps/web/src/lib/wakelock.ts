/**
 * Screen Wake Lock API helper.
 * Keeps the mobile device screen awake during workouts so athletes don't need
 * to unlock their phone between sets.
 */

let wakeLock: any = null;

export async function requestWakeLock(): Promise<boolean> {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen');
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
