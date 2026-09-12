export type Language = 'es' | 'en';
export type UnitSystem = 'metric' | 'imperial';
export type WeightInputMode = 'keyboard' | 'plates';

export interface AppPreferences {
  language: Language;
  units: UnitSystem;
  defaultRestSeconds: number;
  weightInputMode: WeightInputMode;
  defaultBarWeightKg: number;
  availablePlatesKg: number[];
}

export const PREFERENCES_STORAGE_KEY = 'lightweight_preferences_v1';
const LEGACY_LANGUAGE_KEY = 'lightweight_language';

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: 'es',
  units: 'metric',
  defaultRestSeconds: 90,
  weightInputMode: 'keyboard',
  defaultBarWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25]
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export function parseAppPreferences(value: unknown, legacyLanguage?: string | null): AppPreferences {
  const raw = isObject(value) && isObject(value.data) ? value.data : isObject(value) ? value : {};
  const languageCandidate = raw.language ?? legacyLanguage;
  const plates = Array.isArray(raw.availablePlatesKg)
    ? Array.from(new Set(raw.availablePlatesKg.filter(
        (plate): plate is number => typeof plate === 'number' && Number.isFinite(plate) && plate > 0 && plate <= 100
      )))
    : DEFAULT_APP_PREFERENCES.availablePlatesKg;

  return {
    language: languageCandidate === 'en' ? 'en' : 'es',
    units: raw.units === 'imperial' ? 'imperial' : 'metric',
    defaultRestSeconds: [60, 90, 120, 180].includes(Number(raw.defaultRestSeconds))
      ? Number(raw.defaultRestSeconds)
      : DEFAULT_APP_PREFERENCES.defaultRestSeconds,
    weightInputMode: raw.weightInputMode === 'plates' ? 'plates' : 'keyboard',
    defaultBarWeightKg: typeof raw.defaultBarWeightKg === 'number' && Number.isFinite(raw.defaultBarWeightKg) && raw.defaultBarWeightKg >= 0
      ? Math.round(raw.defaultBarWeightKg * 100) / 100
      : DEFAULT_APP_PREFERENCES.defaultBarWeightKg,
    availablePlatesKg: plates.length > 0 ? plates : DEFAULT_APP_PREFERENCES.availablePlatesKg
  };
}

export function getStoredPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return parseAppPreferences(raw ? JSON.parse(raw) : null, localStorage.getItem(LEGACY_LANGUAGE_KEY));
  } catch {
    return { ...DEFAULT_APP_PREFERENCES, availablePlatesKg: [...DEFAULT_APP_PREFERENCES.availablePlatesKg] };
  }
}

export function saveStoredPreferences(preferences: AppPreferences): AppPreferences {
  const safe = parseAppPreferences(preferences);
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, data: safe }));
    window.dispatchEvent(new CustomEvent('lightweight_preferences_changed', { detail: safe }));
  } catch {}
  return safe;
}
