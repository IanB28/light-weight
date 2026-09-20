import type { ExerciseLoadingProfile } from './types.js';

export type BaseResistanceStatus =
  | 'none'
  | 'unknown'
  | 'suggested'
  | 'verified'
  | 'user_defined';

export const BASE_RESISTANCE_STATUSES: readonly BaseResistanceStatus[] = [
  'none',
  'unknown',
  'suggested',
  'verified',
  'user_defined'
] as const;

export interface MachineProfile {
  id: string;
  exerciseId: string;
  label: string;
  baseResistanceStatus: BaseResistanceStatus;
  baseResistanceKg?: number;
  createdAt: string;
  updatedAt: string;
  sourceLabel?: string;
  sourceUrl?: string;
  manufacturer?: string;
  model?: string;
}

export function isValidBaseResistanceStatus(value: unknown): value is BaseResistanceStatus {
  return typeof value === 'string' && (BASE_RESISTANCE_STATUSES as readonly string[]).includes(value);
}

export interface MachineProfileValidationResult {
  valid: boolean;
  error?: string;
}

export function isAuthoritativeProvenance(candidate: {
  sourceUrl?: unknown;
  manufacturer?: unknown;
  model?: unknown;
  sourceLabel?: unknown;
}): boolean {
  const hasValidUrl =
    typeof candidate.sourceUrl === 'string' &&
    /^https?:\/\//i.test(candidate.sourceUrl.trim());
  if (hasValidUrl) return true;

  const hasManufacturer =
    typeof candidate.manufacturer === 'string' && candidate.manufacturer.trim().length > 0;
  const hasModel =
    typeof candidate.model === 'string' && candidate.model.trim().length > 0;
  const hasSourceLabel =
    typeof candidate.sourceLabel === 'string' && candidate.sourceLabel.trim().length > 0;

  return hasManufacturer && hasModel && hasSourceLabel;
}

export function validateMachineProfile(value: unknown): MachineProfileValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Machine profile must be a non-null object' };
  }
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    return { valid: false, error: 'id must be a non-empty string' };
  }
  if (typeof candidate.exerciseId !== 'string' || candidate.exerciseId.trim().length === 0) {
    return { valid: false, error: 'exerciseId must be a non-empty string' };
  }
  if (typeof candidate.label !== 'string' || candidate.label.trim().length === 0) {
    return { valid: false, error: 'label must be a non-empty string' };
  }
  if (!isValidBaseResistanceStatus(candidate.baseResistanceStatus)) {
    return { valid: false, error: `baseResistanceStatus must be one of: ${BASE_RESISTANCE_STATUSES.join(', ')}` };
  }

  const status = candidate.baseResistanceStatus;
  const weightKg = candidate.baseResistanceKg;

  if (status === 'unknown') {
    if (weightKg !== undefined && weightKg !== null) {
      return { valid: false, error: 'baseResistanceKg must be absent when baseResistanceStatus is "unknown"' };
    }
  } else if (status === 'none') {
    if (weightKg !== undefined && weightKg !== null && weightKg !== 0) {
      return { valid: false, error: 'baseResistanceKg must be absent or 0 when baseResistanceStatus is "none"' };
    }
  } else {
    // status is 'suggested' | 'verified' | 'user_defined'
    if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) {
      return { valid: false, error: `baseResistanceKg must be a finite number greater than 0 for status "${status}"` };
    }
    if (status === 'verified') {
      const isAuthoritative = isAuthoritativeProvenance({
        sourceUrl: candidate.sourceUrl,
        manufacturer: candidate.manufacturer,
        model: candidate.model,
        sourceLabel: candidate.sourceLabel
      });
      if (!isAuthoritative) {
        return {
          valid: false,
          error: 'baseResistanceStatus "verified" requires baseResistanceKg > 0 and either a valid http/https sourceUrl or complete structured provenance (manufacturer, model, and sourceLabel/document identifier)'
        };
      }
    }
  }

  return { valid: true };
}

export function isValidMachineProfile(value: unknown): value is MachineProfile {
  return validateMachineProfile(value).valid;
}

export interface ResolvedMachineBaseResistance {
  applicable: boolean;
  status: BaseResistanceStatus;
  weightKg: number | null;
  profileId?: string;
  label?: string;
  provenance?: {
    sourceLabel?: string;
    sourceUrl?: string;
    manufacturer?: string;
    model?: string;
  };
}

export function isPlateLoadedMachine(loading: Pick<ExerciseLoadingProfile, 'mechanism' | 'hasMachineBase'>): boolean {
  return loading.mechanism === 'plate_loaded' || Boolean(loading.hasMachineBase);
}

/**
 * Pure canonical resolver for machine starting/base resistance.
 *
 * Invariants:
 * - Non-machine exercises (barbells, dumbbells, cables, bodyweight) return applicable = false, status = 'none', weightKg = 0.
 * - Applicable machines without a profile, or with an 'unknown' status profile, return status = 'unknown', weightKg = null.
 *   CRITICAL: Unknown NEVER collapses into 0 kg.
 * - Applicable machines with status 'none' resolve to weightKg = 0.
 * - Applicable machines with concrete status ('suggested', 'verified', 'user_defined') resolve to the validated weight.
 */
export function resolveMachineBaseResistance(
  loading: Pick<ExerciseLoadingProfile, 'mechanism' | 'hasMachineBase'>,
  selectedProfile?: MachineProfile | null
): ResolvedMachineBaseResistance {
  if (!isPlateLoadedMachine(loading)) {
    return {
      applicable: false,
      status: 'none',
      weightKg: 0
    };
  }

  if (!selectedProfile) {
    return {
      applicable: true,
      status: 'unknown',
      weightKg: null
    };
  }

  const validation = validateMachineProfile(selectedProfile);
  if (!validation.valid) {
    return {
      applicable: true,
      status: 'unknown',
      weightKg: null,
      profileId: selectedProfile.id,
      label: selectedProfile.label
    };
  }

  if (selectedProfile.baseResistanceStatus === 'unknown') {
    return {
      applicable: true,
      status: 'unknown',
      weightKg: null,
      profileId: selectedProfile.id,
      label: selectedProfile.label
    };
  }

  if (selectedProfile.baseResistanceStatus === 'none') {
    return {
      applicable: true,
      status: 'none',
      weightKg: 0,
      profileId: selectedProfile.id,
      label: selectedProfile.label
    };
  }

  const weightKg = selectedProfile.baseResistanceKg !== undefined && Number.isFinite(selectedProfile.baseResistanceKg) && selectedProfile.baseResistanceKg >= 0
    ? selectedProfile.baseResistanceKg
    : null;

  return {
    applicable: true,
    status: selectedProfile.baseResistanceStatus,
    weightKg,
    profileId: selectedProfile.id,
    label: selectedProfile.label,
    provenance: selectedProfile.sourceLabel || selectedProfile.manufacturer || selectedProfile.model
      ? {
          sourceLabel: selectedProfile.sourceLabel,
          sourceUrl: selectedProfile.sourceUrl,
          manufacturer: selectedProfile.manufacturer,
          model: selectedProfile.model
        }
      : undefined
  };
}
