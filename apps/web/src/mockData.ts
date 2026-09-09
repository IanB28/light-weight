import { Exercise, Routine, WorkoutSession } from '@light-weight/domain';

export const INITIAL_EXERCISES: Exercise[] = [
  {
    id: 'ex-bench',
    name: 'Press de Banca Plano',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders']
  },
  {
    id: 'ex-incline-db',
    name: 'Press Inclinado con Mancuernas',
    category: 'dumbbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps']
  },
  {
    id: 'ex-squat',
    name: 'Sentadilla Trasera con Barra',
    category: 'barbell',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'core']
  },
  {
    id: 'ex-rdl',
    name: 'Peso Muerto Rumano (RDL)',
    category: 'barbell',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'back']
  },
  {
    id: 'ex-pullup',
    name: 'Dominadas Pronas / Lastradas',
    category: 'bodyweight',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms']
  },
  {
    id: 'ex-ohp',
    name: 'Press Militar de Pie (OHP)',
    category: 'barbell',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps', 'core']
  },
  {
    id: 'ex-lat-pulldown',
    name: 'Jalón al Pecho en Polea',
    category: 'cable',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps']
  },
  {
    id: 'ex-bicep-curl',
    name: 'Curl de Bíceps con Barra Z',
    category: 'barbell',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms']
  },
  {
    id: 'ex-tricep-pushdown',
    name: 'Extensión de Tríceps en Polea',
    category: 'cable',
    primaryMuscle: 'triceps',
    secondaryMuscles: []
  },
  {
    id: 'ex-leg-raise',
    name: 'Elevaciones de Piernas Colgado',
    category: 'bodyweight',
    primaryMuscle: 'core',
    secondaryMuscles: []
  }
];

export const INITIAL_ROUTINES: Routine[] = [
  {
    id: 'rt-upper',
    userId: 'user-operator',
    name: 'Torso: Potencia e Hipertrofia',
    description: 'Enfoque en empujes pesados y tirón vertical. 4-5 series efectivas con progresión doble.',
    exerciseIds: ['ex-bench', 'ex-lat-pulldown', 'ex-ohp', 'ex-bicep-curl', 'ex-tricep-pushdown']
  },
  {
    id: 'rt-lower',
    userId: 'user-operator',
    name: 'Pierna: Fuerza Base',
    description: 'Sentadilla pesada con trabajo accesorio de cadena posterior y femoral.',
    exerciseIds: ['ex-squat', 'ex-rdl', 'ex-leg-raise']
  },
  {
    id: 'rt-push',
    userId: 'user-operator',
    name: 'Empuje: Pecho & Hombro',
    description: 'Sobrecarga en press plano e inclinación con aislamiento de tríceps.',
    exerciseIds: ['ex-bench', 'ex-incline-db', 'ex-ohp', 'ex-tricep-pushdown']
  }
];

export const RECENT_SESSIONS: WorkoutSession[] = [
  {
    id: 'sess-101',
    userId: 'user-operator',
    routineId: 'rt-upper',
    startedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    endedAt: new Date(Date.now() - 86400000 * 2 + 4200000).toISOString(),
    notes: 'Excelente sesión. Se superó el umbral en Banca a 85kg.',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 80, reps: 8, completed: true, isWarmup: false, rpe: 8 },
        { setIndex: 2, weightKg: 82.5, reps: 8, completed: true, isWarmup: false, rpe: 8.5 },
        { setIndex: 3, weightKg: 85, reps: 7, completed: true, isWarmup: false, rpe: 9.5 }
      ],
      'ex-lat-pulldown': [
        { setIndex: 1, weightKg: 70, reps: 10, completed: true, isWarmup: false, rpe: 8 },
        { setIndex: 2, weightKg: 75, reps: 9, completed: true, isWarmup: false, rpe: 9 }
      ]
    }
  }
];
