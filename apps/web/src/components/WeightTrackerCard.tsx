import React, { useMemo } from 'react';
import { Plus, Target } from 'lucide-react';
import { BodyweightEntry } from '../lib/storage.js';
import { LineChart, ChartPoint } from './charts/LineChart.js';

interface WeightTrackerCardProps {
  entries: BodyweightEntry[];
  targetWeight: number | null;
  onOpenLogModal: () => void;
  onOpenGoalModal: () => void;
}

export const WeightTrackerCard: React.FC<WeightTrackerCardProps> = ({
  entries,
  targetWeight,
  onOpenLogModal,
  onOpenGoalModal
}) => {
  // Ordenar cronológicamente
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.timestamp - b.timestamp);
  }, [entries]);

  const latestEntry = sortedEntries[sortedEntries.length - 1] || null;

  // Formato del peso actual (ej. 78,7)
  const latestWeightFormatted = latestEntry
    ? latestEntry.weightKg.toFixed(1).replace('.', ',')
    : '--';

  // Formato de fecha del último pesaje (ej. mar, 8 sept)
  const latestDateStr = useMemo(() => {
    if (!latestEntry) return '';
    const d = new Date(latestEntry.timestamp);
    const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    const day = d.getDate();
    const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    return `${weekday}, ${day} ${month}`;
  }, [latestEntry]);

  // Diferencia hacia la meta
  const diffToGoal = latestEntry && targetWeight !== null
    ? Math.round(Math.abs(latestEntry.weightKg - targetWeight) * 10) / 10
    : null;

  const isLosingGoal = latestEntry && targetWeight !== null && targetWeight < latestEntry.weightKg;

  // Puntos para la gráfica
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (sortedEntries.length === 0) return [];
    return sortedEntries.map((e) => ({
      t: e.timestamp,
      y: e.weightKg,
      dateStr: e.date,
      label: `${e.weightKg.toString().replace('.', ',')} kg`
    }));
  }, [sortedEntries]);

  return (
    <div className="p-5 dark-glass-card rounded-[28px] space-y-2 select-none transition-all hover:border-white/15">
      {/* Top row: Label | Target Button | + Registrar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400 font-medium tracking-tight">Peso corporal</span>

        <div className="flex items-center gap-2">
          {targetWeight !== null && (
            <button
              type="button"
              onClick={onOpenGoalModal}
              className="glass-subcard flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-accent hover:border-white/20 active:scale-95 transition-all cursor-pointer rounded-full"
              title="Cambiar meta de peso"
            >
              <Target className="w-3.5 h-3.5 text-accent" />
              <span>{targetWeight.toString().replace('.', ',')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenLogModal}
            className="bg-accent text-accent-fg flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm"
            title="Registrar peso de hoy"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
            <span>Registrar</span>
          </button>
        </div>
      </div>

      {/* Main Stat: 78,7 kg  +  Date on the right */}
      <div className="flex items-baseline justify-between pt-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-extrabold text-white tracking-tight">
            {latestWeightFormatted}
          </span>
          <span className="text-base text-zinc-400 font-normal">kg</span>
        </div>

        <span className="text-xs text-zinc-400 font-normal lowercase">
          {latestDateStr}
        </span>
      </div>

      {/* Subtitle: Meta 77 kg · 1,7 kg por perder */}
      {targetWeight !== null && diffToGoal !== null ? (
        <div
          onClick={onOpenGoalModal}
          className="flex items-center gap-1.5 text-xs text-accent font-medium cursor-pointer hover:underline pt-0.5"
        >
          <Target className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            Meta {targetWeight.toString().replace('.', ',')} kg · {diffToGoal.toString().replace('.', ',')} kg por {isLosingGoal ? 'perder' : 'ganar'}
          </span>
        </div>
      ) : (
        <div
          onClick={onOpenGoalModal}
          className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium cursor-pointer hover:text-white pt-0.5"
        >
          <Target className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Pulsa para definir una meta</span>
        </div>
      )}

      {/* Minimalist SVG Chart matching openGym / dark glassmorphism */}
      <div className="pt-2">
        <LineChart
          points={chartPoints}
          height={130}
          unit="kg"
          color="var(--accent-color, #EAFF55)"
          goal={targetWeight}
        />
      </div>
    </div>
  );
};
