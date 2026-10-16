import { useCallback, useLayoutEffect, useRef } from 'react';
import type { TabType } from '../components/BottomNav.js';
import type { PlanSection } from '../views/PlanSectionSelector.js';

function contextFor(tab: TabType, section: PlanSection, session: string | null) {
  if (tab === 'plan') return `plan:${section}`;
  if (tab === 'workout' && session) return `workout:${session}`;
  return tab;
}

function modalOwnsScroll() {
  return document.body.style.overflow === 'hidden' || Boolean(document.querySelector('[aria-modal="true"]'));
}

/** Document scroll belongs to a navigation context, not to the next mounted view. */
export function useNavigationScroll(tab: TabType, section: PlanSection, session: string | null) {
  const context = contextFor(tab, section, session);
  const activeContext = useRef(context);
  const positions = useRef(new Map<string, number>());
  const lastUnlockedPosition = useRef(0);

  useLayoutEffect(() => {
    const record = () => {
      if (!modalOwnsScroll()) lastUnlockedPosition.current = window.scrollY;
    };
    window.addEventListener('scroll', record, { passive: true });
    return () => window.removeEventListener('scroll', record);
  }, []);

  useLayoutEffect(() => {
    // A finished/cancelled/replaced session must never donate its offset to a new one.
    for (const key of positions.current.keys()) {
      if (key.startsWith('workout:') && key !== `workout:${session}`) positions.current.delete(key);
    }
  }, [session]);

  useLayoutEffect(() => {
    activeContext.current = context;
    const retained = context.startsWith('plan:') || context.startsWith('workout:');
    const target = retained ? positions.current.get(context) ?? 0 : 0;
    let frame: number | undefined;
    const restore = () => {
      // Portal cleanup may restore focus/overflow after this layout effect.
      // Do not scroll underneath a modal or capture the modal's temporary offset.
      if (modalOwnsScroll()) {
        frame = window.requestAnimationFrame(restore);
        return;
      }
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(Math.max(0, target), max), behavior: 'instant' });
      lastUnlockedPosition.current = window.scrollY;
    };
    restore();
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [context]);

  // Call synchronously BEFORE changing tab/section, while the outgoing DOM still exists.
  return useCallback(() => {
    positions.current.set(activeContext.current,
      modalOwnsScroll() ? lastUnlockedPosition.current : window.scrollY);
  }, []);
}
