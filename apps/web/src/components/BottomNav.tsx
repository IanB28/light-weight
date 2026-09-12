import React, { useEffect, useState } from 'react';
import { BarChart2, Calendar, Dumbbell, Home, List } from 'lucide-react';
import { useI18n } from '../lib/i18n.js';

export type TabType = 'home' | 'plan' | 'workout' | 'stats' | 'exercises';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isWorkoutActive: boolean;
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  isWorkoutActive,
}) => {
  const { t } = useI18n();
  const tabs = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'plan', label: t('nav.plan'), icon: Calendar },
    { id: 'workout', label: t('nav.workout'), icon: Dumbbell },
    { id: 'stats', label: t('nav.stats'), icon: BarChart2 },
    { id: 'exercises', label: t('nav.exercises'), icon: List },
  ] satisfies { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[];
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === currentTab));
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);

  useEffect(() => {
    const hasCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
    const updateFromFocus = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      setMobileKeyboardOpen(Boolean(hasCoarsePointer() && element?.matches(EDITABLE_SELECTOR)));
    };
    const onFocusIn = (event: FocusEvent) => updateFromFocus(event.target);
    const onFocusOut = () => window.setTimeout(() => updateFromFocus(document.activeElement), 0);

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <div
      aria-hidden={mobileKeyboardOpen || undefined}
      inert={mobileKeyboardOpen}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none min-[360px]:px-3 ${
        mobileKeyboardOpen ? 'translate-y-[120%]' : 'translate-y-0'
      }`}
    >
      <nav
        aria-label={t('nav.label')}
        className={`bottom-nav-surface relative mx-auto flex h-[72px] max-w-md overflow-hidden rounded-[26px] border border-[var(--nav-border)] p-1.5 ${
          mobileKeyboardOpen ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
      >
        <div className="relative flex h-full w-full items-stretch">
          <div
            aria-hidden="true"
            className="absolute inset-y-0.5 left-0 w-1/5 rounded-[20px] border border-accent/25 bg-accent/12 shadow-[inset_0_1px_0_color-mix(in_srgb,white_20%,transparent),0_8px_22px_-12px_var(--accent-glow)] transition-transform duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none"
            style={{ transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
          />

          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = index === activeIndex;
            const isActiveWorkout = tab.id === 'workout' && isWorkoutActive;
            const accessibleLabel = isActiveWorkout
              ? t('nav.workoutActive')
              : tab.label;

            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                aria-label={accessibleLabel}
                tabIndex={mobileKeyboardOpen ? -1 : undefined}
                title={accessibleLabel}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative z-10 flex min-h-11 min-w-0 flex-1 select-none flex-col items-center justify-center gap-1 rounded-[20px] px-0.5 outline-none transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none ${
                  isActive ? 'text-accent' : 'text-text-muted'
                }`}
              >
                <span className="relative flex h-6 items-center justify-center">
                  <Icon
                    className={`size-5 transition-[transform,color] duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none ${
                      isActive
                        ? '-translate-y-0.5 stroke-[2.5] drop-shadow-[0_0_8px_var(--accent-glow)]'
                        : 'stroke-[2]'
                    }`}
                    aria-hidden="true"
                  />
                  {isActiveWorkout && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-0.5 size-2 rounded-full border border-[var(--nav-bg-solid)] bg-accent shadow-[0_0_7px_var(--accent-glow)]"
                    />
                  )}
                </span>

                <span
                  className={`max-w-full truncate text-[11px] leading-none tracking-[-0.01em] transition-colors duration-150 ${
                    isActive
                      ? 'font-bold text-text-primary'
                      : 'font-medium text-text-muted'
                  }`}
                >
                  {tab.label}
                </span>
                {isActiveWorkout && <span className="sr-only">{t('nav.sessionActive')}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
