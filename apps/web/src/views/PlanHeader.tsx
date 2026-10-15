import { ViewHeader } from '../components/ViewHeader.js';
import { PlanSectionSelector, type PlanSection } from './PlanSectionSelector.js';
import { useI18n } from '../lib/i18n.js';

interface PlanHeaderProps {
  section: PlanSection;
  onSectionChange: (section: PlanSection) => void;
  isWorkoutActive: boolean;
  activeWorkoutDuration: string;
  onNavigateToWorkout: () => void;
  onOpenSettings: () => void;
}

export function PlanHeader({ section, onSectionChange, isWorkoutActive, activeWorkoutDuration, onNavigateToWorkout, onOpenSettings }: PlanHeaderProps) {
  const { t } = useI18n();
  return <div className="mb-4 space-y-3">
    <ViewHeader
      title={t('plan.title')}
      subtitle={t('plan.subtitle')}
      isWorkoutActive={isWorkoutActive}
      activeWorkoutDuration={activeWorkoutDuration}
      onNavigateToWorkout={onNavigateToWorkout}
      onOpenSettings={onOpenSettings}
    />
    <PlanSectionSelector value={section} onChange={onSectionChange} />
  </div>;
}
