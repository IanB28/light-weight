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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#121416]/92 backdrop-blur-2xl border border-white/[0.12] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl shadow-black/90 animate-in slide-in-from-bottom-6 duration-200">
        {/* iOS Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-extrabold text-white tracking-tight">Peso Corporal</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.93] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Mode switcher */}
        <div className="p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] grid grid-cols-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('log')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-all cursor-pointer ${
              activeMode === 'log'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
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
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Meta de Peso
          </button>
        </div>

        {/* Input Box */}
        <div className="p-4 rounded-2xl bg-black/50 border border-white/[0.06] text-center space-y-2">
          <label className="text-xs text-zinc-400 uppercase font-mono tracking-wider block">
            {activeMode === 'log' ? 'Pesaje actual (kg)' : 'Peso objetivo / meta (kg)'}
          </label>

          <div className="flex items-center justify-center gap-2">
            <input
              type="number"
              step="0.1"
              value={activeMode === 'log' ? weightInput : goalInput}
              onChange={(e) => {
                if (activeMode === 'log') setWeightInput(e.target.value);
                else setGoalInput(e.target.value);
              }}
              className="w-32 text-center text-4xl font-extrabold font-mono text-white bg-transparent border-b-2 border-emerald-500 focus:outline-none tabular-nums pb-1"
              autoFocus
            />
            <span className="text-xl font-bold text-zinc-500 font-mono">kg</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.97] text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          {activeMode === 'log' ? 'Guardar Registro' : 'Actualizar Meta'}
        </button>
      </div>
    </div>
  );
};
