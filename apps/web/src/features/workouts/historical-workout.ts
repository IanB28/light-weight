import {
  isValidRirValue,
  isValidWorkoutDateKey,
  normalizeWorkoutSession,
  type Exercise,
  type MachineProfile,
  type WorkoutSession,
  type WorkoutSetType
} from '@light-weight/domain';

export interface HistoricalSetDraft {
  weight: string;
  reps: string;
  rir: string;
  setType: WorkoutSetType;
}

export interface HistoricalExerciseDraft {
  exercise: Exercise;
  sets: HistoricalSetDraft[];
  machineProfile?: MachineProfile;
}

export interface HistoricalWorkoutDraft {
  userId: string;
  routineId?: string;
  performedDate: string;
  performedTime: string;
  durationMinutes?: string;
  routineName?: string;
  exercises: HistoricalExerciseDraft[];
}

export class HistoricalWorkoutValidationError extends Error {}

function createLocalInstant(dateKey: string, time: string): Date {
  if (!isValidWorkoutDateKey(dateKey) || !/^\d{2}:\d{2}$/.test(time)) throw new HistoricalWorkoutValidationError('Invalid performed date or time');
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw new HistoricalWorkoutValidationError('Invalid performed time');
  const local = new Date(`${dateKey}T${time}:00`);
  if (!Number.isFinite(local.getTime())) throw new HistoricalWorkoutValidationError('Invalid performed date');
  return local;
}

export function createHistoricalWorkoutSession(draft: HistoricalWorkoutDraft, recordedAt = new Date()): WorkoutSession {
  const started = createLocalInstant(draft.performedDate, draft.performedTime);
  if (started.getTime() > Date.now()) throw new HistoricalWorkoutValidationError('Performed date cannot be in the future');
  const durationText = draft.durationMinutes?.trim();
  const duration = durationText ? Number(durationText) : undefined;
  if (durationText && (!Number.isInteger(duration) || duration! <= 0 || duration! > 1_440)) {
    throw new HistoricalWorkoutValidationError('Invalid duration');
  }

  const sets = Object.fromEntries(draft.exercises.flatMap(({ exercise, sets: exerciseSets, machineProfile }) => {
    const normalized = exerciseSets.map((set, index) => {
      const weightKg = Number(set.weight);
      const reps = Number(set.reps);
      const rir = set.rir.trim() === '' ? undefined : Number(set.rir);
      if (!Number.isFinite(weightKg) || weightKg < 0 || !Number.isInteger(reps) || reps <= 0 || (rir !== undefined && !isValidRirValue(rir))) {
        throw new HistoricalWorkoutValidationError('Every historical set needs explicit valid weight and reps');
      }
      if (machineProfile?.baseResistanceKg !== undefined && weightKg < machineProfile.baseResistanceKg) {
        throw new HistoricalWorkoutValidationError('Total machine load cannot be below its known base resistance');
      }
      return {
        setIndex: index + 1,
        weightKg,
        reps,
        ...(rir === undefined ? {} : { rir }),
        completed: true,
        setType: set.setType,
        isWarmup: set.setType === 'warmup',
        ...(machineProfile ? {
          machineProfileId: machineProfile.id,
          machineProfileLabel: machineProfile.label,
          machineBaseResistanceKg: machineProfile.baseResistanceKg,
          machineBaseResistanceStatus: machineProfile.baseResistanceStatus,
          machineBaseSourceLabel: machineProfile.sourceLabel,
          machineBaseSourceUrl: machineProfile.sourceUrl,
          machineManufacturer: machineProfile.manufacturer,
          machineModel: machineProfile.model
        } : exercise.category === 'machine' ? {
          machineBaseResistanceStatus: 'unknown' as const
        } : {})
      };
    });
    return normalized.length ? [[exercise.id, normalized] as const] : [];
  }));
  if (Object.values(sets).flat().length === 0) throw new HistoricalWorkoutValidationError('At least one physical set is required');

  const recordedMs = recordedAt.getTime();
  if (!Number.isFinite(recordedMs) || started.getTime() > recordedMs) throw new HistoricalWorkoutValidationError('Historical record time is invalid');
  const id = globalThis.crypto?.randomUUID?.() || `historical-${recordedMs}-${Math.random().toString(36).slice(2)}`;
  return normalizeWorkoutSession({
    id,
    userId: draft.userId,
    ...(draft.routineId ? { routineId: draft.routineId } : {}),
    ...(draft.routineName?.trim() ? { routineName: draft.routineName.trim().slice(0, 255) } : {}),
    startedAt: started.toISOString(),
    performedDate: draft.performedDate,
    recordedAt: recordedAt.toISOString(),
    entrySource: 'historical_manual',
    ...(duration ? { endedAt: new Date(started.getTime() + duration * 60_000).toISOString() } : {}),
    sets
  });
}
