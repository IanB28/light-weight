import React from 'react';
import { Dumbbell, LoaderCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n.js';

export function AuthLoadingScreen() {
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden p-6 font-sans text-text-primary">
      <div
        className="pointer-events-none fixed -top-24 left-1/2 -z-10 h-[26rem] w-[36rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-1)' }}
      />
      <div
        className="pointer-events-none fixed top-[30%] left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-brand, rgba(48, 209, 88, 0.08))' }}
      />

      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/15 text-accent shadow-sm">
          <Dumbbell className="size-7" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
          <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden="true" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    </div>
  );
}
