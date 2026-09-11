import { WorkoutSession, Routine, estimate1RM } from '@light-weight/domain';

const STORAGE_KEYS = {
  HISTORY: 'lightweight_workouts_history',
  ACTIVE_WORKOUT: 'lightweight_active_workout',
  ROUTINES: 'lightweight_routines',
  BODYWEIGHT: 'lightweight_bodyweight',
  TARGET_WEIGHT: 'lightweight_target_weight',
  PROFILE: 'lightweight_user_profile',
  WEEKLY_SCHEDULE: 'lightweight_weekly_schedule',
  USER_INFO: 'lightweight_user_info'
};

export type WeekDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type WeeklySchedule = Record<WeekDay, string | null>;

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null
};

export const DAY_NUM_TO_WEEKDAY: Record<number, WeekDay> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

export const WEEKDAY_NAMES_ES: Record<WeekDay, { short: string; full: string }> = {
  monday: { short: 'Lun', full: 'Lunes' },
  tuesday: { short: 'Mar', full: 'Martes' },
  wednesday: { short: 'Mié', full: 'Miércoles' },
  thursday: { short: 'Jue', full: 'Jueves' },
  friday: { short: 'Vie', full: 'Viernes' },
  saturday: { short: 'Sáb', full: 'Sábado' },
  sunday: { short: 'Dom', full: 'Domingo' }
};

export function getStoredWeeklySchedule(): WeeklySchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEEKLY_SCHEDULE);
    if (!raw) return { ...DEFAULT_WEEKLY_SCHEDULE };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_WEEKLY_SCHEDULE };
    return { ...DEFAULT_WEEKLY_SCHEDULE, ...parsed };
  } catch {
    return { ...DEFAULT_WEEKLY_SCHEDULE };
  }
}

export function saveStoredWeeklySchedule(schedule: WeeklySchedule): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(schedule));
  } catch {}
}

export interface UserProfile {
  gender: 'male' | 'female';
}

export function getStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      const def: UserProfile = { gender: 'male' };
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(def));
      return def;
    }
    return JSON.parse(raw);
  } catch {
    return { gender: 'male' };
  }
}

export function saveStoredProfile(profile: Partial<UserProfile>): UserProfile {
  try {
    const current = getStoredProfile();
    const updated: UserProfile = { ...current, ...profile };
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
    return updated;
  } catch {
    return { gender: 'male', ...profile };
  }
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export const DEFAULT_USER_INFO: UserInfo = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Atleta',
  email: ''
};

export function getStoredUserInfo(): UserInfo {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_INFO);
    if (!raw) return DEFAULT_USER_INFO;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_USER_INFO;
    const info = parsed as Partial<UserInfo>;
    return {
      id: typeof info.id === 'string' ? info.id : DEFAULT_USER_INFO.id,
      name: typeof info.name === 'string' && info.name.trim() ? info.name : DEFAULT_USER_INFO.name,
      email: typeof info.email === 'string' ? info.email : DEFAULT_USER_INFO.email
    };
  } catch {
    return DEFAULT_USER_INFO;
  }
}

export function saveStoredUserInfo(info: Partial<UserInfo>): UserInfo {
  try {
    const current = getStoredUserInfo();
    const updated: UserInfo = { ...current, ...info };
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(updated));
    return updated;
  } catch {
    return { ...DEFAULT_USER_INFO, ...info };
  }
}

export interface BodyweightEntry {
  date: string;       // YYYY-MM-DD
  timestamp: number;  // ms
  weightKg: number;
}

export function getStoredBodyweight(): BodyweightEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BODYWEIGHT);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is BodyweightEntry => (
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof entry.date === 'string' &&
      Number.isFinite(entry.timestamp) &&
      Number.isFinite(entry.weightKg) &&
      entry.weightKg > 0
    ));
  } catch {
    return [];
  }
}

export function saveStoredBodyweight(entries: BodyweightEntry[]): void {
  try { localStorage.setItem(STORAGE_KEYS.BODYWEIGHT, JSON.stringify(entries)); } catch {}
}

export function saveBodyweightEntry(weightKg: number, dateStr?: string): BodyweightEntry[] {
  try {
    const current = getStoredBodyweight();
    if (!Number.isFinite(weightKg) || weightKg <= 0) return current;
    const d = dateStr || new Date().toISOString().slice(0, 10);
    const entry: BodyweightEntry = {
      date: d,
      timestamp: new Date(d).getTime() || Date.now(),
      weightKg: Math.round(weightKg * 10) / 10
    };
    // Replace if exists for today or append and sort
    const filtered = current.filter((b) => b.date !== d);
    const updated = [...filtered, entry].sort((a, b) => a.timestamp - b.timestamp);
    localStorage.setItem(STORAGE_KEYS.BODYWEIGHT, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save bodyweight entry:', err);
    return [];
  }
}

export function getStoredTargetWeight(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TARGET_WEIGHT);
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveStoredTargetWeight(targetKg: number): void {
  try {
    if (!Number.isFinite(targetKg) || targetKg <= 0) return;
    localStorage.setItem(STORAGE_KEYS.TARGET_WEIGHT, String(targetKg));
  } catch {}
}

export function getStoredHistory(): WorkoutSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCompletedWorkout(session: WorkoutSession): WorkoutSession[] {
  try {
    const current = getStoredHistory();
    const updated = [session, ...current];
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
    clearActiveWorkout();
    return updated;
  } catch (err) {
    console.error('Failed to save workout session to storage:', err);
    return [];
  }
}

export function saveStoredHistory(history: WorkoutSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

export function getStoredActiveWorkout<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(activeState: unknown | null): void {
  try {
    if (!activeState) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(activeState));
    }
  } catch (err) {
    console.warn('Failed to save active workout state:', err);
  }
}

export function clearActiveWorkout(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  } catch {}
}

export function getStoredRoutines(): Routine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROUTINES);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredRoutines(routines: Routine[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
  } catch {}
}

export interface PersonalRecordInfo {
  exerciseId: string;
  weightKg: number;
  reps: number;
  est1Rm: number;
  date: string;
}

/**
 * Derives all-time personal records for each exercise from the workout history.
 */
export function calculateAllPersonalRecords(
  history: WorkoutSession[]
): Record<string, PersonalRecordInfo> {
  const records: Record<string, PersonalRecordInfo> = {};

  for (const session of history) {
    for (const [exId, sets] of Object.entries(session.sets)) {
      for (const set of sets) {
        if (!set.completed || set.isWarmup) continue;
        const est = estimate1RM(set.weightKg, set.reps, 'epley');
        if (est === null) continue;

        if (!records[exId] || est > records[exId].est1Rm) {
          records[exId] = {
            exerciseId: exId,
            weightKg: set.weightKg,
            reps: set.reps,
            est1Rm: est,
            date: session.startedAt
          };
        }
      }
    }
  }

  return records;
}
