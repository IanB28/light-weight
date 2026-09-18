import React from 'react';
import { Dumbbell, Eye, Check, Plus, ChevronRight } from 'lucide-react';
import { Exercise } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { useExerciseLabels, useI18n } from '../lib/i18n.js';

export interface ExerciseCatalogCardProps {
  exercise: Exercise;
  mode?: 'library' | 'routine-selection';
  selected?: boolean;
  onToggleSelect?: (exerciseId: string) => void;
  onViewTechnique?: (exercise: Exercise) => void;
  onAction?: (exercise: Exercise) => void;
  isWorkoutActive?: boolean;
  isAdded?: boolean;
}

export const ExerciseCatalogCard: React.FC<ExerciseCatalogCardProps> = ({
  exercise,
  mode = 'library',
  selected = false,
  onToggleSelect,
  onViewTechnique,
  onAction,
  isWorkoutActive = false,
  isAdded = false,
}) => {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const imgUrl = getExerciseImgUrl(exercise);

  if (mode === 'routine-selection') {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(exercise.id)}
        aria-pressed={selected}
        className={`glass-surface group flex min-w-0 flex-col justify-between rounded-[22px] border p-3 shadow-card transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98] ${
          selected
            ? 'border-accent bg-accent/15 text-accent shadow-md shadow-accent/15'
            : 'border-border-subtle hover:border-border-active'
        }`}
      >
        <div className="w-full">
          {/* Square Image Box */}
          <div
            className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-ui-lg border bg-surface-input transition-colors ${
              selected ? 'border-accent/50' : 'border-border-subtle group-hover:border-border-active'
            }`}
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <Dumbbell className="size-8 stroke-[1.6] text-text-muted" />
            )}

            {/* Muscle floating tag */}
            <span className="absolute left-2 top-2 max-w-[65%] truncate rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold capitalize text-text-secondary shadow-sm">
              {muscleLabel(exercise.primaryMuscle)}
            </span>

            {/* Selection Check indicator in corner */}
            <div
              className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full transition-all ${
                selected
                  ? 'bg-accent text-accent-fg shadow-md shadow-accent/30'
                  : 'border border-white/25 bg-black/40 text-transparent'
              }`}
            >
              <Check className="size-3.5 stroke-[3]" />
            </div>
          </div>

          {/* Exercise Metadata */}
          <div className="mt-2.5 min-w-0">
            <span
              className={`line-clamp-2 text-xs font-bold leading-snug tracking-tight transition-colors ${
                selected ? 'text-accent' : 'text-text-primary group-hover:text-accent'
              }`}
            >
              {exercise.name}
            </span>
            <span className="mt-1 block truncate font-mono text-[10px] capitalize text-text-muted">
              {equipmentLabel(exercise.category)}
            </span>
          </div>
        </div>
      </button>
    );
  }

  // Library Mode Card
  return (
    <div className="glass-surface group flex min-w-0 flex-col justify-between rounded-[22px] border border-border-subtle p-3 shadow-card transition-colors hover:border-border-active">
      <button
        type="button"
        onClick={() => onViewTechnique?.(exercise)}
        aria-label={t('library.viewTechnique', { name: exercise.name })}
        className="min-w-0 rounded-ui-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* Square Image Box */}
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input transition-colors group-hover:border-border-active">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <Dumbbell className="size-8 stroke-[1.6] text-text-muted" />
          )}

          {/* Floating Muscle Tag */}
          <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold capitalize text-text-secondary shadow-sm">
            {muscleLabel(exercise.primaryMuscle)}
          </span>

          {/* Hover Overlay to view technique */}
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center gap-1 bg-app/45 text-xs font-medium text-text-primary opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Eye className="size-3.5 text-accent" />
            <span>{t('workout.viewTechnique', { name: exercise.name })}</span>
          </div>
        </div>

        {/* Exercise Metadata */}
        <div className="mt-2.5 min-w-0">
          <span className="line-clamp-2 text-xs font-bold leading-snug tracking-tight text-text-primary transition-colors group-hover:text-accent">
            {exercise.name}
          </span>
          <span className="mt-1 block truncate font-mono text-[10px] capitalize text-text-muted">
            {equipmentLabel(exercise.category)}
          </span>
        </div>
      </button>

      {/* Action button at bottom */}
      <div className="mt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(exercise);
          }}
          title={isWorkoutActive ? t('library.addActive', { name: exercise.name }) : t('library.trainWith', { name: exercise.name })}
          aria-label={isWorkoutActive ? t('library.addActive', { name: exercise.name }) : t('library.trainWith', { name: exercise.name })}
          aria-live="polite"
          className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-ui-md px-2 text-xs font-bold transition-[transform,background-color,color] duration-150 active:scale-[0.96] ${
            isAdded
              ? 'bg-accent text-accent-fg shadow-md shadow-accent/20'
              : isWorkoutActive
              ? 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent hover:text-accent-fg'
              : 'bg-accent text-accent-fg hover:brightness-110 shadow-sm'
          }`}
        >
          {isAdded ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t('library.added')}</span>
            </>
          ) : isWorkoutActive ? (
            <>
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t('library.add')}</span>
            </>
          ) : (
            <>
              <Dumbbell className="w-3.5 h-3.5" />
              <span>{t('library.train')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export interface ExerciseCatalogRowProps {
  exercise: Exercise;
  mode?: 'library' | 'routine-selection';
  selected?: boolean;
  onToggleSelect?: (exerciseId: string) => void;
  onViewTechnique?: (exercise: Exercise) => void;
  onAction?: (exercise: Exercise) => void;
  isWorkoutActive?: boolean;
  isAdded?: boolean;
}

export const ExerciseCatalogRow: React.FC<ExerciseCatalogRowProps> = ({
  exercise,
  mode = 'library',
  selected = false,
  onToggleSelect,
  onViewTechnique,
  onAction,
  isWorkoutActive = false,
  isAdded = false,
}) => {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const imgUrl = getExerciseImgUrl(exercise);

  if (mode === 'routine-selection') {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(exercise.id)}
        aria-pressed={selected}
        className={`group flex w-full items-center justify-between px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          selected
            ? 'bg-accent/15 border-l-2 border-l-accent text-accent'
            : 'hover:bg-surface-active'
        }`}
      >
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 pr-2">
          <div
            className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border bg-surface-input text-text-muted shadow-sm transition-colors ${
              selected ? 'border-accent/40' : 'border-border-subtle group-hover:border-border-active'
            }`}
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <Dumbbell className="size-5 stroke-[1.8] text-text-muted" />
            )}
          </div>

          <div className="min-w-0">
            <span
              className={`block truncate text-sm font-bold tracking-tight transition-colors ${
                selected ? 'text-accent' : 'text-text-primary group-hover:text-accent'
              }`}
            >
              {exercise.name}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11px] capitalize text-text-muted">
              {muscleLabel(exercise.primaryMuscle)} • {equipmentLabel(exercise.category)}
            </span>
          </div>
        </div>

        {/* Selection Checkmark Box */}
        <div
          className={`flex size-6 shrink-0 items-center justify-center rounded-md border transition-all ${
            selected
              ? 'border-accent bg-accent text-accent-fg shadow-sm'
              : 'border-border-subtle bg-surface-input text-transparent'
          }`}
        >
          {selected && <Check className="size-3.5 stroke-[3]" />}
        </div>
      </button>
    );
  }

  // Library Mode Row
  return (
    <div className="group flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-surface-active">
      {/* Thumbnail 44x44 + Name */}
      <button
        type="button"
        onClick={() => onViewTechnique?.(exercise)}
        aria-label={t('library.viewTechnique', { name: exercise.name })}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-ui-md pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-sm transition-colors group-hover:border-border-active">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <Dumbbell className="size-5 stroke-[1.8] text-text-muted" />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Eye className="size-3.5 text-accent" />
          </div>
        </div>

        <div className="min-w-0">
          <span className="block truncate text-sm font-bold tracking-tight text-text-primary transition-colors group-hover:text-accent">
            {exercise.name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] capitalize text-text-muted">
            {muscleLabel(exercise.primaryMuscle)} • {equipmentLabel(exercise.category)}
          </span>
        </div>
      </button>

      {/* Button Action + Chevron */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(exercise);
          }}
          title={isWorkoutActive ? t('library.addActive', { name: exercise.name }) : t('library.trainWith', { name: exercise.name })}
          aria-label={isWorkoutActive ? t('library.addActive', { name: exercise.name }) : t('library.trainWith', { name: exercise.name })}
          aria-live="polite"
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-[transform,background-color,color] duration-150 active:scale-[0.96] ${
            isAdded
              ? 'bg-accent text-accent-fg shadow-md shadow-accent/20'
              : isWorkoutActive
              ? 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent hover:text-accent-fg'
              : 'bg-accent text-accent-fg hover:brightness-110 shadow-sm'
          }`}
        >
          {isAdded ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t('library.added')}</span>
            </>
          ) : isWorkoutActive ? (
            <>
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t('library.add')}</span>
            </>
          ) : (
            <>
              <Dumbbell className="w-3.5 h-3.5" />
              <span>{t('library.train')}</span>
            </>
          )}
        </button>

        <div aria-hidden="true" className="flex size-4 items-center justify-center text-text-muted transition-colors group-hover:text-text-secondary">
          <ChevronRight className="size-4" />
        </div>
      </div>
    </div>
  );
};
