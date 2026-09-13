import { db, sql } from './index.js';
import { users, userProfiles, exercises, routines } from './schema.js';
import { resolveExerciseLoadingProfile, type Exercise } from '@light-weight/domain';

export const SYSTEM_EXERCISES = [
  {
    id: 'ex-bench',
    name: 'Press de Banca Plano con Barra',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    isCustom: false,
  },
  {
    id: 'ex-incline-db',
    name: 'Press Inclinado con Mancuernas',
    category: 'dumbbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    isCustom: false,
  },
  {
    id: 'ex-squat',
    name: 'Sentadilla Trasera con Barra',
    category: 'barbell',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'core'],
    isCustom: false,
  },
  {
    id: 'ex-deadlift',
    name: 'Peso Muerto Convencional',
    category: 'barbell',
    primaryMuscle: 'back',
    secondaryMuscles: ['hamstrings', 'glutes', 'forearms'],
    isCustom: false,
  },
  {
    id: 'ex-rdl',
    name: 'Peso Muerto Rumano (RDL)',
    category: 'barbell',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'back'],
    isCustom: false,
  },
  {
    id: 'ex-pullup',
    name: 'Dominadas Pronas / Lastradas',
    category: 'bodyweight',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    isCustom: false,
  },
  {
    id: 'ex-barbell-row',
    name: 'Remo con Barra 45°',
    category: 'barbell',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    isCustom: false,
  },
  {
    id: 'ex-ohp',
    name: 'Press Militar de Pie (OHP)',
    category: 'barbell',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps', 'core'],
    isCustom: false,
  },
  {
    id: 'ex-lat-pulldown',
    name: 'Jalón al Pecho en Polea',
    category: 'cable',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    isCustom: false,
  },
  {
    id: 'ex-bicep-curl',
    name: 'Curl de Bíceps con Barra Z',
    category: 'barbell',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    isCustom: false,
  },
  {
    id: 'ex-tricep-pushdown',
    name: 'Extensión de Tríceps en Polea',
    category: 'cable',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    isCustom: false,
  },
  {
    id: 'ex-leg-raise',
    name: 'Elevaciones de Piernas Colgado',
    category: 'bodyweight',
    primaryMuscle: 'core',
    secondaryMuscles: [],
    isCustom: false,
  },
];

async function seed() {
  console.log('🌱 Starting database seed in Neon PostgreSQL...');

  // 1. Insert or update default demo user
  const demoUserId = '00000000-0000-0000-0000-000000000001';
  await db
    .insert(users)
    .values({
      id: demoUserId,
      email: 'demo@light-weight.app',
      name: 'Operador Demo',
    })
    .onConflictDoNothing();

  // 2. Insert or update biometric profile
  await db
    .insert(userProfiles)
    .values({
      userId: demoUserId,
      gender: 'male',
      currentBodyweightKg: '77.90',
      unitSystem: 'metric',
    })
    .onConflictDoNothing();

  // 3. Insert system exercises
  for (const ex of SYSTEM_EXERCISES) {
    const loading = resolveExerciseLoadingProfile(ex as Exercise).profile;
    await db
      .insert(exercises)
      .values({
        ...ex,
        loadMechanism: loading.mechanism,
        loadMode: loading.loadMode,
        supportsKeyboard: loading.supportsKeyboard,
        supportsPlates: loading.supportsPlates,
        supportsExternalLoad: loading.supportsExternalLoad,
        includeBarWeight: loading.includeBarWeight
      })
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          name: ex.name,
          category: ex.category,
          primaryMuscle: ex.primaryMuscle,
          secondaryMuscles: ex.secondaryMuscles,
          loadMechanism: loading.mechanism,
          loadMode: loading.loadMode,
          supportsKeyboard: loading.supportsKeyboard,
          supportsPlates: loading.supportsPlates,
          supportsExternalLoad: loading.supportsExternalLoad,
          includeBarWeight: loading.includeBarWeight,
        },
      });
  }

  // 4. Insert default sample routines for the demo user
  const sampleRoutines = [
    {
      id: '00000000-0000-0000-0000-000000000010',
      userId: demoUserId,
      name: 'Torso: Potencia e Hipertrofia',
      description: 'Enfoque en empujes pesados y tirón vertical con progresión doble.',
      exerciseIds: ['ex-bench', 'ex-lat-pulldown', 'ex-ohp', 'ex-bicep-curl', 'ex-tricep-pushdown'],
    },
    {
      id: '00000000-0000-0000-0000-000000000011',
      userId: demoUserId,
      name: 'Pierna: Fuerza Base',
      description: 'Sentadilla pesada con trabajo accesorio de cadena posterior y femoral.',
      exerciseIds: ['ex-squat', 'ex-rdl', 'ex-leg-raise'],
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      userId: demoUserId,
      name: 'Empuje: Pecho & Hombro',
      description: 'Sobrecarga en press plano e inclinación con aislamiento de tríceps.',
      exerciseIds: ['ex-bench', 'ex-incline-db', 'ex-ohp', 'ex-tricep-pushdown'],
    },
  ];

  for (const r of sampleRoutines) {
    await db
      .insert(routines)
      .values(r)
      .onConflictDoNothing();
  }

  console.log('✅ Seed finished successfully! Database is ready.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
