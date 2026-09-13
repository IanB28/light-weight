import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Database, Download, Dumbbell, Languages, Palette, RefreshCw, Sparkles, Upload, UserRound } from 'lucide-react';
import { Exercise, WorkoutSession } from '@light-weight/domain';
import {
  getStoredBodyweight, getStoredHistory, getStoredProfile, getStoredRoutines,
  getStoredTargetWeight, getStoredWeeklySchedule, saveStoredBodyweight,
  saveStoredHistory, saveStoredProfile, saveStoredRoutines, saveStoredTargetWeight,
  saveStoredWeeklySchedule, UserInfo, UserProfile
} from '../lib/storage.js';
import { syncWithCloud } from '../lib/sync.js';
import { AccentColorId, ACCENT_PRESETS, applyTheme, GlassTheme, GLASS_THEMES, getStoredThemeSettings, ThemeSettings } from '../lib/theme.js';
import { parseAppPreferences, saveStoredPreferences } from '../lib/preferences.js';
import type { UnitSystem } from '../lib/preferences.js';
import { usePreferences } from '../lib/preferences-context.js';
import { TranslationKey, useI18n } from '../lib/i18n.js';
import {
  displayWeight,
  parseDisplayWeight,
  usesUnitDefaults,
  weightsMatch,
  WEIGHT_UNIT_PRESETS
} from '../lib/weight-units.js';
import { ProfileView } from '../features/profile/ProfileView.js';
import { BottomSheet, Button, OptionPicker, SectionHeader, SegmentedControl } from './ui/index.js';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
  profile: UserProfile;
  userInfo: UserInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
  onProfileChange: (profile: UserProfile) => void;
}

type SettingsPanel = 'root' | 'profile' | 'training' | 'appearance' | 'theme' | 'accent' | 'language' | 'data';
type StatusMessage = { tone: 'success' | 'error'; text: string } | null;

function SettingsRow({ icon, label, value, onClick, disabled }: { icon: React.ReactNode; label: string; value?: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-14 w-full items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-accent">{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-bold text-text-primary">{label}</span>
      {value && <span className="max-w-[45%] truncate text-xs text-text-muted">{value}</span>}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </button>
  );
}

