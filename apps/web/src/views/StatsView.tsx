import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  Calculator,
  Flame,
  Scale,
  Calendar,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  AlertTriangle,
  TrendingUp,
  Shield,
  Zap,
  User,
  Sparkles,
  Dumbbell,
  Target
} from 'lucide-react';
import {
  estimateOneRm,
  calculateSessionTotalVolume,
  calculateWeeklyStreak,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  calculateMuscleFatigue,
  evaluateRelativeStrength,
  shouldCountForPersonalRecord,
  shouldCountForVolume,
  type Gender,
  type WorkoutSession,
  type Exercise,
  type MuscleGroup
} from '@light-weight/domain';
import {
  getStoredBodyweight,
  saveBodyweightEntry,
  getStoredTargetWeight,
  saveStoredTargetWeight,
  getStoredProfile,
  saveStoredProfile,
  UserProfile,
  BodyweightEntry
} from '../lib/storage.js';
import { LineChart, ChartPoint } from '../components/charts/LineChart.js';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap.js';
import { BodyweightModal } from '../components/BodyweightModal.js';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal.js';
import { TonnageEquivalenceModal } from '../components/TonnageEquivalenceModal.js';
import { ViewHeader } from '../components/ViewHeader.js';
import {
  AnatomicalBodyMap,
  AnalysisMode,
  MuscleAnalytics,
  SPANISH_MUSCLE_NAMES
} from '../components/charts/AnatomicalBodyMap.js';
import { AppCard, Button, EmptyState, SectionHeader } from '../components/ui/index.js';
import { ExercisePicker } from '../components/ExercisePicker.js';
import { useExerciseLabels, useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, formatDisplayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';

interface StatsViewProps {
  history?: WorkoutSession[];
  exercises?: Exercise[];
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
}

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core'
];

