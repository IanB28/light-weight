import { useEffect, useRef, useState } from 'react';
import { webRestTimerNotifier, type RestTimerNotifier } from './rest-timer-notifier.js';
import { adjustRestEnd, restSecondsRemaining } from './workout-time.js';

export interface RestTimerRuntime {
  restEndsAt: number | null;
  secondsLeft: number;
  totalSeconds: number;
  start: (seconds: number) => void;
  cancel: () => void;
  add: (seconds: number) => void;
  subtract: (seconds: number) => void;
}

export function useRestTimer(notifier: RestTimerNotifier = webRestTimerNotifier): RestTimerRuntime {
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const notifiedEndRef = useRef<number | null>(null);
  const secondsLeft = restSecondsRemaining(restEndsAt, nowMs);

  useEffect(() => {
    if (!restEndsAt || secondsLeft <= 0) return;
    const refresh = () => setNowMs(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(interval);
  }, [restEndsAt, secondsLeft]);

  useEffect(() => {
    if (!restEndsAt || secondsLeft > 0 || notifiedEndRef.current === restEndsAt) return;
    notifiedEndRef.current = restEndsAt;
    notifier.notifyFinished();
    setRestEndsAt(null);
  }, [notifier, restEndsAt, secondsLeft]);

  const start = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
    if (safeSeconds === 0) return;
    const now = Date.now();
    notifiedEndRef.current = null;
    setNowMs(now);
    setTotalSeconds(safeSeconds);
    setRestEndsAt(now + safeSeconds * 1_000);
  };

  const cancel = () => {
    setRestEndsAt(null);
    setTotalSeconds(0);
  };

  const add = (seconds: number) => {
    const now = Date.now();
    const nextEnd = adjustRestEnd(restEndsAt, seconds, now);
    setNowMs(now);
    setRestEndsAt(nextEnd);
    if (nextEnd) setTotalSeconds((current) => Math.max(1, current + seconds));
    else setTotalSeconds(0);
  };

  return { restEndsAt, secondsLeft, totalSeconds, start, cancel, add, subtract: (seconds) => add(-Math.abs(seconds)) };
}
