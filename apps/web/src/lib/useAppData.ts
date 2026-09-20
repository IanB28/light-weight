import { useCallback, useEffect, useState } from 'react';
import type { Exercise, Routine, WorkoutSession } from '@light-weight/domain';
import { loadExerciseCatalog } from './exercises.js';
import {
  getStoredBodyweight,
  getStoredHistory,
  getStoredProfile,
  getStoredRoutines,
  getStoredTargetWeight,
  getStoredUserInfo,
  getStoredWeeklySchedule,
  addStoredDeletedRoutineId,
  removeStoredDeletedRoutineIds,
  saveBodyweightEntry,
  saveStoredProfile,
  saveStoredRoutines,
  saveStoredTargetWeight,
  saveStoredWeeklySchedule,
  upsertStoredHistory,
  storedUserScopeMatches,
  type BodyweightEntry,
  type UserProfile,
  type UserInfo,
  type WeeklySchedule
} from './storage.js';
import { useCloudSync } from './useCloudSync.js';
import { useAuth } from './auth-context.js';

export function useAppData() {
  const auth = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [routines, setRoutines] = useState<Routine[]>(() => getStoredRoutines());
  const [history, setHistory] = useState<WorkoutSession[]>(() => getStoredHistory());
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(() => getStoredWeeklySchedule());
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>(() => getStoredBodyweight());
  const [targetWeight, setTargetWeight] = useState<number | null>(() => getStoredTargetWeight());
  const [userInfo, setUserInfo] = useState<UserInfo>(() => getStoredUserInfo());
  const [profile, setProfile] = useState<UserProfile>(() => getStoredProfile());

  const reloadFromStorage = useCallback(() => {
    setHistory(getStoredHistory());
    setRoutines(getStoredRoutines());
    setWeeklySchedule(getStoredWeeklySchedule());
    setBodyweightEntries(getStoredBodyweight());
    setTargetWeight(getStoredTargetWeight());
    setUserInfo(getStoredUserInfo());
    setProfile(getStoredProfile());
  }, []);
  const sync = useCloudSync(reloadFromStorage, auth.isAuthenticated && storedUserScopeMatches(auth.user?.id || null));

  const loadCatalog = useCallback(() => {
    setCatalogStatus('loading');
    return loadExerciseCatalog()
      .then((catalog) => {
        setExercises(catalog);
        setCatalogStatus('ready');
        return catalog;
      })
      .catch((error) => {
        setCatalogStatus('error');
        throw error;
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadExerciseCatalog()
      .then((catalog) => {
        if (!mounted) return;
        setExercises(catalog);
        setCatalogStatus('ready');
      })
      .catch(() => { if (mounted) setCatalogStatus('error'); });
    return () => { mounted = false; };
  }, []);

  const updateWeeklySchedule = useCallback((schedule: WeeklySchedule) => {
    setWeeklySchedule(schedule);
    saveStoredWeeklySchedule(schedule);
  }, []);

  const saveBodyweight = useCallback((weightKg: number, dateStr?: string) => {
    const updated = saveBodyweightEntry(weightKg, dateStr);
    setBodyweightEntries(updated);
    void sync();
    return updated;
  }, [sync]);

  const saveTargetWeight = useCallback((weightKg: number) => {
    setTargetWeight(weightKg);
    saveStoredTargetWeight(weightKg);
  }, []);

  const saveRoutine = useCallback((routine: Routine) => {
    removeStoredDeletedRoutineIds([routine.id]);
    setRoutines((current) => {
      const existingIndex = current.findIndex((item) => item.id === routine.id);
      const updated = existingIndex < 0
        ? [...current, routine]
        : current.map((item) => item.id === routine.id ? routine : item);
      saveStoredRoutines(updated);
      return updated;
    });
    void sync();
  }, [sync]);

  /** Shared offline-first history write used by live and historical entry flows. */
  const saveHistorySession = useCallback((session: WorkoutSession) => {
    const updated = upsertStoredHistory(session);
    setHistory(updated);
    void sync();
    return updated;
  }, [sync]);

  const deleteRoutine = useCallback((routineId: string) => {
    addStoredDeletedRoutineId(routineId);
    setRoutines((current) => {
      const updated = current.filter((routine) => routine.id !== routineId);
      saveStoredRoutines(updated);
      return updated;
    });
    setWeeklySchedule((current) => {
      const updated = Object.fromEntries(
        Object.entries(current).map(([day, assigned]) => [day, assigned === routineId ? null : assigned])
      ) as WeeklySchedule;
      saveStoredWeeklySchedule(updated);
      return updated;
    });
    void sync();
  }, [sync]);

  const saveProfile = useCallback((nextProfile: UserProfile) => {
    const saved = saveStoredProfile(nextProfile);
    setProfile(saved);
    return saved;
  }, []);

  const addCustomExercise = useCallback((exercise: Exercise) => {
    setExercises((current) => [exercise, ...current]);
  }, []);

  return {
    exercises,
    catalogStatus,
    routines,
    history,
    weeklySchedule,
    bodyweightEntries,
    targetWeight,
    userInfo,
    profile,
    setHistory,
    loadCatalog,
    reloadFromStorage,
    sync,
    updateWeeklySchedule,
    saveBodyweight,
    saveTargetWeight,
    saveRoutine,
    saveHistorySession,
    deleteRoutine,
    saveProfile,
    addCustomExercise
  };
}