export const StatsView: React.FC<StatsViewProps> = ({
  history = [],
  exercises = [],
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings
}) => {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const bodyweightUnit = WEIGHT_UNIT_PRESETS[preferences.bodyweightUnits].unit;
  const calculatorStepKg = preferences.units === 'imperial' ? parseDisplayWeight(5, 'imperial') : 2.5;
  const { muscleLabel } = useExerciseLabels();
  const accordionId = React.useId();
  const sectionPanelIds = {
    muscles: `${accordionId}-muscles`,
    exercise: `${accordionId}-exercise`,
    consistency: `${accordionId}-consistency`,
    bodyweight: `${accordionId}-bodyweight`,
    calculator: `${accordionId}-calculator`
  } as const;

  // Collapsible Accordion Sections State
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (sectionId: string) => {
    setOpenSection((current) => current === sectionId ? null : sectionId);
  };

  // User Profile (Gender & Preferences)
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile());
  useEffect(() => {
    const refreshProfile = () => setProfile(getStoredProfile());
    window.addEventListener('lightweight_profile_changed', refreshProfile);
    return () => window.removeEventListener('lightweight_profile_changed', refreshProfile);
  }, []);
  const currentGender: Gender = profile.gender;

  const handleGenderChange = (newGender: Gender) => {
    const updated = saveStoredProfile({ gender: newGender });
    setProfile(updated);
  };

  // Bodyweight State
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>(getStoredBodyweight());
  const [targetWeight, setTargetWeight] = useState<number | null>(getStoredTargetWeight());
  const [isBwModalOpen, setIsBwModalOpen] = useState(false);

  const currentBodyweightKg = useMemo(() => {
    return bodyweightEntries.length > 0
      ? bodyweightEntries[bodyweightEntries.length - 1].weightKg
      : null;
  }, [bodyweightEntries]);

  // =========================================================================
  // 1. MÚSCULOS: MODOS DE ANÁLISIS (EQUILIBRIO, FATIGA, FORTALEZA)
  // =========================================================================
  const [muscleAnalysisMode, setMuscleAnalysisMode] = useState<AnalysisMode>('balance');
  const [muscleWindow, setMuscleWindow] = useState<number>(7); // 7d, 30d, 90d, 0 (all)
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);

  // Exercise lookup dictionary
  const exercisesById = useMemo(() => {
    return exercises.reduce((acc, ex) => {
      acc[ex.id] = ex;
      return acc;
    }, {} as Record<string, Exercise>);
  }, [exercises]);

  // Muscle Balance & Neglected Muscles calculation
  const muscleAnalysis = useMemo(() => {
    return getNeglectedMuscles(history, exercisesById, muscleWindow);
  }, [history, exercisesById, muscleWindow]);

  // Physiological Fatigue calculation with RIR intensity and exponential time decay
  const fatigueMap = useMemo(() => {
    return calculateMuscleFatigue(history, exercisesById);
  }, [history, exercisesById]);

  // Comprehensive Muscle Analytics (Balance, Fatigue, Strength & StrengthLevel Badges)
  const fullMuscleAnalytics = useMemo(() => {
    const workedMap = new Map(muscleAnalysis.worked.map((w) => [w.muscle, w]));

    // Calculate Best 1RM records per muscle group
    const strengthMap = new Map<MuscleGroup, { top1Rm: number; exName: string }>();
    for (const session of history) {
      for (const [exId, sets] of Object.entries(session.sets)) {
        const ex = exercisesById[exId];
        if (!ex) continue;
        const completed = sets.filter(shouldCountForVolume);
        if (completed.length === 0) continue;

        for (const s of completed) {
          const est = estimateOneRm(s.weightKg, s.reps).average;
          const currentBest = strengthMap.get(ex.primaryMuscle) || { top1Rm: 0, exName: '' };
          if (est > currentBest.top1Rm) {
            strengthMap.set(ex.primaryMuscle, { top1Rm: est, exName: ex.name });
          }
        }
      }
    }

    const result = {} as Record<MuscleGroup, MuscleAnalytics>;

    for (const muscle of ALL_MUSCLE_GROUPS) {
      const workedItem = workedMap.get(muscle);
      const sets = workedItem?.sets || 0;
      const volumeKg = workedItem?.volumeKg || 0;

      // Physiological fatigue data
      const fatigueData = fatigueMap[muscle];

      // Strength & StrengthLevel evaluation
      const strInfo = strengthMap.get(muscle) || { top1Rm: 0, exName: '' };
      const strengthEvaluation = currentBodyweightKg && strInfo.top1Rm > 0
        ? evaluateRelativeStrength(muscle, strInfo.top1Rm, currentBodyweightKg, currentGender)
        : undefined;

      result[muscle] = {
        muscle,
        nameEs: SPANISH_MUSCLE_NAMES[muscle] || muscle,
        sets,
        volumeKg,
        fatigueScore: fatigueData.fatigueScore,
        recoveryStatus: fatigueData.status,
        recoveryPct: fatigueData.recoveryPct,
        lastTrainedHoursAgo: fatigueData.hoursSinceLastTrained,
        recentHardSetsCount: fatigueData.recentHardSetsCount,
        topEst1RmKg: strInfo.top1Rm,
        topExerciseName: strInfo.exName,
        strengthEvaluation
      };
    }

    return result;
  }, [muscleAnalysis, fatigueMap, history, exercisesById, currentBodyweightKg, currentGender]);

  // =========================================================================
  // 2. PROGRESO POR EJERCICIO
  // =========================================================================
  const [selectedExId, setSelectedExId] = useState<string>('ex-bench');
  const [exMetric, setExMetric] = useState<'top' | 'e1rm' | 'rir'>('top');

  const exercisesWithHistory = useMemo(() => {
    const ids = new Set<string>();
    for (const session of history) {
      for (const exId of Object.keys(session.sets)) {
        ids.add(exId);
      }
    }
    const list = Array.from(ids)
      .map((id) => exercisesById[id] || { id, name: id, category: 'other', primaryMuscle: 'chest' as MuscleGroup })
      .sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [history, exercisesById, exercises]);

  const currentExerciseId = exercisesWithHistory.some((e) => e.id === selectedExId)
    ? selectedExId
    : exercisesWithHistory[0]?.id || 'ex-bench';

  const exerciseSeries = useMemo(() => {
    return getExerciseProgressSeries(history, currentExerciseId);
  }, [history, currentExerciseId]);

  const exerciseChartPoints: ChartPoint[] = useMemo(() => {
    return exerciseSeries
      .map((p) => {
        let yVal = displayWeight(p.topWeightKg, preferences.units);
        if (exMetric === 'e1rm') yVal = displayWeight(p.est1Rm || p.topWeightKg, preferences.units);
        if (exMetric === 'rir') yVal = p.avgRir !== null ? p.avgRir : 2;

        return {
          t: p.timestamp,
          y: yVal,
          dateStr: p.date,
          label: `${formatDisplayWeight(p.topWeightKg, preferences.units)} × ${p.sets[0]?.reps || 0} (${p.sets.length} series)`
        };
      })
      .filter((p) => Number.isFinite(p.y));
  }, [exerciseSeries, exMetric, preferences.units]);

  const bestAllTimeEstimate = useMemo(() => {
    let best = 0;
    for (const p of exerciseSeries) {
      if (p.est1Rm && p.est1Rm > best) best = p.est1Rm;
    }
    return best;
  }, [exerciseSeries]);

  // =========================================================================
  // 3. PESO CORPORAL & METAS
  // =========================================================================
  const bwChartPoints: ChartPoint[] = useMemo(() => {
    return bodyweightEntries.map((b) => ({
      t: b.timestamp,
      y: displayWeight(b.weightKg, preferences.bodyweightUnits),
      dateStr: b.date
    }));
  }, [bodyweightEntries, preferences.bodyweightUnits]);

  const bw30DayDelta = useMemo(() => {
    if (bodyweightEntries.length < 2) return null;
    const latest = bodyweightEntries[bodyweightEntries.length - 1].weightKg;
    const past = bodyweightEntries[0].weightKg;
    return displayWeight(latest - past, preferences.bodyweightUnits);
  }, [bodyweightEntries, preferences.bodyweightUnits]);

  // =========================================================================
  // =========================================================================
  // 4. CALCULADORA 1RM PERSONALIZADA CON HISTORIAL Y BIOMETRÍA
  // =========================================================================
  const calcExerciseOptions = useMemo(() => {
    const map = new Map<string, Exercise>();
    // Primero los ejercicios que tienen historial
    exercisesWithHistory.forEach((ex) => map.set(ex.id, ex));
    // Luego el resto de ejercicios del catálogo
    exercises.forEach((ex) => {
      if (!map.has(ex.id)) map.set(ex.id, ex);
    });
    return Array.from(map.values());
  }, [exercisesWithHistory, exercises]);

  const [calcExerciseId, setCalcExerciseId] = useState<string>(() => {
    return exercisesWithHistory[0]?.id || exercises[0]?.id || 'barbell-bench-press';
  });

  const currentCalcExerciseId = calcExerciseOptions.some((exercise) => exercise.id === calcExerciseId)
    ? calcExerciseId
    : calcExerciseOptions[0]?.id || calcExerciseId;

  const selectedCalcExercise = useMemo(() => {
    return calcExerciseOptions.find((exercise) => exercise.id === currentCalcExerciseId);
  }, [calcExerciseOptions, currentCalcExerciseId]);

  // Mejor marca registrada por el usuario en este ejercicio
  const lastTopSet = useMemo(() => {
    const sessions = [...history].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    for (const session of sessions) {
      const completed = (session.sets[currentCalcExerciseId] || []).filter(shouldCountForPersonalRecord);
      if (!completed.length) continue;
      const top = completed.reduce((best, set) => estimateOneRm(set.weightKg, set.reps).average > estimateOneRm(best.weightKg, best.reps).average ? set : best);
      return { weightKg: top.weightKg, reps: top.reps, estimatedOneRm: estimateOneRm(top.weightKg, top.reps).average };
    }
    return null;
  }, [history, currentCalcExerciseId]);

  const [calcWeight, setCalcWeight] = useState(100);
  const [calcReps, setCalcReps] = useState(6);

  // Al cambiar el ejercicio, precargar el PR histórico si existe
  const estimate = estimateOneRm(calcWeight, calcReps);

  // Nivel de fuerza y ratio según el peso corporal del usuario
  const userStrengthEval = useMemo(() => {
    if (!selectedCalcExercise || !currentBodyweightKg) return null;
    return evaluateRelativeStrength(
      selectedCalcExercise.primaryMuscle,
      estimate.average,
      currentBodyweightKg || 0,
      currentGender
    );
  }, [selectedCalcExercise, estimate.average, currentBodyweightKg, currentGender]);

  // Estados de listas desplegables internas
  const [isNeglectedListOpen, setIsNeglectedListOpen] = useState(false);
  const [isEffectiveSetsOpen, setIsEffectiveSetsOpen] = useState(false);

  // Total tonnage y modal de equivalencias cotidianas
  const [isTonnageModalOpen, setIsTonnageModalOpen] = useState(false);
  const totalVolumeTonnage = useMemo(() => {
    return history.reduce((sum, s) => sum + calculateSessionTotalVolume(s), 0);
  }, [history]);

  const progressSummary = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSessions = history.filter((session) => {
      const startedAt = Date.parse(session.startedAt);
      return Number.isFinite(startedAt) && startedAt >= cutoff;
    });
    let bestEstimatedOneRm = 0;
    let bestExerciseName = '';

    for (const session of recentSessions) {
      for (const [exerciseId, sets] of Object.entries(session.sets)) {
        for (const set of sets) {
          if (!shouldCountForPersonalRecord(set)) continue;
          const estimatedOneRm = estimateOneRm(set.weightKg, set.reps).average;
          if (estimatedOneRm > bestEstimatedOneRm) {
            bestEstimatedOneRm = estimatedOneRm;
            bestExerciseName = exercisesById[exerciseId]?.name || 'Ejercicio del historial';
          }
        }
      }
    }

    return {
      sessions: recentSessions.length,
      volumeKg: recentSessions.reduce((sum, session) => sum + calculateSessionTotalVolume(session), 0),
      bestEstimatedOneRm,
      bestExerciseName,
      weeklyStreak: calculateWeeklyStreak(history)
    };
  }, [exercisesById, history]);

  const compactNumber = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    [locale]
  );

  // Modal handlers
  const [inspectingSession, setInspectingSession] = useState<WorkoutSession | null>(null);

  const handleSaveWeight = (weightKg: number) => {
    const updated = saveBodyweightEntry(weightKg);
    setBodyweightEntries(updated);
  };

  const handleSaveGoal = (goalKg: number) => {
    saveStoredTargetWeight(goalKg);
    setTargetWeight(goalKg);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* El primer nivel responde cómo va el usuario antes de exponer la analítica. */}
      <ViewHeader
        title={t('stats.title')}
        subtitle={t('stats.subtitle')}
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      <AppCard compact className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-text-secondary">{t('stats.last30')}</p>
            <p className="mt-0.5 text-[11px] text-text-muted">{t('stats.activity')}</p>
          </div>
          <TrendingUp aria-hidden="true" className="size-5 shrink-0 text-accent" />
        </div>

        <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-ui-lg border border-border-subtle bg-surface-input">
          <div className="min-w-0 px-2 py-3 text-center">
            <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-text-muted">{t('stats.bestE1rm')}</span>
            <strong className="mt-1 block truncate text-sm text-text-primary">
              {progressSummary.bestEstimatedOneRm > 0 ? formatDisplayWeight(progressSummary.bestEstimatedOneRm, preferences.units) : '—'}
            </strong>
          </div>
          <div className="min-w-0 px-2 py-3 text-center">
            <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-text-muted">{t('stats.sessions')}</span>
            <strong className="mt-1 block text-sm text-text-primary">{progressSummary.sessions}</strong>
          </div>
          <div className="min-w-0 px-2 py-3 text-center">
            <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-text-muted">{t('stats.volume')}</span>
            <strong className="mt-1 block truncate text-sm text-text-primary">{compactNumber.format(displayWeight(progressSummary.volumeKg, preferences.units))} {weightUnit}</strong>
          </div>
        </div>

        <div className="flex min-h-10 items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-text-muted">
            {progressSummary.bestExerciseName || t('stats.noMarks')}
          </span>
          <span className="shrink-0 font-semibold text-text-secondary">
            {t('stats.streakWeeks', { count: progressSummary.weeklyStreak })}
          </span>
        </div>

        {totalVolumeTonnage > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setIsTonnageModalOpen(true)} className="w-full text-text-muted">
            <Flame aria-hidden="true" className="size-4 text-accent" />
            Tonelaje histórico: {compactNumber.format(displayWeight(totalVolumeTonnage, preferences.units))} {weightUnit}
          </Button>
        )}
      </AppCard>

      <SectionHeader title={t('stats.fullAnalysis')} meta={t('stats.openSection')} />

      {/* ========================================================================= */}
      {/* SECCIONES DESPLEGABLES (ACCORDION TABS)                                    */}
      {/* ========================================================================= */}

      {/* ------------------------------------------------------------------------- */}
      {/* 1. SECCIÓN: MÚSCULOS, FATIGA & FORTALEZA                                  */}
      {/* ------------------------------------------------------------------------- */}
      <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle shadow-card transition-colors hover:border-border-active">
        <button
          type="button"
          onClick={() => toggleSection('muscles')}
          aria-expanded={openSection === 'muscles'}
          aria-controls={sectionPanelIds.muscles}
          className="flex min-h-16 w-full items-center justify-between p-4 text-left transition-[transform,background-color] duration-100 ease-out hover:bg-surface-active active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-text-primary">
                {t('stats.musclesTitle')}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                {t('stats.musclesDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {history.length === 0 ? (
              <span className="rounded-full border border-border-subtle bg-surface-input px-2 py-1 text-[10px] font-bold text-text-muted">
                {t('stats.noData')}
              </span>
            ) : muscleAnalysis.neglected.length > 0 ? (
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-xs bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)] shrink-0"
                title={`${muscleAnalysis.neglected.length} músculos rezagados`}
              >
                !
              </span>
            ) : (
              <span
                className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent-glow)] shrink-0"
                title="Todos los grupos musculares activos"
              />
            )}
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-muted transition-transform duration-200 ${
                openSection === 'muscles' ? 'rotate-180 text-accent' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'muscles' && history.length === 0 && (
          <div id={sectionPanelIds.muscles} className="border-t border-border-subtle p-4">
            <EmptyState
              icon={<Activity className="size-5" />}
              title={t('stats.noHistory')}
              description={t('stats.noHistoryDescription')}
            />
          </div>
        )}

        {openSection === 'muscles' && history.length > 0 && (
          <div id={sectionPanelIds.muscles} className="space-y-4 border-t border-border-subtle p-4 pt-1 animate-in fade-in duration-200">
            {/* Barra de Perfil Biométrico: Género y Peso Corporal */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                {t('stats.strengthStandards')}
              </span>
              <div className="flex items-center gap-1 bg-zinc-900/90 border border-white/[0.08] p-0.5 rounded-xl text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleGenderChange('male')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    currentGender === 'male'
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t('stats.male')}
                </button>
                <button
                  type="button"
                  onClick={() => handleGenderChange('female')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    currentGender === 'female'
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t('stats.female')}
                </button>
                <span className="text-zinc-700 px-1">|</span>
                <span className="text-zinc-300 font-bold px-1.5">{currentBodyweightKg ? formatDisplayWeight(currentBodyweightKg, preferences.bodyweightUnits) : t('stats.noWeight')}</span>
              </div>
            </div>

            {/* Segmented Switcher: [ Equilibrio | Fatiga | Fortaleza ] */}
            <div className="p-1 rounded-2xl glass-subcard border border-white/[0.06] grid grid-cols-3 gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMuscleAnalysisMode('balance');
                  setSelectedMuscle(null);
                }}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  muscleAnalysisMode === 'balance'
                    ? 'bg-accent text-accent-fg shadow-md shadow-accent/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{t('stats.balance')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMuscleAnalysisMode('fatigue');
                  setSelectedMuscle(null);
                }}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  muscleAnalysisMode === 'fatigue'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t('stats.fatigue')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMuscleAnalysisMode('strength');
                  setSelectedMuscle(null);
                }}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  muscleAnalysisMode === 'strength'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{t('stats.strength')}</span>
              </button>
            </div>

            {/* Selector de Ventana de Tiempo (Segmented Control compacto) */}
            {muscleAnalysisMode === 'balance' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase shrink-0">
                  {t('stats.window')}
                </span>
                <div className="grid grid-cols-4 gap-1 text-xs bg-zinc-900/60 p-1 rounded-xl border border-white/[0.04]">
                  {[
                    { days: 7, label: '7d', title: t('stats.last7Days') },
                    { days: 30, label: '30d', title: t('stats.last30') },
                    { days: 90, label: '90d', title: t('stats.last90Days') },
                    { days: 0, label: t('stats.allTime'), title: t('stats.fullHistory') }
                  ].map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setMuscleWindow(opt.days)}
                      className={`px-2.5 py-1 rounded-lg font-bold font-mono text-[11px] text-center transition-all cursor-pointer ${
                        muscleWindow === opt.days
                          ? 'bg-zinc-800 text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={opt.title}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Gráfico del Cuerpo Humano (Frontal y Dorsal) */}
            <AnatomicalBodyMap
              data={fullMuscleAnalytics}
              mode={muscleAnalysisMode}
              gender={currentGender}
              selectedMuscle={selectedMuscle}
              onSelectMuscle={setSelectedMuscle}
            />

            {/* Subsección A: Músculos Rezagados como Lista Desplegable */}
            {muscleAnalysisMode === 'balance' && muscleAnalysis.neglected.length > 0 && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 overflow-hidden shadow-sm transition-all">
                <button
                  type="button"
                  onClick={() => setIsNeglectedListOpen((prev) => !prev)}
                  className="w-full p-3 flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                      !
                    </span>
                    <div className="text-left min-w-0">
                      <span className="text-xs font-bold text-amber-300 block">
                        {t('stats.neglected', { count: muscleAnalysis.neglected.length })}
                      </span>
                      <span className="text-[10px] text-amber-400/80">
                        {isNeglectedListOpen ? t('stats.collapseList') : t('stats.expandSuggestions')}
                      </span>
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-amber-400 transition-transform duration-200 shrink-0 ${
                      isNeglectedListOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isNeglectedListOpen && (
                  <div className="p-3 pt-1 space-y-2 border-t border-amber-500/20 animate-in fade-in duration-150">
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      {t('stats.neglectedDescription')}
                    </p>

                    <div className="space-y-1.5 pt-0.5">
                      {muscleAnalysis.neglected.map((m) => {
                        const muscleName = muscleLabel(m);
                        const sampleEx = exercises.find((ex) => ex.primaryMuscle === m);

                        return (
                          <div
                            key={m}
                            onClick={() => setSelectedMuscle(m)}
                            className="p-2.5 rounded-xl bg-black/40 border border-amber-500/20 flex items-center justify-between hover:bg-amber-500/20 transition-all cursor-pointer group"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                                {muscleName}
                              </span>
                              {sampleEx && (
                                <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                                  {t('stats.suggested')}: <strong className="text-zinc-300">{sampleEx.name}</strong>
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] font-semibold text-amber-400 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 shrink-0">
                              {t('stats.viewOnMap')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Subsección B: Lista Desplegable de Series Efectivas por Grupo */}
            <div className="rounded-2xl glass-subcard border border-white/[0.06] overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsEffectiveSetsOpen((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.03] transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    {muscleAnalysisMode === 'balance'
                      ? t('stats.effectiveSets')
                      : muscleAnalysisMode === 'fatigue'
                      ? t('stats.fatigueLoad')
                      : t('stats.relativeStrength')}
                  </h3>
                  <span className="text-[10px] text-zinc-400 block mt-0.5">
                    {isEffectiveSetsOpen ? t('stats.collapse') : t('stats.expandRanking')}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/[0.06] px-2.5 py-0.5 rounded-full">
                    {muscleAnalysisMode === 'balance'
                      ? t('stats.setCount', { count: Object.values(fullMuscleAnalytics).reduce((a, b) => a + b.sets, 0) })
                      : t('stats.groupCount', { count: ALL_MUSCLE_GROUPS.length })}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isEffectiveSetsOpen ? 'rotate-180 text-accent' : ''
                    }`}
                  />
                </div>
              </button>

              {isEffectiveSetsOpen && (
                <div className="p-3 pt-0 space-y-1.5 border-t border-white/[0.04] animate-in fade-in duration-150">
                  {ALL_MUSCLE_GROUPS.map((m) => {
                    const item = fullMuscleAnalytics[m];
                    const isSelected = selectedMuscle === m;

                    return (
                      <div
                        key={m}
                        onClick={() => setSelectedMuscle(isSelected ? null : m)}
                        className={`p-3 rounded-2xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-zinc-800/80 border-sky-400/50 shadow-sm'
                            : 'bg-black/40 border-white/[0.04] hover:bg-zinc-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                          {muscleAnalysisMode === 'strength' && item.strengthEvaluation && (
                            <span className="text-base shrink-0" title={item.strengthEvaluation.tierLabelEs}>
                              {item.strengthEvaluation.emoji}
                            </span>
                          )}

                          {muscleAnalysisMode !== 'strength' && (
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                muscleAnalysisMode === 'fatigue'
                                  ? item.recoveryStatus === 'fatigued'
                                  ? 'bg-rose-500'
                                  : item.recoveryStatus === 'recovering'
                                  ? 'bg-amber-500'
                                  : 'bg-accent'
                                  : item.sets > 0
                                  ? 'bg-accent'
                                  : 'bg-zinc-700'
                              }`}
                            />
                          )}

                          <div className="min-w-0">
                            <span className="font-bold text-white capitalize block truncate">
                              {muscleLabel(m)}
                            </span>
                            {muscleAnalysisMode === 'strength' && item.strengthEvaluation && (
                              <span
                                className="text-[10px] font-mono font-bold block truncate"
                                style={{ color: item.strengthEvaluation.color }}
                              >
                                {item.strengthEvaluation.tierLabelEs} • {item.strengthEvaluation.currentRatio}× BW
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          {muscleAnalysisMode === 'balance' && (
                            <span className="text-zinc-400">
                              <strong className="text-accent">{item.sets}</strong> {t('workout.sets')} •{' '}
                              {displayWeight(item.volumeKg, preferences.units).toLocaleString(locale)} {weightUnit}
                            </span>
                          )}

                          {muscleAnalysisMode === 'fatigue' && (
                            <div>
                              <span
                                className={`font-bold block ${
                                  item.recoveryStatus === 'fatigued'
                                    ? 'text-rose-400'
                                    : item.recoveryStatus === 'recovering'
                                    ? 'text-amber-400'
                                    : 'text-accent'
                                }`}
                              >
                                {item.recoveryStatus === 'fatigued'
                                  ? t('stats.highFatigue')
                                  : item.recoveryStatus === 'recovering'
                                  ? t('stats.recovering')
                                  : t('stats.ready')}{' '}
                                <span className="text-zinc-500 font-normal text-[10px]">
                                  ({item.fatigueScore} pts)
                                </span>
                              </span>
                              <span className="text-zinc-500 font-normal text-[10px] block">
                                {item.lastTrainedHoursAgo !== null
                                  ? t('stats.hoursAgo', { hours: item.lastTrainedHoursAgo, sets: item.recentHardSetsCount })
                                  : t('stats.rested')}
                              </span>
                            </div>
                          )}

                          {muscleAnalysisMode === 'strength' && (
                            <div>
                              <span className="text-white font-bold block">
                                {item.topEst1RmKg > 0 ? formatDisplayWeight(item.topEst1RmKg, preferences.units) : t('stats.noData')}
                              </span>
                              {item.strengthEvaluation?.nextTier && item.strengthEvaluation.kgToNextTier !== null ? (
                                <span className="text-purple-400 text-[10px] block truncate">
                                  +{formatDisplayWeight(item.strengthEvaluation.kgToNextTier, preferences.units)} → {item.strengthEvaluation.nextTierLabelEs}
                                </span>
                              ) : item.strengthEvaluation?.tier === 'elite' ? (
                                <span className="text-accent font-bold text-[10px] flex items-center justify-end gap-1">
                                  <span>{t('stats.maxRank')}</span>
                                  <Sparkles className="w-3.5 h-3.5 text-accent inline" />
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 2. SECCIÓN: PROGRESO POR EJERCICIO                                        */}
      {/* ------------------------------------------------------------------------- */}
      <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle shadow-card transition-colors hover:border-border-active">
        <button
          type="button"
          onClick={() => toggleSection('exercise')}
          aria-expanded={openSection === 'exercise'}
          aria-controls={sectionPanelIds.exercise}
          className="flex min-h-16 w-full items-center justify-between p-4 text-left transition-[transform,background-color] duration-100 ease-out hover:bg-surface-active active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-text-primary">
                {t('stats.exerciseProgressTitle')}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                {t('stats.exerciseProgressDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {bestAllTimeEstimate > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent/15 text-accent border border-accent/25 shrink-0">
                PR: {formatDisplayWeight(bestAllTimeEstimate, preferences.units)}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-muted transition-transform duration-200 ${
                openSection === 'exercise' ? 'rotate-180 text-accent' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'exercise' && (
          <div id={sectionPanelIds.exercise} className="space-y-4 border-t border-border-subtle p-4 pt-1 animate-in fade-in duration-200">
            {exercisesWithHistory.length === 0 ? (
              <EmptyState title={t('stats.noHistory')} description={t('stats.completeSets')} icon={<TrendingUp className="size-5" />} />
            ) : (<>
            <ExercisePicker
              history={history}
              label={t('stats.selectExercise')}
              value={currentExerciseId}
              exercises={exercisesWithHistory}
              onChange={setSelectedExId}
            />

            {/* Metric Switcher: [ Top Set | 1RM Est. | RIR ] */}
            <div className="p-1 rounded-2xl glass-subcard border border-white/[0.04] grid grid-cols-3 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setExMetric('top')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'top'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t('stats.topSet', { unit: weightUnit })}
              </button>
              <button
                type="button"
                onClick={() => setExMetric('e1rm')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'e1rm'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t('stats.estimated1rm')}
              </button>
              <button
                type="button"
                onClick={() => setExMetric('rir')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'rir'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t('stats.rirEffort')}
              </button>
            </div>

            {/* Gráfica SVG */}
            <div className="pt-2">
              <LineChart
                points={exerciseChartPoints}
                height={150}
                unit={exMetric === 'rir' ? 'RIR' : weightUnit}
                color={exMetric === 'rir' ? '#F59E0B' : 'var(--accent-color)'}
                invertY={exMetric === 'rir'}
              />
            </div>

            {/* Tabla de Sesiones Recientes */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {t('stats.recentSessionHistory')}
              </h3>

              {exerciseSeries.length === 0 ? (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  {t('stats.noExerciseSets')}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {[...exerciseSeries].reverse().slice(0, 5).map((point, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 px-3 rounded-2xl bg-black/40 border border-white/[0.04] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono text-zinc-400 block text-[11px]">
                          {new Date(point.timestamp).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </span>
                        <span className="font-bold text-white text-sm font-mono mt-0.5">
                          {point.label}
                        </span>
                      </div>
                      <div className="text-right">
                        {point.est1Rm && (
                          <span className="text-sky-400 font-mono font-bold text-xs block">
                            1RM: {formatDisplayWeight(point.est1Rm, preferences.units)}
                          </span>
                        )}
                        {point.avgRir !== null && (
                          <span className="text-zinc-500 font-mono text-[10px]">
                            RIR prom: {point.avgRir}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>)}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 3. SECCIÓN: CONSISTENCIA & CALENDARIO                                     */}
      {/* ------------------------------------------------------------------------- */}
      <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle shadow-card transition-colors hover:border-border-active">
        <button
          type="button"
          onClick={() => toggleSection('consistency')}
          aria-expanded={openSection === 'consistency'}
          aria-controls={sectionPanelIds.consistency}
          className="flex min-h-16 w-full items-center justify-between p-4 text-left transition-[transform,background-color] duration-100 ease-out hover:bg-surface-active active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-text-primary">
                {t('stats.consistencyTitle')}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                {t('stats.consistencyDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.04] text-zinc-300 border border-white/[0.06] shrink-0">
              {t('stats.sessionCount', { count: history.length })}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-muted transition-transform duration-200 ${
                openSection === 'consistency' ? 'rotate-180 text-accent' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'consistency' && (
          <div id={sectionPanelIds.consistency} className="space-y-4 border-t border-border-subtle p-4 pt-1 animate-in fade-in duration-200">
            {/* Mapa de Calor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                  {t('stats.activity32')}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {history.length} sesiones registradas
                </span>
              </div>
              <ActivityHeatmap
                history={history}
                onSelectDate={(_d, session) => {
                  if (session) setInspectingSession(session);
                }}
              />
            </div>

            {/* Listado Reciente de Entrenamientos */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase block">
                {t('stats.recentWorkouts')}
              </span>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {history.slice(0, 10).map((session) => {
                  const vol = calculateSessionTotalVolume(session);
                  const totalSets = Object.values(session.sets).reduce(
                    (acc, sList) => acc + sList.filter((s) => s.completed).length,
                    0
                  );

                  return (
                    <div
                      key={session.id}
                      onClick={() => setInspectingSession(session)}
                      className="p-3 rounded-2xl glass-subcard hover:border-white/20 transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]"
                    >
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {session.routineName}
                        </span>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {new Date(session.startedAt).toLocaleDateString(locale, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}{' '}
                          • {totalSets} {t('workout.sets')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-accent">
                          {displayWeight(vol, preferences.units).toLocaleString(locale)} {weightUnit}
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 4. SECCIÓN: PESO CORPORAL & META                                          */}
      {/* ------------------------------------------------------------------------- */}
      <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle shadow-card transition-colors hover:border-border-active">
        <button
          type="button"
          onClick={() => toggleSection('bodyweight')}
          aria-expanded={openSection === 'bodyweight'}
          aria-controls={sectionPanelIds.bodyweight}
          className="flex min-h-16 w-full items-center justify-between p-4 text-left transition-[transform,background-color] duration-100 ease-out hover:bg-surface-active active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-text-primary">
                {t('stats.bodyweightTitle')}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                {t('stats.bodyweightDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.04] text-zinc-300 border border-white/[0.06] shrink-0">
              {bodyweightEntries.length > 0 ? formatDisplayWeight(bodyweightEntries[bodyweightEntries.length - 1].weightKg, preferences.bodyweightUnits) : '—'}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-muted transition-transform duration-200 ${
                openSection === 'bodyweight' ? 'rotate-180 text-accent' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'bodyweight' && (
          <div id={sectionPanelIds.bodyweight} className="space-y-4 border-t border-border-subtle p-4 pt-1 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                {t('stats.weightSummary')}
              </span>
              <button
                onClick={() => setIsBwModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-accent text-accent-fg font-bold text-xs flex items-center gap-1 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                {t('weight.log')}
              </button>
            </div>

            {bodyweightEntries.length === 0 ? (
              <EmptyState title={t('weight.empty')} description={t('weight.emptyDescription')} icon={<Scale className="size-5" />} actionLabel={t('weight.log')} onAction={() => setIsBwModalOpen(true)} />
            ) : (<>
            {/* Metric Banner */}
            <div className="grid grid-cols-3 gap-2 p-3 glass-subcard rounded-2xl text-center">
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">{t('stats.latestWeight')}</span>
                <span className="text-base font-extrabold text-white font-mono">
                  {bodyweightEntries.length > 0 ? formatDisplayWeight(bodyweightEntries[bodyweightEntries.length - 1].weightKg, preferences.bodyweightUnits) : '—'}
                </span>
              </div>
              <div className="border-x border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 font-mono block">{t('stats.goal')}</span>
                <span className="text-base font-extrabold text-accent font-mono">
                  {targetWeight ? formatDisplayWeight(targetWeight, preferences.bodyweightUnits) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">{t('stats.delta30')}</span>
                <span
                  className={`text-base font-extrabold font-mono ${
                    bw30DayDelta && bw30DayDelta < 0 ? 'text-accent' : 'text-zinc-300'
                  }`}
                >
                  {bw30DayDelta !== null ? `${bw30DayDelta > 0 ? '+' : ''}${bw30DayDelta} ${bodyweightUnit}` : '—'}
                </span>
              </div>
            </div>

            {/* LineChart con Meta */}
            <div className="pt-2">
              <LineChart
                points={bwChartPoints}
                height={160}
                unit={bodyweightUnit}
                color="var(--accent-color)"
                goal={targetWeight === null ? null : displayWeight(targetWeight, preferences.bodyweightUnits)}
              />
            </div>
            </>)}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 5. SECCIÓN: CALCULADORA 1RM PERSONALIZADA                                 */}
      {/* ------------------------------------------------------------------------- */}
      <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle shadow-card transition-colors hover:border-border-active">
        <button
          type="button"
          onClick={() => toggleSection('calculator')}
          aria-expanded={openSection === 'calculator'}
          aria-controls={sectionPanelIds.calculator}
          className="flex min-h-16 w-full items-center justify-between p-4 text-left transition-[transform,background-color] duration-100 ease-out hover:bg-surface-active active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-text-primary">
                {t('stats.calculatorTitle')}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                {t('stats.calculatorDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/25 shrink-0">
              {formatDisplayWeight(estimate.average, preferences.units)}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-muted transition-transform duration-200 ${
                openSection === 'calculator' ? 'rotate-180 text-accent' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'calculator' && (
          <div id={sectionPanelIds.calculator} className="space-y-4 border-t border-border-subtle p-4 pt-1 animate-in fade-in duration-200">
            {/* 1. Selector de Ejercicio */}
            <ExercisePicker
              history={history}
              label={t('stats.calcExercise')}
              value={currentCalcExerciseId}
              exercises={calcExerciseOptions}
              onChange={setCalcExerciseId}
            />

            {/* 2. Banner de Récord Personal Histórico del Usuario (PR) */}
            {lastTopSet ? (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-mono font-bold text-amber-400 block">
                      {t('stats.lastTopSet')}
                    </span>
                    <span className="text-xs text-white font-bold block truncate">
                      {formatDisplayWeight(lastTopSet.weightKg, preferences.units)} × {lastTopSet.reps} reps{' '}
                      <span className="text-amber-300 font-normal">
                        (1RM ~{formatDisplayWeight(lastTopSet.estimatedOneRm, preferences.units)})
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCalcWeight(lastTopSet.weightKg);
                    setCalcReps(lastTopSet.reps);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500 text-black font-extrabold text-xs hover:bg-amber-400 active:scale-95 transition-all cursor-pointer shrink-0 shadow-sm"
                >
                  {t('stats.useValues')}
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-400">
                {t('stats.noCalcHistory')}
              </div>
            )}

            {/* 3. Tarjeta de Estándar Biométrico y Nivel de Fuerza (StrengthLevel) */}
            {userStrengthEval && (
              <div className="p-3.5 rounded-2xl glass-subcard border border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-3xl shrink-0" title={userStrengthEval.tierLabelEs}>
                    {userStrengthEval.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        {userStrengthEval.tierLabelEs}
                      </span>
                      <span
                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: `${userStrengthEval.color}20`,
                          borderColor: `${userStrengthEval.color}40`,
                          color: userStrengthEval.color
                        }}
                      >
                        {t('stats.bodyweightRatio', { ratio: userStrengthEval.currentRatio })}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono block mt-0.5">
                      {t('stats.biometricBase', { weight: formatDisplayWeight(currentBodyweightKg ?? 0, preferences.bodyweightUnits), gender: currentGender === 'male' ? t('stats.male') : t('stats.female') })}
                    </span>
                  </div>
                </div>

                {userStrengthEval.nextTier && userStrengthEval.kgToNextTier !== null && (
                  <div className="text-right font-mono shrink-0">
                    <span className="text-[10px] text-zinc-500 block">{t('stats.nextLevel')}</span>
                    <span className="text-xs font-bold text-accent">
                      +{formatDisplayWeight(userStrengthEval.kgToNextTier, preferences.units)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 4. Inputs con Botones de Ajuste Rápido (+/- 2.5 kg, +/- 1 rep) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.06]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold">
                    {t('stats.loadKg', { unit: weightUnit })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCalcWeight((w) => Math.max(0, Math.round((w - calculatorStepKg) * 100) / 100))}
                      className="w-5 h-5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 flex items-center justify-center cursor-pointer text-xs font-mono font-bold active:scale-90 transition-transform"
                      title={`-${displayWeight(calculatorStepKg, preferences.units)} ${weightUnit}`}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalcWeight((w) => Math.round((w + calculatorStepKg) * 100) / 100)}
                      className="w-5 h-5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 flex items-center justify-center cursor-pointer text-xs font-mono font-bold active:scale-90 transition-transform"
                      title={`+${displayWeight(calculatorStepKg, preferences.units)} ${weightUnit}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step={preferences.units === 'imperial' ? 5 : 2.5}
                  value={displayWeight(calcWeight, preferences.units)}
                  onChange={(e) => setCalcWeight(parseDisplayWeight(parseFloat(e.target.value) || 0, preferences.units))}
                  className="w-full bg-transparent font-mono font-bold text-2xl text-white tabular-nums focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.06]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold">
                    {t('stats.repsMax')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCalcReps((r) => Math.max(1, r - 1))}
                      className="w-5 h-5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 flex items-center justify-center cursor-pointer text-xs font-mono font-bold active:scale-90 transition-transform"
                      title="-1 rep"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalcReps((r) => Math.min(12, r + 1))}
                      className="w-5 h-5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 flex items-center justify-center cursor-pointer text-xs font-mono font-bold active:scale-90 transition-transform"
                      title="+1 rep"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={calcReps}
                  onChange={(e) => setCalcReps(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-transparent font-mono font-bold text-2xl text-white tabular-nums focus:outline-none"
                />
              </div>
            </div>

            {calcReps > 12 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                {t('stats.repCap')}
              </div>
            )}

            {/* 5. Comparativa de Fórmulas Teóricas */}
            <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-black/60 border border-white/[0.04]">
              <div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase">Epley</div>
                <div className="text-base font-bold text-white font-mono mt-0.5">{formatDisplayWeight(estimate.epley, preferences.units)}</div>
              </div>
              <div className="border-x border-zinc-800">
                <div className="text-[10px] text-zinc-500 font-mono uppercase">Brzycki</div>
                <div className="text-base font-bold text-white font-mono mt-0.5">{formatDisplayWeight(estimate.brzycki, preferences.units)}</div>
              </div>
              <div>
                <div className="text-[10px] text-accent font-mono uppercase font-bold">{t('stats.consensus')}</div>
                <div className="text-base font-extrabold text-accent font-mono mt-0.5">{formatDisplayWeight(estimate.average, preferences.units)}</div>
              </div>
            </div>

            {/* 6. Desglose de Porcentajes de Entrenamiento (70% - 100%) */}
            <div className="p-3.5 rounded-2xl glass-subcard border border-white/[0.06] space-y-2.5">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                {t('stats.trainingZones', { weight: formatDisplayWeight(estimate.average, preferences.units) })}
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
                {[
                  { pct: 100, reps: '1 rep', label: 'Fuerza Máx' },
                  { pct: 90, reps: '3-4 reps', label: 'Fuerza' },
                  { pct: 80, reps: '7-8 reps', label: 'Hipertrofia' },
                  { pct: 70, reps: '11-12 reps', label: 'Resistencia' }
                ].map((zone) => {
                  const targetKg = Math.round((estimate.average * (zone.pct / 100)) * 2) / 2;
                  return (
                    <div key={zone.pct} className="p-2 rounded-xl bg-black/40 border border-white/[0.04]">
                      <div className="text-[10px] text-zinc-500 font-bold">{zone.pct}%</div>
                      <div className="text-sm font-extrabold text-white my-0.5">{formatDisplayWeight(targetKg, preferences.units)}</div>
                      <div className="text-[9px] text-accent font-semibold">{zone.reps}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALES */}
      <BodyweightModal
        isOpen={isBwModalOpen}
        onClose={() => setIsBwModalOpen(false)}
        currentGoal={targetWeight}
        onSaveWeight={handleSaveWeight}
        onSaveGoal={handleSaveGoal}
      />

      <WorkoutDetailModal
        session={inspectingSession}
        onClose={() => setInspectingSession(null)}
        exercisesById={exercisesById}
      />

      {/* Modal Interactivo de Equivalencias Cotidianas de Tonelaje */}
      <TonnageEquivalenceModal
        isOpen={isTonnageModalOpen}
        onClose={() => setIsTonnageModalOpen(false)}
        totalKg={totalVolumeTonnage}
      />
    </div>
  );
};
