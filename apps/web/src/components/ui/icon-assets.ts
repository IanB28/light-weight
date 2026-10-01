export interface MaskedIconAsset {
  src: string;
  opticalScale: number;
}

export const NAVIGATION_ICON_ASSETS = {
  home: { src: '/icons/navigation/home.png', opticalScale: 1.05 },
  plan: { src: '/icons/navigation/plan.png', opticalScale: 0.94 },
  workout: { src: '/icons/navigation/workout.png', opticalScale: 0.96 },
  stats: { src: '/icons/navigation/progress.png', opticalScale: 1.16 },
  exercises: { src: '/icons/navigation/exercises.png', opticalScale: 0.88 }
} as const satisfies Record<string, MaskedIconAsset>;

export const SEMANTIC_ICON_ASSETS = {
  personalRecord: { src: '/icons/ui/pr_icon.png', opticalScale: 1 },
  bodyweight: { src: '/icons/ui/weight.png', opticalScale: 1.08 },
  goalWeight: { src: '/icons/ui/goal.png', opticalScale: 1.22 }
} as const satisfies Record<string, MaskedIconAsset>;