export function SettingsSheet({ isOpen, onClose, onDataRestored, profile, userInfo, history, exercises, onProfileChange }: SettingsSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<SettingsPanel>('root');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getStoredThemeSettings());
  const { preferences, updatePreferences, reloadPreferences } = usePreferences();
  const { language, setLanguage, t } = useI18n();
  const themeName = (id: GlassTheme) => t(`theme.${id}` as TranslationKey);
  const accentName = (id: AccentColorId) => t(`accent.${id}` as TranslationKey);

  useEffect(() => { if (!isOpen) { setPanel('root'); setStatus(null); } }, [isOpen]);

  const close = () => { setPanel('root'); setStatus(null); onClose(); };
  const chooseTheme = (glassTheme: GlassTheme) => { const updated = { ...themeSettings, glassTheme }; setThemeSettings(updated); applyTheme(updated); };
  const chooseAccent = (accentColor: AccentColorId) => { const updated = { ...themeSettings, accentColor }; setThemeSettings(updated); applyTheme(updated); };
  const unitPreset = WEIGHT_UNIT_PRESETS[preferences.units];
  const displayedPlateOptions = Array.from(new Set([
    ...unitPreset.platesKg,
    ...preferences.availablePlatesKg
  ])).sort((a, b) => b - a);

  const changeUnits = (units: UnitSystem) => {
    if (units === preferences.units) return;
    const shouldUseTargetDefaults = usesUnitDefaults(
      preferences.defaultBarWeightKg,
      preferences.availablePlatesKg,
      preferences.units
    );
    const targetPreset = WEIGHT_UNIT_PRESETS[units];
    updatePreferences(shouldUseTargetDefaults
      ? { units, defaultBarWeightKg: targetPreset.barWeightKg, availablePlatesKg: [...targetPreset.platesKg] }
      : { units });
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setStatus(null);
    setIsSyncing(true);
    const result = await syncWithCloud();
    setIsSyncing(false);
    setStatus(result.ok ? { tone: 'success', text: t('settings.synced') } : { tone: 'error', text: t(`error.${result.error.code === 'not_found' ? 'notFound' : result.error.code === 'rate_limited' ? 'rateLimited' : result.error.code}` as import('../lib/i18n.js').TranslationKey) });
  };

  const handleExport = () => {
    const backupData = {
      app: 'light-weight', version: '2.0.0', exportedAt: new Date().toISOString(),
      profile: getStoredProfile(), preferences, bodyweight: getStoredBodyweight(),
      targetWeight: getStoredTargetWeight(), weeklySchedule: getStoredWeeklySchedule(),
      routines: getStoredRoutines(), history: getStoredHistory(), theme: getStoredThemeSettings()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `light-weight-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setStatus({ tone: 'success', text: t('settings.exported') });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isImporting) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json: unknown = JSON.parse(String(reader.result));
        if (!json || typeof json !== 'object' || (json as { app?: string }).app !== 'light-weight') throw new Error('invalid');
        const data = json as {
          history?: unknown; routines?: unknown; bodyweight?: unknown; targetWeight?: unknown;
          profile?: unknown; preferences?: unknown; weeklySchedule?: unknown;
          theme?: Partial<ThemeSettings>;
        };
        if (Array.isArray(data.history)) saveStoredHistory(data.history);
        if (Array.isArray(data.routines)) saveStoredRoutines(data.routines);
        if (Array.isArray(data.bodyweight)) saveStoredBodyweight(data.bodyweight);
        if (typeof data.targetWeight === 'number') saveStoredTargetWeight(data.targetWeight);
        if (data.profile && typeof data.profile === 'object') onProfileChange(saveStoredProfile(data.profile as Partial<UserProfile>));
        if (data.preferences && typeof data.preferences === 'object') saveStoredPreferences(parseAppPreferences(data.preferences));
        if (data.weeklySchedule && typeof data.weeklySchedule === 'object') saveStoredWeeklySchedule(data.weeklySchedule as ReturnType<typeof getStoredWeeklySchedule>);
        if (data.theme?.glassTheme && GLASS_THEMES[data.theme.glassTheme as GlassTheme] && data.theme?.accentColor && ACCENT_PRESETS[data.theme.accentColor as AccentColorId]) {
          const importedTheme = data.theme as ThemeSettings;
          setThemeSettings(importedTheme);
          applyTheme(importedTheme);
        }
        reloadPreferences();
        setStatus({ tone: 'success', text: t('settings.restored') });
        onDataRestored?.();
        void syncWithCloud();
      } catch {
        setStatus({ tone: 'error', text: t('settings.invalidBackup') });
      } finally {
        setIsImporting(false);
        event.target.value = '';
      }
    };
    reader.onerror = () => { setIsImporting(false); event.target.value = ''; setStatus({ tone: 'error', text: t('settings.invalidBackup') }); };
    reader.readAsText(file);
  };

  const titles: Record<SettingsPanel, string> = {
    root: t('settings.title'), profile: t('profile.title'), training: t('settings.training'), appearance: t('settings.appearance'),
    theme: t('settings.theme'), accent: t('settings.accent'), language: t('settings.language'), data: t('settings.data')
  };
  const backTarget = panel === 'theme' || panel === 'accent' ? 'appearance' : 'root';

  return (
    <BottomSheet open={isOpen} onClose={close} title={titles[panel]} className={panel === 'profile' ? 'min-h-[90dvh] sm:min-h-0 sm:max-w-md' : 'sm:max-w-md'}>
      {panel !== 'root' && <Button variant="ghost" size="sm" onClick={() => setPanel(backTarget)} className="mb-3 -ml-2"><ChevronLeft aria-hidden="true" className="size-4" />{backTarget === 'appearance' ? t('settings.appearance') : t('common.back')}</Button>}

      {panel === 'root' && <div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
        <SettingsRow icon={<UserRound className="size-4" />} label={t('settings.profile')} value={profile.displayName === 'Atleta' ? (userInfo.name && userInfo.name !== 'Atleta' ? userInfo.name : t('profile.athlete')) : profile.displayName} onClick={() => setPanel('profile')} />
        <SettingsRow icon={<Dumbbell className="size-4" />} label={t('settings.training')} onClick={() => setPanel('training')} />
        <SettingsRow icon={<Palette className="size-4" />} label={t('settings.appearance')} value={themeName(themeSettings.glassTheme)} onClick={() => setPanel('appearance')} />
        <SettingsRow icon={<Languages className="size-4" />} label={t('settings.language')} value={language === 'es' ? t('settings.spanish') : t('settings.english')} onClick={() => setPanel('language')} />
        <SettingsRow icon={<Database className="size-4" />} label={t('settings.data')} onClick={() => setPanel('data')} />
      </div>}

      {panel === 'profile' && <ProfileView profile={profile} userInfo={userInfo} history={history} exercises={exercises} onSave={onProfileChange} />}

      {panel === 'training' && <div className="space-y-5">
        <div className="space-y-2"><SectionHeader title={t('settings.units')} /><SegmentedControl value={preferences.units} label={t('settings.units')} options={[{ value: 'metric', label: t('settings.metric') }, { value: 'imperial', label: t('settings.imperial') }]} onChange={changeUnits} /></div>
        <div className="space-y-2"><SectionHeader title={t('settings.bodyweightUnits')} /><SegmentedControl value={preferences.bodyweightUnits} label={t('settings.bodyweightUnits')} options={[{ value: 'metric', label: t('settings.metric') }, { value: 'imperial', label: t('settings.imperial') }]} onChange={(bodyweightUnits) => updatePreferences({ bodyweightUnits })} /></div>
        <div className="space-y-2"><span className="text-xs font-bold text-text-secondary">{t('settings.rest')}</span><OptionPicker value={preferences.defaultRestSeconds} options={[60, 90, 120, 180].map((seconds) => ({ value: seconds, label: `${seconds}s` }))} onChange={(defaultRestSeconds) => updatePreferences({ defaultRestSeconds })} ariaLabel={t('settings.rest')} /></div>
        <div className="space-y-2"><SectionHeader title={t('settings.weightMode')} /><SegmentedControl value={preferences.weightInputMode} label={t('settings.weightMode')} options={[{ value: 'keyboard', label: t('settings.keyboard') }, { value: 'plates', label: t('settings.plates') }]} onChange={(weightInputMode) => updatePreferences({ weightInputMode })} /></div>
        <label className="block space-y-2"><span className="text-xs font-bold text-text-secondary">{t('settings.barWeight')}</span><div className="relative"><input type="number" inputMode="decimal" min="0" step="0.5" value={displayWeight(preferences.defaultBarWeightKg, preferences.units)} onChange={(event) => updatePreferences({ defaultBarWeightKg: parseDisplayWeight(Math.max(0, Number(event.target.value) || 0), preferences.units) })} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 pr-10 font-mono text-sm font-bold text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">{unitPreset.unit}</span></div></label>
        <div className="space-y-2"><SectionHeader title={`${t('settings.availablePlates')} (${unitPreset.unit})`} /><div className="grid grid-cols-4 gap-2">{displayedPlateOptions.map((plate) => { const active = preferences.availablePlatesKg.some((value) => weightsMatch(value, plate)); return <button key={plate} type="button" aria-pressed={active} onClick={() => updatePreferences({ availablePlatesKg: active ? preferences.availablePlatesKg.filter((value) => !weightsMatch(value, plate)) : [...preferences.availablePlatesKg, plate].sort((a, b) => b - a) })} className={`min-h-11 rounded-ui-md border px-1 font-mono text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'border-accent bg-accent-soft text-accent' : 'border-border-subtle bg-surface-input text-text-muted'}`}>{displayWeight(plate, preferences.units)}</button>; })}</div></div>
      </div>}

      {panel === 'appearance' && <div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface"><SettingsRow icon={<Sparkles className="size-4" />} label={t('settings.theme')} value={themeName(themeSettings.glassTheme)} onClick={() => setPanel('theme')} /><SettingsRow icon={<Palette className="size-4" />} label={t('settings.accent')} value={<span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ backgroundColor: ACCENT_PRESETS[themeSettings.accentColor].hex }} />{accentName(themeSettings.accentColor)}</span>} onClick={() => setPanel('accent')} /></div>}

      {panel === 'theme' && <div className="space-y-2" role="radiogroup" aria-label={t('settings.theme')}>{(Object.keys(GLASS_THEMES) as GlassTheme[]).map((id) => { const theme = GLASS_THEMES[id]; const selected = themeSettings.glassTheme === id; return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => chooseTheme(id)} className={`flex min-h-16 w-full items-center gap-3 rounded-ui-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:bg-surface-active'}`}><span className="h-10 w-14 shrink-0 rounded-ui-md border shadow-sm" style={{ background: theme.previewGradient, borderColor: theme.previewBorder }} /><span className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">{themeName(id)}</span>{selected && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}</button>; })}</div>}
      {panel === 'accent' && <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.accent')}>{(Object.keys(ACCENT_PRESETS) as AccentColorId[]).map((id) => { const accent = ACCENT_PRESETS[id]; const selected = themeSettings.accentColor === id; return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => chooseAccent(id)} className={`flex min-h-12 items-center gap-2.5 rounded-ui-lg border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:bg-surface-active'}`}><span className="flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: accent.hex }}>{selected && <Check aria-hidden="true" className="size-4" style={{ color: accent.fg }} />}</span><span className="min-w-0 truncate text-xs font-bold text-text-primary">{accentName(id)}</span></button>; })}</div>}
      {panel === 'language' && <div className="space-y-2" role="radiogroup" aria-label={t('settings.language')}>{(['es', 'en'] as const).map((id) => { const selected = language === id; return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => setLanguage(id)} className={`flex min-h-14 w-full items-center justify-between rounded-ui-lg border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-subtle bg-surface text-text-secondary hover:bg-surface-active'}`}><span>{id === 'es' ? t('settings.spanish') : t('settings.english')}</span>{selected && <Check aria-hidden="true" className="size-4 text-accent" />}</button>; })}</div>}

      {panel === 'data' && <div className="space-y-3"><div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface"><SettingsRow icon={<RefreshCw className={`size-4 ${isSyncing ? 'motion-safe:animate-spin' : ''}`} />} label={isSyncing ? t('settings.syncing') : t('settings.syncNow')} onClick={() => void handleSync()} disabled={isSyncing} /><SettingsRow icon={<Download className="size-4" />} label={t('settings.export')} value="JSON" onClick={handleExport} /><SettingsRow icon={<Upload className="size-4" />} label={isImporting ? t('common.loading') : t('settings.import')} value="JSON" onClick={() => fileInputRef.current?.click()} disabled={isImporting} /></div><input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" />{status && <p role={status.tone === 'error' ? 'alert' : 'status'} className={`rounded-ui-lg border p-3 text-xs font-semibold ${status.tone === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-success/30 bg-success/10 text-success'}`}>{status.text}</p>}</div>}
    </BottomSheet>
  );
}
