import React from 'react';
import { cn } from '@light-weight/ui';

export function SectionHeader({ title, meta, action, className }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-h-9 items-center justify-between gap-3 px-1', className)}><div className="min-w-0"><h2 className="text-xs font-extrabold uppercase tracking-wider text-text-secondary">{title}</h2>{meta && <div className="mt-0.5 text-[11px] text-text-muted">{meta}</div>}</div>{action}</div>;
}
