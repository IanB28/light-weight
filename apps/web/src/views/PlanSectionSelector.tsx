import React from 'react';
import { SegmentedControl } from '../components/ui/index.js';
import { useI18n } from '../lib/i18n.js';

export type PlanSection = 'week' | 'exercises';

export function PlanSectionSelector({ value, onChange }: { value: PlanSection; onChange: (section: PlanSection) => void }) {
  const { t } = useI18n();
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      label={t('plan.sections')}
      options={[
        { value: 'week', label: t('plan.weekAndRoutines') },
        { value: 'exercises', label: t('nav.exercises') }
      ]}
    />
  );
}
