import React, { useRef, useState } from 'react';
import { X, Download, Upload, ShieldCheck, Check, AlertCircle, Palette, Sparkles } from 'lucide-react';
import {
  getStoredHistory,
  getStoredRoutines,
  getStoredBodyweight,
  getStoredProfile,
  getStoredTargetWeight,
  getStoredWeeklySchedule,
  saveStoredBodyweight,
  saveStoredTargetWeight,
  saveStoredProfile,
  saveStoredWeeklySchedule,
  saveStoredHistory,
  saveStoredRoutines
} from '../lib/storage.js';
import { syncWithCloud } from '../lib/sync.js';
import {
  GlassTheme,
  AccentColorId,
  ACCENT_PRESETS,
  GLASS_THEMES,
  getStoredThemeSettings,
  applyTheme,
  ThemeSettings
} from '../lib/theme.js';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getStoredThemeSettings());

  if (!isOpen) return null;

  const handleSelectGlassTheme = (theme: GlassTheme) => {
    const updated = { ...themeSettings, glassTheme: theme };
    setThemeSettings(updated);
    applyTheme(updated);
  };

  const handleSelectAccent = (accent: AccentColorId) => {
    const updated = { ...themeSettings, accentColor: accent };
    setThemeSettings(updated);
    applyTheme(updated);
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
      theme: getStoredThemeSettings(),
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `light-weight-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || typeof json !== 'object' || json.app !== 'light-weight') {
          throw new Error('Formato de respaldo no válido');
        }
        if (json.history && Array.isArray(json.history)) {
          saveStoredHistory(json.history);
        }
        if (json.routines && Array.isArray(json.routines)) {
          saveStoredRoutines(json.routines);
        }
        if (Array.isArray(json.bodyweight)) saveStoredBodyweight(json.bodyweight);
        if (typeof json.targetWeight === 'number') saveStoredTargetWeight(json.targetWeight);
        if (json.profile?.gender === 'male' || json.profile?.gender === 'female') saveStoredProfile(json.profile);
        if (json.weeklySchedule && typeof json.weeklySchedule === 'object') saveStoredWeeklySchedule(json.weeklySchedule);
        if (json.theme?.glassTheme && GLASS_THEMES[json.theme.glassTheme as GlassTheme] && json.theme?.accentColor && ACCENT_PRESETS[json.theme.accentColor as AccentColorId]) {
          const importedTheme = json.theme as ThemeSettings;
          setThemeSettings(importedTheme);
          applyTheme(importedTheme);
        }

        setImportStatus('¡Datos restaurados con éxito!');
        if (onDataRestored) onDataRestored();

        // Disparar sincronización con Neon
        syncWithCloud();

        setTimeout(() => {
          setImportStatus(null);
          onClose();
        }, 1500);
      } catch (err) {
        setImportStatus('Error: Archivo de respaldo no válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="relative w-full max-w-md dark-glass-card border border-white/[0.1] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-y-auto p-5 sm:p-6 space-y-4 z-10 animate-slide-up max-h-[92dvh]">
        {/* iOS Grab Handle */}
        <div className="w-full pb-2 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent font-mono">
              CONFIGURACIÓN
            </span>
            <h3 id="settings-title" className="text-lg font-bold text-white tracking-tight">
              Ajustes y Personalización
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-input text-text-muted transition-colors hover:text-text-primary active:scale-[0.96]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Sección: Fondo Glassmorphism (Midnight vs Carbón) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Modelo de Fondo Glassmorphism
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {GLASS_THEMES[themeSettings.glassTheme]?.name}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(GLASS_THEMES) as GlassTheme[]).map((themeId) => {
              const theme = GLASS_THEMES[themeId];
              const isSelected = themeSettings.glassTheme === themeId;
              return (
                <button
                  key={themeId}
                  type="button"
                  onClick={() => handleSelectGlassTheme(themeId)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-accent bg-white/[0.08] shadow-md shadow-accent/10 ring-1 ring-accent'
                      : 'border-white/[0.08] bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="w-full">
                    {/* Visual preview swatch */}
                    <div
                      className="w-full h-8 rounded-xl mb-2 border shadow-inner flex items-center justify-end px-2"
                      style={{
                        background: theme.previewGradient,
                        borderColor: theme.previewBorder
                      }}
                    >
                      <span className="text-[9px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-black/50 text-white/95 backdrop-blur-sm">
                        {theme.badge}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-white truncate">
                        {theme.name}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-tight">
                    {theme.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Sección: Color de Acento (.accent-highlight) */}
        <div className="space-y-2 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-accent" />
              Color de Acento (Interactivo)
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {ACCENT_PRESETS[themeSettings.accentColor]?.name}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2 pt-0.5">
            {(Object.keys(ACCENT_PRESETS) as AccentColorId[]).map((accId) => {
              const p = ACCENT_PRESETS[accId];
              const isSelected = themeSettings.accentColor === accId;
              return (
                <button
                  key={accId}
                  type="button"
                  onClick={() => handleSelectAccent(accId)}
                  title={p.name}
                  style={{ backgroundColor: p.hex }}
                  className={`w-full aspect-square rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90 ${
                    isSelected
                      ? 'ring-2 ring-white scale-105 shadow-md'
                      : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  {isSelected && (
                    <Check
                      className="w-4 h-4"
                      style={{ color: p.fg }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Sección: Copia de Seguridad */}
        <div className="pt-2 border-t border-white/[0.06]">
          <span className="text-[11px] font-bold text-zinc-300 block mb-1.5">
            Soberanía de Datos
          </span>
          <p className="text-xs text-zinc-400 leading-relaxed mb-2">
            Tus datos son 100% tuyos. Puedes exportar una copia completa en formato JSON o restaurar entrenamientos previos.
          </p>
        </div>

        {importStatus && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              importStatus.includes('Error')
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-accent/15 text-accent border border-accent/30'
            }`}
          >
            {importStatus.includes('Error') ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{importStatus}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {/* Export Button */}
          <button
            onClick={handleExportJson}
            className="w-full p-4 rounded-2xl glass-subcard hover:border-accent/40 text-white font-bold text-xs flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                <Download className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Exportar a JSON</p>
                <p className="text-[11px] text-zinc-400">Descargar copia completa de historial y rutinas</p>
              </div>
            </div>
          </button>

          {/* Import Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 rounded-2xl glass-subcard hover:border-white/30 text-white font-bold text-xs flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-300 group-hover:scale-105 transition-transform">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Restaurar Copia de Seguridad</p>
                <p className="text-[11px] text-zinc-400">Subir un archivo .json de light-weight</p>
              </div>
            </div>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json,application/json"
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
