import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n.js';
import { MaskedPngIcon } from './ui/MaskedPngIcon.js';
import { NAVIGATION_ICON_ASSETS } from './ui/icon-assets.js';

export type TabType = 'home' | 'plan' | 'workout' | 'stats' | 'exercises';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isWorkoutActive: boolean;
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

interface BottomNavItemProps {
  tab: {
    id: TabType;
    label: string;
    icon: { src: string; opticalScale: number };
  };
  isActive: boolean;
  isWorkoutActive: boolean;
  mobileKeyboardOpen: boolean;
  workoutActiveLabel: string;
  sessionActiveLabel: string;
  onSelectTab: (tab: TabType) => void;
}

export const BottomNavItem: React.FC<BottomNavItemProps> = ({
  tab,
  isActive,
  isWorkoutActive,
  mobileKeyboardOpen,
  workoutActiveLabel,
  sessionActiveLabel,
  onSelectTab
}) => {
  const isActiveWorkout = tab.id === 'workout' && isWorkoutActive;
  const accessibleLabel = isActiveWorkout ? workoutActiveLabel : tab.label;

  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      aria-label={accessibleLabel}
      tabIndex={mobileKeyboardOpen ? -1 : undefined}
      title={accessibleLabel}
      onClick={() => onSelectTab(tab.id)}
      data-active={isActive}
      data-workout-running={isActiveWorkout || undefined}
      className={`bottom-nav-item group relative z-10 flex min-h-11 min-w-0 select-none flex-col items-center justify-center gap-0.5 rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none ${
        isActive ? 'text-accent' : 'text-text-muted'
      }`}
    >
      <span className="relative z-10 flex h-[22px] items-center justify-center">
        <MaskedPngIcon
          src={tab.icon.src}
          opticalScale={tab.icon.opticalScale}
          className="size-[1.375rem]"
        />
        {isActiveWorkout && (
          <span
            aria-hidden="true"
            data-testid="workout-running-indicator"
            className="absolute -right-1.5 -top-0.5 size-2 rounded-full border border-[var(--nav-bg-solid)] bg-accent shadow-[0_0_5px_var(--accent-glow)]"
          />
        )}
      </span>

      <span
        className={`relative z-10 max-w-full truncate text-[10px] leading-none tracking-[-0.01em] transition-colors duration-200 min-[360px]:text-[11px] ${
          isActive ? 'font-bold text-text-primary' : 'font-medium text-text-muted'
        }`}
      >
        {tab.label}
      </span>
      {isActiveWorkout && <span className="sr-only">{sessionActiveLabel}</span>}
    </button>
  );
};

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  isWorkoutActive,
}) => {
  const { t } = useI18n();
  const tabs = [
    { id: 'home', label: t('nav.home'), icon: NAVIGATION_ICON_ASSETS.home },
    { id: 'plan', label: t('nav.plan'), icon: NAVIGATION_ICON_ASSETS.plan },
    { id: 'workout', label: t('nav.workout'), icon: NAVIGATION_ICON_ASSETS.workout },
    { id: 'stats', label: t('nav.stats'), icon: NAVIGATION_ICON_ASSETS.stats },
    { id: 'exercises', label: t('nav.exercises'), icon: NAVIGATION_ICON_ASSETS.exercises },
  ] satisfies { id: TabType; label: string; icon: { src: string; opticalScale: number } }[];
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

  const navigation = (
    <div
      aria-hidden={mobileKeyboardOpen || undefined}
      inert={mobileKeyboardOpen}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none min-[360px]:px-3 ${
        mobileKeyboardOpen ? 'translate-y-[120%]' : 'transform-none'
      }`}
    >
      <nav
        aria-label={t('nav.label')}
        className={`bottom-nav-surface relative mx-auto flex h-16 max-w-md overflow-hidden rounded-full border border-[var(--nav-border)] p-1 ${
          mobileKeyboardOpen ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
      >
        <div className="relative flex h-full w-full items-stretch">
          {tabs.map((tab) => (
            <BottomNavItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === currentTab}
              isWorkoutActive={isWorkoutActive}
              mobileKeyboardOpen={mobileKeyboardOpen}
              workoutActiveLabel={t('nav.workoutActive')}
              sessionActiveLabel={t('nav.sessionActive')}
              onSelectTab={onSelectTab}
            />
          ))}
        </div>
      </nav>
    </div>
  );

  // Keep the viewport-fixed surface outside App's scrolling and compositing tree.
  return typeof document === 'undefined' ? navigation : createPortal(navigation, document.body);
};
