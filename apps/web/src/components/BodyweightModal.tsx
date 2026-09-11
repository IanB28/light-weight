import React, { useState } from 'react';
import { X, Scale, Target, Check } from 'lucide-react';

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
  const [weightInput, setWeightInput] = useState<string>('');
  const [goalInput, setGoalInput] = useState<string>(currentGoal ? String(currentGoal) : '');
  const [activeMode, setActiveMode] = useState<'log' | 'goal'>(initialMode);

  React.useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode);
      if (currentGoal) setGoalInput(String(currentGoal));
    }
  }, [isOpen, initialMode, currentGoal]);

  if (!isOpen) return null;

  const handleStep = (delta: number) => {
    if (activeMode === 'log') {
      const val = (parseFloat(weightInput) || 75.0) + delta;
      setWeightInput((Math.round(val * 10) / 10).toFixed(1));
    } else {
      const val = (parseFloat(goalInput) || 75.0) + delta;
      setGoalInput((Math.round(val * 10) / 10).toFixed(1));
    }
  };

  const handleSave = () => {
    if (activeMode === 'log') {
      const val = parseFloat(weightInput);
      if (!isNaN(val) && val > 0) {
        onSaveWeight(val);
        onClose();
      }
    } else {
      const val = parseFloat(goalInput);
      if (!isNaN(val) && val > 0) {
        onSaveGoal(val);
        onClose();
      }
    }
  };

  const activeValue = activeMode === 'log' ? weightInput : goalInput;
  const canSave = Number.isFinite(Number(activeValue)) && Number(activeValue) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bodyweight-modal-title"
        className="w-full max-w-sm dark-glass-card rounded-t-[28px] sm:rounded-[28px] p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-6 duration-200 select-none border border-white/[0.08]"
      >
        {/* iOS Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-accent" />
            <h3 id="bodyweight-modal-title" className="text-base font-extrabold text-primary tracking-tight">Peso Corporal</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar registro de peso"
            className="w-8 h-8 rounded-full glass-subcard hover:border-white/20 active:scale-[0.93] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

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
            Registrar Hoy
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
            Meta de Peso
          </button>
        </div>

        {/* Input Box */}
        <div className="p-4 rounded-2xl glass-subcard text-center space-y-2">
          <label htmlFor="bodyweight-value" className="text-xs text-secondary uppercase font-mono tracking-wider block">
            {activeMode === 'log' ? 'Pesaje actual (kg)' : 'Peso objetivo / meta (kg)'}
          </label>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleStep(-0.5)}
              aria-label="Reducir 0.5 kilogramos"
              className="w-10 h-10 rounded-2xl glass-subcard hover:border-white/20 active:scale-[0.92] text-white font-mono font-bold text-sm flex items-center justify-center transition-all cursor-pointer"
            >
              -0.5
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
              <span className="text-xl font-bold text-zinc-500 font-mono">kg</span>
            </div>

            <button
              type="button"
              onClick={() => handleStep(0.5)}
              aria-label="Aumentar 0.5 kilogramos"
              className="w-10 h-10 rounded-2xl glass-subcard hover:border-white/20 active:scale-[0.92] text-white font-mono font-bold text-sm flex items-center justify-center transition-all cursor-pointer"
            >
              +0.5
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full min-h-11 py-3.5 rounded-2xl bg-accent hover:brightness-110 active:scale-[0.97] text-accent-fg font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          {activeMode === 'log' ? 'Guardar Registro' : 'Actualizar Meta'}
        </button>
      </div>
    </div>
  );
};
