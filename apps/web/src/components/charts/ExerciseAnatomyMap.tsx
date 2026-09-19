import React, { useMemo, useState } from 'react';
import type { Exercise, Gender, MuscleRole } from '@light-weight/domain';
import { Sparkles, Info } from 'lucide-react';
import BODY_PATHS, { type BodyViewData } from '../../lib/body-paths.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { useI18n } from '../../lib/i18n.js';
import {
  type BodyMusclePath,
  resolveExerciseBodyMapData,
  getMuscleTargetDisplayName,
  getBodyPathDisplayName,
  ROLE_DISPLAY_NAMES,
  ROLE_VISUAL_INTENSITY
} from '../../lib/exercise-anatomy.js';

interface ExerciseAnatomyMapProps {
  exercise: Exercise;
  gender?: Gender;
  className?: string;
  onSelectPath?: (path: BodyMusclePath | null) => void;
}

const INERT_KEYS = new Set([
  'head',
  'hair',
  'neck',
  'hands',
  'knees',
  'ankles',
  'feet'
]);

export const ExerciseAnatomyMap: React.FC<ExerciseAnatomyMapProps> = ({
  exercise,
  gender: genderProp,
  className = '',
  onSelectPath
}) => {
  const { preferences } = usePreferences();
  const { t, language } = useI18n();
  const [selectedPathState, setSelectedPathState] = useState<BodyMusclePath | null>(null);

  const gender: Gender = genderProp || 'male';
  const genderPaths = BODY_PATHS[gender] || BODY_PATHS.male;

  const mapData = useMemo(() => resolveExerciseBodyMapData(exercise), [exercise]);

  const handleSelectPath = (path: BodyMusclePath | null) => {
    setSelectedPathState(path);
    onSelectPath?.(path);
  };

  const getPathColor = (pathKey: string, isSelected: boolean) => {
    const region = mapData.regions[pathKey as BodyMusclePath];

    if (!region) {
      return {
        fill: 'var(--untrained-muscle-fill, rgba(255, 255, 255, 0.07))',
        stroke: 'var(--untrained-muscle-stroke, rgba(255, 255, 255, 0.16))',
        strokeWidth: 0.8,
        cursor: 'default'
      };
    }

    if (isSelected) {
      return {
        fill: 'var(--accent-color, #38bdf8)',
        stroke: '#ffffff',
        strokeWidth: 2.2,
        cursor: 'pointer'
      };
    }

    const intensityPct = Math.round(region.visualIntensity * 100);

    return {
      fill: `color-mix(in srgb, var(--accent-color, #38bdf8) ${intensityPct}%, rgba(255, 255, 255, 0.06))`,
      stroke: region.visualIntensity >= 0.8 ? 'var(--accent-color, #38bdf8)' : 'color-mix(in srgb, var(--accent-color, #38bdf8) 60%, transparent)',
      strokeWidth: region.visualIntensity >= 0.8 ? 1.2 : 0.85,
      cursor: 'pointer'
    };
  };

  const renderView = (view: BodyViewData, isFront: boolean) => {
    return (
      <svg
        viewBox={view.vb}
        className="h-[210px] sm:h-[250px] w-auto max-w-full select-none drop-shadow-md transition-all duration-200"
        role="img"
        aria-label={isFront ? t('exercise.frontView') : t('exercise.backView')}
      >
        {/* Render inert silhouette parts */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (!INERT_KEYS.has(key)) return null;
          return paths.map((d, i) => (
            <path
              key={`inert-${key}-${i}`}
              d={d}
              fill="var(--inert-body-fill, rgba(255, 255, 255, 0.12))"
              stroke="var(--inert-body-stroke, rgba(255, 255, 255, 0.22))"
              strokeWidth={0.8}
            />
          ));
        })}

        {/* Render muscle groups */}
        {Object.entries(view.p).map(([key, paths]) => {
          if (INERT_KEYS.has(key)) return null;
          const region = mapData.regions[key as BodyMusclePath];
          const isTargeted = Boolean(region);
          const isSelected = selectedPathState === key;
          const { fill, stroke, strokeWidth, cursor } = getPathColor(key, isSelected);
          const pathLabel = getBodyPathDisplayName(key as BodyMusclePath, language === 'en' ? 'en' : 'es');
          const targetsList = region?.contributions.map((c) => getMuscleTargetDisplayName(c.target, language === 'en' ? 'en' : 'es')).join(', ');
          const roleName = ROLE_DISPLAY_NAMES[region?.strongestRole || 'minimal'][language === 'en' ? 'en' : 'es'];
          const accessibleName = isTargeted
            ? `${pathLabel} (${targetsList} - ${roleName})`
            : undefined;

          return (
            <g
              key={`muscle-group-${key}`}
              tabIndex={isTargeted ? 0 : undefined}
              role={isTargeted ? 'button' : undefined}
              aria-label={accessibleName}
              aria-pressed={isTargeted ? isSelected : undefined}
              className={
                isTargeted
                  ? 'cursor-pointer outline-none focus-visible:stroke-white focus-visible:opacity-90 transition-opacity hover:opacity-95'
                  : ''
              }
              style={{ cursor }}
              onClick={() => {
                if (isTargeted) {
                  handleSelectPath(isSelected ? null : (key as BodyMusclePath));
                }
              }}
              onKeyDown={(e) => {
                if (isTargeted && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleSelectPath(isSelected ? null : (key as BodyMusclePath));
                }
              }}
            >
              {paths.map((d, i) => (
                <path
                  key={`muscle-${key}-${i}`}
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              ))}
            </g>
          );
        })}
      </svg>
    );
  };

  const activeRolesPresent = useMemo(() => {
    const roles = new Set<MuscleRole>();
    for (const c of mapData.allContributions) {
      roles.add(c.role);
    }
    return roles;
  }, [mapData]);

  const selectedRegion = selectedPathState ? mapData.regions[selectedPathState] : null;

  return (
    <div className={`space-y-3.5 ${className}`} role="region" aria-label={t('exercise.anatomy')}>
      {/* Header with Source Badge */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          {t('exercise.anatomy')}
        </h4>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            mapData.source === 'semantic_v2'
              ? 'bg-accent/10 text-accent border-accent/30'
              : 'bg-surface-elevated text-text-muted border-border-subtle'
          }`}
        >
          {mapData.source === 'semantic_v2' ? (
            <>
              <Sparkles className="size-3" aria-hidden="true" />
              <span>{t('exercise.semanticBadge')}</span>
            </>
          ) : (
            <>
              <Info className="size-3" aria-hidden="true" />
              <span>{t('exercise.legacyBadge')}</span>
            </>
          )}
        </span>
      </div>

      {/* Front and Back Body View Surface */}
      <div className="flex items-center justify-center gap-2 sm:gap-6 py-3 px-2 sm:px-4 bg-gradient-to-b from-white/[0.06] to-white/[0.02] rounded-2xl border border-border-subtle shadow-sm relative overflow-hidden backdrop-blur-md">
        <div className="flex flex-col items-center flex-1 min-w-0 max-w-[150px] sm:max-w-[170px]">
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-text-muted uppercase tracking-widest mb-1">
            {t('exercise.frontView')}
          </span>
          {renderView(genderPaths.front, true)}
        </div>

        <div className="w-[1px] h-48 sm:h-56 bg-gradient-to-b from-transparent via-border-subtle to-transparent shrink-0" />

        <div className="flex flex-col items-center flex-1 min-w-0 max-w-[150px] sm:max-w-[170px]">
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-text-muted uppercase tracking-widest mb-1">
            {t('exercise.backView')}
          </span>
          {renderView(genderPaths.back, false)}
        </div>
      </div>

      {/* Role Legend — Qualitative hierarchy, NO physiological percentages */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 bg-surface-input/50 rounded-xl border border-border-subtle text-[10px] font-mono text-text-secondary">
        {(['prime', 'co_prime', 'secondary', 'resisted_isometric', 'stabilizer', 'minimal'] as MuscleRole[]).map((role) => {
          if (!activeRolesPresent.has(role)) return null;
          const roleLabel = ROLE_DISPLAY_NAMES[role][language === 'en' ? 'en' : 'es'];
          const intensity = ROLE_VISUAL_INTENSITY[role];
          const pct = Math.round(intensity * 100);

          return (
            <div key={role} className="flex items-center gap-1 px-1.5 py-0.5 rounded">
              <span
                className="w-2.5 h-2.5 rounded-sm border"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--accent-color, #38bdf8) ${pct}%, rgba(255, 255, 255, 0.06))`,
                  borderColor: intensity >= 0.8 ? 'var(--accent-color, #38bdf8)' : 'color-mix(in srgb, var(--accent-color, #38bdf8) 60%, transparent)'
                }}
                aria-hidden="true"
              />
              <span>{roleLabel}</span>
            </div>
          );
        })}
      </div>

      {/* Muscle Contributions Breakdown List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
          <span>
            {selectedRegion
              ? `${t('exercise.selectedRegion')}: ${getBodyPathDisplayName(selectedRegion.pathKey, language === 'en' ? 'en' : 'es')}`
              : t('exercise.allMuscles')}
          </span>
          {selectedRegion && (
            <button
              type="button"
              onClick={() => handleSelectPath(null)}
              className="text-[10px] text-accent hover:underline cursor-pointer"
            >
              {t('exercise.showAll')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
          {(selectedRegion ? selectedRegion.contributions : mapData.allContributions).map((contrib, idx) => {
            const muscleName = getMuscleTargetDisplayName(contrib.target, language === 'en' ? 'en' : 'es');
            const roleLabel = ROLE_DISPLAY_NAMES[contrib.role][language === 'en' ? 'en' : 'es'];
            const intensity = ROLE_VISUAL_INTENSITY[contrib.role];
            const pct = Math.round(intensity * 100);

            return (
              <div
                key={`${contrib.target.kind}-${idx}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-subtle bg-surface-elevated/70 text-xs"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--accent-color, #38bdf8) ${pct}%, rgba(255, 255, 255, 0.06))`
                  }}
                  aria-hidden="true"
                />
                <span className="font-medium text-text-primary text-[11px]">{muscleName}</span>
                <span className="text-[10px] text-text-muted font-mono">· {roleLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
