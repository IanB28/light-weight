import React from 'react';
import { AlertCircle, CloudOff, LoaderCircle } from 'lucide-react';
import { cn } from '@light-weight/ui';
import { Button } from './Button.js';

interface FeedbackStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, description, icon, actionLabel, onAction, compact, className }: FeedbackStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 p-4' : 'gap-3 px-5 py-8', className)}>
      {icon && <div className="flex size-11 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        {description && <p className="mx-auto max-w-xs text-xs leading-relaxed text-text-muted">{description}</p>}
      </div>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function LoadingState({ title = 'Cargando…', description, compact, className }: Partial<FeedbackStateProps>) {
  return <EmptyState title={title} description={description} compact={compact} className={className} icon={<LoaderCircle className="size-5 animate-spin" />} />;
}

export function ErrorState({ title = 'Algo salió mal', description, actionLabel = 'Reintentar', onAction, compact, className }: Partial<FeedbackStateProps>) {
  return <EmptyState title={title} description={description} actionLabel={onAction ? actionLabel : undefined} onAction={onAction} compact={compact} className={className} icon={<AlertCircle className="size-5 text-danger" />} />;
}

export function OfflineState({ compact = true, className }: Pick<FeedbackStateProps, 'compact' | 'className'>) {
  return <EmptyState title="Estás sin conexión" description="Tus cambios se guardarán localmente." compact={compact} className={className} icon={<CloudOff className="size-5" />} />;
}
