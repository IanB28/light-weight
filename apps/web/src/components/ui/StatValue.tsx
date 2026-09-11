import { cn } from '@light-weight/ui';

export function StatValue({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return <div className={cn('min-w-0 rounded-ui-lg border border-border-subtle bg-surface-input p-3', className)}><span className="block text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</span><strong className="mt-1 block truncate font-mono text-lg text-text-primary">{value}</strong>{detail && <span className="mt-0.5 block truncate text-[11px] text-text-muted">{detail}</span>}</div>;
}
