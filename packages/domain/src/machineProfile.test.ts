import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMachineProfile,
  isValidMachineProfile,
  isPlateLoadedMachine,
  resolveMachineBaseResistance,
  isAuthoritativeProvenance,
  normalizeMachineBaseSelection,
  type MachineProfile
} from './machineProfile.js';
import {
  PLATE_LOADED_PROFILE,
  SMITH_PROFILE,
  BARBELL_PROFILE,
  DUMBBELL_PROFILE
} from './exerciseLoading.js';
import { inferMachineResistanceClass } from './exerciseAudit.js';
import { normalizeLoggedSet } from './setSemantics.js';
import type { LoggedSet } from './types.js';

test('validateMachineProfile validates complete profile attributes', () => {
  const validProfile: MachineProfile = {
    id: 'prof-1',
    exerciseId: 'ex-smith-bench',
    label: 'Smith #1 (Cybex)',
    baseResistanceKg: 9.07,
    baseResistanceStatus: 'suggested',
    sourceLabel: '20 lb counterbalanced',
    manufacturer: 'Cybex',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };

  assert.equal(isValidMachineProfile(validProfile), true);
  assert.equal(validateMachineProfile(validProfile).valid, true);

  // Negative baseResistanceKg is invalid
  const negativeProfile = { ...validProfile, baseResistanceKg: -5 };
  assert.equal(isValidMachineProfile(negativeProfile), false);
  const negVal = validateMachineProfile(negativeProfile);
  assert.equal(negVal.valid, false);
  assert.match(negVal.error || '', /greater than 0/);

  // Unknown status must have absent or null baseResistanceKg
  const unknownWithWeight = {
    ...validProfile,
    baseResistanceStatus: 'unknown' as const,
    baseResistanceKg: 10
  };
  assert.equal(isValidMachineProfile(unknownWithWeight), false);
  const unkVal = validateMachineProfile(unknownWithWeight);
  assert.equal(unkVal.valid, false);
  assert.match(unkVal.error || '', /must be absent/);

  // Suggested/verified/user_defined status cannot have undefined/null baseResistanceKg
  const verifiedNullWeight = {
    ...validProfile,
    baseResistanceStatus: 'verified' as const,
    baseResistanceKg: undefined
  };
  assert.equal(isValidMachineProfile(verifiedNullWeight), false);
  const verVal = validateMachineProfile(verifiedNullWeight);
  assert.equal(verVal.valid, false);
  assert.match(verVal.error || '', /must be a finite number greater than 0/);

  // Canonical zero contract: suggested, user_defined, verified CANNOT be 0 kg
  const suggestedZero = { ...validProfile, baseResistanceStatus: 'suggested' as const, baseResistanceKg: 0 };
  assert.equal(isValidMachineProfile(suggestedZero), false);
  const userDefinedZero = { ...validProfile, baseResistanceStatus: 'user_defined' as const, baseResistanceKg: 0 };
  assert.equal(isValidMachineProfile(userDefinedZero), false);
  const verifiedZero = { ...validProfile, baseResistanceStatus: 'verified' as const, baseResistanceKg: 0, sourceUrl: 'https://example.com' };
  assert.equal(isValidMachineProfile(verifiedZero), false);

  // Verified requires authoritative provenance: base resistance > 0 and (valid http/https URL OR manufacturer + model + sourceLabel)
  const baseVerifiedProfile = {
    id: 'prof-ver-1',
    exerciseId: 'ex-smith-bench',
    label: 'Smith #1',
    baseResistanceStatus: 'verified' as const,
    baseResistanceKg: 10,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };

  // SourceLabel alone MUST fail
  const sourceLabelOnly = { ...baseVerifiedProfile, sourceLabel: 'manual' };
  assert.equal(isValidMachineProfile(sourceLabelOnly), false);
  const weakVal = validateMachineProfile(sourceLabelOnly);
  assert.equal(weakVal.valid, false);
  assert.match(weakVal.error || '', /requires baseResistanceKg > 0 and either a valid http\/https sourceUrl or complete structured provenance/);

  // Manufacturer alone MUST fail
  const manufacturerOnly = { ...baseVerifiedProfile, manufacturer: 'Hammer Strength' };
  assert.equal(isValidMachineProfile(manufacturerOnly), false);
  assert.equal(validateMachineProfile(manufacturerOnly).valid, false);

  // Model alone MUST fail
  const modelOnly = { ...baseVerifiedProfile, model: 'Linear Leg Press' };
  assert.equal(isValidMachineProfile(modelOnly), false);
  assert.equal(validateMachineProfile(modelOnly).valid, false);

  // Manufacturer + Model without sourceLabel MUST fail
  const noSourceLabel = { ...baseVerifiedProfile, manufacturer: 'Hammer Strength', model: 'Linear Leg Press' };
  assert.equal(isValidMachineProfile(noSourceLabel), false);
  assert.equal(validateMachineProfile(noSourceLabel).valid, false);

  // Manufacturer + SourceLabel without model MUST fail
  const noModel = { ...baseVerifiedProfile, manufacturer: 'Hammer Strength', sourceLabel: 'Manual Section 4.2' };
  assert.equal(isValidMachineProfile(noModel), false);
  assert.equal(validateMachineProfile(noModel).valid, false);

  // Model + SourceLabel without manufacturer MUST fail
  const noManufacturer = { ...baseVerifiedProfile, model: 'Linear Leg Press', sourceLabel: 'Manual Section 4.2' };
  assert.equal(isValidMachineProfile(noManufacturer), false);
  assert.equal(validateMachineProfile(noManufacturer).valid, false);

  // Verified with valid http/https sourceUrl passes
  const verifiedUrl = {
    ...baseVerifiedProfile,
    sourceUrl: 'https://cybexintl.com/specs/smith'
  };
  assert.equal(isValidMachineProfile(verifiedUrl), true);

  // Verified with complete structured provenance (manufacturer + model + sourceLabel) passes
  const verifiedStructured = {
    ...baseVerifiedProfile,
    manufacturer: 'Hammer Strength',
    model: 'Linear Leg Press',
    sourceLabel: 'Manual Section 4.2'
  };
  assert.equal(isValidMachineProfile(verifiedStructured), true);

  // Empty label is invalid
  const emptyLabel = { ...validProfile, label: '   ' };
  assert.equal(isValidMachineProfile(emptyLabel), false);
  assert.equal(validateMachineProfile(emptyLabel).valid, false);

  // None status with 0 kg is valid
  const noneProfile: MachineProfile = {
    id: 'prof-2',
    exerciseId: 'ex-leg-press',
    label: 'No sled tare',
    baseResistanceKg: 0,
    baseResistanceStatus: 'none',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
  assert.equal(isValidMachineProfile(noneProfile), true);
});

test('isPlateLoadedMachine correctly detects plate-loaded mechanisms', () => {
  assert.equal(isPlateLoadedMachine(PLATE_LOADED_PROFILE), true);
  assert.equal(isPlateLoadedMachine(SMITH_PROFILE), true);
  assert.equal(isPlateLoadedMachine(BARBELL_PROFILE), false);
  assert.equal(isPlateLoadedMachine(DUMBBELL_PROFILE), false);
});

test('resolveMachineBaseResistance handles unconfigured, suggested, custom, and none', () => {
  // 1. Uncalibrated / first use on Smith: MUST be unknown, NOT 0 kg, NOT auto-injected
  const uncalibratedSmith = resolveMachineBaseResistance(SMITH_PROFILE, undefined);
  assert.equal(uncalibratedSmith.applicable, true);
  assert.equal(uncalibratedSmith.status, 'unknown');
  assert.equal(uncalibratedSmith.weightKg, null);
  assert.equal(uncalibratedSmith.profileId, undefined);

  // 2. Barbell exercise: none, 0 kg, applicable = false
  const barbellRes = resolveMachineBaseResistance(BARBELL_PROFILE, undefined);
  assert.equal(barbellRes.applicable, false);
  assert.equal(barbellRes.status, 'none');
  assert.equal(barbellRes.weightKg, 0);

  // 3. User selects a suggested profile
  const suggestedProfile: MachineProfile = {
    id: 'p-sugg',
    exerciseId: 'ex-smith-squat',
    label: 'Standard Smith (20 lb)',
    baseResistanceKg: 9.07,
    baseResistanceStatus: 'suggested',
    sourceLabel: '20 lb counterbalanced',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
  const withSuggested = resolveMachineBaseResistance(SMITH_PROFILE, suggestedProfile);
  assert.equal(withSuggested.applicable, true);
  assert.equal(withSuggested.status, 'suggested');
  assert.equal(withSuggested.weightKg, 9.07);
  assert.equal(withSuggested.profileId, 'p-sugg');
  assert.equal(withSuggested.label, 'Standard Smith (20 lb)');
  assert.equal(withSuggested.provenance?.sourceLabel, '20 lb counterbalanced');

  // 4. User defines a custom machine
  const customProfile: MachineProfile = {
    id: 'p-custom',
    exerciseId: 'ex-smith-squat',
    label: 'Heavy incline Smith',
    baseResistanceKg: 15,
    baseResistanceStatus: 'user_defined',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
  const withCustom = resolveMachineBaseResistance(SMITH_PROFILE, customProfile);
  assert.equal(withCustom.applicable, true);
  assert.equal(withCustom.status, 'user_defined');
  assert.equal(withCustom.weightKg, 15);
  assert.equal(withCustom.profileId, 'p-custom');

  // 5. User declares machine has 0 kg starting resistance
  const zeroProfile: MachineProfile = {
    id: 'p-zero',
    exerciseId: 'ex-smith-squat',
    label: 'Counterbalanced to 0',
    baseResistanceKg: 0,
    baseResistanceStatus: 'none',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
  const withZero = resolveMachineBaseResistance(SMITH_PROFILE, zeroProfile);
  assert.equal(withZero.applicable, true);
  assert.equal(withZero.status, 'none');
  assert.equal(withZero.weightKg, 0);

  // 6. User creates a placeholder profile marked unknown
  const unknownProfile: MachineProfile = {
    id: 'p-unk',
    exerciseId: 'ex-smith-squat',
    label: 'Gym Unknown Smith',
    baseResistanceStatus: 'unknown',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
  const withUnknown = resolveMachineBaseResistance(SMITH_PROFILE, unknownProfile);
  assert.equal(withUnknown.applicable, true);
  assert.equal(withUnknown.status, 'unknown');
  assert.equal(withUnknown.weightKg, null);
  assert.equal(withUnknown.profileId, 'p-unk');
});

test('inferMachineResistanceClass classifies suggested, candidate, and none_expected', () => {
  assert.equal(
    inferMachineResistanceClass(
      { id: '1', n: 'Smith Bench Press', eq: 'smith machine', bp: 'chest', tg: 'pectorals' },
      SMITH_PROFILE
    ),
    'suggested'
  );

  assert.equal(
    inferMachineResistanceClass(
      { id: '2', n: '45° Leg Press', eq: 'sled machine', bp: 'upper legs', tg: 'quads' },
      PLATE_LOADED_PROFILE
    ),
    'inherent_resistance_candidate'
  );

  assert.equal(
    inferMachineResistanceClass(
      { id: '3', n: 'Barbell Bench Press', eq: 'barbell', bp: 'chest', tg: 'pectorals' },
      BARBELL_PROFILE
    ),
    'none_expected'
  );
});

test('normalizeLoggedSet sanitizes machine base resistance fields', () => {
  // Valid snapshot
  const set1: LoggedSet = {
    setIndex: 0,
    reps: 8,
    weightKg: 100,
    completed: true,
    setType: 'working',
    machineProfileId: 'mp-123',
    machineProfileLabel: 'Cybex Smith',
    machineBaseResistanceKg: 9.07,
    machineBaseResistanceStatus: 'suggested'
  };
  const validSnapshot = normalizeLoggedSet(set1);
  assert.equal(validSnapshot.machineProfileId, 'mp-123');
  assert.equal(validSnapshot.machineProfileLabel, 'Cybex Smith');
  assert.equal(validSnapshot.machineBaseResistanceKg, 9.07);
  assert.equal(validSnapshot.machineBaseResistanceStatus, 'suggested');

  // Unknown status should omit machineBaseResistanceKg or set undefined
  const set2: LoggedSet = {
    setIndex: 1,
    reps: 10,
    weightKg: 80,
    completed: true,
    setType: 'working',
    machineProfileId: 'mp-456',
    machineProfileLabel: 'Gym Sled',
    machineBaseResistanceKg: 25, // Invalid when unknown
    machineBaseResistanceStatus: 'unknown'
  };
  const unknownSnapshot = normalizeLoggedSet(set2);
  assert.equal(unknownSnapshot.machineBaseResistanceStatus, 'unknown');
  assert.equal(unknownSnapshot.machineBaseResistanceKg, undefined);

  // Negative weightKg should be omitted and status cleared
  const set3: LoggedSet = {
    setIndex: 2,
    reps: 5,
    weightKg: 60,
    completed: true,
    setType: 'working',
    machineBaseResistanceKg: -10,
    machineBaseResistanceStatus: 'user_defined'
  };
  const negativeKgSnapshot = normalizeLoggedSet(set3);
  assert.equal(negativeKgSnapshot.machineBaseResistanceKg, undefined);
  assert.equal(negativeKgSnapshot.machineBaseResistanceStatus, undefined);

  // Legacy set without machine fields is preserved unchanged
  const set4: LoggedSet = {
    setIndex: 3,
    reps: 12,
    weightKg: 70,
    completed: true,
    setType: 'working'
  };
  const legacySet = normalizeLoggedSet(set4);
  assert.equal(legacySet.machineProfileId, undefined);
  assert.equal(legacySet.machineBaseResistanceKg, undefined);
  assert.equal(legacySet.machineBaseResistanceStatus, undefined);

  // Canonical zero contract: suggested with 0 kg gets cleared
  const set5: LoggedSet = {
    setIndex: 4,
    reps: 8,
    weightKg: 80,
    completed: true,
    setType: 'working',
    machineBaseResistanceKg: 0,
    machineBaseResistanceStatus: 'suggested'
  };
  const zeroSuggested = normalizeLoggedSet(set5);
  assert.equal(zeroSuggested.machineBaseResistanceKg, undefined);
  assert.equal(zeroSuggested.machineBaseResistanceStatus, undefined);

  // Verified with authoritative provenance retains verified status and provenance fields
  const set6: LoggedSet = {
    setIndex: 5,
    reps: 8,
    weightKg: 80,
    completed: true,
    setType: 'working',
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'verified',
    machineBaseSourceUrl: 'https://example.com/spec',
    machineManufacturer: 'Hammer Strength',
    machineModel: 'Incline Press'
  };
  const verifiedSet = normalizeLoggedSet(set6);
  assert.equal(verifiedSet.machineBaseResistanceStatus, 'verified');
  assert.equal(verifiedSet.machineBaseResistanceKg, 15);
  assert.equal(verifiedSet.machineBaseSourceUrl, 'https://example.com/spec');
  assert.equal(verifiedSet.machineManufacturer, 'Hammer Strength');
  assert.equal(verifiedSet.machineModel, 'Incline Press');

  // Verified without authoritative provenance degrades to user_defined
  const set7: LoggedSet = {
    setIndex: 6,
    reps: 8,
    weightKg: 80,
    completed: true,
    setType: 'working',
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'verified',
    machineBaseSourceLabel: 'manual notes' // NOT authoritative by itself
  };
  const degradedSet = normalizeLoggedSet(set7);
  assert.equal(degradedSet.machineBaseResistanceStatus, 'user_defined');
  assert.equal(degradedSet.machineBaseResistanceKg, 15);
  assert.equal(degradedSet.machineBaseSourceLabel, 'manual notes');
});

test('isAuthoritativeProvenance strictly validates URLs and structured provenance', () => {
  // C: "https://" -> false
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'https://' }), false);
  // D: "http://" -> false
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'http://' }), false);
  // E: ftp URL -> false
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'ftp://manufacturer.com/manual' }), false);
  // Plain text -> false
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'manufacturer manual' }), false);
  // F: real http/https URL with hostname -> true
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'https://manufacturer.com/manual.pdf' }), true);
  assert.equal(isAuthoritativeProvenance({ sourceUrl: 'http://example.com/spec' }), true);
  // G: manufacturer + model + sourceLabel -> true
  assert.equal(isAuthoritativeProvenance({
    manufacturer: 'Hammer Strength',
    model: 'Linear Leg Press',
    sourceLabel: 'Official Service Manual 2022'
  }), true);

  // Incomplete structured provenance must FAIL
  assert.equal(isAuthoritativeProvenance({ sourceLabel: 'Service Manual Rev B' }), false);
  assert.equal(isAuthoritativeProvenance({ manufacturer: 'Matrix' }), false);
  assert.equal(isAuthoritativeProvenance({ model: 'XYZ123' }), false);
  assert.equal(isAuthoritativeProvenance({ manufacturer: 'Matrix', model: 'XYZ123' }), false);
  assert.equal(isAuthoritativeProvenance({ type: 'manual' }), false);
  assert.equal(isAuthoritativeProvenance({ type: 'manufacturer_spec' }), false);

  // Complete structured provenance must PASS
  assert.equal(isAuthoritativeProvenance({
    manufacturer: 'Matrix',
    model: 'XYZ123',
    sourceLabel: 'Service Manual Rev B'
  }), true);
  assert.equal(isAuthoritativeProvenance({
    type: 'manual',
    manufacturer: 'Matrix',
    model: 'XYZ123',
    sourceLabel: 'Service Manual Rev B'
  }), true);
  assert.equal(isAuthoritativeProvenance('https://manufacturer.com/manual.pdf'), true);
});

