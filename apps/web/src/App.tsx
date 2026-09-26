import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { BottomNav, type TabType } from './components/BottomNav.js';
import { RestTimerBar } from './components/RestTimerBar.js';
import { SettingsSheet } from './components/SettingsSheet.js';
import { HomeView } from './views/HomeView.js';
import { WorkoutView } from './views/WorkoutView.js';
import { StatsView } from './views/StatsView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView } from './views/LibraryView.js';
import { initTheme } from './lib/theme.js';
import { usePreferences } from './lib/preferences-context.js';
import { useFeedback } from './lib/feedback-context.js';
import { useI18n, type TranslationKey } from './lib/i18n.js';
import { useAppData } from './lib/useAppData.js';
import { useWorkoutSession } from './features/workouts/useWorkoutSession.js';
import { useRestTimer } from './features/workouts/useRestTimer.js';
import { resolveBodyweightKgAtDate, type MuscleGroup } from '@light-weight/domain';
import { useAuth } from './lib/auth-context.js';
import { switchStoredUserScope, type UserProfile } from './lib/storage.js';
import { AuthScreen } from './features/auth/AuthScreen.js';
import { AuthLoadingScreen } from './features/auth/AuthLoadingScreen.js';
import { UsernameOnboardingScreen } from './features/auth/UsernameOnboardingScreen.js';
import { resolveAuthScreenTarget } from './features/auth/auth-routing.js';
import { ProfileScreen } from './features/profile/ProfileScreen.js';
import { ProfileIdentityProvider } from './features/profile/ProfileIdentityButton.js';
import { appSurfaceReducer, INITIAL_APP_SURFACE_STATE, type SettingsTarget } from './features/profile/profile-surface-state.js';
import { saveProfileUpdate } from './features/profile/profile-save.js';
import { resolveEffectiveProfile } from './features/profile/profile-authority.js';

