import React, { useEffect, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@light-weight/ui';
import { IconButton } from './Button.js';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xl" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="app-modal-title" aria-describedby={description ? 'app-modal-description' : undefined} tabIndex={-1} className={cn('glass-surface max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-ui-xl border border-border-glass bg-surface-elevated p-5 shadow-modal outline-none', className)}><div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="app-modal-title" className="text-lg font-extrabold text-text-primary">{title}</h2>{description && <p id="app-modal-description" className="mt-1 text-xs text-text-muted">{description}</p>}</div><IconButton variant="ghost" size="sm" aria-label="Cerrar" onClick={onClose}><X className="size-4" /></IconButton></div>{children}</div></div>;
}

export function BottomSheet(props: ModalProps) {
  return <Modal {...props} className={cn('fixed bottom-0 left-0 right-0 max-h-[90dvh] max-w-none rounded-b-none rounded-t-ui-xl sm:static sm:max-w-md sm:rounded-ui-xl', props.className)} />;
}

export interface AccordionSectionProps {
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function AccordionSection({ open, onToggle, icon, title, description, badge, children }: AccordionSectionProps) {
  const id = React.useId();
  return <section className="glass-surface overflow-hidden rounded-ui-xl border border-border-subtle"><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-16 w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"><div className="flex min-w-0 items-center gap-3">{icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">{icon}</div>}<div className="min-w-0"><h2 className="text-sm font-extrabold leading-snug text-text-primary">{title}</h2>{description && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-muted">{description}</p>}</div></div><div className="flex shrink-0 items-center gap-2">{badge}<ChevronDown className={cn('size-5 text-text-muted transition-transform', open && 'rotate-180 text-accent')} /></div></button>{open && <div id={id} className="border-t border-border-subtle p-4">{children}</div>}</section>;
}
