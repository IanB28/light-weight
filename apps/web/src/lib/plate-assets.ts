import { poundsToKilograms } from '@light-weight/domain';
import type { UnitSystem } from './preferences.js';
import { displayWeight, weightsMatch } from './weight-units.js';

export interface PlateAssetEntry {
  readonly displayWeight: number;
  readonly assetPath: string;
}

/**
 * Metric plate PNG asset definitions.
 * Stored in /discos/kg/
 * Filenames on disk respect exact naming conventions (including comma-based decimals).
 */
export const METRIC_PLATE_ASSETS: readonly PlateAssetEntry[] = [
  { displayWeight: 25, assetPath: '/discos/kg/25.png' },
  { displayWeight: 20, assetPath: '/discos/kg/20.png' },
  { displayWeight: 15, assetPath: '/discos/kg/15.png' },
  { displayWeight: 10, assetPath: '/discos/kg/10.png' },
  { displayWeight: 5, assetPath: '/discos/kg/5.png' },
  { displayWeight: 2.5, assetPath: '/discos/kg/2,5.png' },
  { displayWeight: 1.25, assetPath: '/discos/kg/1,25.png' }
] as const;

/**
 * Imperial plate PNG asset definitions.
 * Stored in /discos/lbs/
 * Filenames on disk respect exact naming conventions (including comma-based decimals).
 */
export const IMPERIAL_PLATE_ASSETS: readonly PlateAssetEntry[] = [
  { displayWeight: 45, assetPath: '/discos/lbs/45.png' },
  { displayWeight: 35, assetPath: '/discos/lbs/35.png' },
  { displayWeight: 25, assetPath: '/discos/lbs/25.png' },
  { displayWeight: 15, assetPath: '/discos/lbs/15.png' },
  { displayWeight: 10, assetPath: '/discos/lbs/10.png' },
  { displayWeight: 5, assetPath: '/discos/lbs/5.png' },
  { displayWeight: 2.5, assetPath: '/discos/lbs/2,5.png' }
] as const;

export const STANDARD_METRIC_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export const STANDARD_IMPERIAL_PLATES_KG: readonly number[] = [
  poundsToKilograms(45),
  poundsToKilograms(35),
  poundsToKilograms(25),
  poundsToKilograms(15),
  poundsToKilograms(10),
  poundsToKilograms(5),
  poundsToKilograms(2.5)
] as const;

/**
 * Returns the standard plate catalog weights (in kg) for the given unit system.
 */
export function getStandardPlateCatalogKg(units: UnitSystem): readonly number[] {
  return units === 'imperial' ? STANDARD_IMPERIAL_PLATES_KG : STANDARD_METRIC_PLATES_KG;
}

/**
 * Resolves the public asset URL for a plate given its internal weight in kg
 * and the active unit system.
 * Returns null if no matching asset exists (triggering fallback UI).
 */
export function resolvePlateAsset(weightKg: number, units: UnitSystem): string | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  const targetDisplayWeight = displayWeight(weightKg, units);
  const manifest = units === 'imperial' ? IMPERIAL_PLATE_ASSETS : METRIC_PLATE_ASSETS;
  const match = manifest.find((entry) => weightsMatch(entry.displayWeight, targetDisplayWeight, 0.05));
  return match?.assetPath ?? null;
}
