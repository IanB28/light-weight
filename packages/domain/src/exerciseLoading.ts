import type {
  Exercise,
  ExerciseLoadingProfile,
  ExerciseLoadMechanism,
  ExerciseLoadMode,
  ExercisePlateBase
} from './types.js';
import { poundsToKilograms } from './weight.js';

export type ExerciseLoadingProfileSource = 'explicit' | 'override' | 'fallback' | 'default';

export interface ResolvedExerciseLoadingProfile {
  profile: ExerciseLoadingProfile;
  source: ExerciseLoadingProfileSource;
}

export interface ExerciseLoadingResolutionOptions {
  legacyEquipment?: string;
}

export const DEFAULT_EXERCISE_LOADING_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'other',
  loadMode: 'total',
  supportsKeyboard: true,
  supportsPlates: false,
  supportsExternalLoad: true,
  includeBarWeight: false
});

const BARBELL_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'barbell', loadMode: 'total', supportsKeyboard: false,
  supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true
});
const DUMBBELL_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'dumbbell', loadMode: 'per_hand', supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false
});
const PLATE_LOADED_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'plate_loaded', loadMode: 'total', supportsKeyboard: true,
  supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false
});
const SMITH_PROFILE: ExerciseLoadingProfile = Object.freeze({
  ...PLATE_LOADED_PROFILE,
  plateBase: {
    kind: 'fixed' as const,
    weightKg: poundsToKilograms(20),
    selectableWeightsKg: [poundsToKilograms(20), poundsToKilograms(22)],
    label: 'smith' as const
  }
});
const SELECTORIZED_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'selectorized', loadMode: 'total', supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false
});
export const BODYWEIGHT_FULL_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'bodyweight', loadMode: 'added_weight', supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false,
  bodyweightFactor: 1
});
export const BODYWEIGHT_ASSISTED_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'bodyweight', loadMode: 'assisted', supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false,
  bodyweightFactor: 1
});
export const BODYWEIGHT_GENERAL_PROFILE: ExerciseLoadingProfile = Object.freeze({
  mechanism: 'bodyweight', loadMode: 'added_weight', supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false
});
const BODYWEIGHT_PROFILE = BODYWEIGHT_GENERAL_PROFILE;

const cableProfile = (loadMode: ExerciseLoadMode): ExerciseLoadingProfile => ({
  mechanism: 'cable', loadMode, supportsKeyboard: true,
  supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false
});

const selectorizedProfile = (loadMode: ExerciseLoadMode): ExerciseLoadingProfile => ({
  ...SELECTORIZED_PROFILE,
  loadMode
});

const defaultPlateBase = (profile: ExerciseLoadingProfile): ExercisePlateBase => profile.mechanism === 'barbell' ? { kind: 'user_bar' } : { kind: 'none' };
const cloneProfile = (profile: ExerciseLoadingProfile): ExerciseLoadingProfile => ({
  ...profile,
  bodyweightFactor: profile.bodyweightFactor,
  plateBase: profile.plateBase ? { ...profile.plateBase, selectableWeightsKg: profile.plateBase.selectableWeightsKg ? [...profile.plateBase.selectableWeightsKg] : undefined } : defaultPlateBase(profile)
});

export function resolvePlateBaseWeightKg(profile: ExerciseLoadingProfile, userBarWeightKg: number, selectedBaseWeightKg?: number): number {
  const base = profile.plateBase || defaultPlateBase(profile);
  if (base.kind === 'user_bar') return Math.max(0, userBarWeightKg);
  if (base.kind === 'fixed') {
    const choices = base.selectableWeightsKg || [];
    return choices.some((choice) => Math.abs(choice - (selectedBaseWeightKg ?? -1)) < 0.001) ? selectedBaseWeightKg! : Math.max(0, base.weightKg || 0);
  }
  return 0;
}

