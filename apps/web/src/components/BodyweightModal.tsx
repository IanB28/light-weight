import React, { useState } from 'react';
import { Scale, Target, Check } from 'lucide-react';
import { BottomSheet, Button } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';

interface BodyweightModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoal: number | null;
  initialMode?: 'log' | 'goal';
  onSaveWeight: (weightKg: number, dateStr?: string) => void;
  onSaveGoal: (goalKg: number) => void;
}

export const BodyweightModal: React.FC<BodyweightModalProps> = ({
  isOpen,
  onClose,
  currentGoal,
  initialMode = 'log',
  onSaveWeight,
  onSaveGoal
}) => {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const units = preferences.bodyweightUnits;
  const unit = WEIGHT_UNIT_PRESETS[units].unit;
  const step = units === 'imperial' ? 1 : 0.5;
  const [weightInput, setWeightInput] = useState<string>('');
  const [goalInput, setGoalInput] = useState<string>(currentGoal ? String(displayWeight(currentGoal, units)) : '');
  const [activeMode, setActiveMode] = useState<'log' | 'goal'>(initialMode);

  React.useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode);
      if (currentGoal) setGoalInput(String(displayWeight(currentGoal, units)));
    }
  }, [isOpen, initialMode, currentGoal, units]);

  const handleStep = (delta: number) => {
    if (activeMode === 'log') {
      const val = (parseFloat(weightInput) || displayWeight(75, units)) + delta;
      setWeightInput((Math.round(val * 10) / 10).toFixed(1));
    } else {
      const val = (parseFloat(goalInput) || displayWeight(75, units)) + delta;
      setGoalInput((Math.round(val * 10) / 10).toFixed(1));
    }
  };

  const handleSave = () => {
    if (activeMode === 'log') {
      const val = parseFloat(weightInput);
      if (!isNaN(val) && val > 0) {
        onSaveWeight(parseDisplayWeight(val, units));
        onClose();
      }
    } else {
      const val = parseFloat(goalInput);
      if (!isNaN(val) && val > 0) {
        onSaveGoal(parseDisplayWeight(val, units));
        onClose();
      }
    }
  };

  const activeValue = activeMode === 'log' ? weightInput : goalInput;
  const canSave = Number.isFinite(Number(activeValue)) && Number(activeValue) > 0;

  return (
    <BottomSheet open={isOpen} onClose={onClose} title={t('weight.title')} className="sm:max-w-sm">
      <div className="space-y-4">
        {/* Mode switcher */}
        <div className="p-1 rounded-2xl glass-subcard grid grid-cols-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('log')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-all cursor-pointer ${
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
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-all cursor-pointer ${
              activeMode === 'goal'
                ? 'bg-amber-400 text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            {t('weight.goalMode')}
          </button>
        </div>

        {/* Input Box */}
        <div className="p-4 rounded-2xl glass-subcard text-center space-y-2">
          <label htmlFor="bodyweight-value" className="text-xs text-secondary uppercase font-mono tracking-wider block">
            {activeMode === 'log' ? t('weight.current') : t('weight.target')}
          </label>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleStep(-step)}
              aria-label={t('weight.decrease', { amount: step, unit })}
              className="flex size-11 items-center justify-center rounded-ui-lg glass-subcard font-mono text-sm font-bold text-white transition-all hover:border-white/20 active:scale-[0.96]"
            >
              -{step}
            </button>

            <div className="flex items-baseline justify-center gap-1.5">
              <input
                id="bodyweight-value"
                type="number"
                step="0.1"
                min="1"
                inputMode="decimal"
                placeholder="0.0"
                value={activeMode === 'log' ? weightInput : goalInput}
                onChange={(e) => {
                  if (activeMode === 'log') setWeightInput(e.target.value);
                  else setGoalInput(e.target.value);
                }}
                className="w-28 text-center text-4xl font-extrabold font-mono text-white bg-transparent border-b-2 border-accent focus:outline-none tabular-nums pb-1"
                autoFocus
              />
              <span className="text-xl font-bold text-zinc-500 font-mono">{unit}</span>
            </div>

            <button
              type="button"
              onClick={() => handleStep(step)}
              aria-label={t('weight.increase', { amount: step, unit })}
              className="flex size-11 items-center justify-center rounded-ui-lg glass-subcard font-mono text-sm font-bold text-white transition-all hover:border-white/20 active:scale-[0.96]"
            >
              +{step}
            </button>
          </div>
        </div>

        {/* Action Button */}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          {activeMode === 'log' ? t('weight.saveLog') : t('weight.updateGoal')}
        </Button>
      </div>
    </BottomSheet>
  );
};
