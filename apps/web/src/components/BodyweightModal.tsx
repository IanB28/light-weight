import React, { useState } from 'react';
import { X, Scale, Target, Check } from 'lucide-react';

interface BodyweightModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoal: number | null;
  onSaveWeight: (weightKg: number, dateStr?: string) => void;
  onSaveGoal: (goalKg: number) => void;
}

export const BodyweightModal: React.FC<BodyweightModalProps> = ({
  isOpen,
  onClose,
  currentGoal,
  onSaveWeight,
  onSaveGoal
}) => {
  const [weightInput, setWeightInput] = useState<string>('78.0');
  const [goalInput, setGoalInput] = useState<string>(currentGoal ? String(currentGoal) : '75.0');
  const [activeMode, setActiveMode] = useState<'log' | 'goal'>('log');

  if (!isOpen) return null;

  const handleSave = () => {
    if (activeMode === 'log') {
      const val = parseFloat(weightInput);
      if (!isNaN(val) && val > 0) {
        onSaveWeight(val);
      }
    } else {
      const val = parseFloat(goalInput);
      if (!isNaN(val) && val > 0) {
        onSaveGoal(val);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-sm bg-[#121416] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Peso Corporal</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch: [ Registrar Pesaje | Meta ] */}
        <div className="p-1 rounded-xl bg-zinc-900 border border-white/[0.04] grid grid-cols-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('log')}
            className={`py-1.5 rounded-lg font-bold transition-all ${
              activeMode === 'log'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Registrar Hoy
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('goal')}
            className={`py-1.5 rounded-lg font-bold transition-all ${
              activeMode === 'goal'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Definir Meta
          </button>
        </div>

        {/* Input Form */}
        {activeMode === 'log' ? (
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 block">Peso actual (kg):</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                autoFocus
                className="w-full py-3 px-4 rounded-2xl bg-zinc-900 border border-white/[0.08] text-2xl font-bold font-mono text-white text-center focus:outline-none focus:border-emerald-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500">
                kg
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 text-center">
              Pésate en ayunas y a la misma hora para mayor consistencia.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 block">Peso objetivo / meta (kg):</label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                inputMode="decimal"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                autoFocus
                className="w-full py-3 px-4 rounded-2xl bg-zinc-900 border border-white/[0.08] text-2xl font-bold font-mono text-amber-400 text-center focus:outline-none focus:border-amber-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500">
                kg
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 text-center">
              Esta meta se reflejará como la línea dorada de referencia en tus gráficas.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg shadow-emerald-500/20"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Guardar {activeMode === 'log' ? 'Pesaje' : 'Meta'}</span>
        </button>
      </div>
    </div>
  );
};
