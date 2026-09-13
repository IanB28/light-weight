import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  MuscleGroup,
  StrengthTier,
  StrengthEvaluation,
  Gender
} from '@light-weight/domain';
import BODY_PATHS, { BodyViewData } from '../../lib/body-paths.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { displayWeight, formatDisplayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';

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
  const { preferences } = usePreferences();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const genderPaths = BODY_PATHS[gender] || BODY_PATHS.male;

  // Compute maximum volume for balance normalization
  const maxSets = Math.max(1, ...Object.values(data).map((d) => d.sets));

  // Determine fill color and stroke for a given muscle group based on mode
  const getMuscleColor = (muscle: MuscleGroup): { fill: string; stroke: string; strokeWidth: number } => {
    const item = data[muscle];
    // Base fallback: clearly visible against dark glass
    if (!item) return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };

    if (mode === 'balance') {
      if (item.sets === 0) {
        // Untrained muscle in openGym: color-mix(in srgb, var(--label) 11%, var(--surface))
        return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
      }
      const ratio = item.sets / maxSets;
      if (ratio < 0.25) {
        return {
          fill: 'color-mix(in srgb, var(--accent-color) 32%, rgba(255, 255, 255, 0.08))',
          stroke: 'var(--accent-color)',
          strokeWidth: 0.9
        };
      }
      if (ratio < 0.55) {
        return {
          fill: 'color-mix(in srgb, var(--accent-color) 56%, rgba(255, 255, 255, 0.08))',
          stroke: 'var(--accent-color)',
          strokeWidth: 0.9
        };
      }
      if (ratio < 0.85) {
        return {
          fill: 'color-mix(in srgb, var(--accent-color) 78%, rgba(255, 255, 255, 0.08))',
          stroke: 'var(--accent-color)',
          strokeWidth: 1.0
        };
      }
      return { fill: 'var(--accent-color)', stroke: '#ffffff', strokeWidth: 1.2 };
    }

    if (mode === 'fatigue') {
      if (item.recoveryStatus === 'fatigued') {
        return { fill: '#F43F5E', stroke: '#FDA4AF', strokeWidth: 1.2 }; // Rose/Red
      }
      if (item.recoveryStatus === 'recovering') {
        return { fill: '#F59E0B', stroke: '#FDE68A', strokeWidth: 1.1 }; // Amber
      }
      return { fill: '#10B981', stroke: '#6EE7B7', strokeWidth: 1.0 }; // Emerald
    }

    if (mode === 'strength') {
      if (!item.strengthEvaluation || item.topEst1RmKg === 0) {
        return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
      }
      const tier = item.strengthEvaluation.tier;
      switch (tier) {
        case 'elite':
          return { fill: '#A855F7', stroke: '#E9D5FF', strokeWidth: 1.2 };
        case 'advanced':
          return { fill: '#F59E0B', stroke: '#FDE68A', strokeWidth: 1.1 };
        case 'intermediate':
          return { fill: '#10B981', stroke: '#A7F3D0', strokeWidth: 1.0 };
        case 'novice':
          return { fill: '#38BDF8', stroke: '#BAE6FD', strokeWidth: 0.9 };
        case 'beginner':
        default:
          return { fill: 'rgba(255, 255, 255, 0.22)', stroke: 'rgba(255, 255, 255, 0.35)', strokeWidth: 0.8 };
      }
    }

    return { fill: 'rgba(255, 255, 255, 0.07)', stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 0.8 };
  };

  const renderView = (view: BodyViewData, isFront: boolean) => {
    return (
      <svg
        viewBox={view.vb}
        className="h-[285px] sm:h-[320px] w-auto max-w-full drop-shadow-xl select-none transition-all duration-200"
        role="img"
        aria-label={isFront ? 'Vista frontal anatómica' : 'Vista dorsal anatómica'}
      >
        {/* Render inert silhouette parts with distinct openGym contrast */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (!INERT_KEYS.has(key)) return null;
          return paths.map((d, i) => (
            <path
              key={`inert-${key}-${i}`}
              d={d}
              fill="var(--inert-body-fill, rgba(255, 255, 255, 0.12))"
              stroke="var(--inert-body-stroke, rgba(255, 255, 255, 0.22))"
              strokeWidth={0.9}
            />
          ));
        })}

        {/* Render muscle groups with openGym styling and crisp separation */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (INERT_KEYS.has(key)) return null;
          const muscle = SVG_TO_MUSCLE_GROUP[key];
          if (!muscle) return null;

          const { fill, stroke, strokeWidth } = getMuscleColor(muscle);
          const isSelected = selectedMuscle === muscle;

          return paths.map((d, i) => (
            <path
              key={`muscle-${key}-${i}`}
              d={d}
              fill={isSelected ? '#FFFFFF' : fill}
              stroke={isSelected ? '#FFFFFF' : stroke}
              strokeWidth={isSelected ? 4 : strokeWidth}
              className="cursor-pointer transition-colors duration-150 active:opacity-80"
              style={{
                filter: isSelected ? 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.9))' : undefined
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
      {/* Both Views: Anterior (Frontal) & Posterior (Dorsal) with openGym Frosted Glass & Rim Depth */}
      <div className="flex items-center justify-center gap-3 sm:gap-6 py-3 px-2 sm:px-4 bg-gradient-to-b from-white/[0.07] to-white/[0.02] rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="flex flex-col items-center flex-1 min-w-0 max-w-[190px]">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
            Frente
          </span>
          {renderView(genderPaths.front, true)}
        </div>

        <div className="w-[1px] h-56 sm:h-64 bg-gradient-to-b from-transparent via-white/15 to-transparent shrink-0" />

        <div className="flex flex-col items-center flex-1 min-w-0 max-w-[190px]">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
            Dorso
          </span>
          {renderView(genderPaths.back, false)}
        </div>
      </div>

      {/* Mode Legends: Compact, non-deforming, responsive */}
      {mode === 'balance' && (
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/70 rounded-2xl border border-white/[0.06] text-[11px] font-mono text-zinc-400 shadow-sm">
          <span>Menos</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-white/[0.08] border border-white/20" title="Sin series (l0)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_32%,rgba(255,255,255,0.08))] border border-accent/40" title="Volumen bajo (l1)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_56%,rgba(255,255,255,0.08))] border border-accent/60" title="Volumen medio (l2)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_78%,rgba(255,255,255,0.08))] border border-accent/80" title="Volumen alto (l3)" />
            <span className="w-3.5 h-3.5 rounded bg-accent shadow-[0_0_8px_var(--accent-glow)]" title="Volumen máximo (l4)" />
          </div>
          <span className="text-accent font-bold">Más</span>
        </div>
      )}

      {mode === 'fatigue' && (
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-zinc-900/70 rounded-2xl border border-white/[0.06] text-[10px] font-mono text-center shadow-sm">
          <div className="flex items-center justify-center gap-1 text-rose-400 font-semibold" title="Fatiga alta (&ge;4.5 pts)">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 shrink-0" />
            <span>Fatiga (&ge;4.5)</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-amber-400 font-semibold" title="Adaptando (1.8 - 4.5 pts)">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50 shrink-0" />
            <span>Adaptando</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-emerald-400 font-semibold" title="Listo / Recuperado (&lt;1.8 pts)">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 shrink-0" />
            <span>Listo</span>
          </div>
        </div>
      )}

      {mode === 'strength' && (
        <div className="flex items-center justify-between p-2 px-3 bg-zinc-900/70 rounded-2xl border border-white/[0.06] text-[10px] font-mono shadow-sm">
          <div className="flex items-center gap-1 text-zinc-400" title="Principiante">
            <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
            <span>Princ.</span>
          </div>
          <div className="flex items-center gap-1 text-sky-400" title="Novicio">
            <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
            <span>Nov.</span>
          </div>
          <div className="flex items-center gap-1 text-emerald-400" title="Intermedio">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>Inter.</span>
          </div>
          <div className="flex items-center gap-1 text-amber-400" title="Avanzado">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>Avanz.</span>
          </div>
          <div className="flex items-center gap-1 text-purple-400 font-bold" title="Élite">
            <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.5)] shrink-0" />
            <span>Élite</span>
          </div>
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
                {displayWeight(selectedData.volumeKg, preferences.units).toLocaleString()} {weightUnit}
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
                {selectedData.topEst1RmKg > 0 ? `${formatDisplayWeight(selectedData.topEst1RmKg, preferences.units)} 1RM` : 'Sin registro'}
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
                  Faltan +{formatDisplayWeight(selectedData.strengthEvaluation.kgToNextTier ?? 0, preferences.units)}
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
                <span>Actual: {formatDisplayWeight(selectedData.topEst1RmKg, preferences.units)}</span>
                <span>Objetivo: {formatDisplayWeight(selectedData.strengthEvaluation.targetOneRmKg ?? 0, preferences.units)} ({selectedData.strengthEvaluation.targetRatio}× BW)</span>
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