test('normalizeMachineBaseSelection normalizes profile-less and profile-backed selections', () => {
  // H: profile-less unknown + 20 -> degraded to unknown with undefined kg
  const degradedUnknown = normalizeMachineBaseSelection({
    status: 'unknown',
    weightKg: 20
  });
  assert.equal(degradedUnknown.status, 'unknown');
  assert.equal(degradedUnknown.weightKg, undefined);

  // I: profile-less none + 15 -> degraded to unknown with undefined kg
  const degradedNone = normalizeMachineBaseSelection({
    status: 'none',
    weightKg: 15
  });
  assert.equal(degradedNone.status, 'unknown');
  assert.equal(degradedNone.weightKg, undefined);

  // J: profile-less none + 0 -> valid none with weight 0
  const validNone = normalizeMachineBaseSelection({
    status: 'none',
    weightKg: 0
  });
  assert.equal(validNone.status, 'none');
  assert.equal(validNone.weightKg, 0);

  // K: profile-less suggested + positive kg -> valid suggested with positive kg
  const validSuggested = normalizeMachineBaseSelection({
    status: 'suggested',
    weightKg: 9.07
  });
  assert.equal(validSuggested.status, 'suggested');
  assert.equal(validSuggested.weightKg, 9.07);

  // profile-less suggested + 0 -> degraded to unknown
  const invalidSuggestedZero = normalizeMachineBaseSelection({
    status: 'suggested',
    weightKg: 0
  });
  assert.equal(invalidSuggestedZero.status, 'unknown');
  assert.equal(invalidSuggestedZero.weightKg, undefined);

  // profile-less verified -> degraded to unknown
  const invalidVerifiedNoProfile = normalizeMachineBaseSelection({
    status: 'verified',
    weightKg: 15
  });
  assert.equal(invalidVerifiedNoProfile.status, 'unknown');
  assert.equal(invalidVerifiedNoProfile.weightKg, undefined);

  // profile-less user_defined -> degraded to unknown
  const invalidUserDefinedNoProfile = normalizeMachineBaseSelection({
    status: 'user_defined',
    weightKg: 15
  });
  assert.equal(invalidUserDefinedNoProfile.status, 'unknown');
  assert.equal(invalidUserDefinedNoProfile.weightKg, undefined);
});

test('normalizeMachineBaseSelection regression: Smith suggestions = [20 lb, 22 lb] MUST NOT auto-select 20 lb on null weightKg', () => {
  const normalized = normalizeMachineBaseSelection({
    status: 'suggested',
    weightKg: null
  });

  assert.notEqual(normalized.weightKg, 9.07);
  assert.notEqual(normalized.weightKg, 10);
  assert.equal(normalized.status, 'unknown');
  assert.equal(normalized.weightKg, undefined);
});
