import React, { useEffect, useState } from 'react';
import { Dumbbell, Pause, Play, Sparkles } from 'lucide-react';
import { Exercise } from '@light-weight/domain';
import { getExerciseGifUrl, getExerciseImgUrl } from '../lib/exercises.js';
import { useExerciseLabels, useI18n } from '../lib/i18n.js';
import { BottomSheet, Button } from './ui/index.js';
import { ExerciseAnatomyMap } from './charts/ExerciseAnatomyMap.js';

interface ExerciseMediaModalProps {
  exercise: Exercise | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExerciseMediaModal: React.FC<ExerciseMediaModalProps> = ({ exercise, isOpen, onClose }) => {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (isOpen) setIsPlaying(true);
  }, [exercise?.id, isOpen]);

  if (!exercise) return null;
  const gifUrl = getExerciseGifUrl(exercise);
  const imgUrl = getExerciseImgUrl(exercise);

  return <BottomSheet open={isOpen} onClose={onClose} title={exercise.name} description={t('exercise.techniqueGuide')} className="sm:max-w-lg">
    <div className="space-y-4">
      {gifUrl || imgUrl ? (
        <button type="button" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? t('exercise.pauseDemo') : t('exercise.playDemo')} className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-ui-xl border border-border-subtle bg-app/60 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <img src={isPlaying && gifUrl ? gifUrl : imgUrl || gifUrl || ''} alt={exercise.name} loading="eager" className="size-full object-contain" />
          <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 font-mono text-[11px] text-text-secondary shadow-card">
            {isPlaying ? <Pause aria-hidden="true" className="size-3 fill-accent text-accent" /> : <Play aria-hidden="true" className="size-3 fill-accent text-accent" />}
            {isPlaying ? t('exercise.pause') : t('exercise.playGif')}
          </span>
        </button>
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-ui-xl border border-border-subtle bg-surface-input text-text-muted">
          <Dumbbell aria-hidden="true" className="size-8 stroke-[1.5]" />
          <span className="text-xs">{t('exercise.noDemo')}</span>
        </div>
      )}

      <p className="text-xs text-text-muted">{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}{exercise.targetMuscle ? ` · ${t('exercise.target')}: ${exercise.targetMuscle}` : ''}</p>

      <ExerciseAnatomyMap exercise={exercise} />

      {exercise.instructions && exercise.instructions.length > 0 && <section className="space-y-2 pt-1">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary"><Sparkles aria-hidden="true" className="size-3.5 text-warning" />{t('exercise.steps')}</h4>
        <ol className="list-inside list-decimal space-y-2 pl-1 text-xs leading-relaxed text-text-secondary">
          {exercise.instructions.map((step, index) => <li key={index} className="pl-1 marker:font-bold marker:text-accent"><span>{step}</span></li>)}
        </ol>
      </section>}

      <Button variant="secondary" onClick={onClose} className="w-full">{t('exercise.closeGuide')}</Button>
    </div>
  </BottomSheet>;
};
