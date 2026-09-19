import React, { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { BottomSheet } from './Disclosure.js';
import { Button } from './Button.js';
import { useI18n } from '../../lib/i18n.js';
import { RIR_SCALE_ITEMS, type RirScaleItem } from './rir-content.js';

export { RIR_SCALE_ITEMS, type RirScaleItem };

export interface RirEducationContentProps {
  onClose?: () => void;
}

export function RirEducationContent({ onClose }: RirEducationContentProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4 pb-2 text-text-secondary">
      <div className="space-y-2 text-xs leading-relaxed">
        <p className="font-semibold text-text-primary">{t('workout.rirDefinition')}</p>
        <p>{t('workout.rirEstimateDefinition')}</p>
      </div>

      <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-3 space-y-2 text-xs leading-relaxed">
        <h4 className="font-bold uppercase tracking-wider text-[10px] text-text-muted">
          {t('workout.rirInfoExampleTitle')}
        </h4>
        <ul className="space-y-1.5 text-text-secondary">
          <li>• {t('workout.rirInfoExample1')}</li>
          <li>• {t('workout.rirInfoExample2')}</li>
          <li>• {t('workout.rirInfoExample3')}</li>
        </ul>
        <p className="pt-1.5 font-semibold text-accent border-t border-border-subtle/50">
          {t('workout.rirUnsureGuidance')}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="font-bold uppercase tracking-wider text-[10px] text-text-muted">
          {t('workout.rirInfoScaleTitle')}
        </h4>
        <div className="divide-y divide-border-subtle rounded-ui-lg border border-border-subtle bg-surface-input overflow-hidden text-xs">
          {RIR_SCALE_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono font-bold text-text-primary">RIR {item.label}</span>
              <span className="text-text-muted text-right text-[11px]">{t(item.descriptionKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {onClose && (
        <div className="pt-2">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            className="w-full text-xs font-bold"
          >
            {t('workout.rirInfoClose')}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface RirEducationSheetProps {
  open: boolean;
  onClose: () => void;
}

export function RirEducationSheet({ open, onClose }: RirEducationSheetProps) {
  const { t } = useI18n();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('workout.rirInfoTitle')}
    >
      <RirEducationContent onClose={onClose} />
    </BottomSheet>
  );
}

export interface RirHeaderButtonProps {
  className?: string;
}

export function RirHeaderButton({ className = '' }: RirHeaderButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('workout.rirInfoTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`group inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-bold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${className}`}
      >
        <span>RIR</span>
        <CircleHelp aria-hidden="true" className="size-3 shrink-0 text-text-muted transition-colors group-hover:text-text-primary" />
      </button>

      <RirEducationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
