import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AppPreferences,
  getStoredPreferences,
  saveStoredPreferences
} from './preferences.js';

interface PreferencesContextValue {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  reloadPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(getStoredPreferences);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((current) => {
      return saveStoredPreferences({ ...current, ...patch });
    });
  }, []);

  const reloadPreferences = useCallback(() => setPreferences(getStoredPreferences()), []);
  const value = useMemo(
    () => ({ preferences, updatePreferences, reloadPreferences }),
    [preferences, reloadPreferences, updatePreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used within PreferencesProvider');
  return value;
}
