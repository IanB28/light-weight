export const shouldShowExerciseImage = (url: string | null, failedUrl: string | null) =>
  Boolean(url && failedUrl !== url);
