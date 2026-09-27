import React from 'react';
import { Routine, Exercise, normalizeRoutine } from '@light-weight/domain';
import { RoutineEditorModal } from './RoutineEditorModal.js';
import { AppPreferences } from '../lib/preferences.js';

export type RoutineCreationStep = 'details' | 'exercises';

export function toggleSelectionOrder(prevIds: string[], id: string): string[] {
  return prevIds.includes(id)
    ? prevIds.filter((x) => x !== id)
    : [...prevIds, id];
}

export function canProceedToStep2(name: string): boolean {
  return name.trim().length > 0;
}

export function canSaveRoutine(name: string, exerciseIds: string[]): boolean {
  return name.trim().length > 0 && exerciseIds.length > 0;
}

export function buildRoutinePayload(
  name: string,
  description: string,
  exerciseIds: string[],
  ownerId?: string
): Routine {
  const raw: Routine = {
    id: 'rt-' + Date.now(),
    userId: ownerId || 'local-anonymous',
    name: name.trim(),
    description: description.trim() || undefined,
    exerciseIds: [...exerciseIds],
  };
  return normalizeRoutine(raw) || raw;
}

export interface CreateRoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  onSaveRoutine: (newRoutine: Routine) => void;
  ownerId?: string;
  preferences?: AppPreferences;
}

export const CreateRoutineModal: React.FC<CreateRoutineModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSaveRoutine,
  ownerId,
  preferences
}) => {
  return (
    <RoutineEditorModal
      isOpen={isOpen}
      onClose={onClose}
      availableExercises={availableExercises}
      onSaveRoutine={onSaveRoutine}
      mode="create"
      ownerId={ownerId}
      preferences={preferences}
    />
  );
};
