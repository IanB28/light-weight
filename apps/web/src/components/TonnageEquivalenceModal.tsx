import React from 'react';
import { X, Flame, Target, Sparkles } from 'lucide-react';
import { getTonnageEquivalences } from '../lib/tonnage.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';

interface TonnageEquivalenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalKg: number;
}

export const TonnageEquivalenceModal: React.FC<TonnageEquivalenceModalProps> = ({
  isOpen,
  onClose,
  totalKg
}) => {
  const { preferences } = usePreferences();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  if (!isOpen) return null;

  const data = getTonnageEquivalences(totalKg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="tonnage-title" className="relative w-full max-w-md dark-glass-card border border-white/[0.1] rounded-[28px] shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Glow de fondo atmosférico */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-48 h-48 bg-accent/20 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-accent text-accent-fg flex items-center justify-center shadow-lg shadow-accent/30 font-bold shrink-0">
              <Flame className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-accent">
                VOLUMEN TOTAL ACUMULADO
              </span>
              <h3 id="tonnage-title" className="text-xl font-black text-white tracking-tight leading-tight">
                Equivalencias de Tonelaje
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar equivalencias de tonelaje"
            className="flex size-11 shrink-0 items-center justify-center rounded-full glass-subcard text-zinc-400 transition-all hover:border-white/20 hover:text-white active:scale-[0.96]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenedor con scroll para pantallas pequeñas */}
        <div className="space-y-4 overflow-y-auto pr-0.5 scrollbar-none flex-1">
          {/* Tarjeta Principal Destacada */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/20 via-accent/5 to-transparent border border-accent/30 shadow-inner space-y-2 text-center">
            <div className="text-3xl sm:text-4xl animate-bounce">
              {data.primary.icon}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
              {displayWeight(data.totalKg, preferences.units).toLocaleString()} <span className="text-sm font-normal text-zinc-400">{weightUnit}</span>
              <span className="text-xs text-zinc-400 font-normal ml-2">({data.totalTonnes} t)</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-accent">
              {data.primary.sentence}
            </p>
          </div>

          {/* Próximo Hito de Carga */}
          <div className="p-3.5 rounded-2xl glass-subcard border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Target className="w-3.5 h-3.5 text-accent" />
                <span>Próximo Hito: {data.nextMilestone.name}</span>
              </span>
              <span className="text-accent font-mono font-bold">
                {data.nextMilestone.progressPercent}%
              </span>
            </div>

            {/* Barra de Progreso */}
            <div className="w-full h-2 rounded-full bg-zinc-900 border border-white/[0.06] overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500 shadow-[0_0_8px_var(--accent-glow)]"
                style={{ width: `${data.nextMilestone.progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <span>{displayWeight(data.totalKg, preferences.units).toLocaleString()} {weightUnit}</span>
              <span>
                Faltan {displayWeight(data.nextMilestone.remainingKg, preferences.units).toLocaleString()} {weightUnit} para {displayWeight(data.nextMilestone.targetKg, preferences.units).toLocaleString()} {weightUnit}
              </span>
            </div>
          </div>

          {/* Cuadrícula de Relaciones Cotidianas */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Comparaciones del Mundo Real
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Peso × Reps
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {data.breakdown.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl glass-subcard border border-white/[0.06] flex flex-col justify-between hover:border-white/15 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-xs font-bold font-mono text-accent">
                      ~{item.countFormatted}
                    </span>
                  </div>

                  <div className="mt-2 min-w-0">
                    <h4 className="text-xs font-bold text-white tracking-tight truncate">
                      {item.name}
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                      {displayWeight(item.unitKg, preferences.units).toLocaleString()} {weightUnit} c/u
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-[11px] text-zinc-400 leading-relaxed">
            💡 <strong className="text-zinc-200">¿Cómo se calcula?</strong> Cada serie completada suma el peso levantado multiplicado por las repeticiones ejecutadas. Este tonelaje es el trabajo mecánico acumulado por tus músculos.
          </div>
        </div>

        {/* Botón de Cierre */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-accent text-accent-fg font-extrabold text-sm hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-accent/20"
        >
          ¡Seguir Levantando!
        </button>
      </div>
    </div>
  );
};
