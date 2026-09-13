export type Language = 'es' | 'en';
export type UnitSystem = 'metric' | 'imperial';
export type WeightInputMode = 'keyboard' | 'plates';

import { WEIGHT_UNIT_PRESETS, plateListsMatch, weightsMatch } from './weight-units.js';

export interface AppPreferences {
  language: Language;
  units: UnitSystem;
  bodyweightUnits: UnitSystem;
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
  bodyweightUnits: 'metric',
  defaultRestSeconds: 90,
  weightInputMode: 'keyboard',
  defaultBarWeightKg: WEIGHT_UNIT_PRESETS.metric.barWeightKg,
  availablePlatesKg: [...WEIGHT_UNIT_PRESETS.metric.platesKg]
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export function parseAppPreferences(value: unknown, legacyLanguage?: string | null): AppPreferences {
  const raw = isObject(value) && isObject(value.data) ? value.data : isObject(value) ? value : {};
  const languageCandidate = raw.language ?? legacyLanguage;
  const units: UnitSystem = raw.units === 'imperial' ? 'imperial' : 'metric';
  const bodyweightUnits: UnitSystem = raw.bodyweightUnits === 'imperial'
    ? 'imperial'
    : raw.bodyweightUnits === 'metric'
      ? 'metric'
      : units;
  const plates = Array.isArray(raw.availablePlatesKg)
    ? Array.from(new Set(raw.availablePlatesKg.filter(
        (plate): plate is number => typeof plate === 'number' && Number.isFinite(plate) && plate > 0 && plate <= 100
      )))
    : DEFAULT_APP_PREFERENCES.availablePlatesKg;

  const parsedBarWeightKg = typeof raw.defaultBarWeightKg === 'number' && Number.isFinite(raw.defaultBarWeightKg) && raw.defaultBarWeightKg >= 0
    ? Math.round(raw.defaultBarWeightKg * 100_000) / 100_000
    : DEFAULT_APP_PREFERENCES.defaultBarWeightKg;
  const parsedPlatesKg = plates.length > 0 ? plates : DEFAULT_APP_PREFERENCES.availablePlatesKg;
  const hasLegacyMetricDefaultsInImperial = units === 'imperial'
    && weightsMatch(parsedBarWeightKg, WEIGHT_UNIT_PRESETS.metric.barWeightKg)
    && plateListsMatch(parsedPlatesKg, WEIGHT_UNIT_PRESETS.metric.platesKg);

  return {
    language: languageCandidate === 'en' ? 'en' : 'es',
    units,
    bodyweightUnits,
    defaultRestSeconds: [60, 90, 120, 180].includes(Number(raw.defaultRestSeconds))
      ? Number(raw.defaultRestSeconds)
      : DEFAULT_APP_PREFERENCES.defaultRestSeconds,
    weightInputMode: raw.weightInputMode === 'plates' ? 'plates' : 'keyboard',
    defaultBarWeightKg: hasLegacyMetricDefaultsInImperial
      ? WEIGHT_UNIT_PRESETS.imperial.barWeightKg
      : parsedBarWeightKg,
    availablePlatesKg: hasLegacyMetricDefaultsInImperial
      ? [...WEIGHT_UNIT_PRESETS.imperial.platesKg]
      : [...parsedPlatesKg]
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
