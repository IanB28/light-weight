import React from 'react';
import { Home, Calendar, Dumbbell, BarChart2, ListFilter } from 'lucide-react';

export type TabType = 'home' | 'plan' | 'workout' | 'stats' | 'exercises';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isWorkoutActive: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  isWorkoutActive
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black/65 backdrop-blur-2xl border-t border-white/[0.08] shadow-2xl shadow-black/90 pb-safe transition-colors">
      {/* Light-catching hairline reflection on top edge */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

      <div className="max-w-md mx-auto flex items-center justify-between px-3 py-1.5 relative">
        {/* 1. Home */}
        <button
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'home'
              ? 'text-emerald-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Home</span>
        </button>

        {/* 2. Plan */}
        <button
          onClick={() => onSelectTab('plan')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'plan'
              ? 'text-emerald-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Calendar className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Plan</span>
        </button>

        {/* 3. Center Floating Action Button: Start / Resume */}
        <div className="relative -top-3 flex flex-col items-center">
          <button
            onClick={() => onSelectTab('workout')}
            className={`w-13 h-13 rounded-full flex items-center justify-center shadow-xl transition-all duration-150 ease-out active:scale-[0.90] cursor-pointer ring-1 ring-white/20 ${
              isWorkoutActive
                ? 'bg-amber-500 text-black shadow-amber-500/35 animate-pulse'
                : 'bg-emerald-500 text-black shadow-emerald-500/35 hover:bg-emerald-400'
            }`}
            title={isWorkoutActive ? 'Continuar sesión' : 'Comenzar entrenamiento'}
          >
            <Dumbbell className="w-6 h-6 stroke-[2.5]" />
          </button>
          <span className="text-[10px] mt-1 font-extrabold text-emerald-400 tracking-tight">
            {isWorkoutActive ? 'Resume' : 'Start'}
          </span>
        </div>

        {/* 4. Stats */}
        <button
          onClick={() => onSelectTab('stats')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'stats'
              ? 'text-emerald-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BarChart2 className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Stats</span>
        </button>

        {/* 5. Library / Ejercicios */}
        <button
          onClick={() => onSelectTab('exercises')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'exercises'
              ? 'text-emerald-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ListFilter className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Biblioteca</span>
        </button>
      </div>
    </nav>
  );
};
