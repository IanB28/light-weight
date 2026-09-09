import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  MuscleGroup,
  StrengthTier,
  StrengthEvaluation,
  Gender
} from '@light-weight/domain';
import BODY_PATHS, { BodyViewData } from '../../lib/body-paths.js';

export type AnalysisMode = 'balance' | 'fatigue' | 'strength';

export interface MuscleAnalytics {
  muscle: MuscleGroup;
  nameEs: string;
  sets: number;
  volumeKg: number;
  // Physiological fatigue
  fatigueScore: number;
  recoveryStatus: 'fatigued' | 'recovering' | 'ready';
  recoveryPct: number; // 0 to 100
  lastTrainedHoursAgo: number | null;
  recentHardSetsCount: number;
  // Strength & StrengthLevel standards
  topEst1RmKg: number;
  topExerciseName?: string;
  strengthEvaluation?: StrengthEvaluation;
}

interface AnatomicalBodyMapProps {
  data: Record<MuscleGroup, MuscleAnalytics>;
  mode: AnalysisMode;
  gender?: Gender;
  selectedMuscle: MuscleGroup | null;
  onSelectMuscle: (muscle: MuscleGroup | null) => void;
  className?: string;
}

// Map domain MuscleGroup to SVG path keys
const SVG_TO_MUSCLE_GROUP: Record<string, MuscleGroup> = {
  chest: 'chest',
  'upper-back': 'back',
  'lower-back': 'back',
  trapezius: 'back',
  deltoids: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'forearms',
  quadriceps: 'quadriceps',
  hamstring: 'hamstrings',
  gluteal: 'glutes',
  calves: 'calves',
  tibialis: 'calves',
  abs: 'core',
  obliques: 'core',
  serratus: 'core',
  'hip-flexors': 'core',
  adductors: 'quadriceps'
};

const INERT_KEYS = new Set([
  'head',
  'hair',
  'neck',
  'hands',
  'knees',
  'ankles',
  'feet'
]);

export const SPANISH_MUSCLE_NAMES: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  core: 'Abdomen / Core'
};

