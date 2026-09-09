import React, { useState } from 'react';
import { X, Play, Pause, Dumbbell, Sparkles } from 'lucide-react';
import { Exercise } from '@light-weight/domain';
import { getExerciseImgUrl, getExerciseGifUrl } from '../lib/exercises.js';

interface ExerciseMediaModalProps {
  exercise: Exercise | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExerciseMediaModal: React.FC<ExerciseMediaModalProps> = ({
  exercise,
  isOpen,
  onClose,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);

  if (!isOpen || !exercise) return null;

  const gifUrl = getExerciseGifUrl(exercise);
  const imgUrl = getExerciseImgUrl(exercise);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
      {/* Backdrop tap to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg dark-glass-card border border-white/[0.08] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col z-10 animate-slide-up">
        {/* iOS Grab Handle */}
        <div className="w-full pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent font-mono">
              GUÍA DE TÉCNICA
            </span>
            <h3 className="text-lg font-bold text-white tracking-tight leading-tight mt-0.5">
              {exercise.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full glass-subcard hover:border-white/20 flex items-center justify-center text-zinc-400 hover:text-white transition-colors active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Media Player Container */}
          {gifUrl || imgUrl ? (
            <div
              className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/50 border border-white/[0.08] shadow-inner flex items-center justify-center cursor-pointer group"
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              <img
                src={isPlaying && gifUrl ? gifUrl : imgUrl || gifUrl || ''}
                alt={exercise.name}
                loading="eager"
                className="w-full h-full object-contain"
              />

              {/* Pause / Play Overlay Hint */}
              <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.1] text-zinc-300 text-[11px] font-mono flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 text-accent fill-accent" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-accent fill-accent" />
                    <span>Reproducir GIF</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full aspect-video rounded-2xl bg-zinc-900/50 border border-white/[0.08] flex flex-col items-center justify-center text-zinc-500 gap-2">
              <Dumbbell className="w-8 h-8 stroke-[1.5]" />
              <span className="text-xs">Sin demostración visual disponible</span>
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30 capitalize">
              {exercise.primaryMuscle}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-800/80 text-zinc-300 border border-white/[0.08] capitalize">
              {exercise.category}
            </span>
            {exercise.targetMuscle && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 capitalize">
                Objetivo: {exercise.targetMuscle}
              </span>
            )}
          </div>

          {/* Secondary muscles */}
          {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Músculos Secundarios:
              </span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {exercise.secondaryMuscles.map((sm) => (
                  <span
                    key={sm}
                    className="px-2.5 py-0.5 rounded-md text-[11px] bg-zinc-800/60 text-zinc-400 border border-white/[0.04] capitalize font-mono"
                  >
                    {sm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Step-by-Step Instructions */}
          {exercise.instructions && exercise.instructions.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Ejecución Técnica Paso a Paso
              </span>
              <ol className="space-y-2 text-xs text-zinc-300 leading-relaxed list-decimal list-inside pl-1">
                {exercise.instructions.map((step, idx) => (
                  <li key={idx} className="pl-1 text-zinc-300 marker:text-accent marker:font-bold">
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-black/40">
          <button
            onClick={onClose}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl transition-all border border-white/[0.08] cursor-pointer"
          >
            Cerrar Guía
          </button>
        </div>
      </div>
    </div>
  );
};