export const EXERCISE_LOADING_OVERRIDES: Readonly<Record<string, ExerciseLoadingProfile>> = Object.freeze({
  'ex-0739': PLATE_LOADED_PROFILE, // Sled 45° leg press
  'ex-0743': PLATE_LOADED_PROFILE, // Sled hack squat
  'ex-0748': SMITH_PROFILE, // Smith bench press
  'ex-0755': SMITH_PROFILE, // Smith hack squat
  'ex-0760': SMITH_PROFILE, // Smith leg press
  'ex-0585': SELECTORIZED_PROFILE, // Lever leg extension
  'ex-0189': cableProfile('per_side'), // Cable one arm bent-over row
  'ex-0214': cableProfile('per_side'), // Cable seated one arm alternate row
  'ex-0841': BODYWEIGHT_FULL_PROFILE, // Weighted pull-up
  'ex-1755': BODYWEIGHT_FULL_PROFILE, // Weighted tricep dip
  'ex-0017': BODYWEIGHT_ASSISTED_PROFILE, // Assisted pull-up
  'ex-0009': BODYWEIGHT_ASSISTED_PROFILE, // Assisted chest dip (kneeling)
  'ex-0019': BODYWEIGHT_ASSISTED_PROFILE, // Assisted triceps dip (kneeling)
  'ex-1431': BODYWEIGHT_ASSISTED_PROFILE, // Assisted standing chin-up
  'ex-1432': BODYWEIGHT_ASSISTED_PROFILE, // Assisted standing pull-up
  'ex-2364': BODYWEIGHT_ASSISTED_PROFILE, // Assisted wide-grip chest dip
  'ex-0572': BODYWEIGHT_ASSISTED_PROFILE, // Lever assisted chin-up
  'ex-0285': DUMBBELL_PROFILE, // Dumbbell alternate biceps curl
  'ex-0289': DUMBBELL_PROFILE // Dumbbell bench press
});

const LOAD_MECHANISMS = new Set<ExerciseLoadMechanism>([
  'barbell', 'dumbbell', 'plate_loaded', 'selectorized', 'cable', 'bodyweight', 'other'
]);
const LOAD_MODES = new Set<ExerciseLoadMode>(['total', 'per_side', 'per_hand', 'added_weight', 'assisted']);

export function isExerciseLoadingProfile(value: unknown): value is ExerciseLoadingProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ExerciseLoadingProfile>;
  return LOAD_MECHANISMS.has(candidate.mechanism as ExerciseLoadMechanism)
    && LOAD_MODES.has(candidate.loadMode as ExerciseLoadMode)
    && typeof candidate.supportsKeyboard === 'boolean'
    && typeof candidate.supportsPlates === 'boolean'
    && typeof candidate.supportsExternalLoad === 'boolean'
    && typeof candidate.includeBarWeight === 'boolean'
    && (candidate.bodyweightFactor === undefined || (typeof candidate.bodyweightFactor === 'number' && Number.isFinite(candidate.bodyweightFactor)));
}

const UNILATERAL_NAME_PATTERN = /\b(?:unilateral|one[ -]?(?:arm|hand|leg|foot)|single[ -]?(?:arm|hand|leg|foot)|alternat(?:e|ed|ing)|un[ -]?brazo|una[ -]?(?:mano|pierna)|altern(?:o|a|ado|ada))\b/i;
const UNILATERAL_INSTRUCTION_PATTERN = /\b(?:one (?:arm|hand|leg|foot) at a time|repeat (?:with|on) the other (?:arm|hand|leg|foot|side)|switch (?:arms|hands|legs|feet|sides)|each (?:arm|hand|leg|foot)|opposite (?:arm|hand|leg|foot))\b/i;
const SMITH_NAME_PATTERN = /\bsmith(?:\s+machine)?\b/i;

export function isLegacyUnilateralExercise(
  exercise: Pick<Exercise, 'name' | 'instructions'>
): boolean {
  return UNILATERAL_NAME_PATTERN.test(exercise.name)
    || UNILATERAL_INSTRUCTION_PATTERN.test((exercise.instructions || []).join(' '));
}

