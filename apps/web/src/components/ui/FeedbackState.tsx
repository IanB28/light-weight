import React from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { cn } from '@light-weight/ui';
import { Button } from './Button.js';
import { useI18n } from '../../lib/i18n.js';

interface FeedbackStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  tone?: 'accent' | 'danger';
  className?: string;
}

export function EmptyState({ title, description, icon, actionLabel, onAction, compact, tone = 'accent', className }: FeedbackStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 p-4' : 'gap-3 px-5 py-8', className)}>
      {icon && <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-ui-lg border', tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-border-subtle bg-surface-input text-accent')}>{icon}</div>}
      <div className="space-y-1">
        <p className="ui-card-title break-words text-text-primary">{title}</p>
        {description && <p className="ui-caption mx-auto max-w-xs break-words">{description}</p>}
      </div>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function LoadingState({ title, description, compact, className }: Partial<FeedbackStateProps>) {
  const { t } = useI18n();
  return <EmptyState title={title || t('common.loading')} description={description} compact={compact} className={className} icon={<LoaderCircle className="size-5 motion-safe:animate-spin" />} />;
}

export function ErrorState({ title, description, actionLabel, onAction, compact, className }: Partial<FeedbackStateProps>) {
  const { t } = useI18n();
  return <EmptyState title={title || t('common.genericError')} description={description} actionLabel={onAction ? (actionLabel || t('common.retry')) : undefined} onAction={onAction} compact={compact} tone="danger" className={className} icon={<AlertCircle className="size-5" />} />;
}
