import React, { useState } from 'react';
import { X, Plus, Search, Dumbbell, Trash2, Check } from 'lucide-react';
import { Routine, Exercise } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';

interface CreateRoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  onSaveRoutine: (newRoutine: Routine) => void;
}

export const CreateRoutineModal: React.FC<CreateRoutineModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSaveRoutine,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredExercises = availableExercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.primaryMuscle.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 30); // Limitar para agilidad de renderizado

  const toggleSelectExercise = (id: string) => {
    setSelectedExerciseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;

    const newRoutine: Routine = {
      id: 'rt-' + Date.now(),
      userId: 'local-anonymous',
      name: name.trim(),
      description: description.trim() || undefined,
      exerciseIds: selectedExerciseIds,
    };

    onSaveRoutine(newRoutine);
    setName('');
    setDescription('');
    setSelectedExerciseIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-labelledby="create-routine-title" className="relative w-full max-w-lg dark-glass-card border border-white/[0.08] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col z-10 animate-slide-up">
        {/* iOS Grab Handle */}
        <div className="w-full pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent font-mono">
              NUEVA RUTINA
            </span>
            <h3 id="create-routine-title" className="text-lg font-bold text-white tracking-tight leading-tight mt-0.5">
              Diseñar Rutina
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar creación de rutina"
            className="flex size-11 shrink-0 items-center justify-center rounded-full glass-subcard text-zinc-400 transition-colors hover:border-white/20 hover:text-white active:scale-[0.96]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Name & Description Inputs */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Nombre de la Rutina
              </label>
              <input
                type="text"
                placeholder="Ej: Empuje Pesado (Push A)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Descripción / Notas (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Enfoque en hipertrofia de pecho y hombro"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Selected Exercises Count */}
          <div className="pt-1">
            <span className="text-xs font-bold text-zinc-300 block mb-1.5">
              Ejercicios Seleccionados ({selectedExerciseIds.length})
            </span>
            {selectedExerciseIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-2xl bg-black/40 border border-white/[0.06]">
                {selectedExerciseIds.map((id) => {
                  const ex = availableExercises.find((e) => e.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30"
                    >
                      <span>{ex?.name || id}</span>
                      <button
                        type="button"
                        onClick={() => toggleSelectExercise(id)}
                        className="hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search exercises to add */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar para añadir a la rutina..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {filteredExercises.map((ex) => {
                const isSelected = selectedExerciseIds.includes(ex.id);
                const imgUrl = getExerciseImgUrl(ex);
                return (
                  <div
                    key={ex.id}
                    onClick={() => toggleSelectExercise(ex.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-zinc-900/40 border-white/[0.04] text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={ex.name}
                          loading="lazy"
                          className="w-8 h-8 rounded-lg object-cover bg-black/40 border border-white/[0.06]"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                          <Dumbbell className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold leading-tight text-white">{ex.name}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">{ex.primaryMuscle}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center ${
                        isSelected ? 'bg-accent text-accent-fg' : 'border border-zinc-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-black/40 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl transition-all border border-white/[0.08]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className={`flex-1 py-3 font-extrabold text-xs rounded-xl transition-all shadow-lg ${
              name.trim()
                ? 'bg-accent hover:brightness-110 text-accent-fg active:scale-[0.98] shadow-lg shadow-accent/20 cursor-pointer'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Guardar Rutina
          </button>
        </div>
      </div>
    </div>
  );
};