export function App() {
  const { preferences } = usePreferences();
  const { showFeedback } = useFeedback();
  const { t } = useI18n();
  const auth = useAuth();
  const previousAuthScope = useRef<string | null>(null);
  const [surfaces, dispatchSurface] = useReducer(appSurfaceReducer, INITIAL_APP_SURFACE_STATE);
  const { currentTab, profileOpen, settingsOpen, settingsTarget } = surfaces;
  const data = useAppData();
  const workout = useWorkoutSession({
    exercises: data.exercises,
    routines: data.routines,
    history: data.history,
    preferences,
    userId: auth.user?.id || data.userInfo.id,
    bodyweightEntries: data.bodyweightEntries
  });
  const restTimer = useRestTimer();

  useEffect(() => { initTheme(); }, []);
  useEffect(() => {
    if (auth.status === 'loading' || auth.status === 'offline' || auth.status === 'error') return;
    const nextScope = auth.user?.id || 'anonymous';
    if (previousAuthScope.current === nextScope) return;
    previousAuthScope.current = nextScope;
    if (switchStoredUserScope(auth.user?.id || null)) window.location.reload();
  }, [auth.status, auth.user?.id]);

  const navigateToTab = useCallback((tab: TabType) => {
    dispatchSurface({ type: 'select_tab', tab });
  }, []);
  const openSettings = useCallback((target: SettingsTarget = 'root') => {
    dispatchSurface({ type: 'open_settings', target });
  }, []);
  const openRootSettings = useCallback(() => { openSettings('root'); }, [openSettings]);

  const startWorkout = (routineId?: string, sessionName?: string, prefilterMuscles?: MuscleGroup[]) => {
    workout.start(routineId, sessionName, prefilterMuscles);
    navigateToTab('workout');
  };

  const startWorkoutWithExercise = (exercise: Parameters<typeof workout.addExercise>[0]) => {
    workout.startWithExercise(exercise);
    navigateToTab('workout');
  };

  const createCustomExercise = (name: string, muscle: MuscleGroup) => {
    const exercise = workout.createCustomExercise(name, muscle);
    data.addCustomExercise(exercise);
    if (workout.isWorkoutActive) workout.addExercise(exercise);
  };

  const finishWorkout = () => {
    const result = workout.finish();
    if (!result) return;
    restTimer.cancel();
    data.setHistory(result.history);
    navigateToTab('stats');
    showFeedback(t('feedback.workoutSaved'));
    void data.sync();
  };

  const cancelWorkout = () => {
    workout.cancel();
    restTimer.cancel();
    navigateToTab('home');
  };

  const saveBodyweight = (weightKg: number, dateStr?: string) => {
    data.saveBodyweight(weightKg, dateStr);
    showFeedback(t('feedback.weightSaved'));
  };

  const saveTargetWeight = (weightKg: number) => {
    data.saveTargetWeight(weightKg);
    showFeedback(t('feedback.weightSaved'));
  };

  const effectiveProfile = useMemo<UserProfile>(
    () => resolveEffectiveProfile(data.profile, auth.user, auth.status),
    [data.profile, auth.status, auth.user]
  );

  const effectiveUserInfo = useMemo(() => auth.user ? {
    id: auth.user.id,
    name: auth.user.displayName,
    email: auth.user.email
  } : data.userInfo, [auth.user, data.userInfo]);

  const handleSaveProfile = useCallback(async (patch: Partial<UserProfile>) => {
    return saveProfileUpdate({
      currentProfile: effectiveProfile,
      patch,
      authStatus: auth.status,
      authUser: auth.user,
      updateRemote: auth.updateProfile,
      persistLocal: data.saveProfile,
      translateError: (code) => t(`auth.error.${code}` as TranslationKey),
      onSaved: () => showFeedback(t('feedback.profileSaved'))
    });
  }, [effectiveProfile, data, auth, showFeedback, t]);

  const handleLogout = useCallback(() => {
    void auth.logout().then((result) => {
      if (result.ok) {
        switchStoredUserScope(null);
        window.location.reload();
      }
    });
  }, [auth]);

  const authTarget = resolveAuthScreenTarget({
    status: auth.status,
    isAuthenticated: auth.isAuthenticated,
    user: auth.user
  });

  if (authTarget === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (authTarget === 'auth_screen') {
    return <AuthScreen />;
  }

  if (authTarget === 'onboarding' && auth.user) {
    return <UsernameOnboardingScreen user={auth.user} />;
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-transparent font-sans text-text-primary selection:bg-accent selection:text-accent-fg">
      <div className="pointer-events-none fixed -top-24 left-1/2 -z-10 h-[26rem] w-[36rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700" style={{ backgroundColor: 'var(--orb-1)' }} />
      <div className="pointer-events-none fixed top-[28%] -left-28 -z-10 size-[32rem] rounded-full blur-[170px] transition-colors duration-700" style={{ backgroundColor: 'var(--orb-2)' }} />
      <div className="pointer-events-none fixed top-[52%] -right-24 -z-10 size-[32rem] rounded-full blur-[170px] transition-colors duration-700" style={{ backgroundColor: 'var(--orb-3)' }} />
      <div className="pointer-events-none fixed top-[22%] left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700" style={{ backgroundColor: 'var(--orb-brand, rgba(34, 197, 94, 0.08))' }} />

      <ProfileIdentityProvider value={{
        displayName: effectiveProfile.displayName === 'Atleta' ? effectiveUserInfo.name : effectiveProfile.displayName,
        avatarUrl: effectiveProfile.avatarUrl,
        onOpenProfile: () => dispatchSurface({ type: 'open_profile' })
      }}>
      <main className="flex-1 max-w-md w-full mx-auto px-page pt-[max(0.75rem,env(safe-area-inset-top))] pb-page-safe">
        {profileOpen ? <ProfileScreen
          profile={effectiveProfile}
          userInfo={effectiveUserInfo}
          history={data.history}
          exercises={data.exercises}
          authStatus={auth.status}
          isAuthenticated={auth.isAuthenticated}
          bodyweightKg={resolveBodyweightKgAtDate(data.bodyweightEntries)}
          bodyweightEntries={data.bodyweightEntries}
            onSave={handleSaveProfile}
            onUploadAvatar={auth.uploadAvatar}
            avatarUploadAvailable={auth.status === 'authenticated'}
            onClose={() => dispatchSurface({ type: 'close_profile' })}
          onOpenSettings={openSettings}
        /> : <>
        {currentTab === 'home' && <HomeView
          userName={data.profile.displayName === 'Atleta' ? data.userInfo.name : data.profile.displayName}
          history={data.history}
          routines={data.routines}
          weeklySchedule={data.weeklySchedule}
          onUpdateWeeklySchedule={data.updateWeeklySchedule}
          bodyweightEntries={data.bodyweightEntries}
          targetWeight={data.targetWeight}
          onSaveBodyweight={saveBodyweight}
          onSaveTargetWeight={saveTargetWeight}
          onStartWorkout={startWorkout}
          isWorkoutActive={workout.isWorkoutActive}
          activeWorkoutDuration={workout.duration}
          onNavigateToWorkout={() => navigateToTab('workout')}
          onOpenSettings={openRootSettings}
          exercises={data.exercises}
          userId={auth.user?.id || data.userInfo.id}
          onSaveHistoricalWorkout={(session) => { data.saveHistorySession(session); showFeedback(t('feedback.workoutSaved')); }}
          onCreateCustomExercise={createCustomExercise}
        />}

        {currentTab === 'workout' && <WorkoutView
          isWorkoutActive={workout.isWorkoutActive}
          routines={data.routines}
          routineName={workout.activeRoutineName}
          sessionDuration={workout.duration}
          exerciseSessions={workout.exerciseSessions}
          availableExercises={data.exercises}
          history={data.history}
          currentBodyweightKg={resolveBodyweightKgAtDate(data.bodyweightEntries)}
          onToggleSet={workout.toggleSet}
          onUpdateSet={workout.updateSet}
          onUpdateSetRir={workout.updateSetRir}
          onAddSet={workout.addSet}
          onRemoveSet={workout.removeSet}
          onAddExercise={workout.addExercise}
          onRemoveExercise={workout.removeExercise}
          onSkipExercise={workout.skipExercise}
          onResumeExercise={workout.resumeExercise}
          onCreateCustomExercise={createCustomExercise}
          onFinishWorkout={finishWorkout}
          onCancelWorkout={cancelWorkout}
          onStartRestTimer={restTimer.start}
          onStartRoutine={startWorkout}
          preferences={preferences}
          onUpdateWeightInputMode={workout.updateWeightInputMode}
          onToggleAddedWeight={workout.toggleAddedWeight}
          onUpdateBarInclusion={workout.updateBarInclusion}
          onUpdatePlateBaseWeight={workout.updatePlateBaseWeight}
          onUpdateMachineProfile={workout.updateMachineProfile}
          onApplyPlateWeight={workout.applyPlateWeight}
        />}

        {currentTab === 'stats' && <StatsView
          history={data.history}
          exercises={data.exercises}
          isWorkoutActive={workout.isWorkoutActive}
          activeWorkoutDuration={workout.duration}
          onNavigateToWorkout={() => navigateToTab('workout')}
          onOpenSettings={openRootSettings}
          profile={effectiveProfile}
          bodyweightEntries={data.bodyweightEntries}
          targetWeight={data.targetWeight}
          onSaveBodyweight={data.saveBodyweight}
          onSaveTargetWeight={data.saveTargetWeight}
          onSaveProfile={handleSaveProfile}
        />}

        {currentTab === 'plan' && <PlanView
          routines={data.routines}
          exercises={data.exercises}
          routineOwnerId={auth.user?.id || data.userInfo.id}
          weeklySchedule={data.weeklySchedule}
          onUpdateWeeklySchedule={data.updateWeeklySchedule}
          onSelectAndStartRoutine={startWorkout}
          onSaveRoutine={(routine) => { data.saveRoutine(routine); showFeedback(t('feedback.routineSaved')); }}
          onDeleteRoutine={data.deleteRoutine}
          isWorkoutActive={workout.isWorkoutActive}
          activeWorkoutDuration={workout.duration}
          onNavigateToWorkout={() => navigateToTab('workout')}
          onOpenSettings={openRootSettings}
        />}

        {currentTab === 'exercises' && <LibraryView
          exercises={data.exercises}
          history={data.history}
          catalogStatus={data.catalogStatus}
          onRetryCatalog={() => { void data.loadCatalog().catch(() => undefined); }}
          isWorkoutActive={workout.isWorkoutActive}
          activeWorkoutDuration={workout.duration}
          onNavigateToWorkout={() => navigateToTab('workout')}
          onOpenSettings={openRootSettings}
          onAddExerciseToActiveWorkout={workout.addExercise}
          onStartWorkoutWithExercise={startWorkoutWithExercise}
        />}
        </>}
      </main>
      </ProfileIdentityProvider>

      <RestTimerBar
        secondsLeft={restTimer.secondsLeft}
        totalSeconds={restTimer.totalSeconds}
        onAddSeconds={restTimer.add}
        onDismiss={restTimer.cancel}
      />

      <BottomNav currentTab={currentTab} onSelectTab={navigateToTab} isWorkoutActive={workout.isWorkoutActive} />

      <SettingsSheet
        isOpen={settingsOpen}
        target={settingsTarget}
        onClose={() => dispatchSurface({ type: 'close_settings' })}
        onDataRestored={data.reloadFromStorage}
        profile={effectiveProfile}
        onSaveProfile={handleSaveProfile}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
