import React from 'react';
import { Home, Calendar, Dumbbell, BarChart2, List } from 'lucide-react';

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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c1220]/90 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-10px_30px_rgba(2,5,15,0.7)] pb-safe transition-colors">
      {/* Hairline glass reflection */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

      <div className="max-w-md mx-auto flex items-center justify-between px-3 py-1.5 relative">
        {/* 1. Inicio */}
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'home'
              ? 'text-accent font-bold'
              : 'text-[#9CA3AF] hover:text-white'
          }`}
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Inicio</span>
        </button>

        {/* 2. Plan */}
        <button
          type="button"
          onClick={() => onSelectTab('plan')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'plan'
              ? 'text-accent font-bold'
              : 'text-[#9CA3AF] hover:text-white'
          }`}
        >
          <Calendar className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Plan</span>
        </button>

        {/* 3. Botón Central Flotante: Empezar */}
        <div className="relative -top-4 flex flex-col items-center">
          <button
            type="button"
            onClick={() => onSelectTab('workout')}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 ease-out active:scale-[0.90] cursor-pointer ring-4 ring-[#0c1220] bg-accent text-accent-fg shadow-[0_0_24px_var(--accent-glow)] hover:brightness-105 ${
              isWorkoutActive ? 'animate-pulse ring-accent/50' : ''
            }`}
            title={isWorkoutActive ? 'Continuar sesión' : 'Comenzar entrenamiento'}
          >
            <Dumbbell className="w-6 h-6 stroke-[2.5]" />
          </button>
          <span className={`text-[10px] mt-0.5 font-bold tracking-tight ${
            currentTab === 'workout' || isWorkoutActive ? 'text-accent' : 'text-zinc-400'
          }`}>
            {isWorkoutActive ? 'Activo' : 'Empezar'}
          </span>
        </div>

        {/* 4. Progreso */}
        <button
          type="button"
          onClick={() => onSelectTab('stats')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'stats'
              ? 'text-accent font-bold'
              : 'text-[#9CA3AF] hover:text-white'
          }`}
        >
          <BarChart2 className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Progreso</span>
        </button>

        {/* 5. Ejercicios */}
        <button
          type="button"
          onClick={() => onSelectTab('exercises')}
          className={`flex flex-col items-center justify-center w-14 py-1 active:scale-[0.92] transition-all duration-100 ease-out cursor-pointer ${
            currentTab === 'exercises'
              ? 'text-accent font-bold'
              : 'text-[#9CA3AF] hover:text-white'
          }`}
        >
          <List className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-1 tracking-tight">Ejercicios</span>
        </button>
      </div>
    </nav>
  );
};
