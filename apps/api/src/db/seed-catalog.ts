import { db } from './index.js';
import { exercises } from './schema.js';
// @ts-ignore
import { EXDB } from '../../../web/src/lib/exercises-data.js';

function mapBodypartToMuscle(bp: string, tg: string): string {
  const t = (tg || '').toLowerCase();
  const b = (bp || '').toLowerCase();

  if (t.includes('biceps')) return 'biceps';
  if (t.includes('triceps')) return 'triceps';
  if (t.includes('lats') || t.includes('upper back') || t.includes('spine')) return 'back';
  if (t.includes('pectorals')) return 'chest';
  if (t.includes('delts')) return 'shoulders';
  if (t.includes('quads')) return 'quadriceps';
  if (t.includes('hamstrings')) return 'hamstrings';
  if (t.includes('glutes')) return 'glutes';
  if (t.includes('calves')) return 'calves';
  if (t.includes('forearms')) return 'forearms';
  if (t.includes('abs') || b === 'waist') return 'core';

  if (b === 'chest') return 'chest';
  if (b === 'back') return 'back';
  if (b === 'shoulders') return 'shoulders';
  if (b === 'upper arms') return 'biceps';
  if (b === 'lower arms') return 'forearms';
  if (b === 'upper legs') return 'quadriceps';
  if (b === 'lower legs') return 'calves';
  if (b === 'waist') return 'core';

  return 'core';
}

function mapEquipmentToCategory(eq: string): string {
  const e = (eq || '').toLowerCase();
  if (e.includes('barbell') || e.includes('olympic')) return 'barbell';
  if (e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('cable')) return 'cable';
  if (e.includes('body weight') || e.includes('assisted')) return 'bodyweight';
  if (e.includes('machine') || e.includes('leverage') || e.includes('smith')) return 'machine';
  return 'other';
}

async function seedCatalog() {
  console.log(`Starting to seed ${EXDB.length} exercises into Neon PostgreSQL...`);

  const mapped = EXDB.map((raw: any) => {
    const primaryMuscle = mapBodypartToMuscle(raw.bp, raw.tg);
    const category = mapEquipmentToCategory(raw.eq);
    const secondary = Array.isArray(raw.sm)
      ? raw.sm.map((s: string) => mapBodypartToMuscle('', s)).filter((m: string) => m !== primaryMuscle)
      : [];

    return {
      id: `ex-${raw.id}`,
      name: raw.n
        ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1)
        : 'Ejercicio',
      primaryMuscle,
      category,
      secondaryMuscles: Array.from(new Set(secondary)),
      isCustom: false,
    };
  });

  // Batch insert in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
    const chunk = mapped.slice(i, i + CHUNK_SIZE);
    await db.insert(exercises).values(chunk).onConflictDoNothing();
    console.log(`Inserted chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(mapped.length / CHUNK_SIZE)}`);
  }

  console.log('✅ Successfully seeded all 1,300+ catalog exercises into Neon PostgreSQL!');
  process.exit(0);
}

seedCatalog().catch((err) => {
  console.error('❌ Failed to seed catalog:', err);
  process.exit(1);
});