export const AnatomicalBodyMap: React.FC<AnatomicalBodyMapProps> = ({
  data,
  mode,
  gender = 'male',
  selectedMuscle,
  onSelectMuscle,
  className = ''
}) => {
  const genderPaths = BODY_PATHS[gender] || BODY_PATHS.male;

  // Compute maximum volume for balance normalization
  const maxSets = Math.max(1, ...Object.values(data).map((d) => d.sets));

  // Determine fill color for a given muscle group based on mode
  const getMuscleColor = (muscle: MuscleGroup): { fill: string; stroke: string } => {
    const item = data[muscle];
    if (!item) return { fill: '#181A1D', stroke: 'rgba(255,255,255,0.06)' };

    if (mode === 'balance') {
      if (item.sets === 0) {
        return { fill: '#141618', stroke: 'rgba(255,255,255,0.05)' };
      }
      const ratio = item.sets / maxSets;
      if (ratio < 0.25) return { fill: 'color-mix(in srgb, var(--accent-color) 25%, #141618)', stroke: 'var(--accent-color)' };
      if (ratio < 0.55) return { fill: 'color-mix(in srgb, var(--accent-color) 50%, #141618)', stroke: 'var(--accent-color)' };
      if (ratio < 0.8) return { fill: 'color-mix(in srgb, var(--accent-color) 75%, #141618)', stroke: 'var(--accent-color)' };
      return { fill: 'var(--accent-color)', stroke: '#ffffff' };
    }

    if (mode === 'fatigue') {
      if (item.recoveryStatus === 'fatigued') {
        return { fill: '#E11D48', stroke: '#F43F5E' }; // Red/Rose for high fatigue (score >= 4.5)
      }
      if (item.recoveryStatus === 'recovering') {
        return { fill: '#D97706', stroke: '#F59E0B' }; // Amber for recovering (1.8 <= score < 4.5)
      }
      return { fill: '#059669', stroke: '#10B981' }; // Emerald for ready (score < 1.8)
    }

    if (mode === 'strength') {
      if (!item.strengthEvaluation || item.topEst1RmKg === 0) {
        return { fill: '#141618', stroke: 'rgba(255,255,255,0.05)' };
      }
      const tier = item.strengthEvaluation.tier;
      switch (tier) {
        case 'elite':
          return { fill: '#7C3AED', stroke: '#A855F7' }; // Purple / Diamond
        case 'advanced':
          return { fill: '#D97706', stroke: '#F59E0B' }; // Amber / Gold
        case 'intermediate':
          return { fill: '#059669', stroke: '#10B981' }; // Emerald / Silver
        case 'novice':
          return { fill: '#0284C7', stroke: '#38BDF8' }; // Sky / Bronze
        case 'beginner':
        default:
          return { fill: '#3F3F46', stroke: '#71717A' }; // Zinc
      }
    }

    return { fill: '#181A1D', stroke: 'rgba(255,255,255,0.06)' };
  };

  const renderView = (view: BodyViewData, isFront: boolean) => {
    return (
      <svg
        viewBox={view.vb}
        className="w-full max-w-[140px] sm:max-w-[170px] h-auto drop-shadow-md select-none transition-transform"
        role="img"
        aria-label={isFront ? 'Vista frontal anatómica' : 'Vista dorsal anatómica'}
      >
        {/* Render inert silhouette parts */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (!INERT_KEYS.has(key)) return null;
          return paths.map((d, i) => (
            <path
              key={`inert-${key}-${i}`}
              d={d}
              fill="#181A1D"
              stroke="#27272A"
              strokeWidth={0.8}
            />
          ));
        })}

        {/* Render muscle groups */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (INERT_KEYS.has(key)) return null;
          const muscle = SVG_TO_MUSCLE_GROUP[key];
          if (!muscle) return null;

          const { fill, stroke } = getMuscleColor(muscle);
          const isSelected = selectedMuscle === muscle;

          return paths.map((d, i) => (
            <path
              key={`muscle-${key}-${i}`}
              d={d}
              fill={isSelected ? '#F8FAFC' : fill}
              stroke={isSelected ? '#38BDF8' : stroke}
              strokeWidth={isSelected ? 3 : 1}
              className="cursor-pointer transition-colors duration-150 active:opacity-80"
              style={{
                filter: isSelected ? 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.7))' : undefined
              }}
              onClick={() => onSelectMuscle(selectedMuscle === muscle ? null : muscle)}
            >
              <title>{SPANISH_MUSCLE_NAMES[muscle] || muscle}</title>
            </path>
          ));
        })}
      </svg>
    );
  };

  const selectedData = selectedMuscle ? data[selectedMuscle] : null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Both Views: Anterior (Frontal) & Posterior (Dorsal) */}
      <div className="flex items-center justify-center gap-6 py-2 bg-black/50 rounded-3xl border border-white/[0.04] p-3">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">
            Frente
          </span>
          {renderView(genderPaths.front, true)}
        </div>

        <div className="w-[1px] h-48 bg-white/[0.06]" />

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">
            Dorso
          </span>
          {renderView(genderPaths.back, false)}
        </div>
      </div>

      {/* Mode Legends */}
      {mode === 'balance' && (
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/60 rounded-2xl border border-white/[0.04] text-[11px] font-mono text-zinc-400">
          <span>Menor volumen</span>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded bg-[#141618] border border-white/[0.06]" />
            <span className="w-3.5 h-3.5 rounded bg-accent/20" />
            <span className="w-3.5 h-3.5 rounded bg-accent/40" />
            <span className="w-3.5 h-3.5 rounded bg-accent/70" />
            <span className="w-3.5 h-3.5 rounded bg-accent shadow-sm shadow-accent/50" />
          </div>
          <span className="text-accent font-bold">Mayor volumen</span>
        </div>
      )}

      {mode === 'fatigue' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1 px-2 py-2 bg-zinc-900/60 rounded-2xl border border-white/[0.04] text-[10px] font-mono text-center">
            <div className="flex items-center justify-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
              <span>Fatiga Alta (&ge;4.5 pts)</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
              <span>Adaptando (1.8-4.5)</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span>Listo (&lt;1.8)</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 text-center font-mono">
            Modelo fisiológico: Carga ponderada por RIR y decaimiento en el tiempo
          </p>
        </div>
      )}

      {mode === 'strength' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-5 gap-1 px-2 py-2 bg-zinc-900/60 rounded-2xl border border-white/[0.04] text-[10px] font-mono text-center">
            <div className="flex items-center justify-center gap-1 text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              <span>Principiante</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Novicio</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Intermedio</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Avanzado</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-purple-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Élite</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 text-center font-mono">
            Estándares StrengthLevel calculados según peso corporal y género
          </p>
        </div>
      )}

      {/* Selected Muscle Detail Card with Gamification Badges */}
      {selectedData ? (
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-white/[0.08] space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedData.strengthEvaluation && (
                <span className="text-lg" title={selectedData.strengthEvaluation.tierLabelEs}>
                  {selectedData.strengthEvaluation.emoji}
                </span>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-white">
                    {selectedData.nameEs}
                  </h4>
                  {selectedData.strengthEvaluation && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                      style={{
                        backgroundColor: `${selectedData.strengthEvaluation.color}20`,
                        color: selectedData.strengthEvaluation.color,
                        border: `1px solid ${selectedData.strengthEvaluation.color}40`
                      }}
                    >
                      {selectedData.strengthEvaluation.tierLabelEs}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectMuscle(null)}
              className="text-[10px] text-zinc-400 hover:text-white px-2.5 py-1 rounded-full bg-zinc-800 cursor-pointer transition-colors"
            >
              Cerrar
            </button>
          </div>

          {/* 3 Metrics Cards */}
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            {/* Metric 1: Sets / Volume */}
            <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
              <span className="text-[10px] text-zinc-500 block uppercase">Volumen</span>
              <span className="text-sm font-bold text-white">{selectedData.sets} series</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                {selectedData.volumeKg.toLocaleString()} kg
              </span>
            </div>

            {/* Metric 2: Physiological Fatigue */}
            <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
              <span className="text-[10px] text-zinc-500 block uppercase">Fatiga Real</span>
              <span
                className={`text-sm font-bold block ${
                  selectedData.recoveryStatus === 'fatigued'
                    ? 'text-rose-400'
                    : selectedData.recoveryStatus === 'recovering'
                    ? 'text-amber-400'
                    : 'text-accent'
                }`}
              >
                {selectedData.recoveryStatus === 'fatigued'
                  ? 'Fatiga Alta'
                  : selectedData.recoveryStatus === 'recovering'
                  ? 'Adaptando'
                  : 'Listo'}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                {selectedData.lastTrainedHoursAgo !== null
                  ? `Hace ${selectedData.lastTrainedHoursAgo}h (${selectedData.recentHardSetsCount} duras)`
                  : 'Sin entreno'}
              </span>
            </div>

            {/* Metric 3: Strength & Relative Ratio */}
            <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
              <span className="text-[10px] text-zinc-500 block uppercase">Fuerza Relativa</span>
              <span className="text-sm font-bold text-purple-400 block">
                {selectedData.topEst1RmKg > 0
                  ? `${selectedData.strengthEvaluation?.currentRatio}× BW`
                  : '—'}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5 truncate max-w-[90px] mx-auto" title={selectedData.topExerciseName}>
                {selectedData.topEst1RmKg > 0 ? `${selectedData.topEst1RmKg} kg 1RM` : 'Sin registro'}
              </span>
            </div>
          </div>

          {/* Gamification Progress Bar toward Next Tier */}
          {selectedData.strengthEvaluation && selectedData.strengthEvaluation.nextTier && (
            <div className="p-3 rounded-2xl bg-black/50 border border-white/[0.06] space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  Siguiente Rango:
                  <strong className="text-white">
                    {selectedData.strengthEvaluation.nextTierLabelEs}
                  </strong>
                </span>
                <span className="text-purple-400 font-bold text-[11px]">
                  Faltan +{selectedData.strengthEvaluation.kgToNextTier} kg
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-sky-500 via-accent to-purple-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${selectedData.strengthEvaluation.progressPctToNextTier}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Actual: {selectedData.topEst1RmKg} kg</span>
                <span>Objetivo: {selectedData.strengthEvaluation.targetOneRmKg} kg ({selectedData.strengthEvaluation.targetRatio}× BW)</span>
              </div>
            </div>
          )}

          {selectedData.strengthEvaluation && selectedData.strengthEvaluation.tier === 'elite' && (
            <div className="p-2.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-center font-mono text-xs text-purple-300 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
              <span>¡Rango Élite desbloqueado! Te encuentras en el 1% superior de fuerza para este grupo muscular.</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 text-center py-1 font-mono">
          Toca cualquier grupo muscular en el cuerpo para ver su analítica, fatiga e insignias de fuerza.
        </p>
      )}
    </div>
  );
};
