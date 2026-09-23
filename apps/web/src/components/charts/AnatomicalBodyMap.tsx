import React from 'react';
import { Sparkles, UserRound } from 'lucide-react';
import {
  MuscleGroup,
  StrengthRank,
  StrengthEvaluation,
  Gender,
  getContributionTargetKey
} from '@light-weight/domain';
import BODY_PATHS, { BodyViewData } from '../../lib/body-paths.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { useI18n } from '../../lib/i18n.js';
import { displayWeight, formatDisplayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import {
  STRENGTH_RANK_VISUALS,
  getStrengthRankVisual
} from '../../lib/strength-rank-visuals.js';
import { StrengthRankBadge } from '../StrengthRankBadge.js';
import type { BalanceBodyPathData } from '../../lib/balance-anatomy.js';
import type { FatigueBodyPathData } from '../../lib/fatigue-anatomy.js';
import {
  type BodyMusclePath,
  getBodyPathDisplayName,
  getMuscleTargetDisplayName,
  ROLE_DISPLAY_NAMES
} from '../../lib/exercise-anatomy.js';

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
  balanceByPath?: Partial<Record<BodyMusclePath, BalanceBodyPathData>>;
  fatigueByPath?: Partial<Record<BodyMusclePath, FatigueBodyPathData>>;
  mode: AnalysisMode;
  gender?: Gender;
  selectedMuscle: MuscleGroup | null;
  onSelectMuscle: (muscle: MuscleGroup | null) => void;
  selectedPath?: BodyMusclePath | null;
  onSelectPath?: (path: BodyMusclePath | null) => void;
  onConfigureGender?: () => void;
  onSelectGender?: (gender: Gender) => void;
  strengthPresentation?: 'summary' | 'profile';
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
  balanceByPath,
  fatigueByPath,
  mode,
  gender,
  selectedMuscle,
  onSelectMuscle,
  selectedPath,
  onSelectPath,
  onConfigureGender,
  onSelectGender,
  strengthPresentation = 'summary',
  className = ''
}) => {
  const { preferences } = usePreferences();
  const { t } = useI18n();

  // Guard clause: If user hasn't set gender, display an informative state prompting selection
  if (!gender) {
    return (
      <div className={`p-6 rounded-3xl bg-surface border border-border-subtle flex flex-col items-center justify-center text-center space-y-3 ${className}`}>
        <div className="w-12 h-12 rounded-full bg-accent-soft border border-accent/20 flex items-center justify-center text-accent">
          <UserRound className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-text-primary">
            {t('stats.selectBodyMapTitle')}
          </h3>
          <p className="text-xs text-text-secondary max-w-xs">
            {t('stats.selectBodyMapDescription')}
          </p>
        </div>
        {onConfigureGender ? (
          <button
            type="button"
            onClick={onConfigureGender}
            className="px-4 py-2 rounded-ui-md font-bold text-xs bg-accent text-accent-fg hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            {t('stats.configureGender')}
          </button>
        ) : onSelectGender ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSelectGender('male')}
              className="px-4 py-2 rounded-ui-md font-bold text-xs bg-surface text-text-primary hover:bg-surface-active active:scale-95 transition-all cursor-pointer"
            >
              {t('stats.male')}
            </button>
            <button
              type="button"
              onClick={() => onSelectGender('female')}
              className="px-4 py-2 rounded-ui-md font-bold text-xs bg-surface text-text-primary hover:bg-surface-active active:scale-95 transition-all cursor-pointer"
            >
              {t('stats.female')}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const genderPaths = BODY_PATHS[gender];

  // Determine fill color and stroke for a given muscle group based on mode
  const getMuscleColor = (muscle: MuscleGroup): { fill: string; stroke: string; strokeWidth: number } => {
    const item = data[muscle];
    // Base fallback: clearly visible against dark glass
    if (!item) return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };

    if (mode === 'balance') {
      return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
    }

    if (mode === 'fatigue') {
      return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
    }

    if (mode === 'strength') {
      if (!item.strengthEvaluation || item.topEst1RmKg === 0) {
        return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
      }
      const visual = getStrengthRankVisual(item.strengthEvaluation.rank);
      if (visual.rank === 'semidios') {
        return { fill: visual.fill, stroke: visual.accent, strokeWidth: 1.2 };
      }
      if (visual.rank === 'dios') {
        return { fill: visual.fill, stroke: visual.accent, strokeWidth: 1.2 };
      }
      return { fill: visual.fill, stroke: visual.stroke, strokeWidth: 1.0 };
    }

    return { fill: 'rgba(255, 255, 255, 0.07)', stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 0.8 };
  };

  const getPathColor = (pathKey: string, fallbackMuscle: MuscleGroup): { fill: string; stroke: string; strokeWidth: number } => {
    if (mode === 'balance') {
      if (balanceByPath) {
        const pathData = balanceByPath[pathKey as BodyMusclePath];
        const count = pathData?.exposureCount ?? 0;
        if (count === 0) {
          return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
        }
        const maxPathSets = Math.max(1, ...Object.values(balanceByPath).map((p) => p?.exposureCount || 0));
        const ratio = count / maxPathSets;
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
      return { fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))', stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))', strokeWidth: 0.8 };
    }

    if (mode === 'fatigue') {
      if (fatigueByPath) {
        const fData = fatigueByPath[pathKey as BodyMusclePath];
        const state = fData?.state ?? 'fresh';
        if (state === 'fatigued') {
          return { fill: '#F43F5E', stroke: '#FDA4AF', strokeWidth: 1.2 }; // Rose
        }
        if (state === 'recovering') {
          return { fill: '#F59E0B', stroke: '#FDE68A', strokeWidth: 1.1 }; // Amber
        }
        if (state === 'ready') {
          return { fill: '#10B981', stroke: '#6EE7B7', strokeWidth: 1.0 }; // Emerald
        }
        return {
          fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))',
          stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))',
          strokeWidth: 0.8
        };
      }
      return {
        fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))',
        stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))',
        strokeWidth: 0.8
      };
    }

    return getMuscleColor(fallbackMuscle);
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

          const item = data[muscle];
          const { fill, stroke, strokeWidth } = getPathColor(key, muscle);
          const isSemanticBalance = mode === 'balance' && Boolean(balanceByPath);
          const isSemanticFatigue = mode === 'fatigue' && Boolean(fatigueByPath);
          const isSemanticMode = isSemanticBalance || isSemanticFatigue;

          const isSelected = isSemanticMode && onSelectPath
            ? selectedPath === (key as BodyMusclePath)
            : mode === 'strength'
            ? selectedMuscle === muscle
            : false;
          const isStrengthMode = mode === 'strength';
          const rankVisual = isStrengthMode && item?.strengthEvaluation ? getStrengthRankVisual(item.strengthEvaluation.rank) : null;

          let renderedFill = fill;
          let renderedStroke = stroke;
          let renderedStrokeWidth = strokeWidth;
          let renderedFilter: string | undefined = undefined;

          if (isStrengthMode && rankVisual) {
            if (isSelected) {
              renderedFill = rankVisual.fill;
              if (rankVisual.rank === 'dios') {
                renderedStroke = '#FFD700';
                renderedStrokeWidth = 3.5;
                renderedFilter = 'drop-shadow(0 0 10px #FFD700) drop-shadow(0 0 18px rgba(255, 215, 0, 0.85))';
              } else if (rankVisual.rank === 'semidios') {
                renderedStroke = '#FFD700';
                renderedStrokeWidth = 3.5;
                renderedFilter = 'drop-shadow(0 0 10px #FFD700) drop-shadow(0 0 16px rgba(184, 134, 11, 0.85))';
              } else {
                renderedStroke = rankVisual.accent || '#FFFFFF';
                renderedStrokeWidth = 3.5;
                renderedFilter = `drop-shadow(0 0 8px ${rankVisual.accent}) drop-shadow(0 0 14px ${rankVisual.glow || rankVisual.fill})`;
              }
            } else {
              if (rankVisual.rank === 'semidios') {
                renderedFilter = 'drop-shadow(0 0 6px rgba(184, 134, 11, 0.45))';
              } else if (rankVisual.rank === 'dios') {
                renderedFilter = 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.50)) drop-shadow(0 0 10px rgba(255, 215, 0, 0.35))';
              } else if (rankVisual.filterDropShadow) {
                renderedFilter = rankVisual.filterDropShadow;
              }
            }
          } else if (isSelected) {
            renderedFill = '#FFFFFF';
            renderedStroke = '#FFFFFF';
            renderedStrokeWidth = 4;
            renderedFilter = 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.9))';
          }

          const pathDisplayName = getBodyPathDisplayName(key as BodyMusclePath, 'es');
          let titleText = SPANISH_MUSCLE_NAMES[muscle] || muscle;
          if (isSemanticBalance) {
            const pathData = balanceByPath?.[key as BodyMusclePath];
            titleText = pathData ? `${pathDisplayName} (${pathData.exposureCount} series)` : `${pathDisplayName} (0 series)`;
          } else if (isSemanticFatigue) {
            const fData = fatigueByPath?.[key as BodyMusclePath];
            const stateLabels: Record<string, string> = {
              fatigued: 'Fatigado',
              recovering: 'En recuperación',
              ready: 'Listo',
              fresh: 'Fresco'
            };
            const stateLabel = fData ? (stateLabels[fData.state] || fData.state) : 'Fresco';
            const feuVal = fData ? fData.residualFeu.toFixed(2) : '0.00';
            const qualityNote = fData && fData.state === 'fresh' && fData.unknownEffortCount > 0
              ? ' [datos incompletos]'
              : '';
            titleText = `${pathDisplayName} (${feuVal} FEU • ${stateLabel}${qualityNote})`;
          } else if (isStrengthMode) {
            const rankText = item?.strengthEvaluation ? t(`ranks.${item.strengthEvaluation.rank}`) : 'Sin evaluar';
            const broadName = SPANISH_MUSCLE_NAMES[muscle] || muscle;
            if (pathDisplayName && pathDisplayName.toLowerCase() !== broadName.toLowerCase()) {
              titleText = `${pathDisplayName} (Proyección: ${broadName} • ${rankText})`;
            } else {
              titleText = `${broadName} (${rankText})`;
            }
          }

          return paths.map((d, i) => (
            <path
              key={`muscle-${key}-${i}`}
              d={d}
              fill={renderedFill}
              stroke={renderedStroke}
              strokeWidth={renderedStrokeWidth}
              className="cursor-pointer transition-colors duration-150 active:opacity-80"
              style={{
                filter: renderedFilter
              }}
              onClick={() => {
                if (isSemanticMode && onSelectPath) {
                  onSelectPath(selectedPath === (key as BodyMusclePath) ? null : (key as BodyMusclePath));
                } else if (mode === 'strength') {
                  onSelectMuscle(selectedMuscle === muscle ? null : muscle);
                }
              }}
            >
              <title>{titleText}</title>
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
            <span className="w-3.5 h-3.5 rounded bg-white/[0.08] border border-white/20" title="Sin exposición (l0)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_32%,rgba(255,255,255,0.08))] border border-accent/40" title="Exposición baja (l1)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_56%,rgba(255,255,255,0.08))] border border-accent/60" title="Exposición media (l2)" />
            <span className="w-3.5 h-3.5 rounded bg-[color-mix(in_srgb,var(--accent-color)_78%,rgba(255,255,255,0.08))] border border-accent/80" title="Exposición alta (l3)" />
            <span className="w-3.5 h-3.5 rounded bg-accent shadow-[0_0_8px_var(--accent-glow)]" title="Exposición máxima (l4)" />
          </div>
          <span className="text-accent font-bold">Más</span>
        </div>
      )}

      {mode === 'fatigue' && (
        <div className="grid grid-cols-4 gap-1.5 p-2 bg-zinc-900/70 rounded-2xl border border-white/[0.06] text-[10px] font-mono text-center shadow-sm">
          <div className="flex items-center justify-center gap-1 text-rose-400 font-semibold" title="Fatigado (≥3.00 FEU)">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 shrink-0" />
            <span className="truncate">Fatigado</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-amber-400 font-semibold" title="En recuperación (1.00 – 2.99 FEU)">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50 shrink-0" />
            <span className="truncate">Recuperando</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-emerald-400 font-semibold" title="Listo (0.25 – 0.99 FEU)">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 shrink-0" />
            <span className="truncate">Listo</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-zinc-400 font-semibold" title="Fresco (<0.25 FEU)">
            <span className="w-2 h-2 rounded-full bg-white/20 border border-white/30 shrink-0" />
            <span className="truncate">Fresco</span>
          </div>
        </div>
      )}

      {mode === 'strength' && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-ui-lg border border-border-subtle bg-surface-input p-2 text-[10px] font-mono shadow-sm min-[380px]:grid-cols-3">
          {(Object.keys(STRENGTH_RANK_VISUALS) as StrengthRank[]).map((r) => {
            return (
              <div key={r} className="flex min-w-0 items-center gap-1.5 text-text-secondary" title={t(`ranks.${r}`)}>
                <StrengthRankBadge rank={r} size="xs" />
                <span className="leading-snug break-words min-w-0">{t(`ranks.${r}`)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Card (Suppressed when strengthPresentation === 'profile' to let Profile render its own dedicated panel) */}
      {strengthPresentation !== 'profile' && (
        mode === 'balance' ? (
          selectedPath ? (
            (() => {
              const pathData = balanceByPath?.[selectedPath];
              return (
                <div className="p-4 rounded-3xl bg-zinc-900/90 border border-white/[0.08] space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-white">
                        {getBodyPathDisplayName(selectedPath, 'es')}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent-soft text-accent border border-accent/20">
                        Región anatómica
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectPath?.(null)}
                      className="text-[10px] text-zinc-400 hover:text-white px-2.5 py-1 rounded-full bg-zinc-800 cursor-pointer transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>

                  {/* 3 Metrics Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    {/* Metric 1: Exposures */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Series de exposición</span>
                      <span className="text-sm font-bold text-white">{pathData?.exposureCount ?? 0} series</span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">Estímulo directo</span>
                    </div>

                    {/* Metric 2: Hard sets */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Series duras</span>
                      <span className="text-sm font-bold text-accent">{pathData?.hardExposureCount ?? 0} series</span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">RIR ≤ 2 / RPE ≥ 8</span>
                    </div>

                    {/* Metric 3: Strongest role */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Rol dominante</span>
                      <span className="text-sm font-bold text-white">
                        {pathData?.strongestRole ? (ROLE_DISPLAY_NAMES[pathData.strongestRole]?.es ?? pathData.strongestRole) : '—'}
                      </span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                        {pathData?.roles?.length ? `${pathData.roles.length} roles` : 'Sin series'}
                      </span>
                    </div>
                  </div>

                  {/* Contributors list */}
                  {pathData && pathData.contributors.length > 0 && (
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04] space-y-1.5 font-mono">
                      <span className="text-[10px] text-zinc-400 block font-semibold">
                        Componentes anatómicos que aportan a esta región:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {pathData.contributors.map((c) => (
                          <span
                            key={getContributionTargetKey(c)}
                            className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.06] border border-white/10 text-zinc-300"
                          >
                            {getMuscleTargetDisplayName(c, 'es')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <p className="text-[11px] text-zinc-500 text-center py-1 font-mono">
              Toca cualquier región anatómica en el cuerpo para ver sus series de exposición y componentes reclutados.
            </p>
          )
        ) : mode === 'fatigue' ? (
          selectedPath ? (
            (() => {
              const fData = fatigueByPath?.[selectedPath];
              const state = fData?.state ?? 'fresh';
              const hoursAgo = fData?.lastExposedAt
                ? Math.max(0, Math.round((Date.now() - Date.parse(fData.lastExposedAt)) / (1000 * 60 * 60)))
                : null;
              const stateBadge =
                state === 'fatigued'
                  ? { text: 'Fatigado', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
                  : state === 'recovering'
                  ? { text: 'En recuperación', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
                  : state === 'ready'
                  ? { text: 'Listo', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
                  : { text: 'Fresco', bg: 'bg-zinc-800 text-zinc-400 border-zinc-700' };

              return (
                <div className="p-4 rounded-3xl bg-zinc-900/90 border border-white/[0.08] space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-white">
                        {getBodyPathDisplayName(selectedPath, 'es')}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${stateBadge.bg}`}>
                        {stateBadge.text}
                      </span>
                      {fData && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-white/[0.06] border border-white/10">
                          Certeza: {fData.confidence === 'high' ? 'Alta' : fData.confidence === 'moderate' ? 'Moderada' : 'Baja'}
                        </span>
                      )}
                      {fData && fData.unknownEffortCount > 0 && fData.unknownEffortCount >= fData.totalEligibleSets && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30">
                          Esfuerzo sin registrar
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectPath?.(null)}
                      className="text-[10px] text-zinc-400 hover:text-white px-2.5 py-1 rounded-full bg-zinc-800 cursor-pointer transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>

                  {/* Incomplete effort alert banner */}
                  {fData && fData.unknownEffortCount > 0 && (
                    <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-mono leading-relaxed">
                      ⚠️ Datos de esfuerzo incompletos: {fData.unknownEffortCount} de {fData.totalEligibleSets} series no registraron RIR o RPE. La baja carga residual estimada refleja ausencia de datos de intensidad, no necesariamente recuperación muscular completa.
                    </div>
                  )}

                  {/* 3 Metrics Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    {/* Metric 1: Residual Load */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Carga residual</span>
                      <span className={`text-sm font-bold ${
                        state === 'fatigued'
                          ? 'text-rose-400'
                          : state === 'recovering'
                          ? 'text-amber-400'
                          : state === 'ready'
                          ? 'text-emerald-400'
                          : 'text-white'
                      }`}>
                        {fData?.residualFeu ? fData.residualFeu.toFixed(2) : '0.00'} FEU
                      </span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">Activa ahora</span>
                    </div>

                    {/* Metric 2: 7-day Load */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Carga 7 días</span>
                      <span className="text-sm font-bold text-accent">
                        {fData?.rolling7DayFeu ? fData.rolling7DayFeu.toFixed(2) : '0.00'} FEU
                      </span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                        {fData?.totalEligibleSets ?? 0} series
                      </span>
                    </div>

                    {/* Metric 3: Time elapsed */}
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Última exposición</span>
                      <span className="text-sm font-bold text-white">
                        {hoursAgo !== null ? `Hace ${hoursAgo}h` : 'Descansado'}
                      </span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                        {fData?.unknownEffortCount ? `${fData.unknownEffortCount} s/ RIR` : 'Esfuerzo medido'}
                      </span>
                    </div>
                  </div>

                  {/* Contributors list */}
                  {fData && fData.contributors.length > 0 && (
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04] space-y-1.5 font-mono">
                      <span className="text-[10px] text-zinc-400 block font-semibold">
                        Componentes anatómicos que aportan a esta región:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {fData.contributors.map((c) => (
                          <span
                            key={getContributionTargetKey(c.target)}
                            className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.06] border border-white/10 text-zinc-300 flex items-center gap-1"
                          >
                            <span>{getMuscleTargetDisplayName(c.target, 'es')}</span>
                            <span className="text-accent font-bold">({c.residualFeu.toFixed(2)} FEU)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <p className="text-[11px] text-zinc-500 text-center py-1 font-mono">
              Toca cualquier región anatómica en el cuerpo para ver su carga de fatiga en FEU y componentes reclutados.
            </p>
          )
        ) : mode === 'strength' && selectedData ? (
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-white/[0.08] space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-extrabold text-white">
                      {selectedData.nameEs}
                    </h4>
                    {selectedData.strengthEvaluation && (() => {
                      const visual = getStrengthRankVisual(selectedData.strengthEvaluation.rank);
                      return (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                          style={{
                            backgroundColor: visual.glow,
                            color: visual.stroke,
                            border: `1px solid ${visual.stroke}80`
                          }}
                        >
                          {t(`ranks.${selectedData.strengthEvaluation.rank}`)}
                        </span>
                      );
                    })()}
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

            {/* 2 Metrics Cards: Strictly Strength-Derived (Relative Strength & Estimated 1RM) */}
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              {/* Metric 1: Relative Strength */}
              <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                <span className="text-[10px] text-zinc-500 block uppercase">Fuerza Relativa</span>
                <span className="text-sm font-bold text-accent block">
                  {selectedData.topEst1RmKg > 0
                    ? `${selectedData.strengthEvaluation?.currentRatio.toFixed(2)}× BW`
                    : '—'}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  {selectedData.strengthEvaluation ? `${selectedData.strengthEvaluation.strengthScore.toFixed(2)} / 9.00` : 'Sin evaluar'}
                </span>
              </div>

              {/* Metric 2: Estimated 1RM */}
              <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.04]">
                <span className="text-[10px] text-zinc-500 block uppercase">1RM Estimado</span>
                <span className="text-sm font-bold text-white block">
                  {selectedData.topEst1RmKg > 0 ? formatDisplayWeight(selectedData.topEst1RmKg, preferences.units) : '—'}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate max-w-[140px] mx-auto" title={selectedData.topExerciseName}>
                  {selectedData.topEst1RmKg > 0 ? (selectedData.topExerciseName || 'Top set') : 'Sin registro'}
                </span>
              </div>
            </div>

            {/* Gamification Progress Bar toward Next Rank */}
            {selectedData.strengthEvaluation && selectedData.strengthEvaluation.nextRank && (
              <div className="p-3 rounded-2xl bg-black/50 border border-white/[0.06] space-y-1.5 font-mono">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                    Siguiente Rango:
                    <strong className="text-white">
                      {t(`ranks.${selectedData.strengthEvaluation.nextRank}`)}
                    </strong>
                  </span>
                  <span className="text-accent font-bold text-[11px]">
                    Faltan ≈ +{formatDisplayWeight(selectedData.strengthEvaluation.kgToNextRank ?? 0, preferences.units)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-sky-500 via-accent to-purple-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${selectedData.strengthEvaluation.progressPctToNextRank}%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Actual: {formatDisplayWeight(selectedData.topEst1RmKg, preferences.units)}</span>
                  <span>Objetivo: {formatDisplayWeight(selectedData.strengthEvaluation.targetOneRmKg ?? 0, preferences.units)} ({selectedData.strengthEvaluation.targetRatio}× BW)</span>
                </div>
              </div>
            )}

            {selectedData.strengthEvaluation && selectedData.strengthEvaluation.rank === 'dios' && (
              <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-center font-mono text-xs text-amber-300 flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Rango Dios alcanzado (Rango máximo de fuerza).</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 text-center py-1 font-mono">
            Toca cualquier grupo muscular en el cuerpo para ver su nivel de fuerza y rango estimado.
          </p>
        )
      )}
    </div>
  );
};
