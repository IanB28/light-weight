import { Routine, WorkoutSession } from '@light-weight/domain';

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

const generateHistory = (): WorkoutSession[] => {
  const sessions: WorkoutSession[] = [];
  const now = Date.now();

  // 1. Sesión Lunes Sep 7 (2 días atrás)
  sessions.push({
    id: 'sess-sep-7',
    userId: 'user-operator',
    routineId: 'rt-upper',
    routineName: 'Torso: Potencia e Hipertrofia',
    startedAt: new Date(now - 86400000 * 2).toISOString(),
    endedAt: new Date(now - 86400000 * 2 + 3720000).toISOString(), // 62 min
    notes: 'Excelente sesión en banca y jalón.',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rpe: 8 },
        { setIndex: 2, weightKg: 82.5, reps: 8, completed: true, setType: 'working', isWarmup: false, rpe: 8.5 },
        { setIndex: 3, weightKg: 85, reps: 7, completed: true, setType: 'working', isWarmup: false, rpe: 9.5 }
      ],
      'ex-lat-pulldown': [
        { setIndex: 1, weightKg: 70, reps: 10, completed: true, setType: 'working', isWarmup: false, rpe: 8 },
        { setIndex: 2, weightKg: 75, reps: 9, completed: true, setType: 'working', isWarmup: false, rpe: 9 },
        { setIndex: 3, weightKg: 75, reps: 8, completed: true, setType: 'working', isWarmup: false, rpe: 9.5 }
      ],
      'ex-ohp': [
        { setIndex: 1, weightKg: 50, reps: 8, completed: true, setType: 'working', isWarmup: false, rpe: 8 },
        { setIndex: 2, weightKg: 52.5, reps: 7, completed: true, setType: 'working', isWarmup: false, rpe: 8.5 },
        { setIndex: 3, weightKg: 52.5, reps: 6, completed: true, setType: 'working', isWarmup: false, rpe: 9 }
      ]
    }
  });

  // 2. Sesión Viernes Sep 4 (5 días atrás)
  sessions.push({
    id: 'sess-sep-4',
    userId: 'user-operator',
    routineId: 'rt-push',
    routineName: 'Empuje: Pecho & Hombro',
    startedAt: new Date(now - 86400000 * 5).toISOString(),
    endedAt: new Date(now - 86400000 * 5 + 3600000).toISOString(), // 60 min
    notes: 'Press plano y mancuernas.',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 77.5, reps: 10, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 3, weightKg: 82.5, reps: 8, completed: true, setType: 'working', isWarmup: false }
      ],
      'ex-incline-db': [
        { setIndex: 1, weightKg: 30, reps: 10, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 32, reps: 8, completed: true, setType: 'working', isWarmup: false }
      ],
      'ex-tricep-pushdown': [
        { setIndex: 1, weightKg: 35, reps: 12, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 40, reps: 10, completed: true, setType: 'working', isWarmup: false }
      ]
    }
  });

  // 3. Sesión Miércoles Sep 2 (7 días atrás)
  sessions.push({
    id: 'sess-sep-2',
    userId: 'user-operator',
    routineId: 'rt-lower',
    routineName: 'Pierna: Fuerza Base',
    startedAt: new Date(now - 86400000 * 7).toISOString(),
    endedAt: new Date(now - 86400000 * 7 + 3780000).toISOString(), // 63 min
    notes: 'Sentadilla pesada y RDL.',
    sets: {
      'ex-squat': [
        { setIndex: 1, weightKg: 100, reps: 8, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 105, reps: 8, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 3, weightKg: 110, reps: 6, completed: true, setType: 'working', isWarmup: false }
      ],
      'ex-rdl': [
        { setIndex: 1, weightKg: 90, reps: 10, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 95, reps: 8, completed: true, setType: 'working', isWarmup: false }
      ]
    }
  });

  // Sesiones adicionales en semanas anteriores (hasta 13 semanas de racha y 33 entrenamientos)
  let count = 3;
  for (let week = 2; week <= 13; week++) {
    const sessionsInWeek = (week % 2 === 0 || count < 25) ? 3 : 2;
    for (let s = 0; s < sessionsInWeek; s++) {
      if (count >= 33) break;
      const daysAgo = week * 7 + s * 2;
      sessions.push({
        id: `sess-past-w${week}-${s}`,
        userId: 'user-operator',
        routineId: s === 0 ? 'rt-upper' : s === 1 ? 'rt-lower' : 'rt-push',
        routineName: s === 0 ? 'Torso: Potencia' : s === 1 ? 'Pierna Base' : 'Empuje',
        startedAt: new Date(now - 86400000 * daysAgo).toISOString(),
        endedAt: new Date(now - 86400000 * daysAgo + 3600000).toISOString(),
        sets: {
          'ex-bench': [
            { setIndex: 1, weightKg: 75, reps: 8, completed: true, setType: 'working', isWarmup: false },
            { setIndex: 2, weightKg: 77.5, reps: 8, completed: true, setType: 'working', isWarmup: false }
          ],
          'ex-squat': [
            { setIndex: 1, weightKg: 95, reps: 8, completed: true, setType: 'working', isWarmup: false },
            { setIndex: 2, weightKg: 100, reps: 6, completed: true, setType: 'working', isWarmup: false }
          ]
        }
      });
      count++;
    }
  }

  return sessions;
};

export const RECENT_SESSIONS: WorkoutSession[] = generateHistory();
