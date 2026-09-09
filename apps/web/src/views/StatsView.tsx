import React, { useState, useMemo } from 'react';
import {
  Activity,
  Calculator,
  Flame,
  Scale,
  Calendar,
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
  TrendingUp,
  Shield,
  Zap
} from 'lucide-react';
import {
  estimateOneRm,
  calculateSessionTotalVolume,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  calculateMuscleFatigue,
  evaluateRelativeStrength,
  Gender,
  WorkoutSession,
  Exercise,
  MuscleGroup
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
import {
  AnatomicalBodyMap,
  AnalysisMode,
  MuscleAnalytics,
  SPANISH_MUSCLE_NAMES
} from '../components/charts/AnatomicalBodyMap.js';

interface StatsViewProps {
  history?: WorkoutSession[];
  exercises?: Exercise[];
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

export const StatsView: React.FC<StatsViewProps> = ({ history = [], exercises = [] }) => {
  // Collapsible Accordion Sections State
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    muscles: true,
    exercise: true,
    consistency: false,
    bodyweight: false,
    calculator: false
  });

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // User Profile (Gender & Preferences)
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile());
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
      : 75.0;
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
        const completed = sets.filter((s) => s.completed && !s.isWarmup);
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
      const strengthEvaluation = evaluateRelativeStrength(
        muscle,
        strInfo.top1Rm,
        currentBodyweightKg,
        currentGender
      );

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
    return list.length > 0 ? list : exercises.slice(0, 5);
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
        let yVal = p.topWeightKg;
        if (exMetric === 'e1rm') yVal = p.est1Rm || p.topWeightKg;
        if (exMetric === 'rir') yVal = p.avgRir !== null ? p.avgRir : 2;

        return {
          t: p.timestamp,
          y: yVal,
          dateStr: p.date,
          label: `${p.topWeightKg} kg × ${p.sets[0]?.reps || 0} (${p.sets.length} series)`
        };
      })
      .filter((p) => Number.isFinite(p.y));
  }, [exerciseSeries, exMetric]);

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
      y: b.weightKg,
      dateStr: b.date
    }));
  }, [bodyweightEntries]);

  const bw30DayDelta = useMemo(() => {
    if (bodyweightEntries.length < 2) return null;
    const latest = bodyweightEntries[bodyweightEntries.length - 1].weightKg;
    const past = bodyweightEntries[0].weightKg;
    return Math.round((latest - past) * 10) / 10;
  }, [bodyweightEntries]);

  // =========================================================================
  // 4. CALCULADORA 1RM
  // =========================================================================
  const [calcWeight, setCalcWeight] = useState(100);
  const [calcReps, setCalcReps] = useState(6);
  const estimate = estimateOneRm(calcWeight, calcReps);

  // Total tonnage
  const totalVolumeTonnage = useMemo(() => {
    return history.reduce((sum, s) => sum + calculateSessionTotalVolume(s), 0);
  }, [history]);

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
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Estadísticas</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Analítica de rendimiento, fatiga fisiológica y fuerza relativa
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-bold">
          <Flame className="w-3.5 h-3.5" />
          <span>{totalVolumeTonnage.toLocaleString()} kg</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIONES DESPLEGABLES (ACCORDION TABS)                                    */}
      {/* ========================================================================= */}

      {/* ------------------------------------------------------------------------- */}
      {/* 1. SECCIÓN: MÚSCULOS, FATIGA & FORTALEZA                                  */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] overflow-hidden transition-all shadow-2xl shadow-black/60 relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
        <button
          type="button"
          onClick={() => toggleSection('muscles')}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-100 ease-out"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                Músculos, Fatiga & Fortaleza
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Distribución anatómica, recuperación ponderada y nivel StrengthLevel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {muscleAnalysis.neglected.length > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {muscleAnalysis.neglected.length} descuidados
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                11 activos
              </span>
            )}
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
                openSections.muscles ? 'rotate-180 text-emerald-400' : ''
              }`}
            />
          </div>
        </button>

        {openSections.muscles && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.04] animate-in fade-in duration-200">
            {/* Barra de Perfil Biométrico: Género y Peso Corporal */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                ESTÁNDARES DE FUERZA
              </span>
              <div className="flex items-center gap-1 bg-zinc-900 border border-white/[0.08] p-0.5 rounded-xl text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleGenderChange('male')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    currentGender === 'male'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  ♂ Hombre
                </button>
                <button
                  type="button"
                  onClick={() => handleGenderChange('female')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    currentGender === 'female'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  ♀ Mujer
                </button>
                <span className="text-zinc-700 px-1">|</span>
                <span className="text-zinc-300 font-bold px-1.5">{currentBodyweightKg} kg</span>
              </div>
            </div>

            {/* Segmented Switcher: [ Equilibrio | Fatiga | Fortaleza ] */}
            <div className="p-1 rounded-2xl bg-zinc-900/90 border border-white/[0.06] grid grid-cols-3 gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMuscleAnalysisMode('balance');
                  setSelectedMuscle(null);
                }}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  muscleAnalysisMode === 'balance'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Equilibrio</span>
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
                <span>Fatiga</span>
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
                <span>Fortaleza</span>
              </button>
            </div>

            {/* Selector de Ventana de Tiempo (Sólo relevante para Balance) */}
            {muscleAnalysisMode === 'balance' && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                  VENTANA TEMPORAL
                </span>
                <div className="flex gap-1 text-xs">
                  {[
                    { days: 7, label: '7 Días' },
                    { days: 30, label: '30 Días' },
                    { days: 90, label: '90 Días' },
                    { days: 0, label: 'Histórico' }
                  ].map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setMuscleWindow(opt.days)}
                      className={`px-2.5 py-1 rounded-xl font-bold font-mono text-[11px] transition-all cursor-pointer ${
                        muscleWindow === opt.days
                          ? 'bg-zinc-800 text-white border border-white/[0.1]'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
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

            {/* Subsección A: Músculos Descuidados (en modo Equilibrio) */}
            {muscleAnalysisMode === 'balance' && muscleAnalysis.neglected.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Músculos no entrenados en este período</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  No tienes series registradas para estos grupos en los últimos{' '}
                  {muscleWindow === 0 ? 'meses' : `${muscleWindow} días`}:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {muscleAnalysis.neglected.map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedMuscle(m)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 capitalize hover:bg-amber-500/30 transition-all cursor-pointer"
                    >
                      {SPANISH_MUSCLE_NAMES[m] || m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Subsección B: Lista de Ranking según el modo */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {muscleAnalysisMode === 'balance'
                  ? 'Series Efectivas por Grupo'
                  : muscleAnalysisMode === 'fatigue'
                  ? 'Carga de Fatiga Fisiológica y Recuperación'
                  : 'Insignias de Fuerza Relativa (StrengthLevel)'}
              </h3>

              <div className="space-y-1.5">
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
                      <div className="flex items-center gap-2.5">
                        {muscleAnalysisMode === 'strength' && item.strengthEvaluation && (
                          <span className="text-base" title={item.strengthEvaluation.tierLabelEs}>
                            {item.strengthEvaluation.emoji}
                          </span>
                        )}

                        {muscleAnalysisMode !== 'strength' && (
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              muscleAnalysisMode === 'fatigue'
                                ? item.recoveryStatus === 'fatigued'
                                  ? 'bg-rose-500'
                                  : item.recoveryStatus === 'recovering'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                                : item.sets > 0
                                ? 'bg-emerald-500'
                                : 'bg-zinc-700'
                            }`}
                          />
                        )}

                        <div>
                          <span className="font-bold text-white capitalize block">
                            {item.nameEs}
                          </span>
                          {muscleAnalysisMode === 'strength' && item.strengthEvaluation && (
                            <span
                              className="text-[10px] font-mono font-bold"
                              style={{ color: item.strengthEvaluation.color }}
                            >
                              {item.strengthEvaluation.tierLabelEs} • {item.strengthEvaluation.currentRatio}× BW
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        {muscleAnalysisMode === 'balance' && (
                          <span className="text-zinc-400">
                            <strong className="text-emerald-400">{item.sets}</strong> series •{' '}
                            {item.volumeKg.toLocaleString()} kg
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
                                  : 'text-emerald-400'
                              }`}
                            >
                              {item.recoveryStatus === 'fatigued'
                                ? 'Fatiga Alta'
                                : item.recoveryStatus === 'recovering'
                                ? 'Adaptando'
                                : 'Listo'}{' '}
                              <span className="text-zinc-500 font-normal text-[10px]">
                                ({item.fatigueScore} pts)
                              </span>
                            </span>
                            <span className="text-zinc-500 font-normal text-[10px] block">
                              {item.lastTrainedHoursAgo !== null
                                ? `Hace ${item.lastTrainedHoursAgo}h (${item.recentHardSetsCount} duras)`
                                : 'Descansado'}
                            </span>
                          </div>
                        )}

                        {muscleAnalysisMode === 'strength' && (
                          <div>
                            <span className="text-white font-bold block">
                              {item.topEst1RmKg > 0 ? `${item.topEst1RmKg} kg` : 'Sin datos'}
                            </span>
                            {item.strengthEvaluation?.nextTier && item.strengthEvaluation.kgToNextTier !== null ? (
                              <span className="text-purple-400 text-[10px] block">
                                +{item.strengthEvaluation.kgToNextTier} kg p/ {item.strengthEvaluation.nextTierLabelEs}
                              </span>
                            ) : item.strengthEvaluation?.tier === 'elite' ? (
                              <span className="text-purple-400 font-bold text-[10px] block">
                                Rango Máximo 💎
                              </span>
                            ) : null}
                          </div>
                        )}
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
      {/* 2. SECCIÓN: PROGRESO POR EJERCICIO                                        */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] overflow-hidden transition-all shadow-2xl shadow-black/60 relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
        <button
          type="button"
          onClick={() => toggleSection('exercise')}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-100 ease-out"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                Progreso por Ejercicio
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Curvas de sobrecarga progresiva, 1RM estimado y RIR
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {bestAllTimeEstimate > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25">
                PR: {bestAllTimeEstimate} kg
              </span>
            )}
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
                openSections.exercise ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </div>
        </button>

        {openSections.exercise && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.04] animate-in fade-in duration-200">
            {/* Dropdown Selector de Ejercicio */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase block">
                SELECCIONA EL EJERCICIO
              </label>
              <select
                value={currentExerciseId}
                onChange={(e) => setSelectedExId(e.target.value)}
                className="w-full py-2.5 px-3 rounded-2xl bg-zinc-900 border border-white/[0.08] text-white font-bold text-sm focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {exercisesWithHistory.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Metric Switcher: [ Top Set | 1RM Est. | RIR ] */}
            <div className="p-1 rounded-2xl bg-zinc-900/80 border border-white/[0.04] grid grid-cols-3 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setExMetric('top')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'top'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Top Set (kg)
              </button>
              <button
                type="button"
                onClick={() => setExMetric('e1rm')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'e1rm'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                1RM Est.
              </button>
              <button
                type="button"
                onClick={() => setExMetric('rir')}
                className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  exMetric === 'rir'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Esfuerzo RIR
              </button>
            </div>

            {/* Gráfica SVG */}
            <div className="pt-2">
              <LineChart
                points={exerciseChartPoints}
                height={150}
                unit={exMetric === 'rir' ? 'RIR' : 'kg'}
                color={exMetric === 'rir' ? '#F59E0B' : '#38BDF8'}
                invertY={exMetric === 'rir'}
              />
            </div>

            {/* Tabla de Sesiones Recientes */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Historial de Sesiones Recientes
              </h3>

              {exerciseSeries.length === 0 ? (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  Aún no has registrado series para este ejercicio.
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
                          {new Date(point.timestamp).toLocaleDateString('es-ES', {
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
                            1RM: {point.est1Rm} kg
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
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 3. SECCIÓN: CONSISTENCIA & CALENDARIO                                     */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] overflow-hidden transition-all shadow-2xl shadow-black/60 relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
        <button
          type="button"
          onClick={() => toggleSection('consistency')}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-100 ease-out"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                Consistencia & Calendario
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Mapa anual de entrenamientos y registro histórico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.04] text-zinc-300 border border-white/[0.06]">
              {history.length} sesiones
            </span>
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
                openSections.consistency ? 'rotate-180 text-emerald-400' : ''
              }`}
            />
          </div>
        </button>

        {openSections.consistency && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.04] animate-in fade-in duration-200">
            {/* Mapa de Calor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                  ACTIVIDAD EN LAS ÚLTIMAS 32 SEMANAS
                </span>
              </div>
              <ActivityHeatmap
                history={history}
                onSelectDate={(_dateStr, session) => {
                  if (session) setInspectingSession(session);
                }}
              />
            </div>

            {/* Listado de Entrenamientos Completados */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Entrenamientos Completados ({history.length})
              </h3>

              <div className="space-y-1.5">
                {history.map((session) => {
                  const vol = calculateSessionTotalVolume(session);
                  const totalSets = Object.values(session.sets).reduce(
                    (acc, sList) => acc + sList.filter((s) => s.completed).length,
                    0
                  );

                  return (
                    <div
                      key={session.id}
                      onClick={() => setInspectingSession(session)}
                      className="p-3 rounded-2xl bg-black/40 hover:bg-zinc-800/60 border border-white/[0.04] flex items-center justify-between cursor-pointer transition-all active:scale-98"
                    >
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {session.routineName || 'Entrenamiento Libre'}
                        </h4>
                        <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          {new Date(session.startedAt).toLocaleDateString('es-ES', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}{' '}
                          • {totalSets} series
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {vol.toLocaleString()} kg
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
      <div className="rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] overflow-hidden transition-all shadow-2xl shadow-black/60 relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
        <button
          type="button"
          onClick={() => toggleSection('bodyweight')}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-100 ease-out"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                Peso Corporal & Meta
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Evolución de peso corporal y distancia a tu objetivo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.04] text-zinc-300 border border-white/[0.06]">
              {bodyweightEntries[bodyweightEntries.length - 1]?.weightKg || '—'} kg
            </span>
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
                openSections.bodyweight ? 'rotate-180 text-amber-400' : ''
              }`}
            />
          </div>
        </button>

        {openSections.bodyweight && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.04] animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                RESUMEN DE PESO
              </span>
              <button
                onClick={() => setIsBwModalOpen(true)}
                className="px-3 py-1 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center gap-1 active:scale-95 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                Registrar peso
              </button>
            </div>

            {/* Metric Banner */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 border border-white/[0.04] rounded-2xl text-center">
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">Último Peso</span>
                <span className="text-base font-extrabold text-white font-mono">
                  {bodyweightEntries[bodyweightEntries.length - 1]?.weightKg || '—'} kg
                </span>
              </div>
              <div className="border-x border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 font-mono block">Meta</span>
                <span className="text-base font-extrabold text-amber-400 font-mono">
                  {targetWeight ? `${targetWeight} kg` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">Delta 30d</span>
                <span
                  className={`text-base font-extrabold font-mono ${
                    bw30DayDelta && bw30DayDelta < 0 ? 'text-emerald-400' : 'text-zinc-300'
                  }`}
                >
                  {bw30DayDelta !== null ? `${bw30DayDelta > 0 ? '+' : ''}${bw30DayDelta} kg` : '—'}
                </span>
              </div>
            </div>

            {/* LineChart con Meta */}
            <div className="pt-2">
              <LineChart
                points={bwChartPoints}
                height={160}
                unit="kg"
                color="#F59E0B"
                goal={targetWeight}
              />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 5. SECCIÓN: CALCULADORA 1RM                                               */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] overflow-hidden transition-all shadow-2xl shadow-black/60 relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
        <button
          type="button"
          onClick={() => toggleSection('calculator')}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-100 ease-out"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                Calculadora 1RM
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Estimador de fuerza máxima teórica (Epley, Brzycki y Lombardi)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.04] text-zinc-300 border border-white/[0.06]">
              {estimate.average} kg
            </span>
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
                openSections.calculator ? 'rotate-180 text-purple-400' : ''
              }`}
            />
          </div>
        </button>

        {openSections.calculator && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.04] animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 block uppercase font-mono">Carga (kg)</span>
                <input
                  type="number"
                  value={calcWeight}
                  onChange={(e) => setCalcWeight(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono font-bold text-xl text-white tabular-nums focus:outline-none mt-1"
                />
              </div>
              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 block uppercase font-mono">Reps (Máx 12)</span>
                <input
                  type="number"
                  max={12}
                  value={calcReps}
                  onChange={(e) => setCalcReps(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-transparent font-mono font-bold text-xl text-white tabular-nums focus:outline-none mt-1"
                />
              </div>
            </div>

            {calcReps > 12 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                openGym descarta estimaciones de más de 12 repeticiones porque miden resistencia y no fuerza máxima.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-black/60 border border-white/[0.04]">
              <div>
                <div className="text-[10px] text-zinc-500 font-mono">Epley</div>
                <div className="text-base font-bold text-white font-mono">{estimate.epley} kg</div>
              </div>
              <div className="border-x border-zinc-800">
                <div className="text-[10px] text-zinc-500 font-mono">Brzycki</div>
                <div className="text-base font-bold text-white font-mono">{estimate.brzycki} kg</div>
              </div>
              <div>
                <div className="text-[10px] text-purple-400 font-mono">Promedio</div>
                <div className="text-base font-bold text-purple-400 font-mono">{estimate.average} kg</div>
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
    </div>
  );
};
