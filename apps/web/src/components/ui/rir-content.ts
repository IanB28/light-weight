import type { TranslationKey } from '../../lib/i18n.js';

export interface RirScaleItem {
  value: number;
  label: string;
  descriptionKey: TranslationKey;
}

export const RIR_SCALE_ITEMS: readonly RirScaleItem[] = [
  { value: 0, label: '0', descriptionKey: 'workout.rir0Desc' },
  { value: 1, label: '1', descriptionKey: 'workout.rir1Desc' },
  { value: 2, label: '2', descriptionKey: 'workout.rir2Desc' },
  { value: 3, label: '3', descriptionKey: 'workout.rir3Desc' },
  { value: 4, label: '4', descriptionKey: 'workout.rir4Desc' },
  { value: 5, label: '5', descriptionKey: 'workout.rir5Desc' },
  { value: 6, label: '6+', descriptionKey: 'workout.rir6PlusDesc' }
] as const;
