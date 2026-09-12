import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  EQUIPMENT_FILTER_OPTIONS,
  ExerciseEquipmentFilter,
  ExerciseMuscleFilter,
  MUSCLE_FILTER_OPTIONS
} from '../lib/exercise-filters.js';
import { Chip } from './ui/index.js';
import { TranslationKey, useI18n } from '../lib/i18n.js';

interface ExerciseFilterControlsProps {
  muscle: ExerciseMuscleFilter;
  equipment: ExerciseEquipmentFilter;
  onMuscleChange: (value: ExerciseMuscleFilter) => void;
  onEquipmentChange: (value: ExerciseEquipmentFilter) => void;
}

export function ExerciseFilterControls({
  muscle,
  equipment,
  onMuscleChange,
  onEquipmentChange
}: ExerciseFilterControlsProps) {
  const { t } = useI18n();
  const optionLabel = (kind: 'muscle' | 'equipment', value: string, fallback: string) => {
    if (value === 'all') return t(kind === 'muscle' ? 'filter.all' : 'filter.allEquipment');
    return t(`${kind}.${value}` as TranslationKey) || fallback;
  };
  return (
    <div className="space-y-4" aria-label={t('filter.label')}>
      <fieldset className="min-w-0 space-y-2">
        <legend className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
          <SlidersHorizontal aria-hidden="true" className="size-3.5 text-accent" />
          {t('filter.muscle')}
        </legend>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-smooth scrollbar-none">
          {MUSCLE_FILTER_OPTIONS.map((option) => (
            <Chip key={option.value} selected={muscle === option.value} onClick={() => onMuscleChange(option.value)}>
              {optionLabel('muscle', option.value, option.label)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-2">
        <legend className="text-xs font-bold text-text-secondary">{t('filter.equipment')}</legend>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-smooth scrollbar-none">
          {EQUIPMENT_FILTER_OPTIONS.map((option) => (
            <Chip key={option.value} selected={equipment === option.value} onClick={() => onEquipmentChange(option.value)}>
              {optionLabel('equipment', option.value, option.label)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
