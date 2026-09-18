import { db } from './index.js';
import { exercises } from './schema.js';
import {
  mapDatasetExerciseToDomain,
  type RawDatasetExercise
} from '@light-weight/domain';
// @ts-ignore
import { EXDB } from '../../../web/src/lib/exercises-data.js';

export function mapRawCatalogExerciseToDb(raw: RawDatasetExercise) {
  const exercise = mapDatasetExerciseToDomain(raw);
  const loading = exercise.loading!;
  return {
    id: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    category: exercise.category,
    loadMechanism: loading.mechanism,
    loadMode: loading.loadMode,
    supportsKeyboard: loading.supportsKeyboard,
    supportsPlates: loading.supportsPlates,
    supportsExternalLoad: loading.supportsExternalLoad,
    includeBarWeight: loading.includeBarWeight,
    bodyweightFactor:
      typeof loading.bodyweightFactor === 'number'
        ? loading.bodyweightFactor
        : null,
    isCustom: false
  };
}

async function seedCatalog() {
  console.log(`Starting to seed ${EXDB.length} exercises into Neon PostgreSQL...`);

  const mapped = (EXDB as RawDatasetExercise[]).map(mapRawCatalogExerciseToDb);

  // Batch insert in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
    const chunk = mapped.slice(i, i + CHUNK_SIZE);
    for (const exercise of chunk) {
      await db.insert(exercises).values(exercise).onConflictDoUpdate({
        target: exercises.id,
        set: {
          loadMechanism: exercise.loadMechanism,
          loadMode: exercise.loadMode,
          supportsKeyboard: exercise.supportsKeyboard,
          supportsPlates: exercise.supportsPlates,
          supportsExternalLoad: exercise.supportsExternalLoad,
          includeBarWeight: exercise.includeBarWeight,
          bodyweightFactor: exercise.bodyweightFactor
        }
      });
    }
    console.log(`Inserted chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(mapped.length / CHUNK_SIZE)}`);
  }

  console.log('✅ Successfully seeded all 1,300+ catalog exercises into Neon PostgreSQL!');
  process.exit(0);
}

if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_SEED_EXECUTION && process.argv[1]?.includes('seed-catalog')) {
  seedCatalog().catch((err) => {
    console.error('❌ Failed to seed catalog:', err);
    process.exit(1);
  });
}
