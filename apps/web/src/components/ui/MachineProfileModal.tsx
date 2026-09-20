import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Edit2, X } from 'lucide-react';
import { BottomSheet } from './Disclosure.js';
import { Button } from './Button.js';
import { useI18n } from '../../lib/i18n.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { formatDisplayWeight } from '../../lib/weight-units.js';
import {
  type MachineProfile,
  type BaseResistanceStatus,
  kilogramsToPounds,
  poundsToKilograms
} from '@light-weight/domain';
import {
  getMachineProfilesForExercise,
  saveMachineProfile,
  deleteMachineProfile
} from '../../lib/machine-profiles.js';

export interface MachineProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseId: string;
  exerciseName: string;
  suggestions?: readonly { weightKg: number; label?: string }[];
  currentProfileId?: string;
  currentStatus?: BaseResistanceStatus;
  currentWeightKg?: number;
  onSelectProfile: (
    profile: MachineProfile | null,
    status: BaseResistanceStatus,
    weightKg: number | null
  ) => void;
}

export function MachineProfileModal({
  isOpen,
  onClose,
  exerciseId,
  exerciseName,
  suggestions = [],
  currentProfileId,
  currentStatus = 'unknown',
  currentWeightKg: _currentWeightKg,
  onSelectProfile
}: MachineProfileModalProps) {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const isImperial = preferences.units === 'imperial';
  const unitLabel = isImperial ? 'lb' : 'kg';

  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [formLabel, setFormLabel] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formManufacturer, setFormManufacturer] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const refreshProfiles = () => {
    if (exerciseId) {
      setProfiles(getMachineProfilesForExercise(exerciseId));
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshProfiles();
      setIsCreating(false);
      setEditingId(null);
      setFormError(null);
    }
  }, [isOpen, exerciseId]);

  const handleStartCreate = () => {
    setFormLabel('');
    setFormWeight('');
    setFormManufacturer('');
    setFormError(null);
    setEditingId(null);
    setIsCreating(true);
  };

  const handleStartEdit = (profile: MachineProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormLabel(profile.label);
    const displayWeight = profile.baseResistanceKg !== undefined
      ? isImperial
        ? kilogramsToPounds(profile.baseResistanceKg).toFixed(1)
        : profile.baseResistanceKg.toString()
      : '';
    setFormWeight(displayWeight);
    setFormManufacturer(profile.manufacturer || '');
    setFormError(null);
    setEditingId(profile.id);
    setIsCreating(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      setFormError(`${t('workout.machineBaseLabel')} requerido`);
      return;
    }

    const num = parseFloat(formWeight.replace(',', '.'));
    if (isNaN(num) || num < 0) {
      setFormError('Introduce un peso válido (0 o mayor)');
      return;
    }

    const weightKg = isImperial ? poundsToKilograms(num) : num;

    try {
      const saved = saveMachineProfile({
        id: editingId || undefined,
        exerciseId,
        label: formLabel.trim(),
        baseResistanceStatus: weightKg === 0 ? 'none' : 'user_defined',
        baseResistanceKg: Math.round(weightKg * 100) / 100,
        manufacturer: formManufacturer.trim() || undefined
      });

      refreshProfiles();
      setIsCreating(false);
      setEditingId(null);
      onSelectProfile(saved, saved.baseResistanceStatus, saved.baseResistanceKg ?? (saved.baseResistanceStatus === 'none' ? 0 : null));
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMachineProfile(id);
    refreshProfiles();
    if (currentProfileId === id) {
      onSelectProfile(null, 'unknown', null);
    }
  };

  const handleSelectUnknown = () => {
    onSelectProfile(null, 'unknown', null);
    onClose();
  };

  const handleSelectNone = () => {
    // 0 kg tare
    onSelectProfile(null, 'none', 0);
    onClose();
  };

  const handleSelectSuggestion = (suggestion: { weightKg: number; label?: string }) => {
    const label = suggestion.label
      ? `${exerciseName} (${suggestion.label})`
      : `${exerciseName} (${suggestion.weightKg} kg)`;

    try {
      const saved = saveMachineProfile({
        exerciseId,
        label,
        baseResistanceStatus: 'suggested',
        baseResistanceKg: suggestion.weightKg,
        sourceLabel: suggestion.label
      });

      refreshProfiles();
      onSelectProfile(saved, 'suggested', suggestion.weightKg);
      onClose();
    } catch {
      // Fallback
      onSelectProfile(null, 'suggested', suggestion.weightKg);
      onClose();
    }
  };

  const handleSelectProfile = (p: MachineProfile) => {
    onSelectProfile(
      p,
      p.baseResistanceStatus,
      p.baseResistanceKg ?? (p.baseResistanceStatus === 'none' ? 0 : null)
    );
    onClose();
  };

  const formatWeight = (kg?: number | null) => {
    if (kg === undefined || kg === null) return '';
    return formatDisplayWeight(kg, preferences.units);
  };

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title={t('workout.machineBaseModalTitle')}
    >
      <div className="space-y-4 pb-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('workout.machineBaseModalSubtitle')}
        </p>

        {isCreating ? (
          <form onSubmit={handleSaveForm} className="space-y-3 rounded-ui-lg border border-border-subtle bg-surface-input p-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs text-text-primary">
                {editingId ? t('workout.machineBaseEditCustom') : t('workout.machineBaseAddCustom')}
              </h4>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-text-muted hover:text-text-primary p-1"
                aria-label="Cerrar formulario"
              >
                <X className="size-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                {t('workout.machineBaseLabel')} *
              </label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder={t('workout.machineBaseLabelPlaceholder')}
                className="w-full rounded-ui border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                {t('workout.machineBaseWeight')} ({unitLabel}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formWeight}
                onChange={(e) => setFormWeight(e.target.value)}
                placeholder={t('workout.machineBaseWeightPlaceholder')}
                className="w-full rounded-ui border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                {t('workout.machineBaseManufacturer')}
              </label>
              <input
                type="text"
                value={formManufacturer}
                onChange={(e) => setFormManufacturer(e.target.value)}
                placeholder={t('workout.machineBaseManufacturerPlaceholder')}
                className="w-full rounded-ui border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            {formError && (
              <p className="text-[11px] text-danger">{formError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsCreating(false)}
                className="flex-1 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="flex-1 text-xs font-semibold"
              >
                {t('workout.machineBaseSave')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {/* Quick Unconfigured option */}
            <button
              type="button"
              onClick={handleSelectUnknown}
              className={`w-full text-left p-3 rounded-ui-lg border transition-all flex items-center justify-between ${
                currentStatus === 'unknown' && !currentProfileId
                  ? 'border-accent bg-accent/10'
                  : 'border-border-subtle bg-surface-input hover:border-border-default'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary">
                  <span>{t('workout.machineBaseNoProfile')}</span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                  {t('workout.machineBaseNoProfileDesc')}
                </p>
              </div>
              {currentStatus === 'unknown' && !currentProfileId && (
                <Check className="size-4 text-accent shrink-0 ml-2" />
              )}
            </button>

            {/* Zero resistance option */}
            <button
              type="button"
              onClick={handleSelectNone}
              className={`w-full text-left p-3 rounded-ui-lg border transition-all flex items-center justify-between ${
                currentStatus === 'none' && !currentProfileId
                  ? 'border-accent bg-accent/10'
                  : 'border-border-subtle bg-surface-input hover:border-border-default'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary">
                  <span>{t('workout.machineBaseNone')}</span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                  Ideal para carros 100% contrapesados o poleas directas sin resistencia parásita.
                </p>
              </div>
              {currentStatus === 'none' && !currentProfileId && (
                <Check className="size-4 text-accent shrink-0 ml-2" />
              )}
            </button>

            {/* Catalog suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <h4 className="font-bold uppercase tracking-wider text-[10px] text-text-muted">
                  {t('workout.machineBaseSuggestions')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="p-2.5 rounded-ui border border-border-subtle bg-surface-input hover:border-accent/50 text-left transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-semibold text-text-primary block">
                          {sug.label || `${sug.weightKg} kg`}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          ≈ {formatWeight(sug.weightKg)}
                        </span>
                      </div>
                      <Plus className="size-3.5 text-text-muted" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saved profiles */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold uppercase tracking-wider text-[10px] text-text-muted">
                  {t('workout.machineBaseSavedProfiles')}
                </h4>
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                >
                  <Plus className="size-3" />
                  <span>{t('workout.machineBaseAddCustom')}</span>
                </button>
              </div>

              {profiles.length === 0 ? (
                <div className="rounded-ui border border-border-subtle/50 bg-surface-input/50 p-3 text-center text-xs text-text-muted">
                  Aún no has guardado máquinas específicas para este ejercicio.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {profiles.map((p) => {
                    const isSelected = currentProfileId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProfile(p)}
                        className={`group p-2.5 rounded-ui border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-border-subtle bg-surface-input hover:border-border-default'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary truncate">
                              {p.label}
                            </span>
                            <span className="font-mono text-xs font-bold text-accent">
                              {formatWeight(p.baseResistanceKg ?? 0)}
                            </span>
                          </div>
                          {(p.manufacturer || p.sourceLabel) && (
                            <p className="text-[10px] text-text-muted truncate">
                              {[p.manufacturer, p.sourceLabel].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(p, e)}
                            className="p-1 text-text-muted hover:text-text-primary rounded"
                            aria-label="Editar"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(p.id, e)}
                            className="p-1 text-text-muted hover:text-danger rounded"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          {isSelected && (
                            <Check className="size-4 text-accent ml-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
