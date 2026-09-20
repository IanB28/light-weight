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

export type MachineBaseProvenance =
  | string
  | {
      type?: 'manual' | 'manufacturer_spec' | 'url' | 'structured' | string;
      sourceUrl?: string;
      url?: string;
      manufacturer?: string;
      model?: string;
      sourceLabel?: string;
    };

function isValidHttpUrl(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.trim().length > 0;
  } catch {
    return false;
  }
}

export function isAuthoritativeProvenance(
  candidate: MachineBaseProvenance | unknown
): boolean {
  if (!candidate) return false;

  if (typeof candidate === 'string') {
    return isValidHttpUrl(candidate);
  }

  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  const obj = candidate as Record<string, unknown>;

  const urlCandidate = obj.sourceUrl ?? (typeof obj.url === 'string' ? obj.url : undefined);
  if (isValidHttpUrl(urlCandidate)) {
    return true;
  }

  const hasManufacturer =
    typeof obj.manufacturer === 'string' && obj.manufacturer.trim().length > 0;
  const hasModel =
    typeof obj.model === 'string' && obj.model.trim().length > 0;
  const hasSourceLabel =
    typeof obj.sourceLabel === 'string' && obj.sourceLabel.trim().length > 0;

  return hasManufacturer && hasModel && hasSourceLabel;
}

export interface NormalizedMachineBaseSelection {
  profile?: MachineProfile;
  status: BaseResistanceStatus;
  weightKg?: number;
  sourceLabel?: string;
  sourceUrl?: string;
  manufacturer?: string;
  model?: string;
}

export function normalizeMachineBaseSelection(
  selection: import('./types.js').MachineBaseSelection | MachineProfile | undefined,
  loadingProfile?: Pick<ExerciseLoadingProfile, 'mechanism' | 'hasMachineBase'>
): NormalizedMachineBaseSelection {
  if (!selection) {
    return { status: 'unknown', weightKg: undefined };
  }

  const profile = 'id' in selection && !('status' in selection)
    ? (selection as MachineProfile)
    : ('profile' in selection ? selection.profile : undefined);

  if (profile) {
    const loading = loadingProfile ?? { mechanism: 'plate_loaded', hasMachineBase: true };
    const resolved = resolveMachineBaseResistance(loading, profile);
    return {
      profile,
      status: resolved.status,
      weightKg: resolved.weightKg ?? (resolved.status === 'none' ? 0 : undefined),
      sourceLabel: profile.sourceLabel ?? resolved.provenance?.sourceLabel,
      sourceUrl: profile.sourceUrl ?? resolved.provenance?.sourceUrl,
      manufacturer: profile.manufacturer ?? resolved.provenance?.manufacturer,
      model: profile.model ?? resolved.provenance?.model
    };
  }

  const baseSel = selection as import('./types.js').MachineBaseSelection;
  const status = baseSel.status;
  const rawWeight = baseSel.weightKg;

  if (status === 'unknown') {
    if (rawWeight !== null && rawWeight !== undefined) {
      return { status: 'unknown', weightKg: undefined };
    }
    return { status: 'unknown', weightKg: undefined };
  }

  if (status === 'none') {
    if (rawWeight !== null && rawWeight !== undefined && rawWeight !== 0) {
      return { status: 'unknown', weightKg: undefined };
    }
    return { status: 'none', weightKg: 0 };
  }

  if (status === 'suggested') {
    if (typeof rawWeight === 'number' && Number.isFinite(rawWeight) && rawWeight > 0) {
      return { status: 'suggested', weightKg: rawWeight };
    }
    return { status: 'unknown', weightKg: undefined };
  }

  return { status: 'unknown', weightKg: undefined };
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
    provenance: Boolean(selectedProfile.sourceUrl || selectedProfile.sourceLabel || selectedProfile.manufacturer || selectedProfile.model)

      ? {
          sourceLabel: selectedProfile.sourceLabel,
          sourceUrl: selectedProfile.sourceUrl,
          manufacturer: selectedProfile.manufacturer,
          model: selectedProfile.model
        }
      : undefined
  };
}
