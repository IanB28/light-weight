import {
  type MachineProfile,
  validateMachineProfile,
  isValidMachineProfile
} from '@light-weight/domain';
import { STORAGE_KEYS } from './storage.js';

export function getAllMachineProfiles(): MachineProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MACHINE_PROFILES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMachineProfile);
  } catch {
    return [];
  }
}

export function getMachineProfilesForExercise(exerciseId: string): MachineProfile[] {
  if (!exerciseId) return [];
  return getAllMachineProfiles().filter((p) => p.exerciseId === exerciseId);
}

export function getMachineProfileById(id: string): MachineProfile | undefined {
  if (!id) return undefined;
  return getAllMachineProfiles().find((p) => p.id === id);
}

export function saveMachineProfile(
  input: Omit<MachineProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }
): MachineProfile {
  const now = new Date().toISOString();
  const id = input.id || `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const profile: MachineProfile = {
    id,
    exerciseId: input.exerciseId,
    label: input.label.trim(),
    baseResistanceStatus: input.baseResistanceStatus,
    baseResistanceKg: input.baseResistanceKg,
    sourceLabel: input.sourceLabel?.trim() || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    manufacturer: input.manufacturer?.trim() || undefined,
    model: input.model?.trim() || undefined,
    createdAt: input.createdAt || now,
    updatedAt: now
  };

  const validation = validateMachineProfile(profile);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid machine profile');
  }

  const existing = getAllMachineProfiles();
  const index = existing.findIndex((p) => p.id === id);
  const next = index >= 0
    ? [...existing.slice(0, index), profile, ...existing.slice(index + 1)]
    : [...existing, profile];

  localStorage.setItem(STORAGE_KEYS.MACHINE_PROFILES, JSON.stringify(next));
  return profile;
}

export function deleteMachineProfile(id: string): void {
  if (!id) return;
  const existing = getAllMachineProfiles();
  const target = existing.find((p) => p.id === id);
  const next = existing.filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEYS.MACHINE_PROFILES, JSON.stringify(next));

  if (target) {
    const lastUsedMap = getLastUsedMachineProfileMap();
    if (lastUsedMap[target.exerciseId] === id) {
      delete lastUsedMap[target.exerciseId];
      saveLastUsedMachineProfileMap(lastUsedMap);
    }
  }
}

function getLastUsedMachineProfileMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_USED_MACHINE_PROFILES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function saveLastUsedMachineProfileMap(map: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEYS.LAST_USED_MACHINE_PROFILES, JSON.stringify(map));
}

export function getLastUsedMachineProfileId(exerciseId: string): string | null {
  if (!exerciseId) return null;
  const map = getLastUsedMachineProfileMap();
  const profileId = map[exerciseId];
  if (!profileId) return null;
  const profile = getMachineProfileById(profileId);
  return profile ? profileId : null;
}

export function setLastUsedMachineProfileId(exerciseId: string, profileId: string | null): void {
  if (!exerciseId) return;
  const map = getLastUsedMachineProfileMap();
  if (profileId === null) {
    delete map[exerciseId];
  } else {
    map[exerciseId] = profileId;
  }
  saveLastUsedMachineProfileMap(map);
}

export function clearMachineProfiles(): void {
  localStorage.setItem(STORAGE_KEYS.MACHINE_PROFILES, JSON.stringify([]));
  saveLastUsedMachineProfileMap({});
}
