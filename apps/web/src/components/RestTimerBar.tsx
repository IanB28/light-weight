import React, { useLayoutEffect, useRef } from 'react';
import { Timer, Plus, Minus, X } from 'lucide-react';
import { useI18n } from '../lib/i18n.js';

interface RestTimerBarProps {
  secondsLeft: number;
  totalSeconds: number;
  onAddSeconds: (delta: number) => void;
  onDismiss: () => void;
  reserveSpace?: boolean;
  onHeightChange?: (height: number) => void;
}

export const RestTimerBar: React.FC<RestTimerBarProps> = ({
  secondsLeft,
  totalSeconds,
  onAddSeconds,
  onDismiss,
  reserveSpace = false,
  onHeightChange
}) => {
  const { t } = useI18n();
  const slot = useRef<HTMLDivElement>(null);
  const visible = secondsLeft > 0;
  const rendered = visible || reserveSpace;
  useLayoutEffect(() => {
    const element = slot.current;
    if (!element) return;
    const measure = () => onHeightChange?.(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rendered, onHeightChange]);
  if (!rendered) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const percentage = totalSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0;

  return (
    <div ref={slot} aria-hidden={!visible || undefined} inert={!visible}
      className={`rest-timer-slot fixed left-3 right-3 z-40 mx-auto max-w-md ${visible
        ? 'bottom-above-nav motion-safe:animate-in motion-safe:slide-in-from-bottom-5 motion-safe:duration-200'
        : 'invisible pointer-events-none'}`}>
      <div className="ui-elevated-surface relative overflow-hidden rounded-ui-xl border border-border-active p-2.5 sm:p-3">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-surface-input"
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-1 bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${percentage}%` }}
        />

        <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-accent-soft text-accent">
              <Timer aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-wide text-text-secondary">
                {t('workout.restTimer')}
              </p>
              <p className="font-mono text-xl font-bold tabular-nums leading-none tracking-tight text-text-primary">
                {formattedTime}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 font-mono">
            <button
              type="button"
              onClick={() => onAddSeconds(-15)}
              aria-label={t('workout.subtractRestSeconds', { seconds: 15 })}
              className="ui-focus-visible ui-pressable flex size-11 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-xs font-bold tabular-nums text-text-secondary transition-[background-color,border-color] duration-150 hover:border-border-active hover:bg-surface-active"
              title={t('workout.subtractRestSeconds', { seconds: 15 })}
            >
              <Minus aria-hidden="true" className="size-3" />15s
            </button>
            <button
              type="button"
              onClick={() => onAddSeconds(30)}
              aria-label={t('workout.addRestSeconds', { seconds: 30 })}
              className="ui-focus-visible ui-pressable flex size-11 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-xs font-bold tabular-nums text-text-secondary transition-[background-color,border-color] duration-150 hover:border-border-active hover:bg-surface-active"
              title={t('workout.addRestSeconds', { seconds: 30 })}
            >
              <Plus aria-hidden="true" className="size-3" />30s
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('workout.skipRest')}
              className="ui-focus-visible ui-pressable flex size-11 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-text-muted transition-[background-color,border-color,color] duration-150 hover:border-danger hover:bg-danger-soft hover:text-danger"
              title={t('workout.skipRest')}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
