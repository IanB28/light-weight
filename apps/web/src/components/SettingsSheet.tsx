import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Palette,
  RefreshCw,
  Sparkles,
  Upload
} from 'lucide-react';
import {
  getStoredBodyweight,
  getStoredHistory,
  getStoredProfile,
  getStoredRoutines,
  getStoredTargetWeight,
  getStoredWeeklySchedule,
  saveStoredBodyweight,
  saveStoredHistory,
  saveStoredProfile,
  saveStoredRoutines,
  saveStoredTargetWeight,
  saveStoredWeeklySchedule
} from '../lib/storage.js';
import { syncWithCloud } from '../lib/sync.js';
import {
  AccentColorId,
  ACCENT_PRESETS,
  applyTheme,
  GlassTheme,
  GLASS_THEMES,
  getStoredThemeSettings,
  ThemeSettings
} from '../lib/theme.js';
import { BottomSheet, Button, SectionHeader } from './ui/index.js';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
}

type SettingsPanel = 'root' | 'theme' | 'accent';
type StatusMessage = { tone: 'success' | 'error'; text: string } | null;

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function SettingsRow({ icon, label, value, onClick, disabled }: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-bold text-text-primary">{label}</span>
      {value && <span className="max-w-[45%] truncate text-xs text-text-muted">{value}</span>}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </button>
  );
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({ isOpen, onClose, onDataRestored }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<SettingsPanel>('root');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getStoredThemeSettings());

  useEffect(() => {
    if (!isOpen) {
      setPanel('root');
      setStatus(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setPanel('root');
    setStatus(null);
    onClose();
  };

  const handleSelectGlassTheme = (theme: GlassTheme) => {
    const updated = { ...themeSettings, glassTheme: theme };
    setThemeSettings(updated);
    applyTheme(updated);
  };

  const handleSelectAccent = (accentColor: AccentColorId) => {
    const updated = { ...themeSettings, accentColor };
    setThemeSettings(updated);
    applyTheme(updated);
  };

  const handleSync = async () => {
    setStatus(null);
    setIsSyncing(true);
    const success = await syncWithCloud();
    setIsSyncing(false);
    setStatus(success
      ? { tone: 'success', text: 'Datos sincronizados.' }
      : { tone: 'error', text: 'No pudimos sincronizar. Tus datos locales siguen seguros.' });
  };

  const handleExportJson = () => {
    const backupData = {
      app: 'light-weight',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profile: getStoredProfile(),
      bodyweight: getStoredBodyweight(),
      targetWeight: getStoredTargetWeight(),
      weeklySchedule: getStoredWeeklySchedule(),
      routines: getStoredRoutines(),
      history: getStoredHistory(),
      theme: getStoredThemeSettings()
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
    setStatus({ tone: 'success', text: 'Respaldo exportado.' });
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (!json || typeof json !== 'object' || json.app !== 'light-weight') {
          throw new Error('Formato de respaldo no válido');
        }
        if (Array.isArray(json.history)) saveStoredHistory(json.history);
        if (Array.isArray(json.routines)) saveStoredRoutines(json.routines);
        if (Array.isArray(json.bodyweight)) saveStoredBodyweight(json.bodyweight);
        if (typeof json.targetWeight === 'number') saveStoredTargetWeight(json.targetWeight);
        if (json.profile?.gender === 'male' || json.profile?.gender === 'female') saveStoredProfile(json.profile);
        if (json.weeklySchedule && typeof json.weeklySchedule === 'object') saveStoredWeeklySchedule(json.weeklySchedule);
        if (
          json.theme?.glassTheme &&
          GLASS_THEMES[json.theme.glassTheme as GlassTheme] &&
          json.theme?.accentColor &&
          ACCENT_PRESETS[json.theme.accentColor as AccentColorId]
        ) {
          const importedTheme = json.theme as ThemeSettings;
          setThemeSettings(importedTheme);
          applyTheme(importedTheme);
        }
        setStatus({ tone: 'success', text: 'Datos restaurados con éxito.' });
        onDataRestored?.();
        void syncWithCloud();
      } catch {
        setStatus({ tone: 'error', text: 'El archivo no es un respaldo válido de LightWeight.' });
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const panelTitle = panel === 'root' ? 'Configuración' : panel === 'theme' ? 'Tema' : 'Color de acento';
  const panelDescription = panel === 'root'
    ? 'Apariencia, sincronización y respaldo.'
    : panel === 'theme'
      ? 'Elige la superficie visual de LightWeight.'
      : 'Elige el color para acciones y estados activos.';

  return (
    <BottomSheet open={isOpen} onClose={handleClose} title={panelTitle} description={panelDescription} className="sm:max-w-md">
      {panel !== 'root' && (
        <Button variant="ghost" size="sm" onClick={() => setPanel('root')} className="mb-3 -ml-2">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Configuración
        </Button>
      )}

      {panel === 'root' && (
        <div className="space-y-5">
          <section className="space-y-2" aria-labelledby="settings-appearance">
            <SectionHeader title="Apariencia" />
            <div id="settings-appearance" className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
              <SettingsRow
                icon={<Sparkles aria-hidden="true" className="size-4" />}
                label="Tema"
                value={GLASS_THEMES[themeSettings.glassTheme].name}
                onClick={() => setPanel('theme')}
              />
              <SettingsRow
                icon={<Palette aria-hidden="true" className="size-4" />}
                label="Color de acento"
                value={(
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: ACCENT_PRESETS[themeSettings.accentColor].hex }} />
                    {ACCENT_PRESETS[themeSettings.accentColor].name}
                  </span>
                )}
                onClick={() => setPanel('accent')}
              />
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="settings-data">
            <SectionHeader title="Datos" />
            <div id="settings-data" className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
              <SettingsRow
                icon={<RefreshCw aria-hidden="true" className={`size-4 ${isSyncing ? 'motion-safe:animate-spin' : ''}`} />}
                label={isSyncing ? 'Sincronizando…' : 'Sincronizar ahora'}
                onClick={() => void handleSync()}
                disabled={isSyncing}
              />
              <SettingsRow
                icon={<Download aria-hidden="true" className="size-4" />}
                label="Exportar datos"
                value="JSON"
                onClick={handleExportJson}
              />
              <SettingsRow
                icon={<Upload aria-hidden="true" className="size-4" />}
                label="Restaurar respaldo"
                value="JSON"
                onClick={() => fileInputRef.current?.click()}
              />
            </div>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
          </section>

          {status && (
            <div
              role="status"
              className={`flex items-center gap-2 rounded-ui-lg border p-3 text-xs font-semibold ${status.tone === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-success/30 bg-success/10 text-success'}`}
            >
              {status.tone === 'error' ? <AlertCircle aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4" />}
              {status.text}
            </div>
          )}
        </div>
      )}

      {panel === 'theme' && (
        <div className="space-y-2" role="radiogroup" aria-label="Tema visual">
          {(Object.keys(GLASS_THEMES) as GlassTheme[]).map((themeId) => {
            const theme = GLASS_THEMES[themeId];
            const selected = themeSettings.glassTheme === themeId;
            return (
              <button
                key={themeId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleSelectGlassTheme(themeId)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-ui-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:bg-surface-active'}`}
              >
                <span className="h-10 w-14 shrink-0 rounded-ui-md border shadow-sm" style={{ background: theme.previewGradient, borderColor: theme.previewBorder }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-text-primary">{theme.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-muted">{theme.description}</span>
                </span>
                {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}

      {panel === 'accent' && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Color de acento">
          {(Object.keys(ACCENT_PRESETS) as AccentColorId[]).map((accentId) => {
            const accent = ACCENT_PRESETS[accentId];
            const selected = themeSettings.accentColor === accentId;
            return (
              <button
                key={accentId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleSelectAccent(accentId)}
                className={`flex min-h-12 items-center gap-2.5 rounded-ui-lg border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:bg-surface-active'}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: accent.hex }}>
                  {selected && <Check aria-hidden="true" className="size-4" style={{ color: accent.fg }} />}
                </span>
                <span className="min-w-0 truncate text-xs font-bold text-text-primary">{accent.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
};
