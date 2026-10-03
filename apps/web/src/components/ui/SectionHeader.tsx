import React from 'react';
import { cn } from '@light-weight/ui';

export function SectionHeader({ title, meta, action, className }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-h-10 items-start justify-between gap-3 px-1', className)}><div className="min-w-0 flex-1"><h2 className="ui-section-title break-words text-text-primary">{title}</h2>{meta && <div className="ui-caption mt-1 break-words">{meta}</div>}</div>{action && <div className="max-w-[45%] shrink-0 self-start">{action}</div>}</div>;
}
