import React, { useState } from 'react';
import { estimateOneRm, calculateVolume, type LoggedSet } from '@light-weight/domain';
import { cn } from '@light-weight/ui';
import { Dumbbell, Activity, ShieldCheck, Flame } from 'lucide-react';

export default function App() {
  const [weight, setWeight] = useState<number>(100);
  const [reps, setReps] = useState<number>(5);

  const oneRm = estimateOneRm(weight, reps);

  const sampleSets: LoggedSet[] = [
    { setIndex: 1, weightKg: weight, reps: reps, completed: true, isWarmup: false },
    { setIndex: 2, weightKg: weight, reps: Math.max(1, reps - 1), completed: true, isWarmup: false },
    { setIndex: 3, weightKg: weight, reps: Math.max(1, reps - 2), completed: true, isWarmup: false }
  ];

  const totalVolume = calculateVolume(sampleSets);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-6 sm:p-10 font-sans">
      <header className="w-full max-w-3xl flex items-center justify-between pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              light-weight
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">F&F</span>
            </h1>
            <p className="text-xs text-zinc-400">Private Gym Tracker • Domain Engine Active</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Operator Access Only</span>
        </div>
      </header>

      <main className="w-full max-w-3xl mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1RM Calculator & Domain Test Card */}
        <section className={cn("p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-5 shadow-xl")}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              1RM Estimator (@light-weight/domain)
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Weight (kg)</label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Reps completed</label>
              <input
                type="number"
                value={reps}
                onChange={(e) => setReps(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-center">
            <div>
              <div className="text-xs text-zinc-500 font-mono">Epley</div>
              <div className="text-lg font-bold text-white font-mono">{oneRm.epley} kg</div>
            </div>
            <div className="border-x border-zinc-800">
              <div className="text-xs text-zinc-500 font-mono">Brzycki</div>
              <div className="text-lg font-bold text-white font-mono">{oneRm.brzycki} kg</div>
            </div>
            <div>
              <div className="text-xs text-emerald-400 font-mono">Average 1RM</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{oneRm.average} kg</div>
            </div>
          </div>
        </section>

        {/* Volume & Progression Preview Card */}
        <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-5 shadow-xl justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                Session Volume Preview
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Calculates pure tonnage using the shared domain engine:
            </p>
            <div className="mt-4 space-y-2">
              {sampleSets.map((s) => (
                <div key={s.setIndex} className="flex justify-between items-center text-xs py-1.5 px-3 rounded bg-zinc-950 border border-zinc-800/60">
                  <span className="text-zinc-400">Set {s.setIndex}</span>
                  <span className="font-mono text-zinc-300">{s.weightKg} kg × {s.reps} reps</span>
                  <span className="font-mono text-emerald-400 font-semibold">{s.weightKg * s.reps} kg</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-zinc-800/80">
            <span className="text-sm text-zinc-400 font-medium">Total Volume Tonnage:</span>
            <span className="text-xl font-bold font-mono text-emerald-400">{totalVolume} kg</span>
          </div>
        </section>
      </main>
    </div>
  );
}
