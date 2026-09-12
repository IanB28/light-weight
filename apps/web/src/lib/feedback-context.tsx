import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useI18n } from './i18n.js';

type FeedbackTone = 'success' | 'error' | 'info';
interface FeedbackMessage { id: number; text: string; tone: FeedbackTone }
interface FeedbackContextValue { showFeedback: (text: string, tone?: FeedbackTone) => void }

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const showFeedback = useCallback((text: string, tone: FeedbackTone = 'success') => {
    setMessage({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!message || message.tone === 'error') return;
    const timer = window.setTimeout(() => setMessage((current) => current?.id === message.id ? null : current), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const value = useMemo(() => ({ showFeedback }), [showFeedback]);
  return <FeedbackContext.Provider value={value}>{children}{message && <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] z-[70] flex justify-center" role={message.tone === 'error' ? 'alert' : 'status'} aria-live={message.tone === 'error' ? 'assertive' : 'polite'}><div className={`pointer-events-auto flex min-h-11 max-w-sm items-center gap-2 rounded-ui-lg border bg-surface-elevated px-3 py-2 text-xs font-semibold shadow-modal ${message.tone === 'error' ? 'border-danger/35 text-danger' : 'border-success/35 text-text-primary'}`}>{message.tone === 'error' ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-success" />}<span className="flex-1">{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label={t('common.close')} className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X className="size-4" /></button></div></div>}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used within FeedbackProvider');
  return value;
}