const FULL_BODYWEIGHT_NAME_PATTERN = /\b(?:pull[ -]?ups?|chin[ -]?ups?|chest dip|triceps? dip|muscle[ -]?ups?|dominadas?|fondos?(?:\s+en\s+paralelas)?)\b/i;
const ASSISTED_NAME_PATTERN = /\b(?:assisted|asistid[oa]s?)\b/i;

function resolveFallbackProfile(
  exercise: Pick<Exercise, 'category' | 'name' | 'instructions'>,
  legacyEquipment = ''
): ExerciseLoadingProfile | null {
  const equipment = legacyEquipment.toLowerCase();
  const unilateral = isLegacyUnilateralExercise(exercise);

  // Some API/database rows predate equipment persistence. Name recognition is
  // intentionally centralized here so web and API rebuild the same safe base.
  if (equipment.includes('smith') || SMITH_NAME_PATTERN.test(exercise.name)) return SMITH_PROFILE;
  if (equipment.includes('sled') || equipment.includes('plate loaded') || equipment.includes('plate-loaded')) {
    return PLATE_LOADED_PROFILE;
  }
  if (equipment.includes('barbell') || equipment.includes('olympic') || exercise.category === 'barbell') return BARBELL_PROFILE;
  if (equipment.includes('dumbbell') || exercise.category === 'dumbbell') return DUMBBELL_PROFILE;
  if (equipment.includes('cable') || exercise.category === 'cable') return cableProfile(unilateral ? 'per_side' : 'total');

  const isAssistedMovement = equipment.includes('assisted') || ASSISTED_NAME_PATTERN.test(exercise.name);
  const isFullBodyweightMovement = FULL_BODYWEIGHT_NAME_PATTERN.test(exercise.name);

  if (isAssistedMovement && isFullBodyweightMovement) return BODYWEIGHT_ASSISTED_PROFILE;
  if (isFullBodyweightMovement && (equipment.includes('body weight') || exercise.category === 'bodyweight')) {
    return BODYWEIGHT_FULL_PROFILE;
  }
  if (equipment.includes('body weight') || isAssistedMovement || exercise.category === 'bodyweight') {
    return BODYWEIGHT_GENERAL_PROFILE;
  }
  if (equipment.includes('machine') || equipment.includes('leverage') || exercise.category === 'machine') {
    return selectorizedProfile(unilateral ? 'per_side' : 'total');
  }
  return null;
}

export function resolveExerciseLoadingProfile(
  exercise: Pick<Exercise, 'id' | 'category' | 'name' | 'instructions' | 'loading'>,
  options: ExerciseLoadingResolutionOptions = {}
): ResolvedExerciseLoadingProfile {
  const override = EXERCISE_LOADING_OVERRIDES[exercise.id];
  if (isExerciseLoadingProfile(exercise.loading)) {
    // Database rows predate plate-base metadata. Keep explicit mechanics but restore
    // curated equipment semantics when the metadata was not persisted.
    const fallbackPlateBase = resolveFallbackProfile(exercise, options.legacyEquipment)?.plateBase;
    const plateBase = exercise.loading.plateBase ?? override?.plateBase ?? fallbackPlateBase;
    return { profile: cloneProfile({ ...exercise.loading, plateBase }), source: 'explicit' };
  }

  if (override) return { profile: cloneProfile(override), source: 'override' };

  const fallback = resolveFallbackProfile(exercise, options.legacyEquipment);
  if (fallback) return { profile: cloneProfile(fallback), source: 'fallback' };

  return { profile: cloneProfile(DEFAULT_EXERCISE_LOADING_PROFILE), source: 'default' };
}

/** Physical plates are mounted symmetrically for barbells and plate-loaded machines. */
export function getPlateLoadMultiplier(profile: ExerciseLoadingProfile): 1 | 2 {
  return profile.mechanism === 'barbell' || profile.mechanism === 'plate_loaded' ? 2 : 1;
}
