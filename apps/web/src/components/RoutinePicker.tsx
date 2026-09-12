import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Dumbbell, Moon } from 'lucide-react';
import { Routine } from '@light-weight/domain';
import { BottomSheet, EmptyState, SearchInput } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';

interface RoutinePickerProps {
  dayLabel: string;
  value: string | null;
  routines: Routine[];
  onChange: (routineId: string | null) => void;
}

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .trim();

export function RoutinePicker({ dayLabel, value, routines, onChange }: RoutinePickerProps) {
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRoutine = routines.find((routine) => routine.id === value);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  const filteredRoutines = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return routines;
    return routines.filter((routine) => normalizeSearch(`${routine.name} ${routine.description || ''}`).includes(normalizedQuery));
  }, [query, routines, language]);

  const selectRoutine = (routineId: string | null) => {
    onChange(routineId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('routine.forDay', { day: dayLabel })}: ${selectedRoutine?.name || t('routine.rest')}`}
        disabled={routines.length === 0}
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-ui-md border border-border-subtle bg-surface-input px-3 text-left transition-[background-color,border-color,opacity] hover:border-border-active hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedRoutine ? (
          <Dumbbell aria-hidden="true" className="size-3.5 shrink-0 text-accent" />
        ) : (
          <Moon aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
        )}
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${selectedRoutine ? 'text-text-primary' : 'text-text-muted'}`}>
          {selectedRoutine?.name || t('routine.rest')}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('routine.forDay', { day: dayLabel })}
        description={t('routine.chooseDescription')}
      >
        <div className="space-y-3">
          {routines.length > 4 && (
            <SearchInput
              ref={searchRef}
              label={t('routine.search')}
              placeholder={t('routine.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}

          <div className="max-h-[56dvh] space-y-1 overflow-y-auto overscroll-contain pr-1" aria-label={`Rutinas disponibles para ${dayLabel}`}>
            <button
              type="button"
              aria-pressed={!value || !selectedRoutine}
              onClick={() => selectRoutine(null)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-ui-lg border px-3 py-2.5 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${!value || !selectedRoutine ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-border-subtle hover:bg-surface-active'}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-text-muted">
                <Moon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text-primary">{t('routine.rest')}</span>
                <span className="block text-[11px] text-text-muted">{t('routine.noneScheduled')}</span>
              </span>
              {(!value || !selectedRoutine) && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
            </button>

            {filteredRoutines.map((routine) => {
              const selected = routine.id === value;
              return (
                <button
                  key={routine.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectRoutine(routine.id)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-ui-lg border px-3 py-2.5 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-border-subtle hover:bg-surface-active'}`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-accent">
                    <Dumbbell aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-text-primary">{routine.name}</span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {routine.exerciseIds.length} {routine.exerciseIds.length === 1 ? t('library.exercise') : t('library.exercises')}
                    </span>
                  </span>
                  {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>

          {filteredRoutines.length === 0 && query && (
            <EmptyState
              compact
              icon={<Dumbbell className="size-5" />}
              title={t('routine.noneFound')}
              description={t('routine.tryOther')}
              actionLabel={t('routine.clearSearch')}
              onAction={() => setQuery('')}
            />
          )}
        </div>
      </BottomSheet>
    </>
  );
}
