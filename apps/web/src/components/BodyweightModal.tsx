import React, { useState, useEffect, useRef } from 'react';
import { Scale, Target, Check } from 'lucide-react';
import { BottomSheet, Button } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { WeightWidget, getBodyweightBounds } from './WeightWidget.js';

export interface BodyweightModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoal: number | null;
  currentWeightKg?: number | null;
  initialMode?: 'log' | 'goal';
  onSaveWeight: (weightKg: number, dateStr?: string) => void;
  onSaveGoal: (goalKg: number) => void;
}

export const BodyweightModal: React.FC<BodyweightModalProps> = ({
  isOpen,
  onClose,
  currentGoal,
  currentWeightKg,
  initialMode = 'log',
  onSaveWeight,
  onSaveGoal
}) => {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const units = preferences.bodyweightUnits;
  const unit = WEIGHT_UNIT_PRESETS[units].unit;

  const [activeMode, setActiveMode] = useState<'log' | 'goal'>(initialMode);

  const [logValue, setLogValue] = useState<number>(() => {
    const initKg = (currentWeightKg && currentWeightKg > 0)
      ? currentWeightKg
      : (currentGoal && currentGoal > 0)
        ? currentGoal
        : 75;
    return displayWeight(initKg, units);
  });

  const [goalValue, setGoalValue] = useState<number>(() => {
    const initKg = (currentGoal && currentGoal > 0)
      ? currentGoal
      : (currentWeightKg && currentWeightKg > 0)
        ? currentWeightKg
        : 75;
    return displayWeight(initKg, units);
  });

  const prevUnitsRef = useRef(units);

  useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode);
      const initLogKg = (currentWeightKg && currentWeightKg > 0)
        ? currentWeightKg
        : (currentGoal && currentGoal > 0)
          ? currentGoal
          : 75;
      setLogValue(displayWeight(initLogKg, units));

      const initGoalKg = (currentGoal && currentGoal > 0)
        ? currentGoal
        : (currentWeightKg && currentWeightKg > 0)
          ? currentWeightKg
          : 75;
      setGoalValue(displayWeight(initGoalKg, units));

      prevUnitsRef.current = units;
    }
  }, [isOpen, initialMode, currentGoal, currentWeightKg, units]);

  // Preserve semantic underlying value when units change while modal is open
  useEffect(() => {
    if (prevUnitsRef.current !== units) {
      const prev = prevUnitsRef.current;
      setLogValue((cur) => {
        const kg = parseDisplayWeight(cur, prev);
        return displayWeight(kg, units);
      });
      setGoalValue((cur) => {
        const kg = parseDisplayWeight(cur, prev);
        return displayWeight(kg, units);
      });
      prevUnitsRef.current = units;
    }
  }, [units]);

  const activeValue = activeMode === 'log' ? logValue : goalValue;
  const canSave = Number.isFinite(activeValue) && activeValue > 0;

  const handleSave = () => {
    if (activeMode === 'log') {
      if (Number.isFinite(logValue) && logValue > 0) {
        onSaveWeight(parseDisplayWeight(logValue, units));
        onClose();
      }
    } else {
      if (Number.isFinite(goalValue) && goalValue > 0) {
        onSaveGoal(parseDisplayWeight(goalValue, units));
        onClose();
      }
    }
  };

  const { min: minWeight, max: maxWeight } = getBodyweightBounds(units);

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title={t('weight.title')}
      className="flex flex-col min-h-[66vh] max-h-[72vh] sm:min-h-0 sm:max-h-[90dvh] sm:max-w-sm"
    >
      <div className="flex flex-1 flex-col justify-between space-y-3 sm:space-y-4">
        {/* Mode switcher */}
        <div className="p-1 rounded-2xl glass-subcard grid grid-cols-2 gap-1 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode('log')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-colors cursor-pointer ${
              activeMode === 'log'
                ? 'bg-accent text-accent-fg shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            {t('weight.logMode')}
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('goal')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-colors cursor-pointer ${
              activeMode === 'goal'
                ? 'bg-amber-400 text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            {t('weight.goalMode')}
          </button>
        </div>

        {/* Tactile Sliding WeightWidget Scale Module */}
        <WeightWidget
          value={activeMode === 'log' ? logValue : goalValue}
          min={minWeight}
          max={maxWeight}
          step={0.1}
          unit={unit}
          label={activeMode === 'log' ? t('weight.current') : t('weight.target')}
          locale={locale}
          icon={activeMode === 'log' ? 'scale' : 'target'}
          onChange={(newVal) => {
            if (activeMode === 'log') {
              setLogValue(newVal);
            } else {
              setGoalValue(newVal);
            }
          }}
        />

        {/* Action Button */}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full shrink-0"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          {activeMode === 'log' ? t('weight.saveLog') : t('weight.updateGoal')}
        </Button>
      </div>
    </BottomSheet>
  );
};
