export type GlassTheme = 'midnight' | 'carbon';
export type AccentColorId =
  | 'lime'
  | 'neon'
  | 'sky'
  | 'teal'
  | 'orange'
  | 'violet'
  | 'pink'
  | 'red'
  | 'gold'
  | 'mint'
  | 'indigo'
  | 'emerald';

export interface AccentColorPreset {
  id: AccentColorId;
  name: string;
  hex: string;
  fg: string;
  glow: string;
}

export const ACCENT_PRESETS: Record<AccentColorId, AccentColorPreset> = {
  lime: {
    id: 'lime',
    name: 'Lima OpenGym',
    hex: '#30D158',
    fg: '#000000',
    glow: 'rgba(48, 209, 88, 0.45)'
  },
  neon: {
    id: 'neon',
    name: 'Lima Neón',
    hex: '#EAFF55',
    fg: '#0A0A0A',
    glow: 'rgba(234, 255, 85, 0.45)'
  },
  sky: {
    id: 'sky',
    name: 'Azul Cielo',
    hex: '#0A84FF',
    fg: '#FFFFFF',
    glow: 'rgba(10, 132, 255, 0.45)'
  },
  teal: {
    id: 'teal',
    name: 'Turquesa Teal',
    hex: '#40C8E0',
    fg: '#000000',
    glow: 'rgba(64, 200, 224, 0.45)'
  },
  orange: {
    id: 'orange',
    name: 'Naranja Sunset',
    hex: '#FF9F0A',
    fg: '#000000',
    glow: 'rgba(255, 159, 10, 0.45)'
  },
  violet: {
    id: 'violet',
    name: 'Violeta Eléctrico',
    hex: '#BF5AF2',
    fg: '#FFFFFF',
    glow: 'rgba(191, 90, 242, 0.45)'
  },
  pink: {
    id: 'pink',
    name: 'Rosa Neón',
    hex: '#FF375F',
    fg: '#FFFFFF',
    glow: 'rgba(255, 55, 95, 0.45)'
  },
  red: {
    id: 'red',
    name: 'Rojo Carmesí',
    hex: '#FF453A',
    fg: '#FFFFFF',
    glow: 'rgba(255, 69, 58, 0.45)'
  },
  gold: {
    id: 'gold',
    name: 'Dorado Ámbar',
    hex: '#FFD60A',
    fg: '#000000',
    glow: 'rgba(255, 214, 10, 0.45)'
  },
  mint: {
    id: 'mint',
    name: 'Menta Fresca',
    hex: '#63E6E2',
    fg: '#000000',
    glow: 'rgba(99, 230, 226, 0.45)'
  },
  indigo: {
    id: 'indigo',
    name: 'Índigo Profundo',
    hex: '#5E5CE6',
    fg: '#FFFFFF',
    glow: 'rgba(94, 92, 230, 0.45)'
  },
  emerald: {
    id: 'emerald',
    name: 'Verde Esmeralda',
    hex: '#10B981',
    fg: '#FFFFFF',
    glow: 'rgba(16, 185, 129, 0.45)'
  }
};

export const GLASS_THEMES: Record<GlassTheme, { id: GlassTheme; name: string; description: string }> = {
  midnight: {
    id: 'midnight',
    name: 'Azul Noche Profundo',
    description: 'Gradiente cósmico profundo con destellos azulados'
  },
  carbon: {
    id: 'carbon',
    name: 'Negro Carbón',
    description: 'Superficie de carbón esmerilada con sobriedad neutra'
  }
};

export interface ThemeSettings {
  glassTheme: GlassTheme;
  accentColor: AccentColorId;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  glassTheme: 'midnight',
  accentColor: 'lime'
};

const THEME_STORAGE_KEY = 'lightweight_theme_settings';

export function getStoredThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      glassTheme: parsed.glassTheme && GLASS_THEMES[parsed.glassTheme as GlassTheme] ? parsed.glassTheme : 'midnight',
      accentColor: parsed.accentColor && ACCENT_PRESETS[parsed.accentColor as AccentColorId] ? parsed.accentColor : 'lime'
    };
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

export function applyTheme(settings: ThemeSettings): void {
  try {
    const preset = ACCENT_PRESETS[settings.accentColor] || ACCENT_PRESETS.lime;
    const root = document.documentElement;

    // 1. Set data attributes on <html> for Tailwind variants
    root.setAttribute('data-theme', settings.glassTheme);
    root.setAttribute('data-accent', settings.accentColor);

    // 2. Set CSS variables that feed Tailwind's @theme tokens
    root.style.setProperty('--accent-color', preset.hex);
    root.style.setProperty('--accent-fg', preset.fg);
    root.style.setProperty('--accent-glow', preset.glow);

    // 3. Persist to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));

    // 4. Dispatch a custom event so components can re-render if needed
    window.dispatchEvent(new CustomEvent('lightweight_theme_changed', { detail: settings }));
  } catch (err) {
    console.error('Error applying theme:', err);
  }
}

export function initTheme(): ThemeSettings {
  const current = getStoredThemeSettings();
  applyTheme(current);
  return current;
}
