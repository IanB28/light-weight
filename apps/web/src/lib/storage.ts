import {
  normalizeLoggedSet,
  normalizeWorkoutSession,
  type LegacyWorkoutSession,
  type Routine,
  type WorkoutSession
} from '@light-weight/domain';
import { browserStorageAdapter, type StorageAdapter } from './storage-adapter.js';
export { calculateAllPersonalRecords } from './workout-history-index.js';
export type { PersonalRecordInfo } from './workout-history-index.js';

export const STORAGE_KEYS = {
  HISTORY: 'lightweight_workouts_history',
  ACTIVE_WORKOUT: 'lightweight_active_workout',
  ROUTINES: 'lightweight_routines',
  BODYWEIGHT: 'lightweight_bodyweight',
  TARGET_WEIGHT: 'lightweight_target_weight',
  PROFILE: 'lightweight_user_profile',
  WEEKLY_SCHEDULE: 'lightweight_weekly_schedule',
  USER_INFO: 'lightweight_user_info',
  DELETED_ROUTINE_IDS: 'lightweight_deleted_routine_ids'
};

const PRIVATE_STORAGE_KEYS = Object.values(STORAGE_KEYS);
const DATA_SCOPE_KEY = 'lightweight_data_scope';
const ANONYMOUS_SCOPE = 'anonymous';

function scopeCacheKey(scope: string): string {
  return `lightweight_data_scope_cache:${scope}`;
}

export function storedUserScopeMatches(userId: string | null): boolean {
  try {
    return (localStorage.getItem(DATA_SCOPE_KEY) || ANONYMOUS_SCOPE) === (userId || ANONYMOUS_SCOPE);
  } catch {
    return userId === null;
  }
}

/** Keeps authenticated caches isolated while allowing the first account to claim existing offline data. */
export function switchStoredUserScope(nextUserId: string | null): boolean {
  try {
    const nextScope = nextUserId || ANONYMOUS_SCOPE;
    const currentScope = localStorage.getItem(DATA_SCOPE_KEY) || ANONYMOUS_SCOPE;
    if (currentScope === nextScope) return false;
    const currentSnapshot = Object.fromEntries(PRIVATE_STORAGE_KEYS.flatMap((key) => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }));
    localStorage.setItem(scopeCacheKey(currentScope), JSON.stringify(currentSnapshot));
    const targetRaw = localStorage.getItem(scopeCacheKey(nextScope));
    const firstAccountClaimsLocalData = currentScope === ANONYMOUS_SCOPE && nextScope !== ANONYMOUS_SCOPE && !targetRaw;
    if (firstAccountClaimsLocalData) {
      localStorage.removeItem(scopeCacheKey(ANONYMOUS_SCOPE));
    } else {
      PRIVATE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      if (targetRaw) {
        const target = JSON.parse(targetRaw) as Record<string, unknown>;
        PRIVATE_STORAGE_KEYS.forEach((key) => { if (typeof target[key] === 'string') localStorage.setItem(key, target[key] as string); });
      }
    }
    localStorage.setItem(DATA_SCOPE_KEY, nextScope);
    return true;
  } catch {
    return false;
  }
}

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
  displayName: string;
  username?: string;
  birthDate?: string;
  avatarUrl?: string;
  gender?: 'male' | 'female';
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'Atleta'
};

export function parseUserProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_USER_PROFILE };
  const profile = value as Partial<UserProfile>;
  const username = typeof profile.username === 'string'
    ? profile.username.trim().replace(/^@/, '').toLowerCase()
    : undefined;
  const avatarUrl = typeof profile.avatarUrl === 'string' && /^https?:\/\//i.test(profile.avatarUrl)
    ? profile.avatarUrl
    : undefined;
  const validGender = profile.gender === 'male' || profile.gender === 'female' ? profile.gender : undefined;
  return {
    displayName: typeof profile.displayName === 'string' && profile.displayName.trim()
      ? profile.displayName.trim().slice(0, 100)
      : DEFAULT_USER_PROFILE.displayName,
    ...(validGender ? { gender: validGender } : {}),
    ...(username ? { username: username.slice(0, 30) } : {}),
    ...(typeof profile.birthDate === 'string' ? { birthDate: profile.birthDate } : {}),
    ...(avatarUrl ? { avatarUrl } : {})
  };
}

export function getStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    return raw ? parseUserProfile(JSON.parse(raw)) : { ...DEFAULT_USER_PROFILE };
  } catch {
    return { ...DEFAULT_USER_PROFILE };
  }
}

export function saveStoredProfile(profile: Partial<UserProfile>): UserProfile {
  try {
    const current = getStoredProfile();
    const updated = parseUserProfile({ ...current, ...profile });
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
    return updated;
  } catch {
    return parseUserProfile(profile);
  }
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export const DEFAULT_USER_INFO: UserInfo = {
  id: 'local-anonymous',
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

export function normalizeStoredHistory(value: unknown): WorkoutSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((session): session is LegacyWorkoutSession => (
      Boolean(session)
      && typeof session === 'object'
      && typeof session.id === 'string'
      && typeof session.userId === 'string'
      && typeof session.startedAt === 'string'
      && Boolean(session.sets)
      && typeof session.sets === 'object'
      && !Array.isArray(session.sets)
    ))
    .map(normalizeWorkoutSession);
}

export function getStoredHistory(): WorkoutSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) return [];
    return normalizeStoredHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCompletedWorkout(session: WorkoutSession): WorkoutSession[] {
  try {
    const current = getStoredHistory();
    const updated = [normalizeWorkoutSession(session), ...current];
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
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.map(normalizeWorkoutSession)));
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

export function normalizeStoredActiveWorkout<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.exerciseSessions)) return value;
  return {
    ...state,
    exerciseSessions: state.exerciseSessions.map((session) => {
      if (!session || typeof session !== 'object' || Array.isArray(session)) return session;
      const exerciseSession = session as Record<string, unknown>;
      return {
        ...exerciseSession,
        sets: Array.isArray(exerciseSession.sets)
          ? exerciseSession.sets.map((set) => normalizeLoggedSet(set as Parameters<typeof normalizeLoggedSet>[0]))
          : []
      };
    })
  } as T;
}

export function getStoredActiveWorkout<T = unknown>(adapter: StorageAdapter = browserStorageAdapter): T | null {
  try {
    const raw = adapter.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    if (!raw) return null;
    return normalizeStoredActiveWorkout(JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function saveActiveWorkout(activeState: unknown | null, adapter: StorageAdapter = browserStorageAdapter): void {
  try {
    if (!activeState) {
      adapter.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    } else {
      adapter.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(activeState));
    }
  } catch (err) {
    console.warn('Failed to save active workout state:', err);
  }
}

export function clearActiveWorkout(adapter: StorageAdapter = browserStorageAdapter): void {
  try {
    adapter.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
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

/** Pending routine deletes are scoped with the rest of a user's offline data. */
export function getStoredDeletedRoutineIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_ROUTINE_IDS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 250);
  } catch {
    return [];
  }
}

export function saveStoredDeletedRoutineIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DELETED_ROUTINE_IDS, JSON.stringify([...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 250)));
  } catch {}
}

export function addStoredDeletedRoutineId(id: string): void {
  if (!id) return;
  saveStoredDeletedRoutineIds([...getStoredDeletedRoutineIds(), id]);
}

export function removeStoredDeletedRoutineIds(ids: string[]): void {
  if (!ids.length) return;
  const acknowledged = new Set(ids);
  saveStoredDeletedRoutineIds(getStoredDeletedRoutineIds().filter((id) => !acknowledged.has(id)));
}
